import { describe, expect, it } from "vitest";
import type { Day, Option } from "./board";
import { withoutHidden } from "./filters";

const option = (id: string, day = "2026-10-17"): Option => ({
  id, stop: "A", kind: "fixed", day, start: "2026-10-17T16:00:00.000Z", end: null,
  listing: { id, stop: "A", title: `T ${id}`, category: "music", cost: "free", source: "https://a.example/e", schedule: { kind: "fixed", start: "2026-10-17T16:00:00.000Z" } },
});
const days: Day[] = [
  { day: "2026-10-17", options: [option("a"), option("b")] },
  { day: "2026-10-18", options: [option("c", "2026-10-18")] },
];
const ids = (d: Day[]) => d.flatMap((x) => x.options.map((o) => o.id));

describe("withoutHidden", () => {
  it("leaves out hidden entries, and a day left with nothing", () => {
    const r = withoutHidden(days, new Set(["c"]));
    expect(ids(r)).toEqual(["a", "b"]);
    expect(r.map((d) => d.day)).toEqual(["2026-10-17"]);
  });

  it("hides a flexible entry from every day it appears on", () => {
    const open: Day[] = [
      { day: "2026-10-17", options: [option("m"), option("a")] },
      { day: "2026-10-18", options: [option("m", "2026-10-18")] },
    ];
    expect(ids(withoutHidden(open, new Set(["m"])))).toEqual(["a"]);
  });

  it("changes nothing when nothing is hidden", () => {
    expect(withoutHidden(days, new Set())).toEqual(days);
  });
});
