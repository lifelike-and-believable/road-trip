import { askModel, makeAsk } from "../../../lib/anthropic";
import { isRefreshJob } from "../../../lib/auth";
import { buildCorridor } from "../../../lib/corridor";
import { storeError } from "../../../lib/http";
import { runAll } from "../../../lib/pipeline";
import { buildSources, type Ask } from "../../../lib/sources";
import { getDoc, listDocs, setDoc } from "../../../lib/store";
import type { Trip } from "../../../lib/trip";

// The job stops starting work well before the function's limit and leaves the rest for the next run.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

/* The daily refresh. Vercel's scheduler calls it with GET and the CRON_SECRET
   bearer token; POST with REFRESH_SECRET runs it by hand. A browser session
   does not count: only the job token starts it. */
async function handle(req: Request) {
  if (!isRefreshJob(req)) {
    return Response.json({ code: "permission_denied", error: "refresh token required" }, { status: 401 });
  }

  let trips: Trip[];
  try {
    trips = (await listDocs<Trip>("trips")).map((d) => d.data);
  } catch (e) {
    return storeError("refresh", e);
  }

  // Made on first use, so a missing key fails the stages that need Claude and not the corridor stage.
  let ask: Ask | undefined;
  const lazyAsk: Ask = async (request) => (ask ??= makeAsk())(request);

  const started = Date.now();
  try {
    const result = await runAll(trips, {
      getDoc,
      setDoc,
      buildCorridor: (trip, now) => buildCorridor(trip, now),
      buildSources: (trip, corridor, now) => buildSources(trip, corridor, now, { ask: lazyAsk, model: askModel() }),
      ask: lazyAsk,
      now: () => new Date(),
      clock: Date.now,
      deadline: started + WORK_BUDGET_MS,
    });
    return Response.json({ ranAt: new Date(started).toISOString(), ...result });
  } catch (e) {
    console.error("[refresh]", e);
    return Response.json({ code: "refresh_error", error: "the refresh did not finish" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
