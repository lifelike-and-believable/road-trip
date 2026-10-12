import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), refresh: vi.fn(), makeAsk: vi.fn() }));

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
vi.mock("../../../../../lib/refresh", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/refresh")>();
  return { ...real, refreshListings: S.refresh };
});
vi.mock("../../../../../lib/anthropic", () => ({ makeAsk: S.makeAsk, askModel: () => "m" }));

import { GET, POST } from "./route";
import { issueCookie } from "../../../../../lib/auth";
import { SourcesError } from "../../../../../lib/sources";

const ID = "11111111-1111-1111-1111-111111111111";
const day = 86400000;
const trip = (over: Record<string, unknown> = {}) => ({
  id: ID, createdAt: new Date().toISOString(), from: { label: "A" }, to: { label: "B" },
  start: new Date(Date.now() + 2 * day).toISOString(), end: new Date(Date.now() + 4 * day).toISOString(),
  roundTrip: false, ...over,
});
const DOC = { tripId: ID, updatedAt: "now", stops: { A: { refreshedAt: "now", listings: [] } } };
const REPORT = { updated: ["A"], kept: [], failed: [], fresh: [], passed: [], noSources: [], remaining: 0, usage: { inputTokens: 1, outputTokens: 1 } };

const signedIn = () => ({ cookie: issueCookie().split(";")[0] });
const req = (method: string, headers: Record<string, string> = signedIn(), query = "") =>
  new Request(`https://x.test/api/trips/${ID}/listings${query}`, { method, headers });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/listings">;

const ready = () => {
  S.docs.set(`trips/${ID}`, trip());
  S.docs.set(`corridors/${ID}`, { tripId: ID, legs: [] });
  S.docs.set(`sources/${ID}`, { tripId: ID, sources: [] });
};

beforeEach(() => {
  S.docs.clear();
  S.refresh.mockReset().mockResolvedValue({ doc: DOC, report: REPORT });
  S.makeAsk.mockReset().mockReturnValue(vi.fn());
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/trips/[id]/listings", () => {
  it("requires sign-in or the job's token", async () => {
    ready();
    expect((await POST(req("POST", {}), ctx())).status).toBe(401);
    expect((await POST(req("POST", { authorization: "Bearer job-secret" }), ctx())).status).toBe(200);
  });

  it("refreshes from the stored corridor and sources, stores the document, and returns it with the report", async () => {
    ready();
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listings: DOC, report: REPORT });
    expect(S.docs.get(`listings/${ID}`)).toEqual(DOC);
    const args = S.refresh.mock.calls[0];
    expect(args[0]).toMatchObject({ id: ID });
    expect(args[5]).toMatchObject({ force: false });
    expect(args[5].deadline).toBeGreaterThan(Date.now());
  });

  it("forces a re-read of recent places with ?force=1", async () => {
    ready();
    await POST(req("POST", signedIn(), "?force=1"), ctx());
    expect(S.refresh.mock.calls[0][5].force).toBe(true);
  });

  it("does not write when nothing was updated or kept", async () => {
    ready();
    S.refresh.mockResolvedValue({ doc: DOC, report: { ...REPORT, updated: [], failed: [{ stop: "A", code: "upstream" }] } });
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(S.docs.has(`listings/${ID}`)).toBe(false);
  });

  it("does nothing for an ended trip", async () => {
    S.docs.set(`trips/${ID}`, trip({ start: new Date(Date.now() - 3 * day).toISOString(), end: new Date(Date.now() - 2 * day).toISOString() }));
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("trip_ended");
    expect(S.refresh).not.toHaveBeenCalled();
  });

  it("asks for the corridor, then the sources, first", async () => {
    S.docs.set(`trips/${ID}`, trip());
    expect((await (await POST(req("POST"), ctx())).json()).code).toBe("no_corridor");
    S.docs.set(`corridors/${ID}`, { tripId: ID, legs: [] });
    expect((await (await POST(req("POST"), ctx())).json()).code).toBe("no_sources");
  });

  it("answers 404 for an unknown trip and 400 for a malformed id", async () => {
    expect((await POST(req("POST"), ctx())).status).toBe(404);
    expect((await POST(req("POST"), ctx("../x"))).status).toBe(400);
  });

  it("answers 503 when the Anthropic key is missing", async () => {
    ready();
    S.makeAsk.mockImplementation(() => { throw new SourcesError("not_configured", "ANTHROPIC_API_KEY is not set"); });
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not_configured");
  });

  it("answers 500 without leaking an unexpected error", async () => {
    ready();
    S.refresh.mockRejectedValueOnce(new Error("secret internals"));
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret internals/);
  });
});

describe("GET /api/trips/[id]/listings", () => {
  it("requires sign-in", async () => {
    expect((await GET(req("GET", {}), ctx())).status).toBe(401);
  });
  it("returns the stored listings, also after the trip ends", async () => {
    S.docs.set(`listings/${ID}`, DOC);
    expect(await (await GET(req("GET"), ctx())).json()).toEqual(DOC);
  });
  it("answers 404 when there are none and 400 for a malformed id", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("no_listings");
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(400);
  });
});
