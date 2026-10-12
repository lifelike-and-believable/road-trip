import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCookie, isAuthed, isRefreshJob, issueCookie, safeEqual } from "./auth";

const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });
const cookieValue = (setCookie: string) => setCookie.split(";")[0];

beforeEach(() => {
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.AUTH_SECRET;
  delete process.env.REFRESH_SECRET;
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("session cookie", () => {
  it("is HttpOnly, Secure, SameSite=Lax and lasts a year", () => {
    const c = issueCookie();
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=31536000/);
  });

  it("authenticates a request carrying a fresh cookie", () => {
    expect(isAuthed(req({ cookie: cookieValue(issueCookie()) }))).toBe(true);
  });

  it("rejects a missing, tampered or foreign-secret cookie", () => {
    const good = cookieValue(issueCookie());
    expect(isAuthed(req({}))).toBe(false);
    expect(isAuthed(req({ cookie: good.slice(0, -2) + "xx" }))).toBe(false);
    process.env.AUTH_SECRET = "other";
    expect(isAuthed(req({ cookie: good }))).toBe(false);
  });

  it("expires after a year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cookie = cookieValue(issueCookie());
    vi.setSystemTime(new Date("2027-01-02T00:00:00Z"));
    expect(isAuthed(req({ cookie }))).toBe(false);
  });

  it("is rejected, not thrown on, when AUTH_SECRET is unset", () => {
    const cookie = cookieValue(issueCookie());
    delete process.env.AUTH_SECRET;
    expect(isAuthed(req({ cookie }))).toBe(false);
  });

  it("clears with Max-Age=0", () => {
    expect(clearCookie()).toMatch(/Max-Age=0/);
  });
});

describe("refresh job", () => {
  it("accepts the bearer token and nothing else", () => {
    expect(isRefreshJob(req({ authorization: "Bearer job-secret" }))).toBe(true);
    expect(isRefreshJob(req({ authorization: "Bearer nope" }))).toBe(false);
    expect(isRefreshJob(req({}))).toBe(false);
  });
  it("refuses everything when REFRESH_SECRET is unset", () => {
    delete process.env.REFRESH_SECRET;
    expect(isRefreshJob(req({ authorization: "Bearer " }))).toBe(false);
    expect(isRefreshJob(req({ authorization: "Bearer undefined" }))).toBe(false);
  });
});
