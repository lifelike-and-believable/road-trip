import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/health", () => {
  it("reports whether the cron secret is set, never its value", async () => {
    const read = async () => (await GET(new Request("https://x.test/"))).json();
    expect((await read()).config.CRON_SECRET).toBe(false);
    process.env.CRON_SECRET = "do-not-leak";
    const body = await read();
    expect(body.config.CRON_SECRET).toBe(true);
    expect(JSON.stringify(body)).not.toContain("do-not-leak");
  });
});
