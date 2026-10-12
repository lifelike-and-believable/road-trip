import { describe, expect, it } from "vitest";
import { cumulativeKm, haversineKm, pointAtKm, type LonLat } from "./geo";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm([-73.5673, 45.5017], [-73.5673, 45.5017])).toBe(0);
  });

  it("measures Montréal to Québec at about 233 km in a straight line", () => {
    const d = haversineKm([-73.5673, 45.5017], [-71.208, 46.8139]);
    expect(d).toBeGreaterThan(230);
    expect(d).toBeLessThan(237);
  });

  it("measures a degree of longitude on the equator at about 111.2 km", () => {
    expect(haversineKm([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
  });

  it("is symmetric", () => {
    const a: LonLat = [-79.38, 43.65];
    const b: LonLat = [-75.7, 45.42];
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe("cumulativeKm", () => {
  it("starts at zero and grows along the line", () => {
    const line: LonLat[] = [[0, 0], [1, 0], [2, 0]];
    const cum = cumulativeKm(line);
    expect(cum).toHaveLength(3);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeCloseTo(111.19, 1);
    expect(cum[2]).toBeCloseTo(222.39, 1);
  });

  it("returns an empty list for an empty line", () => {
    expect(cumulativeKm([])).toEqual([]);
  });
});

describe("pointAtKm", () => {
  const line: LonLat[] = [[0, 0], [1, 0], [2, 0]];
  const cum = cumulativeKm(line);

  it("interpolates between vertices", () => {
    const p = pointAtKm(line, cum, cum[1] / 2);
    expect(p.lon).toBeCloseTo(0.5, 3);
    expect(p.lat).toBeCloseTo(0, 6);
  });

  it("lands on a vertex exactly", () => {
    expect(pointAtKm(line, cum, cum[1])).toEqual({ lon: 1, lat: 0 });
  });

  it("clamps to the ends of the line", () => {
    expect(pointAtKm(line, cum, -5)).toEqual({ lon: 0, lat: 0 });
    expect(pointAtKm(line, cum, 9999)).toEqual({ lon: 2, lat: 0 });
  });

  it("handles a one-point line and rejects an empty one", () => {
    expect(pointAtKm([[3, 4]], [0], 10)).toEqual({ lon: 3, lat: 4 });
    expect(() => pointAtKm([], [], 0)).toThrow();
  });

  it("copes with repeated vertices", () => {
    const l: LonLat[] = [[0, 0], [0, 0], [1, 0]];
    const c = cumulativeKm(l);
    expect(pointAtKm(l, c, c[2] / 2).lon).toBeCloseTo(0.5, 3);
  });
});
