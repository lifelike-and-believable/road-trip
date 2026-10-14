import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), counts: new Map<string, number>() }));

vi.mock("../../../../../lib/store", async (orig) => ({
  ...(await orig<typeof import("../../../../../lib/store")>()),
  getDoc: async (p: string) => S.docs.get(p) ?? null,
  setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
  readCount: async (n: string) => S.counts.get(n) ?? 0,
  bumpCount: async (n: string) => void S.counts.set(n, (S.counts.get(n) ?? 0) + 1),
}));

import { PUT } from "./route";

const ID = "11111111-1111-1111-1111-111111111111";
const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
// Thirty towns, more than one run of the routine reads.
const names = Array.from({ length: 30 }, (_, i) => `Town ${i}`);
const corridor = {
  tripId: ID, builtAt: at(-1), from: { label: "A", lat: 0, lon: 0 }, to: { label: "B", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{ id: "out", distanceKm: 1500, driveMinutes: 1200, arriveAt: at(60), fits: true,
    stops: names.map((name, i) => ({ name, region: "NY", lat: 0, lon: 0, km: i * 50, from: at(24 + i), until: at(24 + i) })) }],
};
const posted = (count: number) => ({
  stops: Object.fromEntries(names.slice(0, count).map((n, i) => [n, [{
    title: `Show in ${n}`, source: "https://a.example/events", category: "music", cost: "free",
    schedule: { kind: "fixed", start: at(24 + i), durationMin: 60 },
  }]])),
});
const put = (body: unknown) =>
  PUT(new Request(`https://x.test/api/trips/${ID}/listings`, { method: "PUT", headers: { authorization: "Bearer routine-secret", "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: ID }) } as RouteContext<"/api/trips/[id]/listings">);

let fired: string[];

beforeEach(() => {
  S.docs.clear();
  S.counts.clear();
  fired = [];
  S.docs.set(`trips/${ID}`, { id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(20), end: at(80), roundTrip: false });
  S.docs.set(`corridors/${ID}`, corridor);
  process.env.ROUTINE_SECRET = "routine-secret";
  process.env.ROUTINE_FIRE_URL = "https://api.example/routines/trig_1/fire";
  process.env.ROUTINE_FIRE_TOKEN = "fire-token";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    fired.push(JSON.parse(String(init.body)).text);
    return new Response("{}", { status: 200 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ROUTINE_FIRE_URL;
  delete process.env.ROUTINE_FIRE_TOKEN;
  delete process.env.LISTINGS_BY;
});

// A long trip has more towns than one run of the routine reads; the app starts it again for the rest.
describe("PUT listings on a long trip", () => {
  it("starts the routine again to read the towns still unread, and says how many there are", async () => {
    const res = await put(posted(25));
    expect(res.status).toBe(200);
    expect((await res.json()).unread).toBe(5);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatch(new RegExp(`^Continue trip ${ID}:`));
  });

  it("does not start it again once every town is read", async () => {
    await put(posted(30));
    expect(fired).toHaveLength(0);
  });

  it("starts it again at most four times a day for a trip", async () => {
    for (let i = 0; i < 6; i++) await put(posted(25));
    expect(fired).toHaveLength(4);
  });

  it("leaves it to the daily run when the routine is not set up to be started, or the server reads the listings", async () => {
    delete process.env.ROUTINE_FIRE_URL;
    await put(posted(25));
    process.env.ROUTINE_FIRE_URL = "https://api.example/routines/trig_1/fire";
    process.env.LISTINGS_BY = "cron";
    await put(posted(25));
    expect(fired).toHaveLength(0);
  });
});
