import { describe, expect, it, vi } from "vitest";
import type { Corridor } from "./corridor";
import { refreshListings, unreadPlaces } from "./refresh";
import type { AskResult, SourceList } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

// A long trip: fifteen towns along the road, an hour apart.
const names = Array.from({ length: 15 }, (_, i) => `Town ${i}`);
const corridor: Corridor = {
  tripId: "t1", builtAt: NOW.toISOString(),
  from: { label: "A", lat: 0, lon: 0 }, to: { label: "B", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{ id: "out", distanceKm: 750, driveMinutes: 600, arriveAt: at(40), fits: true,
    stops: names.map((name, i) => ({ name, region: "NY", lat: 0, lon: 0, km: i * 50, from: at(24 + i), until: at(24 + i) })) }],
};
const trip: Trip = { id: "t1", createdAt: NOW.toISOString(), from: { label: "A" }, to: { label: "B" }, start: at(20), end: at(60), roundTrip: false };
const sources: SourceList = {
  tripId: "t1", builtAt: NOW.toISOString(), model: "m", stopsSearched: names, searches: 0, usage: { inputTokens: 0, outputTokens: 0 },
  sources: [{ name: "Guide", url: "https://guide.example/events", kind: "directory", near: names, covers: ["fixed", "flexible"] }],
};
const reply = (): AskResult => ({ text: JSON.stringify({ listings: [] }), searches: 1, inputTokens: 1, outputTokens: 1 });

// A long trip passes many more towns than a fixed few; a run reads all that are due, and only the deadline stops it.
describe("refreshListings on a long trip", () => {
  it("reads every place that is due when no limit is given", async () => {
    const ask = vi.fn(async () => reply());
    const { report } = await refreshListings(trip, corridor, sources, null, NOW, { ask });
    expect(ask).toHaveBeenCalledTimes(15);
    expect(report.remaining).toBe(0);
  });

  it("still stops at the deadline, and says how many are left", async () => {
    const ask = vi.fn(async () => reply());
    let t = 0;
    const { report } = await refreshListings(trip, corridor, sources, null, NOW, { ask, concurrency: 3, deadline: 2, now: () => t++ });
    expect(ask).toHaveBeenCalledTimes(6);
    expect(report.remaining).toBe(9);
  });
});

describe("unreadPlaces", () => {
  it("lists the places not yet read that the traveller has not passed, in route order", () => {
    const doc = { tripId: "t1", updatedAt: NOW.toISOString(), stops: { "Town 0": { refreshedAt: NOW.toISOString(), listings: [] } } };
    expect(unreadPlaces(corridor, doc, NOW)).toEqual(names.slice(1));
    expect(unreadPlaces(corridor, null, NOW)).toEqual(names);
    // a day and a half on, the first dozen towns are more than three hours behind
    expect(unreadPlaces(corridor, null, new Date(NOW.getTime() + 39 * 3_600_000))).toEqual(names.slice(13));
  });
});
