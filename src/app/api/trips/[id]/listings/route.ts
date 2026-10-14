import { makeAsk } from "../../../../../lib/anthropic";
import { gate, isRoutine, readGate } from "../../../../../lib/auth";
import type { Corridor } from "../../../../../lib/corridor";
import { readJson, storeError } from "../../../../../lib/http";
import { fireRoutine, routineFireConfig } from "../../../../../lib/fire-routine";
import { ingestListings } from "../../../../../lib/ingest";
import { listingsBy } from "../../../../../lib/listings-by";
import { refreshListings, unreadPlaces, type ListingsDoc } from "../../../../../lib/refresh";
import { SourcesError, type SourceList } from "../../../../../lib/sources";
import { bumpCount, getDoc, readCount, setDoc } from "../../../../../lib/store";
import { isActive, isTripId, type Trip } from "../../../../../lib/trip";

// Reading a trip's stops takes several web reads; stop starting new ones well before the limit.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;
const INGEST_LIMIT_BYTES = 512 * 1024;

/* A long trip has more places than one run of the routine reads. When it posts and places are still unread,
   it is started again for them, a few times a day at most, well inside the trigger's limit of 30 starts an hour. */
const MAX_CONTINUES_PER_DAY = 4;

async function continueRoutine(tripId: string): Promise<void> {
  if (listingsBy() !== "routine" || !routineFireConfig()) return;
  try {
    const key = `routine-continues:${tripId}`;
    if ((await readCount(key)) >= MAX_CONTINUES_PER_DAY) return;
    await bumpCount(key, 24 * 3600);
    const r = await fireRoutine(tripId, { kind: "continue" });
    if (!r.fired) console.error("[listings] the routine could not be started again:", r.reason);
  } catch {
    console.error("[listings] the routine could not be started again: store");
  }
}

const badId = () => Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/listings">) {
  const denied = readGate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();
  try {
    const doc = await getDoc<ListingsDoc>(`listings/${id}`);
    if (!doc) return Response.json({ code: "no_listings", error: "no listings yet" }, { status: 404 });
    return Response.json(doc);
  } catch (e) {
    return storeError("listings", e);
  }
}

/** Read the places on this trip's corridor that are due, up to a limit. Call again for the rest. ?force=1 reads recent ones too. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/listings">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();

  let trip: Trip | null;
  let corridor: Corridor | null;
  let sources: SourceList | null;
  let previous: ListingsDoc | null;
  try {
    trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    if (!isActive(trip, new Date())) {
      return Response.json({ code: "trip_ended", error: "this trip is over and is no longer updated" }, { status: 409 });
    }
    corridor = await getDoc<Corridor>(`corridors/${id}`);
    if (!corridor) return Response.json({ code: "no_corridor", error: "build the route corridor first" }, { status: 409 });
    sources = await getDoc<SourceList>(`sources/${id}`);
    if (!sources) return Response.json({ code: "no_sources", error: "find the event sources first" }, { status: 409 });
    previous = await getDoc<ListingsDoc>(`listings/${id}`);
  } catch (e) {
    return storeError("listings", e);
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  let result: Awaited<ReturnType<typeof refreshListings>>;
  try {
    result = await refreshListings(trip, corridor, sources, previous, new Date(), {
      ask: makeAsk(),
      force,
      deadline: Date.now() + WORK_BUDGET_MS,
    });
  } catch (e) {
    if (e instanceof SourcesError) {
      return Response.json({ code: e.code, error: e.message }, { status: e.code === "not_configured" ? 503 : 502 });
    }
    console.error("[listings]", e);
    return Response.json({ code: "listings_error", error: "could not read the listings" }, { status: 500 });
  }

  try {
    if (result.report.updated.length || result.report.kept.length) await setDoc(`listings/${id}`, result.doc);
  } catch (e) {
    return storeError("listings", e);
  }
  return Response.json({ listings: result.doc, report: result.report });
}

/** Listings read elsewhere, by the routine, posted place by place. Only the job's token may do this. */
export async function PUT(req: Request, ctx: RouteContext<"/api/trips/[id]/listings">) {
  if (!isRoutine(req)) {
    return Response.json({ code: "permission_denied", error: "routine token required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();

  const body = await readJson(req, INGEST_LIMIT_BYTES);
  if (!body.ok) return body.response;

  try {
    const trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    if (!isActive(trip, new Date())) {
      return Response.json({ code: "trip_ended", error: "this trip is over and is no longer updated" }, { status: 409 });
    }
    const corridor = await getDoc<Corridor>(`corridors/${id}`);
    if (!corridor) return Response.json({ code: "no_corridor", error: "build the route corridor first" }, { status: 409 });

    const now = new Date();
    const result = ingestListings(corridor, await getDoc<ListingsDoc>(`listings/${id}`), body.value, now);
    if (!result.ok) return Response.json({ code: result.code, error: result.error }, { status: 400 });
    if (result.report.updated.length || result.report.kept.length) await setDoc(`listings/${id}`, result.doc);
    const unread = unreadPlaces(corridor, result.doc, now);
    if (unread.length) await continueRoutine(id);
    return Response.json({ listings: result.doc, report: result.report, unread: unread.length });
  } catch (e) {
    return storeError("listings", e);
  }
}
