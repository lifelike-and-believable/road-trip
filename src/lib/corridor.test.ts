import { describe, expect, it, vi } from "vitest";
import { buildCorridor, type CorridorDeps } from "./corridor";
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
  it("lists origin, one stop per town along the road, then destination", async () => {
    const c = await buildCorridor(trip(), NOW, deps());
    expect(c.legs).toHaveLength(1);
    const stops = c.legs[0].stops;
    expect(stops.map((s) => `${s.kind}:${s.name}`)).toEqual([
      "origin:Alpha", "along:Town 0", "along:Town 1", "along:Town 2", "along:Town 3", "destination:Omega",
    ]);
    expect(stops[0].km).toBe(0);
    expect(stops.at(-1)?.km).toBeCloseTo(444.8, 1);
    expect(stops[1].region).toBe("Région");
  });

  it("keeps the first of consecutive samples that fall in the same town", async () => {
    const d = deps();
    const c = await buildCorridor(trip(), NOW, d);
    // eight samples at 50 km spacing, two per town
    expect(d.reverseName).toHaveBeenCalledTimes(8);
    expect(c.legs[0].stops.filter((s) => s.kind === "along")).toHaveLength(4);
  });

  it("drops a sample where the map names no place", async () => {
    const d = deps({ reverseName: vi.fn(async (_la: number, lon: number) => (lon < 1.5 ? null : { name: `Town ${Math.floor(lon)}` })) });
    const names = (await buildCorridor(trip(), NOW, d)).legs[0].stops.map((s) => s.name);
    expect(names).toEqual(["Alpha", "Town 1", "Town 2", "Town 3", "Omega"]);
  });

  it("estimates when the traveller passes each stop from the route's own duration", async () => {
    const t = trip();
    const stops = (await buildCorridor(t, NOW, deps())).legs[0].stops;
    const start = ms(t.start);
    expect(stops[0].from).toBe(t.start);
    expect(stops[0].until).toBe(t.start);
    const first = stops[1]; // the first town, from the sample 50 km in
    expect(ms(first.from) - start).toBeCloseTo((first.km / 444.8) * 300 * MIN, -3);
    expect(first.until).toBe(first.from);
  });

  it("holds the destination from arrival until the trip ends", async () => {
    const t = trip();
    const leg = (await buildCorridor(t, NOW, deps())).legs[0];
    const dest = leg.stops.at(-1)!;
    expect(ms(dest.from)).toBe(ms(t.start) + 300 * MIN);
    expect(dest.until).toBe(t.end);
    expect(leg.arriveAt).toBe(dest.from);
    expect(leg).toMatchObject({ id: "out", fits: true, driveMinutes: 300 });
  });

  it("flags a window too short for the drive but still returns the corridor", async () => {
    const t = trip({ start: "2026-10-16T14:00:00Z", end: "2026-10-16T16:00:00Z" });
    const leg = (await buildCorridor(t, NOW, deps())).legs[0];
    expect(leg.fits).toBe(false);
    expect(leg.stops.length).toBeGreaterThan(2);
  });

  it("widens the spacing on a long route to cap the lookups", async () => {
    const long: LonLat[] = [[0, 0], [18, 0]];
    const d = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 2000, durationMin: 1500, line: long })) });
    await buildCorridor(trip({}, true), NOW, d);
    expect(d.reverseName.mock.calls.length).toBeLessThanOrEqual(20);
    expect(d.reverseName.mock.calls.length).toBeGreaterThan(10);
  });

  it("lists only the two ends when the route is shorter than the spacing", async () => {
    const d = deps({ driveRoute: vi.fn(async () => ({ distanceKm: 30, durationMin: 25, line: [[0, 0], [0.27, 0]] as LonLat[] })) });
    const stops = (await buildCorridor(trip(), NOW, d)).legs[0].stops;
    expect(stops.map((s) => s.kind)).toEqual(["origin", "destination"]);
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
    // 2 geocodes + 8 reverse lookups = 10 requests, 9 gaps
    expect(d.pause).toHaveBeenCalledTimes(9);
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
    expect(d.reverseName).toHaveBeenCalledTimes(8);
    const [out, back] = c.legs;
    expect(back.stops.map((s) => s.name)).toEqual(out.stops.map((s) => s.name).reverse());
    expect(back.stops[0]).toMatchObject({ kind: "origin", name: "Omega", km: 0 });
    expect(back.stops.at(-1)).toMatchObject({ kind: "destination", name: "Alpha" });
    expect(back.stops.at(-1)?.km).toBeCloseTo(444.8, 1);
  });

  it("holds the outbound destination until the turnaround, then drives back", async () => {
    const t = rt();
    const [out, back] = (await buildCorridor(t, NOW, deps())).legs;
    expect(out.stops.at(-1)?.until).toBe("2026-10-17T16:00:00.000Z");
    expect(back.stops[0].from).toBe("2026-10-17T16:00:00.000Z");
    expect(back.stops[0].until).toBe("2026-10-17T16:00:00.000Z");
    expect(ms(back.arriveAt)).toBe(ms("2026-10-17T16:00:00Z") + 300 * MIN);
    expect(back.stops.at(-1)?.until).toBe(t.end);
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

  it("holds the destination for the stay, then starts the return from arrival plus the stay", async () => {
    // leaves 2026-10-16 14:00, drives 300 minutes, stays 24 hours
    const t = withStay(1440);
    const [out, back] = (await buildCorridor(t, NOW, deps())).legs;
    expect(out.arriveAt).toBe("2026-10-16T19:00:00.000Z");
    expect(out.stops.at(-1)?.from).toBe("2026-10-16T19:00:00.000Z");
    expect(out.stops.at(-1)?.until).toBe("2026-10-17T19:00:00.000Z");
    expect(back.stops[0].from).toBe("2026-10-17T19:00:00.000Z");
    expect(back.stops[0].until).toBe("2026-10-17T19:00:00.000Z");
    expect(back.arriveAt).toBe("2026-10-18T00:00:00.000Z");
    expect(back.stops.at(-1)?.until).toBe(t.end);
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
