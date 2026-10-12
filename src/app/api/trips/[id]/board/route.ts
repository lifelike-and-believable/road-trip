import { gate } from "../../../../../lib/auth";
import type { Corridor } from "../../../../../lib/corridor";
import { storeError } from "../../../../../lib/http";
import type { PlanDoc } from "../../../../../lib/plan";
import type { ListingsDoc } from "../../../../../lib/refresh";
import type { SourceList } from "../../../../../lib/sources";
import { getDoc } from "../../../../../lib/store";
import { isTripId, presentTrip, type Trip } from "../../../../../lib/trip";

/* Everything one board screen needs, in one request: the trip, its corridor, how many
   sources were found, the listings and the traveller's plan. A part that does not exist
   yet is null, which is how the board knows what to say is still to come. */
export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/board">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

  try {
    const trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    const [corridor, sources, listings, plan] = await Promise.all([
      getDoc<Corridor>(`corridors/${id}`),
      getDoc<SourceList>(`sources/${id}`),
      getDoc<ListingsDoc>(`listings/${id}`),
      getDoc<PlanDoc>(`plans/${id}`),
    ]);
    return Response.json({
      trip: presentTrip(trip, new Date()),
      corridor,
      sources: sources ? { count: sources.sources.length } : null,
      listings,
      plan: plan ?? { tripId: id, updatedAt: null, picks: [], starred: [] },
    });
  } catch (e) {
    return storeError("board", e);
  }
}
