import { askModel, makeAsk } from "./anthropic";
import { buildCorridor } from "./corridor";
import type { PipelineDeps } from "./pipeline";
import { buildSources, type Ask } from "./sources";
import { getDoc, setDoc } from "./store";

/** The pipeline wired to the real store, map services and Claude. Shared by the daily refresh and a new trip. */
export function liveDeps(started: number, workBudgetMs: number, readListings: boolean): PipelineDeps {
  // Made on first use, so a missing key fails the stages that need Claude and not the corridor stage.
  let ask: Ask | undefined;
  const lazyAsk: Ask = async (request) => (ask ??= makeAsk())(request);
  return {
    getDoc,
    setDoc,
    buildCorridor: (trip, now) => buildCorridor(trip, now),
    buildSources: (trip, corridor, now) => buildSources(trip, corridor, now, { ask: lazyAsk, model: askModel() }),
    ask: lazyAsk,
    now: () => new Date(),
    clock: Date.now,
    deadline: started + workBudgetMs,
    readListings,
  };
}
