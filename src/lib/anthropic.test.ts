import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { askModel, makeAsk } from "./anthropic";
import { SourcesError } from "./sources";

type Body = {
  model: string;
  system: string;
  max_tokens: number;
  fallbacks: unknown;
  tools: unknown;
  messages: Array<{ role: string; content: unknown }>;
};
type Sent = { headers: Headers; body: Body };

function clientReplying(...replies: Array<{ status?: number; body: unknown }>) {
  const sent: Sent[] = [];
  let i = 0;
  const fetch = async (_url: unknown, init?: RequestInit) => {
    sent.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const r = replies[Math.min(i++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { sent, client: new Anthropic({ apiKey: "test-key", fetch: fetch as never, maxRetries: 0 }) };
}

const message = (content: unknown[], stop_reason = "end_turn") => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
  content, stop_reason, stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});
const text = (t: string) => ({ type: "text", text: t });
const search = (id: string) => ({ type: "server_tool_use", id, name: "web_search", input: { query: "x" }, caller: { type: "direct" } });
const ask = { system: "SYS", user: "USER" };

afterEach(() => {
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("askModel", () => {
  it("defaults to Claude Opus 5.5 and can be overridden", () => {
    expect(askModel()).toBe("claude-opus-5-5");
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    expect(askModel()).toBe("claude-sonnet-5-5");
  });
});

describe("makeAsk", () => {
  it("refuses to start without a key, with a message that names the setting", () => {
    expect(() => makeAsk()).toThrowError(expect.objectContaining({ code: "not_configured", message: expect.stringContaining("ANTHROPIC_API_KEY") }));
  });

  it("sends the prompt with web search and server-side fallbacks, and returns the joined text and search count", async () => {
    const { client, sent } = clientReplying({ body: message([search("s1"), search("s2"), text('{"sources":'), text("[]}")]) });
    const out = await makeAsk(client)(ask);
    expect(out).toEqual({ text: '{"sources":[]}', searches: 2 });

    const { body, headers } = sent[0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.system).toBe("SYS");
    expect(body.messages).toEqual([{ role: "user", content: "USER" }]);
    expect(body.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 6 }]);
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("uses the configured model", async () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    const { client, sent } = clientReplying({ body: message([text("{}")]) });
    await makeAsk(client)(ask);
    expect(sent[0].body.model).toBe("claude-sonnet-5-5");
  });

  it("resumes a paused turn by sending the assistant content back, with no extra user message", async () => {
    const paused = message([search("s1")], "pause_turn");
    const { client, sent } = clientReplying({ body: paused }, { body: message([search("s2"), text("done")]) });
    const out = await makeAsk(client)(ask);
    expect(out).toEqual({ text: "done", searches: 2 });
    expect(sent).toHaveLength(2);
    const msgs = sent[1].body.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1].role).toBe("assistant");
    expect((msgs[1].content as Array<Record<string, unknown>>)[0]).toMatchObject({ type: "server_tool_use", id: "s1" });
  });

  it("gives up after a few pauses instead of looping", async () => {
    const { client, sent } = clientReplying({ body: message([search("s")], "pause_turn") });
    await expect(makeAsk(client)(ask)).rejects.toMatchObject({ code: "upstream" });
    expect(sent.length).toBeLessThanOrEqual(6);
  });

  it("reports a refusal and a cut-off reply as errors", async () => {
    const refused = clientReplying({ body: message([], "refusal") });
    await expect(makeAsk(refused.client)(ask)).rejects.toMatchObject({ code: "refused" });
    const cut = clientReplying({ body: message([text("{")], "max_tokens") });
    await expect(makeAsk(cut.client)(ask)).rejects.toMatchObject({ code: "bad_output" });
  });

  it("turns API errors into SourcesError without leaking the key or the response body", async () => {
    for (const status of [401, 429, 500]) {
      const { client } = clientReplying({ status, body: { type: "error", error: { type: "x", message: "secret details test-key" } } });
      const err = await makeAsk(client)(ask).catch((e) => e);
      expect(err).toBeInstanceOf(SourcesError);
      expect(err.code).toBe("upstream");
      expect(err.message).not.toMatch(/test-key|secret details/);
      expect(err.message).toContain(String(status));
    }
  });
});
