import { describe, expect, it, vi } from "vitest";
import type { Corridor } from "./corridor";
import { prepareNewTrip } from "./on-create";
import { OsmError } from "./osm";
import type { PipelineDeps } from "./pipeline";
import type { SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H).toISOString();
const trip: Trip = { id: "t1", createdAt: at(0), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false };
const corridor = { tripId: "t1", legs: [] } as unknown as Corridor;
const sources = { tripId: "t1", sources: [] } as unknown as SourceList;

function setup(over: Partial<PipelineDeps> = {}, by: "routine" | "cron" = "routine") {
  const docs = new Map<string, unknown>();
  const deps: PipelineDeps = {
    getDoc: async <T,>(p: string) => (docs.get(p) as T) ?? null,
    setDoc: async (p, v) => void docs.set(p, v),
    buildCorridor: vi.fn(async () => corridor),
    buildSources: vi.fn(async () => sources),
    ask: vi.fn(),
    now: () => NOW, clock: () => 0, deadline: 1e12, ...over,
  };
  const fire = vi.fn(async () => ({ fired: true }) as const);
  return { deps, fire, docs, run: () => prepareNewTrip(trip, { deps, by, fire }) };
}

describe("a new trip", () => {
  it("gets its corridor and sources built, and then the routine is started for it", async () => {
    const { run, fire, docs } = setup();
    const result = await run();
    expect(docs.has("corridors/t1")).toBe(true);
    expect(docs.has("sources/t1")).toBe(true);
    expect(fire).toHaveBeenCalledWith("t1");
    expect(result).toEqual({ corridor: "built", sources: "built", routine: { fired: true } });
  });

  it("does not start the routine when the sources could not be found, because it would have nothing to read", async () => {
    const { run, fire } = setup({ buildSources: vi.fn(async () => { throw Object.assign(new Error("x"), { code: "anthropic_error" }); }) });
    const result = await run();
    expect(fire).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sources: "failed", routine: { fired: false, reason: "not_ready" } });
  });

  it("does not start the routine when the corridor failed", async () => {
    const { run, fire } = setup({ buildCorridor: vi.fn(async () => { throw new Error("osrm down"); }) });
    expect((await run()).routine).toEqual({ fired: false, reason: "not_ready" });
    expect(fire).not.toHaveBeenCalled();
  });

  it("records which place could not be found, so the board can say so", async () => {
    const { run, docs } = setup({ buildCorridor: vi.fn(async () => { throw new OsmError("not_found", "no place", "to"); }) });
    await run();
    expect(docs.get("prep/t1")).toMatchObject({ state: "failed", corridor: "failed", problem: { code: "not_found", place: "to" } });
  });

  it("leaves the reading to this server, and does not start the routine, when LISTINGS_BY is cron", async () => {
    const { deps, fire } = setup({}, "cron");
    const result = await prepareNewTrip(trip, { deps, by: "cron", fire });
    expect(fire).not.toHaveBeenCalled();
    expect(result.routine).toEqual({ fired: false, reason: "cron" });
  });

  it("does not start the routine for a trip that has already ended", async () => {
    const { deps, fire } = setup();
    const result = await prepareNewTrip({ ...trip, start: at(-48), end: at(-24) }, { deps, by: "routine", fire });
    expect(fire).not.toHaveBeenCalled();
    expect(result.routine).toEqual({ fired: false, reason: "ended" });
  });
});
