import { describe, expect, it, vi } from "vitest";
import type { Corridor, Stop } from "./corridor";
import type { Listing } from "./listing";
import { refreshListings, stopWindows, STALE_HOURS, type ListingsDoc } from "./refresh";
import { SourcesError, type AskRequest, type AskResult, type Source, type SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H).toISOString();

const stop = (name: string, kind: Stop["kind"], from: string, until = from): Stop => ({
  name, region: "NY", lat: 0, lon: 0, kind, km: 0, from, until,
});

/** A -> B -> C out, and back again, with times the tests set. */
function corridor(times: Record<string, Array<[string, string]>>): Corridor {
  const leg = (id: "out" | "back", names: string[], i: number): Corridor["legs"][number] => ({
    id, distanceKm: 1, driveMinutes: 1, arriveAt: "x", fits: true,
    stops: names.map((n, k) => {
      const [from, until] = times[n][Math.min(i, times[n].length - 1)];
      return stop(n, k === 0 ? "origin" : k === names.length - 1 ? "destination" : "along", from, until);
    }),
  });
  return {
    tripId: "t1", builtAt: NOW.toISOString(),
    from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
    sources: { geocoding: "g", routing: "r", timing: "t" },
    legs: [leg("out", ["A", "B", "C"], 0), leg("back", ["C", "B", "A"], 1)],
  };
}

const trip: Trip = {
  id: "t1", createdAt: NOW.toISOString(), from: { label: "A" }, to: { label: "C" },
  start: at(24), end: at(120), roundTrip: true,
};

const source = (name: string, near: string[]): Source => ({
  name, url: `https://${name.toLowerCase()}.example/events`, kind: "tourism", near, covers: ["fixed", "flexible"],
});
const sourceList = (sources: Source[]): SourceList => ({
  tripId: "t1", builtAt: NOW.toISOString(), model: "m", stopsSearched: [], searches: 0,
  usage: { inputTokens: 0, outputTokens: 0 }, sources,
});

// every stop is visited tomorrow (out) and in four days (back)
const TIMES = {
  A: [[at(24), at(24)], [at(100), at(100)]] as Array<[string, string]>,
  B: [[at(30), at(30)], [at(94), at(94)]] as Array<[string, string]>,
  C: [[at(36), at(60)], [at(60), at(60)]] as Array<[string, string]>,
};

const fixedJson = (title: string, startIso: string) => ({
  title, source: "https://a.example/events", category: "music", cost: "free",
  schedule: { kind: "fixed", start: startIso, durationMin: 90 },
});
const reply = (...items: unknown[]) => JSON.stringify({ listings: items });

const result = (text: string, inputTokens = 100, outputTokens = 20): AskResult => ({ text, searches: 1, inputTokens, outputTokens });

describe("stopWindows", () => {
  it("gathers every window a place is visited in, across both legs, in route order", () => {
    const w = stopWindows(corridor(TIMES));
    expect([...w.keys()]).toEqual(["A", "B", "C"]);
    expect(w.get("B")!.windows).toEqual([{ from: at(30), until: at(30) }, { from: at(94), until: at(94) }]);
    expect(w.get("B")!.region).toBe("NY");
  });
});

