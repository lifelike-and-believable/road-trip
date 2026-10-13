import { describe, expect, it } from "vitest";
import type { Day, Option } from "./board";
import { CATEGORY_LABELS, categoriesIn, filterDays, type Filters } from "./filters";
import type { Listing } from "./listing";

const option = (id: string, category: Listing["category"], cost: Listing["cost"], day = "2026-10-17"): Option => ({
  id, stop: "A", kind: "fixed", day, start: "2026-10-17T16:00:00.000Z", end: null,
  listing: { id, stop: "A", title: `T ${id}`, category, cost, source: "https://a.example/e", schedule: { kind: "fixed", start: "2026-10-17T16:00:00.000Z" } },
});

const days: Day[] = [
  { day: "2026-10-17", options: [option("a", "music", "free"), option("b", "museum", "ticketed"), option("c", "music", "unknown")] },
  { day: "2026-10-18", options: [option("d", "food", "free", "2026-10-18")] },
];
const none: Filters = { categories: new Set(), freeOnly: false, starredOnly: false };
const ids = (d: Day[]) => d.flatMap((x) => x.options.map((o) => o.id));

describe("filterDays", () => {
  it("shows everything when no filter is on", () => {
    expect(ids(filterDays(days, none, new Set()))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the chosen categories, and drops a day left with nothing", () => {
    const r = filterDays(days, { ...none, categories: new Set(["food"]) }, new Set());
    expect(r.map((d) => d.day)).toEqual(["2026-10-18"]);
    expect(ids(filterDays(days, { ...none, categories: new Set(["music", "museum"]) }, new Set()))).toEqual(["a", "b", "c"]);
  });

  it("free only keeps what is marked free, not what is unknown", () => {
    expect(ids(filterDays(days, { ...none, freeOnly: true }, new Set()))).toEqual(["a", "d"]);
  });

  it("starred only keeps the starred", () => {
    expect(ids(filterDays(days, { ...none, starredOnly: true }, new Set(["b", "d"])))).toEqual(["b", "d"]);
  });

  it("applies every filter that is on together", () => {
    const f: Filters = { categories: new Set(["music"]), freeOnly: true, starredOnly: true };
    expect(ids(filterDays(days, f, new Set(["a", "c"])))).toEqual(["a"]);
  });
});

describe("categoriesIn", () => {
  it("lists the categories present, in the board's fixed order, with no repeats", () => {
    expect(categoriesIn(days)).toEqual(["music", "museum", "food"]);
    expect(categoriesIn([])).toEqual([]);
  });

  it("has a label for every category", () => {
    for (const c of categoriesIn(days)) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });
});
