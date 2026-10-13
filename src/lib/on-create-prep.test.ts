import { describe, expect, it, vi } from "vitest";
import type { Corridor } from "./corridor";
import type { FireResult } from "./fire-routine";
import { prepareNewTrip } from "./on-create";
import type { PipelineDeps } from "./pipeline";
import type { PrepDoc } from "./prep";
import type { SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H).toISOString();
const trip: Trip = { id: "t1", createdAt: at(0), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false };
const corridor = { tripId: "t1", legs: [] } as unknown as Corridor;
const sources = { tripId: "t1", sources: [] } as unknown as SourceList;
const STARTED = at(-0.01);

function setup(over: Partial<PipelineDeps> = {}) {
  const docs = new Map<string, unknown>([["prep/t1", { tripId: "t1", state: "working", startedAt: STARTED, updatedAt: STARTED }]]);
  const deps: PipelineDeps = {
    getDoc: async <T,>(p: string) => (docs.get(p) as T) ?? null,
    setDoc: async (p, v) => void docs.set(p, v),
    buildCorridor: vi.fn(async () => corridor),
    buildSources: vi.fn(async () => sources),
    ask: vi.fn(),
    now: () => NOW, clock: () => 0, deadline: 1e12, ...over,
  };
  return { deps, docs, run: (fire: (id: string) => Promise<FireResult> = async () => ({ fired: true })) => prepareNewTrip(trip, { deps, by: "routine", fire }) };
}
const prep = (docs: Map<string, unknown>) => docs.get("prep/t1") as PrepDoc;

describe("the record of getting a trip ready", () => {
  it("ends as done, with what happened to each step and whether the routine was started", async () => {
    const { run, docs } = setup();
    await run();
    expect(prep(docs)).toEqual({ tripId: "t1", state: "done", startedAt: STARTED, updatedAt: NOW.toISOString(), corridor: "built", sources: "built", routine: { fired: true } });
  });

  it("ends as failed when the sources could not be found, and names the step", async () => {
    const { run, docs } = setup({ buildSources: vi.fn(async () => { throw new Error("x"); }) });
    await run();
    expect(prep(docs)).toMatchObject({ state: "failed", corridor: "built", sources: "failed", routine: { fired: false, reason: "not_ready" } });
  });

  it("keeps why the routine was not started, so the board can say", async () => {
    const { run, docs } = setup();
    await run(async () => ({ fired: false, reason: "http_429" }));
    expect(prep(docs)).toMatchObject({ state: "done", routine: { fired: false, reason: "http_429" } });
  });
});
