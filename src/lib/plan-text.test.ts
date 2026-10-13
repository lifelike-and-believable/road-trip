import { describe, expect, it } from "vitest";
import type { Itinerary } from "./board";
import type { Listing } from "./listing";
import { planText } from "./plan-text";

const TZ = "America/Toronto"; // UTC-4 on these dates
const listing = (id: string, over: Partial<Listing> = {}): Listing => ({
  id, stop: "Champlain", title: `Title ${id}`, category: "music", cost: "free", source: "https://a.example/list",
  schedule: { kind: "fixed", start: "2026-10-17T14:00:00.000Z" }, ...over,
});
const byId = (...ls: Listing[]) => new Map(ls.map((l) => [l.id, { listing: l, stop: l.stop }]));
const item = (id: string, startAt: string | null, endAt: string | null, placed: "fixed" | "auto" | "unplaceable" = "fixed") => ({
  id, title: `Title ${id}`, stop: "Champlain", kind: "fixed" as const, placed, startAt, endAt, endKnown: endAt !== null,
});
const itinerary = (...items: Itinerary["items"]): Itinerary => ({ items, gaps: [], missing: [] });

describe("planText", () => {
  it("writes the trip's title, then a heading for each day and a line for each pick", () => {
    const a = listing("a", { venue: "Farm hall", url: "https://a.example/a" });
    const b = listing("b", { stop: "Plattsburgh" });
    const text = planText(
      "Montréal to Plattsburgh",
      itinerary(item("a", "2026-10-17T14:00:00.000Z", "2026-10-17T15:00:00.000Z"), item("b", "2026-10-18T18:00:00.000Z", null)),
      byId(a, b),
      TZ,
    );
    expect(text).toBe(
      [
        "MY ROAD TRIP: MONTRÉAL TO PLATTSBURGH",
        "",
        "SATURDAY 17 OCTOBER",
        "  10:00 a.m.  Title a",
        "              Farm hall, near Champlain · until 11:00 a.m.",
        "              https://a.example/a",
        "",
        "SUNDAY 18 OCTOBER",
        "  2:00 p.m.  Title b",
        "             near Plattsburgh",
      ].join("\n"),
    );
  });

  it("puts a pick that could not be fitted under its own heading, with no time", () => {
    const text = planText("A to B", itinerary(item("a", null, null, "unplaceable")), byId(listing("a")), TZ);
    expect(text).toContain("NO TIME THAT FITS");
    expect(text).toContain("  Title a");
    expect(text).not.toContain("a.m.");
  });

  it("says so when there is nothing on the plan", () => {
    expect(planText("A to B", itinerary(), byId(), TZ)).toBe("MY ROAD TRIP: A TO B\n\nNothing on the plan yet.");
  });
});
