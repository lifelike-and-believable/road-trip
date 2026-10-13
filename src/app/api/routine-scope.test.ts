import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => S.docs.get(p) ?? null,
    setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
    deleteDoc: async (p: string) => void S.docs.delete(p),
    listDocs: async (c: string) =>
      [...S.docs].filter(([k]) => k.startsWith(`${c}/`)).map(([k, data]) => ({ id: k.split("/").pop()!, data })),
  };
});
vi.mock("../../lib/anthropic", () => ({ makeAsk: () => vi.fn(), askModel: () => "m" }));
vi.mock("../../lib/corridor", async (orig) => ({ ...(await orig<object>()), buildCorridor: vi.fn() }));

import { issueCookie } from "../../lib/auth";
import * as trips from "./trips/route";
import * as trip from "./trips/[id]/route";
import * as corridor from "./trips/[id]/corridor/route";
import * as sources from "./trips/[id]/sources/route";
import * as listings from "./trips/[id]/listings/route";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const ctx = { params: Promise.resolve({ id: ID }) };
const asCtx = <T>() => ctx as unknown as T;

const routine = { authorization: "Bearer routine-secret" };
const call = (method: string, headers: Record<string, string>, body?: unknown) =>
  new Request(`https://x.test/api/x`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  S.docs.clear();
  S.docs.set(`trips/${ID}`, {
    id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false,
  });
  S.docs.set(`corridors/${ID}`, {
    tripId: ID, builtAt: at(-1), from: { label: "A", lat: 0, lon: 0 }, to: { label: "B", lat: 0, lon: 0 },
    sources: { geocoding: "g", routing: "r", timing: "t" },
    legs: [{ id: "out", distanceKm: 1, driveMinutes: 1, arriveAt: at(30), fits: true,
      stops: [{ name: "Midway", region: "NY", lat: 0, lon: 0, kind: "along", km: 0, from: at(30), until: at(30) }] }],
  });
  S.docs.set(`sources/${ID}`, { tripId: ID, sources: [] });
  S.docs.set(`listings/${ID}`, { tripId: ID, updatedAt: at(-1), stops: {} });
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "refresh-secret";
  process.env.CRON_SECRET = "cron-secret";
  process.env.ROUTINE_SECRET = "routine-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("what the routine's token can reach", () => {
  it("reads the trips, the corridor, the sources and the listings", async () => {
    expect((await trips.GET(call("GET", routine))).status).toBe(200);
    expect((await corridor.GET(call("GET", routine), asCtx<Parameters<typeof corridor.GET>[1]>())).status).toBe(200);
    expect((await sources.GET(call("GET", routine), asCtx<Parameters<typeof sources.GET>[1]>())).status).toBe(200);
    expect((await listings.GET(call("GET", routine), asCtx<Parameters<typeof listings.GET>[1]>())).status).toBe(200);
  });

  it("posts listings", async () => {
    const body = { stops: { Midway: [{ title: "Jazz", source: "https://a.example/e", schedule: { kind: "fixed", start: at(31) } }] } };
    const res = await listings.PUT(call("PUT", routine, body), asCtx<Parameters<typeof listings.PUT>[1]>());
    expect(res.status).toBe(200);
  });

  it("cannot create, read one, or delete a trip, or build a corridor or sources, or have the server read places", async () => {
    const denied = [
      await trips.POST(call("POST", routine, { from: "A" })),
      await trip.GET(call("GET", routine), asCtx<Parameters<typeof trip.GET>[1]>()),
      await trip.DELETE(call("DELETE", routine), asCtx<Parameters<typeof trip.DELETE>[1]>()),
      await corridor.POST(call("POST", routine), asCtx<Parameters<typeof corridor.POST>[1]>()),
      await sources.POST(call("POST", routine), asCtx<Parameters<typeof sources.POST>[1]>()),
      await listings.POST(call("POST", routine), asCtx<Parameters<typeof listings.POST>[1]>()),
    ];
    expect(denied.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(S.docs.has(`trips/${ID}`)).toBe(true);
    expect(S.docs.has(`listings/${ID}`)).toBe(true);
  });
});

// The routine reads web pages while holding its token, so the token is given only what the routine uses:
// the stops and their times, never where a trip starts and ends, which is often a home address.
describe("what the routine's token is shown", () => {
  it("lists trips without their start and end places", async () => {
    S.docs.set(`trips/${ID}`, { ...(S.docs.get(`trips/${ID}`) as object), from: { label: "12 Rue Secrète, Montréal" }, to: { label: "B", lat: 1, lon: 2 } });
    const body = await (await trips.GET(call("GET", routine))).json();
    expect(body.trips[0]).toMatchObject({ id: ID, status: expect.any(String), start: expect.any(String), end: expect.any(String) });
    expect(body.trips[0]).not.toHaveProperty("from");
    expect(body.trips[0]).not.toHaveProperty("to");
    expect(JSON.stringify(body)).not.toContain("Secrète");
  });

  it("gives the corridor's stops and times without its ends or the road itself", async () => {
    S.docs.set(`corridors/${ID}`, { ...(S.docs.get(`corridors/${ID}`) as object), line: [[-73.6, 45.5], [-73.4, 44.7]] });
    const body = await (await corridor.GET(call("GET", routine), asCtx<Parameters<typeof corridor.GET>[1]>())).json();
    expect(body.legs[0].stops[0]).toMatchObject({ name: "Midway", region: "NY", from: expect.any(String), until: expect.any(String) });
    expect(body).not.toHaveProperty("from");
    expect(body).not.toHaveProperty("to");
    expect(body).not.toHaveProperty("line");
  });

  it("still shows a signed-in traveller everything", async () => {
    const owner = { cookie: issueCookie().split(";")[0] };
    const list = await (await trips.GET(call("GET", owner))).json();
    expect(list.trips[0]).toHaveProperty("from");
    const c = await (await corridor.GET(call("GET", owner), asCtx<Parameters<typeof corridor.GET>[1]>())).json();
    expect(c).toHaveProperty("from");
  });
});

describe("who may post listings", () => {
  const body = { stops: { Midway: [{ title: "Jazz", source: "https://a.example/e", schedule: { kind: "fixed", start: at(31) } }] } };
  const put = (headers: Record<string, string>) =>
    listings.PUT(call("PUT", headers, body), asCtx<Parameters<typeof listings.PUT>[1]>());

  it("only the routine's token, not the refresh job's, the cron's or a signed-in browser's", async () => {
    expect((await put({ authorization: "Bearer refresh-secret" })).status).toBe(401);
    expect((await put({ authorization: "Bearer cron-secret" })).status).toBe(401);
    expect((await put({})).status).toBe(401);
    expect((await put(routine)).status).toBe(200);
  });

  it("no one, until the routine's token is set", async () => {
    delete process.env.ROUTINE_SECRET;
    expect((await put(routine)).status).toBe(401);
    expect((await put({ authorization: "Bearer refresh-secret" })).status).toBe(401);
  });
});
