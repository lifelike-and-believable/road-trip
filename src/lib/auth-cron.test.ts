import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRefreshJob } from "./auth";

const req = (authorization?: string, cookie?: string) =>
  new Request("https://x.test/", { headers: { ...(authorization ? { authorization } : {}), ...(cookie ? { cookie } : {}) } });

beforeEach(() => {
  process.env.AUTH_SECRET = "s3cret";
});
afterEach(() => {
  delete process.env.REFRESH_SECRET;
  delete process.env.CRON_SECRET;
});

describe("isRefreshJob with Vercel's cron secret", () => {
  it("accepts the bearer token Vercel's cron sends when CRON_SECRET is set", () => {
    process.env.CRON_SECRET = "cron-secret";
    expect(isRefreshJob(req("Bearer cron-secret"))).toBe(true);
  });

  it("still accepts REFRESH_SECRET, and either one when both are set", () => {
    process.env.REFRESH_SECRET = "job-secret";
    process.env.CRON_SECRET = "cron-secret";
    expect(isRefreshJob(req("Bearer job-secret"))).toBe(true);
    expect(isRefreshJob(req("Bearer cron-secret"))).toBe(true);
  });

  it("refuses a wrong or missing token, and everything when neither secret is set", () => {
    process.env.CRON_SECRET = "cron-secret";
    expect(isRefreshJob(req("Bearer nope"))).toBe(false);
    expect(isRefreshJob(req())).toBe(false);
    expect(isRefreshJob(req("Bearer "))).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isRefreshJob(req("Bearer cron-secret"))).toBe(false);
    expect(isRefreshJob(req("Bearer undefined"))).toBe(false);
  });
});
