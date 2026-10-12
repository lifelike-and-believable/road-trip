/* The one place the app calls Claude. Each request searches the web for event
   sources near a few stops. Written against the installed SDK's types. */

import Anthropic from "@anthropic-ai/sdk";
import { SourcesError, type Ask } from "./sources";

const DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_SEARCHES = 6;
const MAX_FETCHES = 10;
const SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES } as const;
const FETCH_TOOL = { type: "web_fetch_20260209", name: "web_fetch", max_uses: MAX_FETCHES } as const;
const MAX_TOKENS = 16_000;
/** A search-heavy turn can pause before it finishes; resume it a few times at most. */
const MAX_PAUSES = 4;

export const askModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

export function makeAsk(client?: Anthropic): Ask {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new SourcesError("not_configured", "ANTHROPIC_API_KEY is not set");
  }
  const anthropic = client ?? new Anthropic();

  return async ({ system, user, tools }) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
    let searches = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for (let pauses = 0; pauses <= MAX_PAUSES; pauses++) {
        const response = await anthropic.beta.messages.create({
          model: askModel(),
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system,
          tools: tools === "search+fetch" ? [SEARCH_TOOL, FETCH_TOOL] : [SEARCH_TOOL],
          messages,
        });
        searches += response.content.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;

        if (response.stop_reason === "refusal") throw new SourcesError("refused", "the model declined this request");
        if (response.stop_reason === "max_tokens") throw new SourcesError("bad_output", "the reply was cut off");
        if (response.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: response.content });
          continue;
        }
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        return { text, searches, inputTokens, outputTokens };
      }
    } catch (e) {
      if (e instanceof SourcesError) throw e;
      if (e instanceof Anthropic.APIError) {
        // The message names the status only: API error bodies can echo request details.
        throw new SourcesError("upstream", `the Anthropic API answered ${e.status ?? "with an error"}`);
      }
      throw e;
    }
    throw new SourcesError("upstream", "the search did not finish");
  };
}
