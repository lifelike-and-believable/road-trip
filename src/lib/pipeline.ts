/* The scheduled job: bring every active trip up to date.

   For each trip that has not ended, in the order the trips start: build its
   corridor if there is none, find its sources if there are none, then refresh
   its listings. A trip that has ended is never touched, so its last listings
   stay readable and cost nothing. Each stage is only done once; later runs
   reuse what is stored.

   A function run has a time limit, so the job works to a deadline: no trip or
   build is started after it, and what was not reached waits for the next run. */

import type { Corridor } from "./corridor";
import { refreshListings, type ListingsDoc, type RefreshReport } from "./refresh";
import type { Ask, SourceList } from "./sources";
import { activeTrips, isActive, type Trip } from "./trip";

export type PipelineDeps = {
  getDoc: <T>(path: string) => Promise<T | null>;
  setDoc: (path: string, data: unknown) => Promise<void>;
  buildCorridor: (trip: Trip, now: Date) => Promise<Corridor>;
  buildSources: (trip: Trip, corridor: Corridor, now: Date) => Promise<SourceList>;
  ask: Ask;
  now: () => Date;
  /** Epoch milliseconds now; separate from `now` so a test can move one without the other. */
  clock: () => number;
  /** Epoch milliseconds after which no new work is started. */
  deadline: number;
  maxStops?: number;
  concurrency?: number;
  /** False when the routine posts the listings: the corridor and sources are still built here. Default true. */
  readListings?: boolean;
};

export type TripRun = {
  tripId: string;
  corridor: "existing" | "built" | "failed";
  sources: "existing" | "built" | "failed" | "skipped";
  listings?: RefreshReport;
  /** Which stage failed and with what code, never the details. */
  error?: string;
};

const codeOf = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "error");

async function runTrip(trip: Trip, deps: PipelineDeps): Promise<TripRun> {
  const run: TripRun = { tripId: trip.id, corridor: "existing", sources: "existing" };
  const now = deps.now();
  const late = () => deps.clock() >= deps.deadline;

  let corridor = await deps.getDoc<Corridor>(`corridors/${trip.id}`);
  if (!corridor) {
    try {
      corridor = await deps.buildCorridor(trip, now);
      await deps.setDoc(`corridors/${trip.id}`, corridor);
      run.corridor = "built";
    } catch (e) {
      return { ...run, corridor: "failed", sources: "skipped", error: `corridor: ${codeOf(e)}` };
    }
  }

  let sources = await deps.getDoc<SourceList>(`sources/${trip.id}`);
  if (!sources) {
    if (late()) return { ...run, sources: "skipped" };
    try {
      sources = await deps.buildSources(trip, corridor, now);
      await deps.setDoc(`sources/${trip.id}`, sources);
      run.sources = "built";
    } catch (e) {
      return { ...run, sources: "failed", error: `sources: ${codeOf(e)}` };
    }
  }

  if (late() || deps.readListings === false) return run;
  try {
    const previous = await deps.getDoc<ListingsDoc>(`listings/${trip.id}`);
    const { doc, report } = await refreshListings(trip, corridor, sources, previous, now, {
      ask: deps.ask,
      deadline: deps.deadline,
      now: deps.clock,
      maxStops: deps.maxStops,
      concurrency: deps.concurrency,
    });
    if (report.updated.length || report.kept.length) await deps.setDoc(`listings/${trip.id}`, doc);
    run.listings = report;
  } catch (e) {
    run.error = `listings: ${codeOf(e)}`;
  }
  return run;
}

export async function runAll(
  trips: Trip[],
  deps: PipelineDeps,
): Promise<{ runs: TripRun[]; ended: string[]; deferred: string[] }> {
  const now = deps.now();
  const ended = trips.filter((t) => !isActive(t, now)).map((t) => t.id);
  const live = activeTrips(trips, now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const runs: TripRun[] = [];
  const deferred: string[] = [];
  for (let i = 0; i < live.length; i++) {
    if (deps.clock() >= deps.deadline) {
      deferred.push(...live.slice(i).map((t) => t.id));
      break;
    }
    runs.push(await runTrip(live[i], deps));
  }
  return { runs, ended, deferred };
}
