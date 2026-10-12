import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ trips: [] as unknown[], runAll: vi.fn(), throws: false }));

vi.mock("../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../lib/store")>();
  return {
    ...real,
    listDocs: async () => {
      if (S.throws) throw new Error("redis down");
      return S.trips.map((data, i) => ({ id: String(i), data }));
    },
  };
});
vi.mock("../../../lib/pipeline", () => ({ runAll: S.runAll }));

import { GET, POST } from "./route";
import { issueCookie } from "../../../lib/auth";

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/refresh", { method, headers });

beforeEach(() => {
  S.trips = [{ id: "t1" }, { id: "t2" }];
  S.throws = false;
  S.runAll.mockReset().mockResolvedValue({ runs: [{ tripId: "t1" }], ended: ["t2"], deferred: [] });
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
  process.env.CRON_SECRET = "cron-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the refresh job", () => {
  it("refuses a request without a job token, including a signed-in browser", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { cookie: issueCookie().split(";")[0] }))).status).toBe(401);
    expect((await GET(req("GET", { authorization: "Bearer wrong" }))).status).toBe(401);
    expect(S.runAll).not.toHaveBeenCalled();
  });

  it("runs for Vercel's cron (GET with CRON_SECRET) and for a manual POST with REFRESH_SECRET", async () => {
    expect((await GET(req("GET", { authorization: "Bearer cron-secret" }))).status).toBe(200);
    expect((await POST(req("POST", { authorization: "Bearer job-secret" }))).status).toBe(200);
    expect(S.runAll).toHaveBeenCalledTimes(2);
  });

  it("hands every stored trip to the pipeline with a deadline well inside the function's time limit", async () => {
    const before = Date.now();
    const res = await GET(req("GET", { authorization: "Bearer cron-secret" }));
    const [trips, deps] = S.runAll.mock.calls[0];
    expect(trips).toEqual([{ id: "t1" }, { id: "t2" }]);
    expect(deps.deadline).toBeGreaterThan(before + 60_000);
    expect(deps.deadline).toBeLessThanOrEqual(Date.now() + 250_000);
    expect(typeof deps.getDoc).toBe("function");
    expect(typeof deps.buildCorridor).toBe("function");
    expect(typeof deps.buildSources).toBe("function");
    expect(await res.json()).toMatchObject({ runs: [{ tripId: "t1" }], ended: ["t2"], deferred: [] });
  });

  it("does not fail the whole job because the Anthropic key is missing until a stage needs it", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await GET(req("GET", { authorization: "Bearer cron-secret" }));
    expect(res.status).toBe(200);
    const deps = S.runAll.mock.calls[0][1];
    await expect(deps.ask({ system: "s", user: "u" })).rejects.toMatchObject({ code: "not_configured" });
  });

  it("answers 500 without leaking a store error", async () => {
    S.throws = true;
    const res = await GET(req("GET", { authorization: "Bearer cron-secret" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/redis down/);
  });
});
