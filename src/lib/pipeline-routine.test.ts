import { describe, expect, it, vi } from "vitest";
import type { Corridor } from "./corridor";
import { listingsBy } from "./listings-by";
import { runAll, type PipelineDeps } from "./pipeline";
import type { SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H).toISOString();

const trip: Trip = { id: "t1", createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false };
const corridor = { tripId: "t1", legs: [] } as unknown as Corridor;
const sources = { tripId: "t1", sources: [] } as unknown as SourceList;

function deps(over: Partial<PipelineDeps> = {}) {
  const docs = new Map<string, unknown>([["corridors/t1", corridor], ["sources/t1", sources]]);
  const ask = vi.fn();
  const d: PipelineDeps = {
    getDoc: async <T,>(p: string) => (docs.get(p) as T) ?? null,
    setDoc: async (p, v) => void docs.set(p, v),
    buildCorridor: vi.fn(async () => corridor),
    buildSources: vi.fn(async () => sources),
    ask, now: () => NOW, clock: () => 0, deadline: 1e12, ...over,
  };
  return { d, ask, docs };
}

describe("the pipeline when listings come from the routine", () => {
  it("still builds the corridor and the sources, but reads no listings", async () => {
    const { d, ask, docs } = deps({ readListings: false });
    docs.delete("corridors/t1");
    docs.delete("sources/t1");
    const result = await runAll([trip], d);
    expect(result.runs[0]).toMatchObject({ tripId: "t1", corridor: "built", sources: "built" });
    expect(result.runs[0].listings).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });

  it("reads listings as before when the setting is left out", async () => {
    const { d } = deps();
    const result = await runAll([trip], d);
    expect(result.runs[0].listings).toBeDefined();
  });
});

describe("listingsBy", () => {
  it("is the routine unless the server is asked to read the places itself", () => {
    expect(listingsBy({})).toBe("routine");
    expect(listingsBy({ LISTINGS_BY: "routine" })).toBe("routine");
    expect(listingsBy({ LISTINGS_BY: "anything else" })).toBe("routine");
    expect(listingsBy({ LISTINGS_BY: "cron" })).toBe("cron");
  });
});
