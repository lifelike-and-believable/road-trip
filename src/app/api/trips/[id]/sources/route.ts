import { gate, readGate } from "../../../../../lib/auth";
import { askModel, makeAsk } from "../../../../../lib/anthropic";
import type { Corridor } from "../../../../../lib/corridor";
import { storeError } from "../../../../../lib/http";
import { buildSources, SourcesError, type SourceList } from "../../../../../lib/sources";
import { getDoc, setDoc } from "../../../../../lib/store";
import { isActive, isTripId, type Trip } from "../../../../../lib/trip";

// Several web-search requests run side by side, each of which can take a while.
export const maxDuration = 300;

const badId = () => Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

const STATUS: Record<SourcesError["code"], number> = {
  not_configured: 503,
  refused: 502,
  upstream: 502,
  bad_output: 502,
  no_sources: 422,
};

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/sources">) {
  const denied = readGate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();
  try {
    const list = await getDoc<SourceList>(`sources/${id}`);
    if (!list) return Response.json({ code: "no_sources", error: "no sources found yet" }, { status: 404 });
    return Response.json(list);
  } catch (e) {
    return storeError("sources", e);
  }
}

/** Find the sources once, for an active trip whose corridor exists. A later call returns what was stored. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/sources">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();

  let trip: Trip | null;
  let corridor: Corridor | null;
  try {
    trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    if (!isActive(trip, new Date())) {
      return Response.json({ code: "trip_ended", error: "this trip is over and is no longer updated" }, { status: 409 });
    }
    const stored = await getDoc<SourceList>(`sources/${id}`);
    if (stored) return Response.json(stored);
    corridor = await getDoc<Corridor>(`corridors/${id}`);
    if (!corridor) {
      return Response.json({ code: "no_corridor", error: "build the route corridor first" }, { status: 409 });
    }
  } catch (e) {
    return storeError("sources", e);
  }

  let list: SourceList;
  try {
    list = await buildSources(trip, corridor, new Date(), { ask: makeAsk(), model: askModel() });
  } catch (e) {
    if (e instanceof SourcesError) {
      return Response.json({ code: e.code, error: e.message }, { status: STATUS[e.code] });
    }
    console.error("[sources]", e);
    return Response.json({ code: "sources_error", error: "could not find sources" }, { status: 500 });
  }

  try {
    await setDoc(`sources/${id}`, list);
  } catch (e) {
    return storeError("sources", e);
  }
  return Response.json(list, { status: 201 });
}
