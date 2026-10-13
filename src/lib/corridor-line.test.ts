import { describe, expect, it, vi } from "vitest";
import { buildCorridor, MAX_LINE_POINTS, type CorridorDeps } from "./corridor";
import type { LonLat } from "./geo";
import { parseTripInput, type Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");

const trip = (): Trip => {
  const r = parseTripInput({
    from: { label: "Alpha", lat: 0, lon: 0 }, to: { label: "Omega", lat: 0, lon: 4 },
    start: "2026-10-16T14:00:00Z", end: "2026-10-18T22:00:00Z", roundTrip: true, turnaround: "2026-10-17T16:00:00Z",
  }, NOW);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return { id: "t1", createdAt: NOW.toISOString(), ...r.value };
};

const deps = (line: LonLat[]): CorridorDeps => ({
  geocode: vi.fn(),
  reverseName: vi.fn(async (_lat: number, lon: number) => ({ name: `Town ${Math.floor(lon)}` })),
  driveRoute: vi.fn(async () => ({ distanceKm: 444.8, durationMin: 300, line })),
  pause: vi.fn(async () => {}),
});

describe("the corridor's route line", () => {
  it("stores the road for the map, from where it starts to where it ends", async () => {
    const line: LonLat[] = [[0, 0], [1, 0.3], [2, 0], [3, 0.3], [4, 0]];
    const c = await buildCorridor(trip(), NOW, deps(line));
    expect(c.line?.[0]).toEqual([0, 0]);
    expect(c.line?.at(-1)).toEqual([4, 0]);
    expect(c.line?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a long road small enough to store, and rounds it to about a metre", async () => {
    const long: LonLat[] = Array.from({ length: 6000 }, (_, i): LonLat => [(i / 6000) * 4 + 1e-7, Math.sin(i / 30) * 0.02 + 1e-7]);
    const c = await buildCorridor(trip(), NOW, deps(long));
    expect(c.line?.length).toBeLessThanOrEqual(MAX_LINE_POINTS);
    for (const [lon, lat] of c.line ?? []) {
      expect(Math.round(lon * 1e5) / 1e5).toBe(lon);
      expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
    }
  });

  it("is one road for both legs of a round trip, not a second copy", async () => {
    const c = await buildCorridor(trip(), NOW, deps([[0, 0], [2, 0.5], [4, 0]]));
    expect(c.legs).toHaveLength(2);
    expect(Array.isArray(c.line)).toBe(true);
  });
});
