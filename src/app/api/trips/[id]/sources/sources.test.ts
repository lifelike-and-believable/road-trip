import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), build: vi.fn(), makeAsk: vi.fn() }));

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
vi.mock("../../../../../lib/sources", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/sources")>();
  return { ...real, buildSources: S.build };
});
vi.mock("../../../../../lib/anthropic", () => ({ makeAsk: S.makeAsk, askModel: () => "test-model" }));

import { GET, POST } from "./route";
import { issueCookie } from "../../../../../lib/auth";
import { SourcesError } from "../../../../../lib/sources";

const ID = "11111111-1111-1111-1111-111111111111";
const day = 86400000;
const trip = (over: Record<string, unknown> = {}) => ({
  id: ID, createdAt: new Date().toISOString(),
  from: { label: "A" }, to: { label: "B" },
  start: new Date(Date.now() + 2 * day).toISOString(), end: new Date(Date.now() + 4 * day).toISOString(),
  roundTrip: false, ...over,
});
const CORRIDOR = { tripId: ID, legs: [] };
const LIST = { tripId: ID, sources: [{ name: "x" }] };

const signedIn = () => ({ cookie: issueCookie().split(";")[0] });
const req = (method: string, headers: Record<string, string> = signedIn()) =>
  new Request(`https://x.test/api/trips/${ID}/sources`, { method, headers });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/sources">;

beforeEach(() => {
  S.docs.clear();
  S.build.mockReset().mockResolvedValue(LIST);
  S.makeAsk.mockReset().mockReturnValue(vi.fn());
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/trips/[id]/sources", () => {
  const ready = () => {
    S.docs.set(`trips/${ID}`, trip());
    S.docs.set(`corridors/${ID}`, CORRIDOR);
  };

  it("requires sign-in or the job's token", async () => {
    ready();
    expect((await POST(req("POST", {}), ctx())).status).toBe(401);
    expect(S.build).not.toHaveBeenCalled();
    expect((await POST(req("POST", { authorization: "Bearer job-secret" }), ctx())).status).toBe(201);
  });

  it("builds from the trip and its corridor, stores the list and returns it", async () => {
    ready();
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(LIST);
    expect(S.docs.get(`sources/${ID}`)).toEqual(LIST);
    expect(S.build).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), CORRIDOR, expect.any(Date), expect.objectContaining({ model: "test-model" }));
  });

  it("returns the stored list without asking again", async () => {
    ready();
    S.docs.set(`sources/${ID}`, LIST);
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(S.build).not.toHaveBeenCalled();
  });

  it("does nothing for an ended trip", async () => {
    S.docs.set(`trips/${ID}`, trip({ start: new Date(Date.now() - 3 * day).toISOString(), end: new Date(Date.now() - 2 * day).toISOString() }));
    S.docs.set(`corridors/${ID}`, CORRIDOR);
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("trip_ended");
    expect(S.build).not.toHaveBeenCalled();
  });

  it("asks for the corridor first when there is none", async () => {
    S.docs.set(`trips/${ID}`, trip());
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_corridor");
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

  it("answers 502 for upstream trouble or a refusal, and 422 when nothing usable came back", async () => {
    ready();
    for (const [code, status] of [["upstream", 502], ["refused", 502], ["bad_output", 502], ["no_sources", 422]] as const) {
      S.build.mockRejectedValueOnce(new SourcesError(code, `m-${code}`));
      const res = await POST(req("POST"), ctx());
      expect(res.status).toBe(status);
      expect((await res.json()).code).toBe(code);
    }
    expect(S.docs.has(`sources/${ID}`)).toBe(false);
  });

  it("answers 500 without leaking an unexpected error", async () => {
    ready();
    S.build.mockRejectedValueOnce(new Error("secret internals"));
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret internals/);
  });
});

describe("GET /api/trips/[id]/sources", () => {
  it("requires sign-in", async () => {
    expect((await GET(req("GET", {}), ctx())).status).toBe(401);
  });
  it("returns the stored list, also after the trip ends", async () => {
    S.docs.set(`sources/${ID}`, LIST);
    expect(await (await GET(req("GET"), ctx())).json()).toEqual(LIST);
  });
  it("answers 404 when none is built and 400 for a malformed id", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("no_sources");
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(400);
  });
});
