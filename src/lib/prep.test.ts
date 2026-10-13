import { describe, expect, it } from "vitest";
import { describePrep, isStale, PREP_STALE_MS, type PrepDoc } from "./prep";

const NOW = new Date("2026-10-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const prep = (over: Partial<PrepDoc> = {}): PrepDoc => ({ tripId: "t", state: "working", startedAt: ago(MIN), updatedAt: ago(MIN), ...over });
const have = { corridor: false, sources: false, listings: 0 };

const states = (r: ReturnType<typeof describePrep>) => r.steps.map((s) => s.state);

describe("isStale", () => {
  it("is a working prep that has not been touched for a while, because the function that was doing it has gone", () => {
    expect(isStale(prep(), NOW)).toBe(false);
    expect(isStale(prep({ updatedAt: ago(PREP_STALE_MS + 1) }), NOW)).toBe(true);
    expect(isStale(prep({ state: "done", updatedAt: ago(PREP_STALE_MS * 5) }), NOW)).toBe(false);
  });
});

describe("describePrep", () => {
  it("shows the route being built while the work is under way", () => {
    const r = describePrep(prep(), have, NOW);
    expect(states(r)).toEqual(["working", "waiting", "waiting"]);
    expect(r.settled).toBe(false);
    expect(r.canRetry).toBe(false);
  });

  it("moves on to the sources once the route is there", () => {
    const r = describePrep(prep(), { ...have, corridor: true }, NOW);
    expect(states(r)).toEqual(["done", "working", "waiting"]);
  });

  it("says the routine is reading the places once the sources are found and it has been started", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: true } }), { corridor: true, sources: true, listings: 0 }, NOW);
    expect(states(r)).toEqual(["done", "done", "working"]);
    expect(r.steps[2].note).toMatch(/few minutes/);
    expect(r.settled).toBe(false);
    expect(r.canRetry).toBe(false);
  });

  it("is settled when listings have arrived", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: true } }), { corridor: true, sources: true, listings: 12 }, NOW);
    expect(states(r)).toEqual(["done", "done", "done"]);
    expect(r.steps[2].note).toMatch(/12/);
    expect(r.settled).toBe(true);
  });

  it("says which step failed and offers to try again", () => {
    const r = describePrep(prep({ state: "failed", corridor: "built", sources: "failed" }), { ...have, corridor: true }, NOW);
    expect(states(r)).toEqual(["done", "failed", "waiting"]);
    expect(r.canRetry).toBe(true);
    expect(r.settled).toBe(true);
  });

  it("treats a prep whose function disappeared as failed, and offers to try again", () => {
    const r = describePrep(prep({ updatedAt: ago(PREP_STALE_MS + MIN) }), have, NOW);
    expect(states(r)[0]).toBe("failed");
    expect(r.canRetry).toBe(true);
  });

  it("explains when the routine was never set up to start by itself, without offering a retry that cannot help", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: false, reason: "not_configured" } }), { corridor: true, sources: true, listings: 0 }, NOW);
    expect(r.steps[2].state).toBe("waiting");
    expect(r.steps[2].note).toMatch(/daily/);
    expect(r.canRetry).toBe(false);
    expect(r.settled).toBe(true);
  });

  it("says the daily refresh reads the places when the server is set to do that", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: false, reason: "cron" } }), { corridor: true, sources: true, listings: 0 }, NOW);
    expect(r.steps[2].note).toMatch(/daily/);
    expect(r.canRetry).toBe(false);
  });

  it("offers to try again when the routine refused to start", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: false, reason: "http_429" } }), { corridor: true, sources: true, listings: 0 }, NOW);
    expect(r.steps[2].state).toBe("failed");
    expect(r.steps[2].note).toMatch(/daily/);
    expect(r.canRetry).toBe(true);
  });

  it("starts from nothing when there is no record yet, as for a trip made before this existed", () => {
    const r = describePrep(null, have, NOW);
    expect(states(r)).toEqual(["waiting", "waiting", "waiting"]);
    expect(r.settled).toBe(false);
    expect(r.needsStart).toBe(true);
  });

  it("does not ask for a start when there is a record that is under way, or when everything is there", () => {
    expect(describePrep(prep(), have, NOW).needsStart).toBe(false);
    expect(describePrep(null, { corridor: true, sources: true, listings: 3 }, NOW).needsStart).toBe(false);
  });

  it("says there is nothing to read when the road passes no towns, instead of waiting or failing", () => {
    const r = describePrep(prep({ state: "done", routine: { fired: true } }), { corridor: true, sources: true, listings: 0, stops: 0 }, NOW);
    expect(states(r)).toEqual(["done", "done", "done"]);
    expect(r.steps[2].note).toMatch(/no towns/);
    expect(r.canRetry).toBe(false);
    expect(r.settled).toBe(true);
  });

  it("stops waiting for the routine after a long time and says it is taking longer than usual", () => {
    const r = describePrep(prep({ state: "done", updatedAt: ago(40 * MIN), routine: { fired: true } }), { corridor: true, sources: true, listings: 0 }, NOW);
    expect(r.steps[2].note).toMatch(/longer than usual/);
    expect(r.settled).toBe(true);
  });
});
