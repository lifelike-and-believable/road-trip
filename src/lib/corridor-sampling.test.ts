import { describe, expect, it, vi } from "vitest";
import { buildCorridor, samplePositions } from "./corridor";
import type { LonLat } from "./geo";
import { parseTripInput, type Trip } from "./trip";

describe("samplePositions", () => {
  it("samples every 25 km within 100 km of each end and every 50 km between", () => {
    expect(samplePositions(444.8)).toEqual([25, 50, 75, 100, 150, 200, 250, 300, 344.8, 369.8, 394.8, 419.8]);
    expect(samplePositions(596)).toEqual([25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 496, 521, 546, 571]);
  });

  it("is anchored to both ends, so the first and last gaps are one step", () => {
    for (const total of [150, 254.5, 444.8, 596]) {
      const p = samplePositions(total);
      expect(p[0]).toBe(25);
      expect(total - p.at(-1)!).toBeCloseTo(25, 1);
    }
    // a longer route widens the step, and the gap with it (spacing is total / 16 here)
    const p = samplePositions(1200);
    expect(1200 - p.at(-1)!).toBeCloseTo(37.5, 1);
    expect(p[0]).toBeCloseTo(37.5, 1);
  });

  it("finds nothing to sample on a route shorter than half a spacing step either side", () => {
    expect(samplePositions(30)).toEqual([]);
    expect(samplePositions(0)).toEqual([]);
    expect(samplePositions(60)).toEqual([25]);
  });

  it("stays inside the route and in increasing order", () => {
    for (const total of [61, 130, 254.5, 596, 2000, 4500]) {
      const p = samplePositions(total);
      expect(p.every((km) => km > 0 && km < total)).toBe(true);
      expect(p).toEqual([...p].sort((a, b) => a - b));
      expect(new Set(p).size).toBe(p.length);
    }
  });

  it("keeps the number of lookups bounded on a very long route, with wider steps", () => {
    const p = samplePositions(2000);
    expect(p.length).toBeGreaterThan(10);
    expect(p.length).toBeLessThanOrEqual(20);
    expect(p[0]).toBeGreaterThan(25);
  });
});

describe("the corridor uses them", () => {
  const LINE: LonLat[] = [[0, 0], [4, 0]];
  const trip = (): Trip => {
    const r = parseTripInput({
      from: { label: "Alpha", lat: 0, lon: 0 }, to: { label: "Omega", lat: 0, lon: 4 },
      start: "2026-10-16T14:00:00Z", end: "2026-10-18T22:00:00Z", roundTrip: false,
    }, new Date("2026-10-12T12:00:00Z"));
    if (!r.ok) throw new Error(r.errors.join());
    return { id: "t1", createdAt: "2026-10-12T12:00:00.000Z", ...r.value };
  };

  it("lists a town just before the destination and just after the origin", async () => {
    let n = 0;
    const c = await buildCorridor(trip(), new Date("2026-10-12T12:00:00Z"), {
      geocode: vi.fn(),
      reverseName: vi.fn(async () => ({ name: `Place ${++n}` })),
      driveRoute: vi.fn(async () => ({ distanceKm: 444.8, durationMin: 300, line: LINE })),
      pause: vi.fn(async () => {}),
    });
    const along = c.legs[0].stops.filter((s) => s.kind === "along");
    expect(along).toHaveLength(samplePositions(444.8).length);
    expect(along[0].km).toBe(25);
    expect(444.8 - along.at(-1)!.km).toBeLessThanOrEqual(25);
  });
});
