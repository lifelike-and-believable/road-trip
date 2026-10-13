import { describe, expect, it } from "vitest";
import { placesOf, type Day, type Option } from "./board";

const option = (id: string, stop: string, coords?: { lat: number; lon: number }, day = "2026-10-17"): Option => ({
  id, stop, kind: "fixed", day, start: "2026-10-17T16:00:00.000Z", end: null,
  listing: { id, stop, title: `T ${id}`, category: "museum", cost: "free", source: "https://a.example/e", schedule: { kind: "fixed", start: "2026-10-17T16:00:00.000Z" }, ...coords },
});

describe("placesOf", () => {
  it("lists the listings that have coordinates, with what the map needs to draw and name them", () => {
    const days: Day[] = [{ day: "2026-10-17", options: [option("a", "B", { lat: 45, lon: -73.4 }), option("b", "B")] }];
    expect(placesOf(days, [])).toEqual([{ id: "a", title: "T a", lat: 45, lon: -73.4, category: "museum", stop: "B", picked: false }]);
  });

  it("lists a flexible listing once even though it appears on several days", () => {
    const days: Day[] = [
      { day: "2026-10-17", options: [option("m", "B", { lat: 45, lon: -73.4 })] },
      { day: "2026-10-18", options: [option("m", "B", { lat: 45, lon: -73.4 }, "2026-10-18")] },
    ];
    expect(placesOf(days, [])).toHaveLength(1);
  });

  it("marks the ones on the plan", () => {
    const days: Day[] = [{ day: "2026-10-17", options: [option("a", "B", { lat: 45, lon: -73.4 }), option("c", "B", { lat: 45.1, lon: -73.4 })] }];
    expect(placesOf(days, [{ id: "c" }]).map((p) => [p.id, p.picked])).toEqual([["a", false], ["c", true]]);
  });

  it("is empty when nothing has coordinates", () => {
    expect(placesOf([{ day: "2026-10-17", options: [option("a", "B")] }], [])).toEqual([]);
  });
});
