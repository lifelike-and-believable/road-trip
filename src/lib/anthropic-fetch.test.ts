import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { makeAsk } from "./anthropic";

function clientReplying() {
  const bodies: Array<{ tools: unknown }> = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const body = {
      id: "m", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { bodies, client: new Anthropic({ apiKey: "k", fetch: fetch as never, maxRetries: 0 }) };
}

describe("makeAsk tools", () => {
  it("searches only by default", async () => {
    const { client, bodies } = clientReplying();
    await makeAsk(client)({ system: "s", user: "u" });
    expect(bodies[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 6 }]);
  });

  it("can also read the pages it is given, with a limit on how many", async () => {
    const { client, bodies } = clientReplying();
    await makeAsk(client)({ system: "s", user: "u", tools: "search+fetch" });
    expect(bodies[0].tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: 6 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
    ]);
  });
});
