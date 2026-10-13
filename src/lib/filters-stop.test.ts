import { describe, expect, it } from "vitest";
import type { Day, Option } from "./board";
import { filterDays, type Filters } from "./filters";

const option = (id: string, stop: string, day = "2026-10-17"): Option => ({
  id, stop, kind: "fixed", day, start: "2026-10-17T16:00:00.000Z", end: null,
  listing: { id, stop, title: `T ${id}`, category: "music", cost: "free", source: "https://a.example/e", schedule: { kind: "fixed", start: "2026-10-17T16:00:00.000Z" } },
});
const days: Day[] = [
  { day: "2026-10-17", options: [option("a", "Champlain"), option("b", "Plattsburgh")] },
  { day: "2026-10-18", options: [option("c", "Plattsburgh", "2026-10-18")] },
];
const none: Filters = { categories: new Set(), freeOnly: false, starredOnly: false };
const ids = (d: Day[]) => d.flatMap((x) => x.options.map((o) => o.id));

describe("filterDays by stop", () => {
  it("shows only what is near the chosen stop, and drops a day left with nothing", () => {
    const r = filterDays(days, { ...none, stop: "Plattsburgh" }, new Set());
    expect(ids(r)).toEqual(["b", "c"]);
    const champlain = filterDays(days, { ...none, stop: "Champlain" }, new Set());
    expect(champlain.map((d) => d.day)).toEqual(["2026-10-17"]);
  });

  it("shows everything when no stop is chosen, and works together with the other filters", () => {
    expect(ids(filterDays(days, none, new Set()))).toEqual(["a", "b", "c"]);
    expect(ids(filterDays(days, { ...none, stop: "Plattsburgh", starredOnly: true }, new Set(["c"])))).toEqual(["c"]);
  });
});
