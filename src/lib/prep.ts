/* Getting a new trip ready: its route, then its sources, then the places read by the routine.
   `prep/<id>` records the server's side of that. The board turns it, together with what is already stored,
   into three plain steps to show, so nobody has to start each one by hand. No Node imports: it runs in the browser too. */

export type PrepRoutine = { fired: boolean; reason?: string };

export type PrepDoc = {
  tripId: string;
  state: "working" | "done" | "failed";
  startedAt: string;
  updatedAt: string;
  corridor?: "existing" | "built" | "failed";
  sources?: "existing" | "built" | "failed" | "skipped";
  routine?: PrepRoutine;
};

export type StepState = "done" | "working" | "waiting" | "failed";
export type Step = { key: "route" | "sources" | "places"; label: string; state: StepState; note?: string };

/** `stops` is how many towns the stored corridor passes, when it is known. */
export type Have = { corridor: boolean; sources: boolean; listings: number; stops?: number };

/** A prep still marked as working this long after it was last touched belongs to a function that has since stopped. */
export const PREP_STALE_MS = 10 * 60_000;
/** After this long with the routine started and nothing posted, the board stops waiting and says so. */
export const ROUTINE_PATIENCE_MS = 30 * 60_000;

export function isStale(prep: PrepDoc, now: Date): boolean {
  return prep.state === "working" && now.getTime() - Date.parse(prep.updatedAt) > PREP_STALE_MS;
}

export function describePrep(prep: PrepDoc | null, have: Have, now: Date) {
  const stale = prep ? isStale(prep, now) : false;
  const state = stale ? "failed" : (prep?.state ?? null);

  const route: Step = { key: "route", label: "Work out the route", state: "waiting" };
  if (have.corridor) route.state = "done";
  else if (state === "working") route.state = "working";
  else if (state === "failed" || state === "done") route.state = "failed";

  const sources: Step = { key: "sources", label: "Find pages that list things to do", state: "waiting" };
  if (have.sources) sources.state = "done";
  else if (have.corridor) {
    if (state === "working") sources.state = "working";
    else if (state === "failed" || state === "done") sources.state = "failed";
  }

  const places: Step = { key: "places", label: "Read those pages for what is on", state: "waiting" };
  if (have.corridor && have.stops === 0) {
    places.state = "done";
    places.note = "The road passes no towns between the two places, so there is nothing to read.";
  } else if (have.listings > 0) {
    places.state = "done";
    places.note = `${have.listings} ${have.listings === 1 ? "place" : "places"} found.`;
  } else if (have.sources) {
    if (state === "working") {
      places.note = "Starting the routine.";
    } else if (state === "done" && prep?.routine) {
      const r = prep.routine;
      if (r.fired) {
        const waited = now.getTime() - Date.parse(prep.updatedAt);
        if (waited > ROUTINE_PATIENCE_MS) {
          places.note = "This is taking longer than usual. The routine will also read this trip in its next daily run.";
        } else {
          places.state = "working";
          places.note = "The routine is reading the pages. This usually takes a few minutes.";
        }
      } else if (r.reason === "not_configured" || r.reason === "cron") {
        places.note = "They are read in the next daily run.";
      } else if (r.reason === "ended") {
        places.note = "This trip is over, so nothing more will be read.";
      } else {
        places.state = "failed";
        places.note = "The routine could not be started. It will read this trip in its next daily run.";
      }
    } else if (!prep) {
      places.note = "They are read in the next daily run.";
    }
  }

  const steps: Step[] = [route, sources, places];
  const canRetry = steps.some((s) => s.state === "failed");
  const needsStart = prep === null && !(have.corridor && have.sources);
  const running = needsStart || state === "working" || steps.some((s) => s.state === "working");
  return { steps, canRetry, needsStart, settled: !running };
}

export function workingDoc(tripId: string, now: Date): PrepDoc {
  const at = now.toISOString();
  return { tripId, state: "working", startedAt: at, updatedAt: at };
}