describe("refreshListings", () => {
  const ask = (fn: (r: AskRequest) => Promise<AskResult> | AskResult) => vi.fn(async (r: AskRequest) => fn(r));
  const run = (opts: Parameters<typeof refreshListings>[5], previous: ListingsDoc | null = null, sources = [source("One", ["A", "B", "C"])]) =>
    refreshListings(trip, corridor(TIMES), sourceList(sources), previous, NOW, opts);

  it("asks once per place, naming its sources and every window, and lets the model read the pages", async () => {
    const a = ask(() => result(reply()));
    await run({ ask: a });
    expect(a).toHaveBeenCalledTimes(3);
    const first = a.mock.calls.find((c) => c[0].user.includes("Stop: B"))![0];
    expect(first.tools).toBe("search+fetch");
    expect(first.user).toContain("https://one.example/events");
    expect(first.user).toContain(at(30));
    expect(first.user).toContain(at(94));
    expect(first.system).toMatch(/untrusted/i);
    expect(first.system).toMatch(/fixed/);
    expect(first.system).toMatch(/flexible/);
  });

  it("stores the valid listings that fall in the visit windows and drops the rest", async () => {
    const a = ask((r) =>
      r.user.includes("Stop: B")
        ? result(reply(fixedJson("In window", at(31)), fixedJson("Far away", at(300))))
        : result(reply()),
    );
    const { doc, report } = await run({ ask: a });
    expect(doc.stops.B.listings.map((l) => l.title)).toEqual(["In window"]);
    expect(doc.stops.B.refreshedAt).toBe(NOW.toISOString());
    expect(doc.stops.B.listings[0].stop).toBe("B");
    expect(report.updated.sort()).toEqual(["A", "B", "C"]);
    expect(doc).toMatchObject({ tripId: "t1", updatedAt: NOW.toISOString() });
  });

  it("totals the tokens used", async () => {
    const { report } = await run({ ask: ask(() => result(reply(), 1000, 50)) });
    expect(report.usage).toEqual({ inputTokens: 3000, outputTokens: 150 });
  });

  it("leaves alone a place the traveller has already passed", async () => {
    const times = { ...TIMES, A: [[at(-30), at(-30)], [at(-20), at(-20)]] as Array<[string, string]> };
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-40), stops: { A: { refreshedAt: at(-40), listings: [{ id: "x" } as Listing] } } };
    const a = ask(() => result(reply()));
    const { doc, report } = await refreshListings(trip, corridor(times), sourceList([source("One", ["A", "B", "C"])]), prev, NOW, { ask: a });
    expect(report.passed).toEqual(["A"]);
    expect(a.mock.calls.some((c) => c[0].user.includes("Stop: A"))).toBe(false);
    expect(doc.stops.A.listings).toHaveLength(1);
  });

  it("does not ask again about a place refreshed recently, unless forced", async () => {
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-1), stops: { B: { refreshedAt: at(-(STALE_HOURS - 1)), listings: [] } } };
    const a = ask(() => result(reply()));
    const { report } = await run({ ask: a }, prev);
    expect(report.fresh).toEqual(["B"]);
    expect(a).toHaveBeenCalledTimes(2);
    const forced = ask(() => result(reply()));
    await run({ ask: forced, force: true }, prev);
    expect(forced).toHaveBeenCalledTimes(3);
  });

  it("asks again once a refresh is older than the stale limit", async () => {
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-30), stops: { B: { refreshedAt: at(-(STALE_HOURS + 1)), listings: [] } } };
    const a = ask(() => result(reply()));
    await run({ ask: a }, prev);
    expect(a).toHaveBeenCalledTimes(3);
  });

  it("skips a place with no sources and says so", async () => {
    const a = ask(() => result(reply()));
    const { report } = await run({ ask: a }, null, [source("One", ["A", "C"])]);
    expect(report.noSources).toEqual(["B"]);
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("keeps the earlier listings, and tries again next time, when a read fails", async () => {
    const earlier = { refreshedAt: at(-25), listings: [{ id: "keep" } as Listing] };
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-25), stops: { B: earlier } };
    const a = ask((r) => {
      if (r.user.includes("Stop: B")) throw new SourcesError("upstream", "overloaded");
      return result(reply());
    });
    const { doc, report } = await run({ ask: a }, prev);
    expect(doc.stops.B).toEqual(earlier);
    expect(report.failed).toEqual([{ stop: "B", code: "upstream" }]);
    expect(report.updated.sort()).toEqual(["A", "C"]);
  });

  it("reports an unexpected error as a failure without throwing", async () => {
    const { report } = await run({ ask: ask(() => { throw new Error("boom"); }) });
    expect(report.failed.map((f) => f.code)).toEqual(["error", "error", "error"]);
  });

  it("keeps the earlier listings when a read finds nothing usable, rather than blanking the place", async () => {
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-25), stops: { B: { refreshedAt: at(-25), listings: [{ id: "keep" } as Listing] } } };
    const { doc, report } = await run({ ask: ask(() => result("I could not find anything.")) }, prev);
    expect(doc.stops.B.listings).toEqual([{ id: "keep" }]);
    expect(doc.stops.B.refreshedAt).toBe(NOW.toISOString());
    expect(report.kept).toEqual(["B"]);
    expect(report.updated.sort()).toEqual(["A", "C"]);
  });

  it("records an empty place as empty when there was nothing before", async () => {
    const { doc } = await run({ ask: ask(() => result(reply())) });
    expect(doc.stops.A).toEqual({ refreshedAt: NOW.toISOString(), listings: [] });
  });

  it("does only a bounded amount of work and says how much is left", async () => {
    const a = ask(() => result(reply()));
    const { report, doc } = await run({ ask: a, maxStops: 2 });
    expect(a).toHaveBeenCalledTimes(2);
    expect(report.remaining).toBe(1);
    expect(Object.keys(doc.stops)).toHaveLength(2);
  });

  it("stops starting new work when the deadline has passed", async () => {
    const a = ask(() => result(reply()));
    const { report } = await run({ ask: a, deadline: NOW.getTime() - 1, now: () => NOW.getTime() });
    expect(a).not.toHaveBeenCalled();
    expect(report.remaining).toBe(3);
  });

  it("runs a few reads at once but no more than the limit", async () => {
    let active = 0;
    let peak = 0;
    const a = ask(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return result(reply());
    });
    await run({ ask: a, concurrency: 2 });
    expect(peak).toBe(2);
  });

  it("does not change the document it was given", async () => {
    const prev: ListingsDoc = { tripId: "t1", updatedAt: at(-25), stops: { B: { refreshedAt: at(-25), listings: [] } } };
    const copy = structuredClone(prev);
    await run({ ask: ask(() => result(reply(fixedJson("x", at(31))))) }, prev);
    expect(prev).toEqual(copy);
  });
});
