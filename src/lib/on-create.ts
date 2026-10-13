/* What happens right after a trip is made: build its corridor and sources
   now, then start the listings routine for it, so the board fills in minutes
   and not at the next daily refresh. The daily refresh stays as the safety net
   for any step that fails here. */

import type { FireResult } from "./fire-routine";
import { runAll, type PipelineDeps } from "./pipeline";
import { isActive, type Trip } from "./trip";

export type NewTripResult = {
  corridor: "existing" | "built" | "failed";
  sources: "existing" | "built" | "failed" | "skipped";
  routine: FireResult;
};

type Options = {
  deps: PipelineDeps;
  by: "routine" | "cron";
  fire: (tripId: string) => Promise<FireResult>;
};

export async function prepareNewTrip(trip: Trip, { deps, by, fire }: Options): Promise<NewTripResult> {
  if (!isActive(trip, deps.now())) {
    return { corridor: "existing", sources: "skipped", routine: { fired: false, reason: "ended" } };
  }
  const { runs } = await runAll([trip], { ...deps, readListings: by === "cron" });
  const run = runs[0];
  const ready = !!run && run.corridor !== "failed" && (run.sources === "existing" || run.sources === "built");
  const routine: FireResult = by === "cron" ? { fired: false, reason: "cron" } : ready ? await fire(trip.id) : { fired: false, reason: "not_ready" };
  return { corridor: run?.corridor ?? "failed", sources: run?.sources ?? "skipped", routine };
}
