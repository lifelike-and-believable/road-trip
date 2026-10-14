import { gate } from "../../../../../lib/auth";
import type { Corridor } from "../../../../../lib/corridor";
import { storeError } from "../../../../../lib/http";
import type { PlanDoc } from "../../../../../lib/plan";
import type { PrepDoc } from "../../../../../lib/prep";
import type { ListingsDoc } from "../../../../../lib/refresh";
import type { SourceList } from "../../../../../lib/sources";
import { getDocs } from "../../../../../lib/store";
import { isTripId, presentTrip, type Trip } from "../../../../../lib/trip";

/* Everything one board screen needs, in one request: the trip, its corridor, how many
   sources were found, the listings, how getting the trip ready is going, and the traveller's plan. A part that does not exist
   yet is null, which is how the board knows what to say is still to come. */
export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/board">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

  try {
    // One request to the store for all six, since the board asks on every load and every few seconds while a trip gets ready.
    const docs = await getDocs([`trips/${id}`, `corridors/${id}`, `sources/${id}`, `listings/${id}`, `plans/${id}`, `prep/${id}`]);
    const [trip, corridor, sources, listings, plan, prep] = docs as [
      Trip | null, Corridor | null, SourceList | null, ListingsDoc | null, PlanDoc | null, PrepDoc | null,
    ];
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    return Response.json({
      trip: presentTrip(trip, new Date()),
      corridor,
      sources: sources ? { count: sources.sources.length } : null,
      listings,
      prep,
      plan: plan ?? { tripId: id, updatedAt: null, picks: [], starred: [] },
    });
  } catch (e) {
    return storeError("board", e);
  }
}
