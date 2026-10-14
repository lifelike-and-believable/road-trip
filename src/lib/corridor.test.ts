import { describe, expect, it, vi } from "vitest";
import { buildCorridor, type CorridorDeps } from "./corridor";
import { OsmError } from "./osm";
import type { LonLat } from "./geo";
import { parseTripInput, type Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const MIN = 60_000;

// 4 degrees of longitude on the equator: about 444.8 km, driven in 300 minutes
const LINE: LonLat[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
const ROUTE = { distanceKm: 444.8, durationMin: 300, line: LINE };

function deps(over: Partial<CorridorDeps> = {}) {
  const d = {
    geocode: vi.fn(async (q: string) => ({ lat: 0, lon: q === "Omega" ? 4 : 0, displayName: q })),
    reverseName: vi.fn(async (_lat: number, lon: number) => ({ name: `Town ${Math.floor(lon)}`, region: "Région" })),
    driveRoute: vi.fn(async () => ROUTE),
    pause: vi.fn(async () => {}),
  };
  return Object.assign(d, over);
}

function trip(over: Record<string, unknown> = {}, coords = true): Trip {
  const raw = {
    from: coords ? { label: "Alpha", lat: 0, lon: 0 } : { label: "Alpha" },
    to: coords ? { label: "Omega", lat: 0, lon: 4 } : { label: "Omega" },
    start: "2026-10-16T14:00:00Z",
    end: "2026-10-18T22:00:00Z",
    roundTrip: false,
    ...over,
  };
  const r = parseTripInput(raw, NOW);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return { id: "t1", createdAt: NOW.toISOString(), ...r.value };
}

const ms = (iso: string) => Date.parse(iso);

describe("a one-way trip", () => {
  it("lists one stop per town along the road", async () => {
    const c = await buildCorridor(trip(), NOW, deps());
    expect(c.legs).toHaveLength(1);
    const stops = c.legs[0].stops;
    expect(stops.map((s) => s.name)).toEqual(["Town 0", "Town 1", "Town 2", "Town 3"]);
    expect(stops[0].region).toBe("Région");
  });

  it("keeps the first of consecutive samples that fall in the same town", async () => {
    const d = deps();
    const c = await buildCorridor(trip(), NOW, d);
    // twelve samples (see samplePositions), two or three per town
    expect(d.reverseName).toHaveBeenCalledTimes(12);
    expect(c.legs[0].stops).toHaveLength(4);
  });

  it("drops a sample where the map names no place", async () => {
    const d = deps({ reverseName: vi.fn(async (_la: number, lon: number) => (lon < 1.5 ? null : { name: `Town ${Math.floor(lon)}` })) });
    const names = (await buildCorridor(trip(), NOW, d)).legs[0].stops.map((s) => s.name);
    expect(names).toEqual(["Town 1", "Town 2", "Town 3"]);
  });

  it("estimates when the traveller passes each stop from the route's own duration", async () => {
    const t = trip();
    const stops = (await buildCorridor(t, NOW, deps())).legs[0].stops;
    const start = ms(t.start);
    const first = stops[0]; // the first town, from the sample 25 km in
    expect(ms(first.from) - start).toBeCloseTo((first.km / 444.8) * 300 * MIN, -3);
    expect(first.until).toBe(first.from);
  });

  it("works out when the traveller arrives from the route's duration", async () => {
    const t = trip();
    const leg = (await buildCorridor(t, NOW, deps())).legs[0];
    expect(ms(leg.arriveAt)).toBe(ms(t.start) + 300 * MIN);
    expect(leg).toMatchObject({ id: "out", fits: true, driveMinutes: 300 });
  });

  it("flags a window too short for the drive but still returns the corridor", async () => {
    const t = trip({ start: "2026-10-16T14:00:00Z", end: "2026-10-16T16:00:00Z" });
    const leg = (await buildCorridor(t, NOW, deps())).legs[0];
    expect(leg.fits).toBe(false);
    expect(leg.stops.length).toBeGreaterThan(2);
  });

  it("samples a long route by distance, and widens the spacing only on a very long one to cap the lookups", async () => {
    const long: LonLat[] = [[0, 0], [18, 0]];
    const d = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 2000, durationMin: 1500, line: long })) });
    await buildCorridor(trip({}, true), NOW, d);
    expect(d.reverseName.mock.calls.length).toBeGreaterThan(30);
    expect(d.reverseName.mock.calls.length).toBeLessThanOrEqual(80);

    const veryLong: LonLat[] = [[0, 0], [54, 0]];
    const e = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 6000, durationMin: 4500, line: veryLong })) });
    await buildCorridor(trip({}, true), NOW, e);
    expect(e.reverseName.mock.calls.length).toBeLessThanOrEqual(80);
    expect(e.reverseName.mock.calls.length).toBeGreaterThan(60);
  });

  it("lists no stops when the route is shorter than the spacing", async () => {
    const d = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 30, durationMin: 25, line: [[0, 0], [0.27, 0]] as LonLat[] })) });
    const stops = (await buildCorridor(trip(), NOW, d)).legs[0].stops;
    expect(stops).toEqual([]);
    expect(d.reverseName).not.toHaveBeenCalled();
  });
});

