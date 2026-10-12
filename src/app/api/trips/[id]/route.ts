import { gate } from "../../../../lib/auth";
import { storeError } from "../../../../lib/http";
import { deleteDoc, getDoc } from "../../../../lib/store";
import { isTripId, presentTrip, type Trip } from "../../../../lib/trip";

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });
  try {
    const trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    return Response.json(presentTrip(trip, new Date()));
  } catch (e) {
    return storeError("trips/id", e);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });
  try {
    await deleteDoc(`trips/${id}`);
    await deleteDoc(`corridors/${id}`);
    await deleteDoc(`sources/${id}`);
    return Response.json({ ok: true });
  } catch (e) {
    return storeError("trips/id", e);
  }
}
