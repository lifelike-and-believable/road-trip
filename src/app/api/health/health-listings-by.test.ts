import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.LISTINGS_BY;
  delete process.env.BOARD_PASSCODE;
});

describe("GET /api/health", () => {
  it("says who reads the listings, and reports the shared passcode by name without its value", async () => {
    const read = async () => (await GET(new Request("https://x.test/"))).json();
    expect((await read()).listingsBy).toBe("routine");
    process.env.LISTINGS_BY = "cron";
    expect((await read()).listingsBy).toBe("cron");

    expect((await read()).config.BOARD_PASSCODE).toBe(false);
    process.env.BOARD_PASSCODE = "do-not-leak";
    const body = await read();
    expect(body.config.BOARD_PASSCODE).toBe(true);
    expect(JSON.stringify(body)).not.toContain("do-not-leak");
  });
});
