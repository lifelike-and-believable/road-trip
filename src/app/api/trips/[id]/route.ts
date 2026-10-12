import { gate } from "../../../../lib/auth";
import { storeError } from "../../../../lib/http";
import { deleteDoc, getDoc } from "../../../../lib/store";
import { presentTrip, type Trip } from "../../../../lib/trip";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });
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
  if (!ID.test(id)) return Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });
  try {
    await deleteDoc(`trips/${id}`);
    return Response.json({ ok: true });
  } catch (e) {
    return storeError("trips/id", e);
  }
}
