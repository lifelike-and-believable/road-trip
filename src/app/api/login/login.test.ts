import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, POST } from "./route";
import { GET as session } from "../session/route";
import { GET as health } from "../health/route";

const post = (b: unknown) =>
  new Request("https://x.test/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });

beforeEach(() => {
  process.env.AUTH_SECRET = "s3cret";
  process.env.BOARD_PASSCODE = "open sesame";
});

describe("login", () => {
  it("sets the cookie for the right passcode", async () => {
    const res = await POST(post({ passcode: "open sesame" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^trip_auth=/);
  });

  it("refuses a wrong or missing passcode without a cookie", async () => {
    for (const b of [{ passcode: "nope" }, {}, { passcode: 5 }]) {
      const res = await POST(post(b));
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("answers 500 when the passcode is not configured", async () => {
    delete process.env.BOARD_PASSCODE;
    expect((await POST(post({ passcode: "" }))).status).toBe(500);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await POST(new Request("https://x.test/api/login", { method: "POST", body: "{x" }));
    expect(res.status).toBe(400);
  });

  it("clears the cookie on DELETE", async () => {
    expect((await DELETE()).headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("session and health", () => {
  it("reports whether the request is signed in", async () => {
    const cookie = (await POST(post({ passcode: "open sesame" }))).headers.get("set-cookie")!.split(";")[0];
    expect(await (await session(new Request("https://x.test/", { headers: { cookie } }))).json()).toEqual({ authed: true });
    expect(await (await session(new Request("https://x.test/"))).json()).toEqual({ authed: false });
  });

  it("reports which settings are present, as booleans only", async () => {
    process.env.DOC_SALT = "do-not-leak";
    const j = await (await health(new Request("https://x.test/"))).json();
    expect(j.config.DOC_SALT).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/do-not-leak|s3cret|open sesame/);
    delete process.env.DOC_SALT;
  });
});
