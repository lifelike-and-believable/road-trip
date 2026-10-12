import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("GET /api/health", () => {
  it("reports whether the Anthropic key is set, never its value", async () => {
    const read = async () => (await GET(new Request("https://x.test/"))).json();
    expect((await read()).config.ANTHROPIC_API_KEY).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-do-not-leak";
    const body = await read();
    expect(body.config.ANTHROPIC_API_KEY).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-ant-do-not-leak");
  });
});
