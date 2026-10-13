import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRefreshJob, isRoutine, issueCookie, readGate } from "./auth";

const req = (headers: Record<string, string> = {}) => new Request("https://x.test/", { headers });
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

beforeEach(() => {
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "refresh-secret";
  process.env.CRON_SECRET = "cron-secret";
  process.env.ROUTINE_SECRET = "routine-secret";
});
afterEach(() => {
  delete process.env.ROUTINE_SECRET;
});

describe("the routine's token", () => {
  it("is the routine's own, and neither the refresh job's nor the cron's", () => {
    expect(isRoutine(req(bearer("routine-secret")))).toBe(true);
    expect(isRoutine(req(bearer("refresh-secret")))).toBe(false);
    expect(isRoutine(req(bearer("cron-secret")))).toBe(false);
    expect(isRefreshJob(req(bearer("routine-secret")))).toBe(false);
  });

  it("does not exist until it is set, and an empty header never matches", () => {
    delete process.env.ROUTINE_SECRET;
    expect(isRoutine(req(bearer("routine-secret")))).toBe(false);
    expect(isRoutine(req(bearer("")))).toBe(false);
    expect(isRoutine(req())).toBe(false);
  });
});

describe("readGate", () => {
  it("lets the routine, the refresh job and a signed-in browser read, and turns everyone else away", () => {
    expect(readGate(req(bearer("routine-secret")))).toBeNull();
    expect(readGate(req(bearer("refresh-secret")))).toBeNull();
    expect(readGate(req({ cookie: issueCookie().split(";")[0] }))).toBeNull();
    expect(readGate(req(bearer("nope")))?.status).toBe(401);
    expect(readGate(req())?.status).toBe(401);
  });
});
