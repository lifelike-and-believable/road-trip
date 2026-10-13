import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ counts: new Map<string, number>(), down: false }));

vi.mock("../../../lib/store", async (orig) => ({
  ...(await orig<object>()),
  readCount: async (name: string) => {
    if (S.down) throw new Error("Redis returned 503");
    return S.counts.get(name) ?? 0;
  },
  bumpCount: async (name: string) => {
    if (S.down) throw new Error("Redis returned 503");
    S.counts.set(name, (S.counts.get(name) ?? 0) + 1);
  },
}));

import { POST } from "./route";

const post = (passcode: string, ip = "203.0.113.7") =>
  new Request("https://x.test/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: JSON.stringify({ passcode }),
  });

beforeEach(() => {
  S.counts.clear();
  S.down = false;
  process.env.AUTH_SECRET = "s3cret";
  process.env.BOARD_PASSCODE = "open sesame";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// One shared passcode is the only way in, so guessing it is slowed to ten wrong tries a quarter of an hour from one address.
describe("wrong passcodes", () => {
  it("are refused for a while after ten from one address, even when the next one is right", async () => {
    for (let i = 0; i < 10; i++) expect((await POST(post("nope"))).status).toBe(401);
    const blocked = await POST(post("open sesame"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(await blocked.json()).toMatchObject({ code: "too_many_attempts" });
  });

  it("are counted per address, so another address can still sign in", async () => {
    for (let i = 0; i < 10; i++) await POST(post("nope"));
    expect((await POST(post("open sesame", "198.51.100.4"))).status).toBe(200);
  });

  it("do not count a right passcode", async () => {
    for (let i = 0; i < 20; i++) expect((await POST(post("open sesame"))).status).toBe(200);
  });

  it("still let the traveller in when the store cannot count, since the board needs the store anyway", async () => {
    S.down = true;
    expect((await POST(post("open sesame"))).status).toBe(200);
    expect((await POST(post("nope"))).status).toBe(401);
  });
});
