import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { makeAsk } from "./anthropic";

type Body = { model: string; output_config?: { effort?: string } };

function clientReplying(...stopReasons: string[]) {
  const bodies: Body[] = [];
  let i = 0;
  const fetch = async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const stop_reason = stopReasons[Math.min(i++, stopReasons.length - 1)];
    const content = stop_reason === "pause_turn"
      ? [{ type: "server_tool_use", id: "s", name: "web_search", input: {}, caller: { type: "direct" } }]
      : [{ type: "text", text: "{}" }];
    const body = {
      id: "m", type: "message", role: "assistant", model: "x", content, stop_reason, stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { bodies, client: new Anthropic({ apiKey: "k", fetch: fetch as never, maxRetries: 0 }) };
}

afterEach(() => {
  delete process.env.ANTHROPIC_MODEL;
});

describe("reasoning effort", () => {
  // Claude Sonnet 5.5 defaults to high and Claude Opus 5.5 to medium, so leaving it unset
  // would make a change of model quietly change how much is spent on reasoning.
  it("is pinned to medium, whichever model is used", async () => {
    for (const model of [undefined, "claude-opus-5-5", "claude-sonnet-5-5"]) {
      if (model) process.env.ANTHROPIC_MODEL = model;
      else delete process.env.ANTHROPIC_MODEL;
      const { client, bodies } = clientReplying("end_turn");
      await makeAsk(client)({ system: "s", user: "u" });
      expect(bodies[0].output_config).toEqual({ effort: "medium" });
    }
  });

  it("is sent again when a paused turn is resumed", async () => {
    const { client, bodies } = clientReplying("pause_turn", "end_turn");
    await makeAsk(client)({ system: "s", user: "u" });
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.output_config?.effort)).toEqual(["medium", "medium"]);
  });
});
