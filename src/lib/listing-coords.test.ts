import { describe, expect, it } from "vitest";
import { MAX_LISTING_KM, parseListings } from "./listing";

const item = (over: Record<string, unknown> = {}) => ({
  title: "Maple Museum", source: "https://a.example/list", category: "museum", cost: "ticketed",
  schedule: { kind: "flexible", hours: [{ opens: "2026-10-17T09:00:00-04:00", closes: "2026-10-17T17:00:00-04:00" }] },
  ...over,
});
const parse = (over: Record<string, unknown>, at?: [number, number]) =>
  parseListings(JSON.stringify({ listings: [item(over)] }), "Champlain", at)[0];

// Champlain, NY: longitude first
const CHAMPLAIN: [number, number] = [-73.45, 44.98];

describe("a listing's coordinates", () => {
  it("keeps a latitude and longitude, rounded to about a metre", () => {
    const l = parse({ lat: 44.980001234, lon: -73.449998765 });
    expect(l.lat).toBe(44.98);
    expect(l.lon).toBe(-73.45);
  });

  it("has none when the reply gave none", () => {
    const l = parse({});
    expect(l).toBeDefined();
    expect(l).not.toHaveProperty("lat");
    expect(l).not.toHaveProperty("lon");
  });

  it("drops coordinates that are not both real numbers on the globe, and keeps the listing", () => {
    for (const bad of [
      { lat: "44.98", lon: "-73.45" }, { lat: 44.98 }, { lon: -73.45 }, { lat: 91, lon: -73.45 }, { lat: 44.98, lon: -181 },
      { lat: null, lon: null }, { lat: Number.NaN, lon: -73.45 }, { lat: 0, lon: 0 },
    ]) {
      const l = parse(bad);
      expect(l?.title).toBe("Maple Museum");
      expect(l).not.toHaveProperty("lat");
      expect(l).not.toHaveProperty("lon");
    }
  });

  it("keeps coordinates within reach of the stop, and drops ones too far away, keeping the listing", () => {
    expect(MAX_LISTING_KM).toBe(40);
    const near = parse({ lat: 45.05, lon: -73.4 }, CHAMPLAIN);
    expect(near.lat).toBe(45.05);
    const far = parse({ lat: 45.5, lon: -73.6 }, CHAMPLAIN); // Montréal, about 60 km north
    expect(far?.title).toBe("Maple Museum");
    expect(far).not.toHaveProperty("lat");
  });

  it("does not change a listing's id", () => {
    expect(parse({ lat: 44.98, lon: -73.45 }).id).toBe(parse({}).id);
  });
});
