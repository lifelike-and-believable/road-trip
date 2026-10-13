import { describe, expect, it } from "vitest";
import type { Corridor } from "./corridor";
import { ingestListings } from "./ingest";

const NOW = new Date("2026-10-12T12:00:00Z");
const day = "2026-10-16T14:00:00.000Z";
const corridor: Corridor = {
  tripId: "t1", builtAt: NOW.toISOString(),
  from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{ id: "out", distanceKm: 100, driveMinutes: 120, arriveAt: day, fits: true, stops: [{ name: "Champlain", region: "NY", lat: 44.98, lon: -73.45, km: 50, from: day, until: day }] }],
};
const museum = (over: Record<string, unknown>) => ({
  title: "Maple Museum", source: "https://a.example/list", category: "museum", cost: "ticketed",
  schedule: { kind: "flexible", hours: [{ opens: "2026-10-16T09:00:00-04:00", closes: "2026-10-16T17:00:00-04:00" }] }, ...over,
});

describe("coordinates through the routine's ingest", () => {
  it("keeps a listing's coordinates when they are near the stop's own", () => {
    const r = ingestListings(corridor, null, { stops: { Champlain: [museum({ lat: 45.0, lon: -73.4 })] } }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.stops.Champlain.listings[0]).toMatchObject({ lat: 45, lon: -73.4 });
  });

  it("drops coordinates far from the stop but keeps the listing", () => {
    const r = ingestListings(corridor, null, { stops: { Champlain: [museum({ lat: 45.5, lon: -73.6 })] } }, NOW);
    if (!r.ok) throw new Error(r.error);
    const l = r.doc.stops.Champlain.listings[0];
    expect(l.title).toBe("Maple Museum");
    expect(l).not.toHaveProperty("lat");
  });
});