describe("places and coordinates", () => {
  it("uses coordinates the trip already has without geocoding", async () => {
    const d = deps();
    await buildCorridor(trip(), NOW, d);
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("geocodes a place that has only a label and records where it was put", async () => {
    const d = deps();
    const c = await buildCorridor(trip({}, false), NOW, d);
    expect(d.geocode.mock.calls.map((x) => x[0])).toEqual(["Alpha", "Omega"]);
    expect(c.from).toMatchObject({ label: "Alpha", lat: 0, lon: 0 });
    expect(c.to).toMatchObject({ label: "Omega", lat: 0, lon: 4 });
  });

  it("states where the figures came from and that they are estimates", async () => {
    const c = await buildCorridor(trip(), NOW, deps());
    expect(c.tripId).toBe("t1");
    expect(c.builtAt).toBe(NOW.toISOString());
    expect(c.sources.geocoding).toMatch(/OpenStreetMap/);
    expect(c.sources.routing).toMatch(/OSRM/);
    expect(c.sources.timing).toMatch(/estimate/i);
  });

  it("propagates a failure so no partial corridor is stored", async () => {
    const d = deps({ driveRoute: vi.fn(async () => { throw new Error("no route"); }) });
    await expect(buildCorridor(trip(), NOW, d)).rejects.toThrow("no route");
  });
});

describe("pacing", () => {
  it("waits 1.1 seconds before every Nominatim request after the first", async () => {
    const d = deps();
    await buildCorridor(trip({}, false), NOW, d);
    // 2 geocodes + 12 reverse lookups = 14 requests, 13 gaps
    expect(d.pause).toHaveBeenCalledTimes(13);
    expect(d.pause).toHaveBeenCalledWith(1100);
  });
});

describe("a round trip", () => {
  const rt = () => trip({ roundTrip: true, turnaround: "2026-10-17T16:00:00Z" });

  it("adds a return leg that reuses the road in reverse", async () => {
    const d = deps();
    const c = await buildCorridor(rt(), NOW, d);
    expect(c.legs.map((l) => l.id)).toEqual(["out", "back"]);
    expect(d.driveRoute).toHaveBeenCalledTimes(1);
    expect(d.reverseName).toHaveBeenCalledTimes(12);
    const [out, back] = c.legs;
    expect(back.stops.map((s) => s.name)).toEqual(out.stops.map((s) => s.name).reverse());
    expect(back.stops[0].km).toBeLessThan(back.stops.at(-1)!.km);
  });

  it("starts the return at the turnaround and drives back", async () => {
    const [, back] = (await buildCorridor(rt(), NOW, deps())).legs;
    expect(ms(back.stops[0].from)).toBeGreaterThan(ms("2026-10-17T16:00:00Z"));
    expect(ms(back.arriveAt)).toBe(ms("2026-10-17T16:00:00Z") + 300 * MIN);
    expect(back.fits).toBe(true);
  });

  it("flags a return leg that cannot be driven before the end", async () => {
    const t = trip({ roundTrip: true, turnaround: "2026-10-18T20:00:00Z" });
    const [out, back] = (await buildCorridor(t, NOW, deps())).legs;
    expect(out.fits).toBe(true);
    expect(back.fits).toBe(false);
  });
});

describe("a round trip with a stay", () => {
  const withStay = (stay: number) => trip({ roundTrip: true, stay });

  it("starts the return from arrival plus the stay", async () => {
    // leaves 2026-10-16 14:00, drives 300 minutes, stays 24 hours
    const [out, back] = (await buildCorridor(withStay(1440), NOW, deps())).legs;
    expect(out.arriveAt).toBe("2026-10-16T19:00:00.000Z");
    expect(back.arriveAt).toBe("2026-10-18T00:00:00.000Z");
    expect(out.fits).toBe(true);
    expect(back.fits).toBe(true);
  });

  it("flags the return when the stay leaves too little time to drive back", async () => {
    // a 50 hour stay: the return would arrive after the trip ends
    const [out, back] = (await buildCorridor(withStay(3000), NOW, deps())).legs;
    expect(out.fits).toBe(true);
    expect(back.fits).toBe(false);
    expect(back.stops.length).toBeGreaterThan(2);
  });
});

describe("a place the map cannot find", () => {
  it("says which end of the trip it was", async () => {
    const geocode = vi.fn(async (q: string) => {
      if (q === "Omega") throw new OsmError("not_found", 'no place found for "Omega"');
      return { lat: 0, lon: 0, displayName: q };
    });
    await expect(buildCorridor(trip({}, false), NOW, deps({ geocode }))).rejects.toMatchObject({ code: "not_found", place: "to" });
  });
});
