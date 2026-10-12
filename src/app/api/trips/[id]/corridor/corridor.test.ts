import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), build: vi.fn() }));

vi.mock("../../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => S.docs.get(p) ?? null,
    setDoc: async (p: string, d: unknown) => {
      S.docs.set(p, d);
    },
  };
});
vi.mock("../../../../../lib/corridor", () => ({ buildCorridor: S.build }));

import { GET, POST } from "./route";
import { issueCookie } from "../../../../../lib/auth";
import { OsmError } from "../../../../../lib/osm";

const ID = "11111111-1111-1111-1111-111111111111";
const day = 86400000;
const trip = (over: Record<string, unknown> = {}) => ({
  id: ID,
  createdAt: new Date().toISOString(),
  from: { label: "Alpha" },
  to: { label: "Omega" },
  start: new Date(Date.now() + 2 * day).toISOString(),
  end: new Date(Date.now() + 4 * day).toISOString(),
  roundTrip: false,
  ...over,
});
const CORRIDOR = { tripId: ID, builtAt: "2026-10-12T12:00:00.000Z", legs: [] };

const signedIn = () => ({ cookie: issueCookie().split(";")[0] });
const req = (method: string, headers: Record<string, string> = signedIn()) =>
  new Request(`https://x.test/api/trips/${ID}/corridor`, { method, headers });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/corridor">;

beforeEach(() => {
  S.docs.clear();
  S.build.mockReset();
  S.build.mockResolvedValue(CORRIDOR);
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/trips/[id]/corridor", () => {
  it("refuses a request that is not signed in", async () => {
    S.docs.set(`trips/${ID}`, trip());
    expect((await POST(req("POST", {}), ctx())).status).toBe(401);
    expect(S.build).not.toHaveBeenCalled();
  });

  it("lets the refresh job build one", async () => {
    S.docs.set(`trips/${ID}`, trip());
    const res = await POST(req("POST", { authorization: "Bearer job-secret" }), ctx());
    expect(res.status).toBe(201);
  });

  it("builds, stores and returns the corridor for an active trip", async () => {
    S.docs.set(`trips/${ID}`, trip());
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(CORRIDOR);
    expect(S.docs.get(`corridors/${ID}`)).toEqual(CORRIDOR);
    expect(S.build).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), expect.any(Date));
  });

  it("returns the stored corridor without building again", async () => {
    S.docs.set(`trips/${ID}`, trip());
    S.docs.set(`corridors/${ID}`, CORRIDOR);
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(S.build).not.toHaveBeenCalled();
  });

  it("does not build for a trip that has ended", async () => {
    S.docs.set(`trips/${ID}`, trip({
      start: new Date(Date.now() - 3 * day).toISOString(),
      end: new Date(Date.now() - 2 * day).toISOString(),
    }));
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("trip_ended");
    expect(S.build).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown trip and 400 for a malformed id", async () => {
    expect((await POST(req("POST"), ctx())).status).toBe(404);
    expect((await POST(req("POST"), ctx("../x"))).status).toBe(400);
  });

  it("answers 422 when a place cannot be found or no road joins the places", async () => {
    S.docs.set(`trips/${ID}`, trip());
    S.build.mockRejectedValueOnce(new OsmError("not_found", 'no place found for "Alpha"'));
    const a = await POST(req("POST"), ctx());
    expect(a.status).toBe(422);
    expect(await a.json()).toMatchObject({ code: "not_found", error: 'no place found for "Alpha"' });
    S.build.mockRejectedValueOnce(new OsmError("no_route", "no driving route between the places"));
    expect((await POST(req("POST"), ctx())).status).toBe(422);
    expect(S.docs.has(`corridors/${ID}`)).toBe(false);
  });

  it("answers 502 when the map services fail", async () => {
    S.docs.set(`trips/${ID}`, trip());
    S.build.mockRejectedValueOnce(new OsmError("upstream", "router.project-osrm.org answered 503"));
    expect((await POST(req("POST"), ctx())).status).toBe(502);
  });

  it("answers 500 without leaking an unexpected error", async () => {
    S.docs.set(`trips/${ID}`, trip());
    S.build.mockRejectedValueOnce(new Error("secret internals"));
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret internals/);
  });
});

describe("GET /api/trips/[id]/corridor", () => {
  it("requires sign-in", async () => {
    expect((await GET(req("GET", {}), ctx())).status).toBe(401);
  });

  it("returns the stored corridor, and still does for an ended trip", async () => {
    S.docs.set(`corridors/${ID}`, CORRIDOR);
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CORRIDOR);
  });

  it("answers 404 when none has been built, and 400 for a malformed id", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("no_corridor");
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(400);
  });
});
