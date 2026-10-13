import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { personGate, readGate } from "../../../lib/auth";
import { fireRoutine } from "../../../lib/fire-routine";
import { readJson, storeError } from "../../../lib/http";
import { listingsBy } from "../../../lib/listings-by";
import { liveDeps } from "../../../lib/live-deps";
import { prepareNewTrip } from "../../../lib/on-create";
import { workingDoc } from "../../../lib/prep";
import { listDocs, setDoc } from "../../../lib/store";
import { parseTripInput, presentTrip, type Trip } from "../../../lib/trip";

// The work after the response (corridor, sources, then the routine) can take a few minutes.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

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
  const denied = personGate(req);
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

  // Marked before the answer, so the board that opens next sees it under way and does not start the same work again.
  try {
    await setDoc(`prep/${trip.id}`, workingDoc(trip.id, now));
  } catch (e) {
    return storeError("trips", e);
  }

  const by = listingsBy();
  after(async () => {
    try {
      const result = await prepareNewTrip(trip, {
        deps: liveDeps(Date.now(), WORK_BUDGET_MS, by === "cron"),
        by,
        fire: (id) => fireRoutine(id),
      });
      console.log("[new trip]", trip.id, JSON.stringify(result));
    } catch (e) {
      console.error("[new trip]", trip.id, e instanceof Error ? e.name : "error");
    }
  });
  return Response.json(presentTrip(trip, now), { status: 201 });
}
