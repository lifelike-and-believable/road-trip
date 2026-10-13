import { describe, expect, it, vi } from "vitest";
import { buildCorridor, type CorridorDeps } from "./corridor";
import type { LonLat } from "./geo";
import { parseTripInput, type Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const MIN = 60_000;

// 4 degrees of longitude on the equator: about 444.8 km, driven in 300 minutes
const LINE: LonLat[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];

function deps(over: Partial<CorridorDeps> = {}): CorridorDeps {
  return {
    geocode: vi.fn(),
    reverseName: vi.fn(async (_lat: number, lon: number) => ({ name: `Town ${Math.floor(lon)}` })),
    driveRoute: vi.fn(async () => ({ distanceKm: 444.8, durationMin: 300, line: LINE })),
    pause: vi.fn(async () => {}),
    ...over,
  };
}

function trip(over: Record<string, unknown> = {}): Trip {
  const r = parseTripInput({
    from: { label: "Alpha", lat: 0, lon: 0 }, to: { label: "Omega", lat: 0, lon: 4 },
    start: "2026-10-16T14:00:00Z", end: "2026-10-18T22:00:00Z", roundTrip: false, ...over,
  }, NOW);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return { id: "t1", createdAt: NOW.toISOString(), ...r.value };
}

describe("the stops are the towns along the road, not the two ends", () => {
  it("does not list the start or the end place", async () => {
    const stops = (await buildCorridor(trip(), NOW, deps())).legs[0].stops;
    expect(stops.map((s) => s.name)).toEqual(["Town 0", "Town 1", "Town 2", "Town 3"]);
    expect(stops.every((s) => s.km > 0 && s.km < 444.8)).toBe(true);
  });

  it("passes the traveller through each stop at one instant", async () => {
    for (const s of (await buildCorridor(trip(), NOW, deps())).legs[0].stops) expect(s.until).toBe(s.from);
  });

  it("still says when the traveller arrives when a short route has no stops", async () => {
    const short = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 30, durationMin: 25, line: [[0, 0], [0.27, 0]] as LonLat[] })) });
    const [leg] = (await buildCorridor(trip(), NOW, short)).legs;
    expect(leg.stops).toEqual([]);
    expect(leg.arriveAt).toBe("2026-10-16T14:25:00.000Z");
  });

  it("still works out the arrival and the return from a stay at the destination", async () => {
    const [out, back] = (await buildCorridor(trip({ roundTrip: true, stay: 1440 }), NOW, deps())).legs;
    expect(out.arriveAt).toBe("2026-10-16T19:00:00.000Z");
    expect(back.arriveAt).toBe("2026-10-18T00:00:00.000Z");
    // the return starts 24 hours after arriving, so its first town is passed that far into the drive
    const first = back.stops[0];
    const expected = Date.parse("2026-10-17T19:00:00Z") + (first.km / 444.8) * 300 * MIN;
    expect(Date.parse(first.from)).toBeCloseTo(expected, -3);
    expect(out.fits && back.fits).toBe(true);
  });

  it("gives the return leg the same towns in the opposite order", async () => {
    const [out, back] = (await buildCorridor(trip({ roundTrip: true, turnaround: "2026-10-17T16:00:00Z" }), NOW, deps())).legs;
    expect(back.stops.map((s) => s.name)).toEqual(out.stops.map((s) => s.name).reverse());
  });
});
