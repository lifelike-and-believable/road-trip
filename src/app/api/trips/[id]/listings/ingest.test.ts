import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), throws: false }));

vi.mock("../../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => {
      if (S.throws) throw new Error("redis down");
      return S.docs.get(p) ?? null;
    },
    setDoc: async (p: string, d: unknown) => {
      S.docs.set(p, d);
    },
  };
});

import { PUT } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * H).toISOString();

const trip = (over: Record<string, unknown> = {}) => ({
  id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" },
  start: at(24), end: at(96), roundTrip: false, ...over,
});
const corridor = {
  tripId: ID, builtAt: at(-1), from: { label: "A", lat: 0, lon: 0 }, to: { label: "B", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{
    id: "out", distanceKm: 1, driveMinutes: 1, arriveAt: at(30), fits: true,
    stops: [{ name: "Midway", region: "NY", lat: 0, lon: 0, kind: "along", km: 0, from: at(30), until: at(30) }],
  }],
};
const listing = (title: string) => ({
  title, source: "https://a.example/events", category: "music", cost: "free",
  schedule: { kind: "fixed", start: at(31), durationMin: 60 },
});

const job = { authorization: "Bearer routine-secret" };
const put = (body: unknown, headers: Record<string, string> = job) =>
  new Request(`https://x.test/api/trips/${ID}/listings`, {
    method: "PUT", headers, body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/listings">;
const payload = { stops: { Midway: [listing("Jazz night")] } };

beforeEach(() => {
  S.docs.clear();
  S.throws = false;
  S.docs.set(`trips/${ID}`, trip());
  S.docs.set(`corridors/${ID}`, corridor);
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
  process.env.ROUTINE_SECRET = "routine-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/trips/[id]/listings", () => {
  it("takes the routine's token only, not a signed-in browser or the refresh job's token", async () => {
    expect((await PUT(put(payload, { authorization: "Bearer job-secret" }), ctx())).status).toBe(401);
    expect((await PUT(put(payload, {}), ctx())).status).toBe(401);
    expect((await PUT(put(payload, { cookie: issueCookie().split(";")[0] }), ctx())).status).toBe(401);
    expect((await PUT(put(payload, { authorization: "Bearer wrong" }), ctx())).status).toBe(401);
    expect(S.docs.has(`listings/${ID}`)).toBe(false);
  });

  it("validates the listings, stores them with the trip, and reports what happened", async () => {
    const res = await PUT(put(payload), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report).toMatchObject({ updated: ["Midway"], kept: [], passed: [], unknown: [] });
    const stored = S.docs.get(`listings/${ID}`) as { stops: Record<string, { listings: Array<{ title: string }> }> };
    expect(stored.stops.Midway.listings.map((l) => l.title)).toEqual(["Jazz night"]);
    expect(body.listings).toEqual(stored);
  });

  it("refuses an id that is not a trip id, a trip that does not exist, and one that has ended", async () => {
    expect((await PUT(put(payload), ctx("nope"))).status).toBe(400);
    S.docs.delete(`trips/${ID}`);
    expect((await PUT(put(payload), ctx())).status).toBe(404);
    S.docs.set(`trips/${ID}`, trip({ start: at(-48), end: at(-24) }));
    const ended = await PUT(put(payload), ctx());
    expect(ended.status).toBe(409);
    expect((await ended.json()).code).toBe("trip_ended");
    expect(S.docs.has(`listings/${ID}`)).toBe(false);
  });

  it("needs the corridor first, since it says where the traveller is when", async () => {
    S.docs.delete(`corridors/${ID}`);
    const res = await PUT(put(payload), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_corridor");
  });

  it("refuses a payload that would blank the trip, and one that is not JSON, without storing anything", async () => {
    const empty = await PUT(put({ stops: { Midway: [] } }), ctx());
    expect(empty.status).toBe(400);
    expect((await empty.json()).code).toBe("empty_payload");
    const bad = await PUT(put({ stops: "x" }), ctx());
    expect((await bad.json()).code).toBe("bad_payload");
    const notJson = await PUT(put("{nope"), ctx());
    expect(notJson.status).toBe(400);
    expect(S.docs.has(`listings/${ID}`)).toBe(false);
  });

  it("refuses a body that is too large", async () => {
    const big = { stops: { Midway: [{ ...listing("x"), notes: "y".repeat(600_000) }] } };
    expect((await PUT(put(big), ctx())).status).toBe(413);
  });

  it("answers a store failure without exposing the details", async () => {
    S.throws = true;
    const res = await PUT(put(payload), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("redis down");
  });
});
