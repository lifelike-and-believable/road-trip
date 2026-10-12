import { gate } from "../../../../../lib/auth";
import { buildCorridor, type Corridor } from "../../../../../lib/corridor";
import { storeError } from "../../../../../lib/http";
import { OsmError } from "../../../../../lib/osm";
import { getDoc, setDoc } from "../../../../../lib/store";
import { isActive, isTripId, type Trip } from "../../../../../lib/trip";

// Looking up a few dozen towns at Nominatim's one request a second takes a while.
export const maxDuration = 60;

const badId = () => Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/corridor">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();
  try {
    const corridor = await getDoc<Corridor>(`corridors/${id}`);
    if (!corridor) return Response.json({ code: "no_corridor", error: "no corridor built yet" }, { status: 404 });
    return Response.json(corridor);
  } catch (e) {
    return storeError("corridor", e);
  }
}

/** Build the corridor once. A later call returns what was stored. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/corridor">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();

  let trip: Trip | null;
  try {
    trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    if (!isActive(trip, new Date())) {
      return Response.json({ code: "trip_ended", error: "this trip is over and is no longer updated" }, { status: 409 });
    }
    const stored = await getDoc<Corridor>(`corridors/${id}`);
    if (stored) return Response.json(stored);
  } catch (e) {
    return storeError("corridor", e);
  }

  let corridor: Corridor;
  try {
    corridor = await buildCorridor(trip, new Date());
  } catch (e) {
    if (e instanceof OsmError) {
      const status = e.code === "upstream" ? 502 : 422;
      return Response.json({ code: e.code, error: e.message }, { status });
    }
    console.error("[corridor]", e);
    return Response.json({ code: "corridor_error", error: "could not build the corridor" }, { status: 500 });
  }

  try {
    await setDoc(`corridors/${id}`, corridor);
  } catch (e) {
    return storeError("corridor", e);
  }
  return Response.json(corridor, { status: 201 });
}
