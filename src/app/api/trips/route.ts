import { randomUUID } from "node:crypto";
import { gate, readGate } from "../../../lib/auth";
import { readJson, storeError } from "../../../lib/http";
import { listDocs, setDoc } from "../../../lib/store";
import { parseTripInput, presentTrip, type Trip } from "../../../lib/trip";

export async function GET(req: Request) {
  const denied = readGate(req);
  if (denied) return denied;
  try {
    const now = new Date();
    const docs = await listDocs<Trip>("trips");
    const trips = docs
      .map((d) => d.data)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map((t) => presentTrip(t, now));
    return Response.json({ trips });
  } catch (e) {
    return storeError("trips", e);
  }
}

export async function POST(req: Request) {
  const denied = gate(req);
  if (denied) return denied;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const now = new Date();
  const parsed = parseTripInput(body.value, now);
  if (!parsed.ok) {
    return Response.json({ code: "bad_trip", errors: parsed.errors }, { status: 400 });
  }

  const trip: Trip = { id: randomUUID(), createdAt: now.toISOString(), ...parsed.value };
  try {
    await setDoc(`trips/${trip.id}`, trip);
  } catch (e) {
    return storeError("trips", e);
  }
  return Response.json(presentTrip(trip, now), { status: 201 });
}
