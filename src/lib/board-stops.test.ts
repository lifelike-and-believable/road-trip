import { describe, expect, it } from "vitest";
import { stopSummaries, type Day, type Option } from "./board";
import type { Corridor } from "./corridor";

const stop = (name: string, lat: number, lon: number, km: number, region?: string) => ({ name, region, lat, lon, km, from: "2026-10-17T12:00:00.000Z", until: "2026-10-17T12:00:00.000Z" });
const corridor: Corridor = {
  tripId: "t1", builtAt: "2026-10-12T12:00:00.000Z",
  from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [
    { id: "out", distanceKm: 100, driveMinutes: 120, arriveAt: "x", fits: true, stops: [stop("B", 44.9, -73.3, 25, "NY"), stop("C", 44.7, -73.4, 75, "NY")] },
    { id: "back", distanceKm: 100, driveMinutes: 120, arriveAt: "x", fits: true, stops: [stop("C", 44.7, -73.4, 25, "NY"), stop("B", 44.9, -73.3, 75, "NY")] },
  ],
};
const option = (id: string, stopName: string, day = "2026-10-17"): Option => ({
  id, stop: stopName, kind: "fixed", day, start: "2026-10-17T16:00:00.000Z", end: null,
  listing: { id, stop: stopName, title: id, category: "music", cost: "free", source: "https://a.example/e", schedule: { kind: "fixed", start: "2026-10-17T16:00:00.000Z" } },
});

describe("stopSummaries", () => {
  it("lists each stop once, in route order, with where it is and how many listings are near it", () => {
    const days: Day[] = [{ day: "2026-10-17", options: [option("a", "B"), option("b", "B"), option("c", "C")] }];
    const r = stopSummaries(corridor, days, [], new Map());
    expect(r.map((s) => [s.name, s.count])).toEqual([["B", 2], ["C", 1]]);
    expect(r[0]).toMatchObject({ region: "NY", lat: 44.9, lon: -73.3 });
  });

  it("counts a flexible listing once even though it appears on several days", () => {
    const days: Day[] = [
      { day: "2026-10-17", options: [option("m", "B")] },
      { day: "2026-10-18", options: [option("m", "B", "2026-10-18")] },
    ];
    expect(stopSummaries(corridor, days, [], new Map())[0].count).toBe(1);
  });

  it("says which stops have a pick on the plan, and leaves out a stop where nothing has been found", () => {
    const days: Day[] = [{ day: "2026-10-17", options: [option("a", "B")] }];
    const byId = new Map([["a", { stop: "B" }]]);
    const r = stopSummaries(corridor, days, [{ id: "a" }], byId);
    expect(r.find((s) => s.name === "B")).toMatchObject({ count: 1, picked: true });
    expect(r.find((s) => s.name === "C")).toBeUndefined();
  });
});

describe("stopSummaries with nothing found yet", () => {
  it("has no stops at all, so the map shows the road and no pins", () => {
    expect(stopSummaries(corridor, [], [], new Map())).toEqual([]);
  });

  it("keeps route order for the stops that do have something", () => {
    const days: Day[] = [{ day: "2026-10-17", options: [option("c", "C")] }];
    expect(stopSummaries(corridor, days, [], new Map()).map((s) => s.name)).toEqual(["C"]);
  });
});
