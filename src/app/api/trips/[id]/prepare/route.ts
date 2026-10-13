import { after } from "next/server";
import { gate } from "../../../../../lib/auth";
import { fireRoutine } from "../../../../../lib/fire-routine";
import { storeError } from "../../../../../lib/http";
import { listingsBy } from "../../../../../lib/listings-by";
import { liveDeps } from "../../../../../lib/live-deps";
import { prepareNewTrip } from "../../../../../lib/on-create";
import { isStale, workingDoc, type PrepDoc } from "../../../../../lib/prep";
import { getDoc, setDoc } from "../../../../../lib/store";
import { isActive, isTripId, type Trip } from "../../../../../lib/trip";

// The work after the response (corridor, sources, then the routine) can take a few minutes.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

/* Gets a trip ready: its route, its sources, and then the routine is started to read the places. This is what
   a new trip does by itself, and what the board does for a trip that was never started or whose first attempt
   failed. It answers at once; the board follows the progress through the board request. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/prepare">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

  try {
    const trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    const now = new Date();
    if (!isActive(trip, now)) return Response.json({ code: "ended", error: "this trip is over" }, { status: 409 });

    const existing = await getDoc<PrepDoc>(`prep/${id}`);
    if (existing && existing.state === "working" && !isStale(existing, now)) {
      return Response.json({ started: false, prep: existing });
    }

    const prep = workingDoc(id, now);
    await setDoc(`prep/${id}`, prep);
    const by = listingsBy();
    after(async () => {
      try {
        const result = await prepareNewTrip(trip, { deps: liveDeps(Date.now(), WORK_BUDGET_MS, by === "cron"), by, fire: (tripId) => fireRoutine(tripId) });
        console.log("[prepare]", id, JSON.stringify(result));
      } catch (e) {
        console.error("[prepare]", id, e instanceof Error ? e.name : "error");
      }
    });
    return Response.json({ started: true, prep }, { status: 202 });
  } catch (e) {
    return storeError("prepare", e);
  }
}
