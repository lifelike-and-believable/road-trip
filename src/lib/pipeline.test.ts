import { describe, expect, it, vi } from "vitest";
import type { Corridor } from "./corridor";
import { OsmError } from "./osm";
import { runAll, type PipelineDeps } from "./pipeline";
import { SourcesError, type SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H).toISOString();

const trip = (id: string, startH: number, endH: number): Trip => ({
  id, createdAt: NOW.toISOString(), from: { label: "A" }, to: { label: "C" }, start: at(startH), end: at(endH), roundTrip: false,
});

const corridorFor = (id: string): Corridor => ({
  tripId: id, builtAt: NOW.toISOString(), from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{
    id: "out", distanceKm: 1, driveMinutes: 1, arriveAt: at(30), fits: true,
    stops: [
      { name: "A", lat: 0, lon: 0, km: 0, from: at(24), until: at(24) },
      { name: "C", lat: 0, lon: 0, km: 1, from: at(30), until: at(60) },
    ],
  }],
});

const sourcesFor = (id: string): SourceList => ({
  tripId: id, builtAt: NOW.toISOString(), model: "m", stopsSearched: ["A", "C"], searches: 0,
  usage: { inputTokens: 0, outputTokens: 0 },
  sources: [{ name: "S", url: "https://s.example/e", kind: "tourism", near: ["A", "C"], covers: ["fixed", "flexible"] }],
});

function setup(over: Partial<PipelineDeps> = {}, docs: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(docs));
  const deps = {
    getDoc: vi.fn(async (p: string) => store.get(p) ?? null),
    setDoc: vi.fn(async (p: string, d: unknown) => { store.set(p, d); }),
    buildCorridor: vi.fn(async (t: Trip) => corridorFor(t.id)),
    buildSources: vi.fn(async (t: Trip) => sourcesFor(t.id)),
    ask: vi.fn(async () => ({ text: JSON.stringify({ listings: [] }), searches: 0, inputTokens: 10, outputTokens: 5 })),
    now: () => NOW,
    deadline: NOW.getTime() + 10 * 60_000,
    clock: () => NOW.getTime(),
    ...over,
  } as PipelineDeps & { getDoc: ReturnType<typeof vi.fn>; setDoc: ReturnType<typeof vi.fn>; buildCorridor: ReturnType<typeof vi.fn>; buildSources: ReturnType<typeof vi.fn>; ask: ReturnType<typeof vi.fn> };
  return { store, deps };
}

describe("runAll", () => {
  it("builds a new trip's corridor, then its sources, then its listings, and stores each", async () => {
    const { store, deps } = setup();
    const out = await runAll([trip("t1", 24, 120)], deps);
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]).toMatchObject({ tripId: "t1", corridor: "built", sources: "built" });
    expect(out.runs[0].listings?.updated.sort()).toEqual(["A", "C"]);
    expect([...store.keys()].sort()).toEqual(["corridors/t1", "listings/t1", "sources/t1"]);
    const order = [deps.buildCorridor, deps.buildSources, deps.ask].map((f) => f.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("reuses what is already stored", async () => {
    const { deps } = setup({}, { "corridors/t1": corridorFor("t1"), "sources/t1": sourcesFor("t1") });
    const out = await runAll([trip("t1", 24, 120)], deps);
    expect(out.runs[0]).toMatchObject({ corridor: "existing", sources: "existing" });
    expect(deps.buildCorridor).not.toHaveBeenCalled();
    expect(deps.buildSources).not.toHaveBeenCalled();
  });

  it("never touches a trip whose end has passed", async () => {
    const { deps } = setup();
    const out = await runAll([trip("old", -48, -1), trip("t1", 24, 120)], deps);
    expect(out.ended).toEqual(["old"]);
    expect(out.runs.map((r) => r.tripId)).toEqual(["t1"]);
    for (const call of [...deps.getDoc.mock.calls, ...deps.setDoc.mock.calls]) expect(String(call[0])).not.toContain("old");
  });

  it("works through trips in the order they start", async () => {
    const { deps } = setup();
    const out = await runAll([trip("later", 200, 300), trip("soon", 24, 120)], deps);
    expect(out.runs.map((r) => r.tripId)).toEqual(["soon", "later"]);
  });

  it("records a corridor failure, skips that trip's later stages, and carries on with the next trip", async () => {
    const { deps } = setup({
      buildCorridor: vi.fn(async (t: Trip) => {
        if (t.id === "bad") throw new OsmError("not_found", 'no place found for "A"');
        return corridorFor(t.id);
      }),
    });
    const out = await runAll([trip("bad", 24, 120), trip("t1", 30, 120)], deps);
    expect(out.runs[0]).toMatchObject({ tripId: "bad", corridor: "failed", sources: "skipped", error: "corridor: not_found" });
    expect(out.runs[0].listings).toBeUndefined();
    expect(out.runs[1]).toMatchObject({ tripId: "t1", corridor: "built", sources: "built" });
  });

  it("records a sources failure and does not read listings", async () => {
    const { deps } = setup({ buildSources: vi.fn(async () => { throw new SourcesError("upstream", "x"); }) });
    const out = await runAll([trip("t1", 24, 120)], deps);
    expect(out.runs[0]).toMatchObject({ corridor: "built", sources: "failed", error: "sources: upstream" });
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it("describes an unexpected error without its details", async () => {
    const { deps } = setup({ buildCorridor: vi.fn(async () => { throw new Error("secret internals"); }) });
    const out = await runAll([trip("t1", 24, 120)], deps);
    expect(out.runs[0].error).toBe("corridor: error");
    expect(JSON.stringify(out)).not.toContain("secret internals");
  });

  it("starts no work after the deadline and lists the trips it deferred", async () => {
    const { deps } = setup({ deadline: NOW.getTime() - 1 });
    const out = await runAll([trip("t1", 24, 120), trip("t2", 30, 120)], deps);
    expect(out.runs).toEqual([]);
    expect(out.deferred).toEqual(["t1", "t2"]);
    expect(deps.buildCorridor).not.toHaveBeenCalled();
  });

  it("defers the remaining trips when the deadline passes part way through", async () => {
    let t = NOW.getTime();
    const { deps } = setup({
      deadline: NOW.getTime() + 1000,
      clock: () => t,
      buildCorridor: vi.fn(async (tr: Trip) => { t += 5000; return corridorFor(tr.id); }),
    });
    const out = await runAll([trip("t1", 24, 120), trip("t2", 30, 120)], deps);
    expect(out.runs.map((r) => r.tripId)).toEqual(["t1"]);
    expect(out.deferred).toEqual(["t2"]);
  });

  it("passes the deadline on to the listing refresh and reports what is left", async () => {
    const { deps } = setup({ maxStops: 1 });
    const out = await runAll([trip("t1", 24, 120)], deps);
    expect(out.runs[0].listings?.remaining).toBe(1);
  });
});
