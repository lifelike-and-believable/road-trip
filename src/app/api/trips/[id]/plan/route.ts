import { gate } from "../../../../../lib/auth";
import { readJson, storeError } from "../../../../../lib/http";
import { parsePlan, type PlanDoc } from "../../../../../lib/plan";
import { getDoc, setDoc } from "../../../../../lib/store";
import { isActive, isTripId, type Trip } from "../../../../../lib/trip";

const badId = () => Response.json({ code: "bad_id", error: "not a trip id" }, { status: 400 });

export async function GET(req: Request, ctx: RouteContext<"/api/trips/[id]/plan">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();
  try {
    const plan = await getDoc<PlanDoc>(`plans/${id}`);
    return Response.json(plan ?? { tripId: id, updatedAt: null, picks: [], starred: [] });
  } catch (e) {
    return storeError("plan", e);
  }
}

/** Replace the whole plan. The board sends the complete set each time, as the Montreal board's sync does. */
export async function PUT(req: Request, ctx: RouteContext<"/api/trips/[id]/plan">) {
  const denied = gate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isTripId(id)) return badId();

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = parsePlan(body.value);
  if (!parsed.ok) return Response.json({ code: "bad_plan", errors: parsed.errors }, { status: 400 });

  try {
    const trip = await getDoc<Trip>(`trips/${id}`);
    if (!trip) return Response.json({ code: "not_found", error: "no such trip" }, { status: 404 });
    if (!isActive(trip, new Date())) {
      return Response.json({ code: "trip_ended", error: "this trip is over and is no longer changed" }, { status: 409 });
    }
    const plan: PlanDoc = { tripId: id, updatedAt: new Date().toISOString(), picks: parsed.picks, starred: parsed.starred };
    await setDoc(`plans/${id}`, plan);
    return Response.json(plan);
  } catch (e) {
    return storeError("plan", e);
  }
}
