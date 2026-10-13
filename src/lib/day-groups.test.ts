import { describe, expect, it } from "vitest";
import { bandOf, groupDay, type Option } from "./board";
import { dayParts } from "./format";
import type { Listing } from "./listing";

const TZ = "America/Toronto"; // UTC-4 on these dates
// 2026-10-17 at the given local clock time
const local = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 17, hh + 4, mm)).toISOString();

describe("the time bands a day is divided into", () => {
  it("puts the morning to 11:59, the afternoon from noon, the evening from 5 p.m. and late from 8:30 p.m.", () => {
    expect(bandOf(local(0), TZ)).toBe("morning");
    expect(bandOf(local(11, 59), TZ)).toBe("morning");
    expect(bandOf(local(12), TZ)).toBe("afternoon");
    expect(bandOf(local(16, 59), TZ)).toBe("afternoon");
    expect(bandOf(local(17), TZ)).toBe("evening");
    expect(bandOf(local(20, 29), TZ)).toBe("evening");
    expect(bandOf(local(20, 30), TZ)).toBe("late");
    expect(bandOf(local(23, 59), TZ)).toBe("late");
  });

  it("goes by the trip's clock, not UTC", () => {
    // 01:00 UTC on the 18th is 9 p.m. on the 17th in Toronto
    expect(bandOf("2026-10-18T01:00:00.000Z", TZ)).toBe("late");
    expect(bandOf("2026-10-18T01:00:00.000Z")).toBe("morning");
  });
});

const listing = (id: string, kind: "fixed" | "flexible"): Listing => ({
  id, stop: "A", title: id, category: "music", cost: "free", source: "https://a.example/",
  schedule: kind === "fixed"
    ? { kind: "fixed", start: local(19) }
    : { kind: "flexible", hours: [{ opens: local(9), closes: local(17) }] },
});
const option = (id: string, kind: "fixed" | "flexible", startH: number, startM = 0): Option => ({
  id, listing: listing(id, kind), stop: "A", kind, day: "2026-10-17", start: local(startH, startM), end: null,
});

describe("groupDay", () => {
  it("puts scheduled events in their bands in time order and attractions with opening hours in their own group", () => {
    const g = groupDay(
      [option("park", "flexible", 9), option("late", "fixed", 21), option("lunch", "fixed", 12), option("early", "fixed", 10), option("pm", "fixed", 12, 30)],
      TZ,
    );
    expect(g.bands.map((b) => [b.band, b.options.map((o) => o.id)])).toEqual([
      ["morning", ["early"]],
      ["afternoon", ["lunch", "pm"]],
      ["late", ["late"]],
    ]);
    expect(g.open.map((o) => o.id)).toEqual(["park"]);
  });

  it("leaves out a band with nothing in it, and has no groups for an empty day", () => {
    expect(groupDay([], TZ)).toEqual({ bands: [], open: [] });
  });
});

describe("dayParts", () => {
  it("splits a calendar day into its weekday and its date", () => {
    expect(dayParts("2026-10-17")).toEqual({ weekday: "Saturday", date: "17 October" });
  });
});
