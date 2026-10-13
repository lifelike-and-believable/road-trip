import { describe, expect, it } from "vitest";
import { boardDays, buildItinerary, instantIn, localDay, localTime, SLACK_MIN, type Pick } from "./board";
import type { Corridor, Stop } from "./corridor";
import { PASS_SLACK_MIN, type Listing } from "./listing";
import type { ListingsDoc } from "./refresh";

const TZ = "America/Toronto"; // UTC-4 on these dates
const DAY0 = Date.parse("2026-10-17T00:00:00Z");
const H = 3_600_000;
const utc = (hours: number) => new Date(DAY0 + hours * H).toISOString();

const stop = (name: string, km: number, from: number, until = from): Stop => ({
  name, region: "NY", lat: 0, lon: 0, km, from: utc(from), until: utc(until),
});

// 100 km in 120 minutes each way, so 1.2 minutes a kilometre. A -> B -> C out, with two days at C, then back.
const corridor: Corridor = {
  tripId: "t1", builtAt: utc(0),
  from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
  sources: { geocoding: "Nominatim", routing: "OSRM demo server", timing: "estimates" },
  legs: [
    { id: "out", distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true,
      stops: [stop("A", 0, 12), stop("B", 50, 13), stop("C", 100, 14, 38)] },
    { id: "back", distanceKm: 100, driveMinutes: 120, arriveAt: utc(60), fits: true,
      stops: [stop("C", 0, 38), stop("B", 50, 39), stop("A", 100, 40)] },
  ],
};

const fixed = (id: string, stopName: string, startH: number, durationMin?: number): Listing => ({
  id, stop: stopName, title: `Show ${id}`, category: "music", cost: "free", source: "https://a.example/e",
  schedule: durationMin ? { kind: "fixed", start: utc(startH), durationMin } : { kind: "fixed", start: utc(startH) },
});
const flexible = (id: string, stopName: string, hours: Array<[number, number]>, typicalMin?: number): Listing => ({
  id, stop: stopName, title: `Place ${id}`, category: "museum", cost: "ticketed", source: "https://a.example/e",
  schedule: {
    kind: "flexible",
    hours: hours.map(([o, c]) => ({ opens: utc(o), closes: utc(c) })),
    ...(typicalMin ? { typicalMin } : {}),
  },
});

const doc = (...ls: Listing[]): ListingsDoc => {
  const stops: ListingsDoc["stops"] = {};
  for (const l of ls) (stops[l.stop] ??= { refreshedAt: utc(0), listings: [] }).listings.push(l);
  return { tripId: "t1", updatedAt: utc(0), stops };
};
const index = (...ls: Listing[]) => new Map(ls.map((l) => [l.id, { listing: l, stop: l.stop }]));
const pick = (id: string, at?: number): Pick => (at === undefined ? { id } : { id, at: utc(at) });

describe("local time", () => {
  it("gives the traveller's day and clock time in the trip's zone, in Canadian style", () => {
    expect(localDay("2026-10-18T02:30:00Z", TZ)).toBe("2026-10-17");
    expect(localDay("2026-10-18T04:00:00Z", TZ)).toBe("2026-10-18");
    expect(localTime("2026-10-18T00:00:00Z", TZ).replace(/\s/g, " ")).toBe("8:00 p.m.");
  });

  it("falls back to UTC when the trip has no zone", () => {
    expect(localDay("2026-10-18T02:30:00Z")).toBe("2026-10-18");
  });
});

describe("the slack the board shares with the listings", () => {
  it("is the same three hours", () => expect(SLACK_MIN).toBe(PASS_SLACK_MIN));
});

describe("boardDays", () => {
  it("is empty with no listings", () => {
    expect(boardDays(corridor, null, TZ)).toEqual([]);
    expect(boardDays(corridor, doc(), TZ)).toEqual([]);
  });

  it("groups fixed listings by the day they start, in the trip's zone, and orders them by time", () => {
    // utc(2) is 22:00 on the 16th local; utc(25) is 21:00 on the 17th local
    const days = boardDays(corridor, doc(fixed("late", "C", 14, 60), fixed("early", "A", 12.5, 60), fixed("next", "B", 39, 60)), TZ);
    expect(days.map((d) => d.day)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(days[0].options.map((o) => o.id)).toEqual(["early", "late"]);
    expect(days[1].options.map((o) => o.id)).toEqual(["next"]);
    expect(days[0].options[0]).toMatchObject({ stop: "A", region: "NY", kind: "fixed", start: utc(12.5), end: utc(13.5) });
  });

  it("gives a fixed listing with no length no end", () => {
    const [day] = boardDays(corridor, doc(fixed("a", "A", 12)), TZ);
    expect(day.options[0].end).toBeNull();
  });

  it("shows a flexible listing on each day it is open while the traveller is there, with that day's hours", () => {
    const l = flexible("m", "C", [[14, 22], [38, 46], [200, 210]], 90);
    const days = boardDays(corridor, doc(l), TZ);
    expect(days.map((d) => d.day)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(days[0].options[0]).toMatchObject({ id: "m", kind: "flexible", start: utc(14), end: utc(22) });
    expect(days[1].options[0]).toMatchObject({ start: utc(38), end: utc(46) });
  });

  it("shows a place open twice in one day once that day, with both periods", () => {
    // 10 a.m. to noon and 1 to 5 p.m. in Toronto
    const l = flexible("m", "C", [[14, 16], [17, 21]]);
    const days = boardDays(corridor, doc(l), TZ);
    expect(days).toHaveLength(1);
    expect(days[0].options).toHaveLength(1);
    expect(days[0].options[0]).toMatchObject({
      id: "m", start: utc(14), end: utc(21),
      periods: [{ opens: utc(14), closes: utc(16) }, { opens: utc(17), closes: utc(21) }],
    });
  });

  it("leaves out a listing that is not on near any time the traveller is at its stop", () => {
    expect(boardDays(corridor, doc(fixed("x", "B", 100, 60)), TZ)).toEqual([]);
    expect(boardDays(corridor, doc(flexible("y", "A", [[100, 110]])), TZ)).toEqual([]);
  });
});

describe("buildItinerary: order and gaps", () => {
  const a = fixed("a", "A", 12, 30); // 12:00 to 12:30 UTC
  const c = fixed("c", "C", 13.5, 60);

  it("puts picks in time order whatever order they were picked in", () => {
    const it = buildItinerary([pick("c"), pick("a")], index(a, c), corridor);
    expect(it.items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(it.items[0]).toMatchObject({ placed: "fixed", startAt: utc(12), endAt: utc(12.5), endKnown: true });
  });

  it("reports the gap, the estimated drive between the stops, and says when it is tight", () => {
    const it = buildItinerary([pick("a"), pick("c")], index(a, c), corridor);
    expect(it.gaps).toHaveLength(1);
    // 12:30 to 13:30 is 60 minutes; A to C is 100 km, 120 minutes at 1.2 min/km
    expect(it.gaps[0]).toMatchObject({ minutes: 60, travelMin: 120, state: "tight" });
    expect(it.gaps[0].travelSource).toContain("OSRM demo server");
  });

  it("calls a gap that is long enough ok", () => {
    const later = fixed("c2", "C", 16, 60);
    const it = buildItinerary([pick("a"), pick("c2")], index(a, later), corridor);
    expect(it.gaps[0]).toMatchObject({ minutes: 210, travelMin: 120, state: "ok" });
  });

  it("flags an overlap and a back to back", () => {
    const long = fixed("long", "A", 12, 120);
    const during = fixed("during", "A", 13, 30);
    const o = buildItinerary([pick("long"), pick("during")], index(long, during), corridor);
    expect(o.gaps[0]).toMatchObject({ minutes: -60, state: "overlap" });

    const first = fixed("first", "A", 12, 60);
    const second = fixed("second", "A", 13, 30);
    const b = buildItinerary([pick("first"), pick("second")], index(first, second), corridor);
    expect(b.gaps[0]).toMatchObject({ minutes: 0, travelMin: 0, state: "back-to-back" });
  });

  it("says nothing about driving when the two picks are on different legs, since a stay is in between", () => {
    const out = fixed("out", "B", 13, 60);
    const back = fixed("back", "B", 39, 60);
    const it = buildItinerary([pick("out"), pick("back")], index(out, back), corridor);
    expect(it.gaps[0]).toMatchObject({ travelMin: null, travelSource: null, state: "ok" });
    expect(it.gaps[0].minutes).toBe(25 * 60);
  });

  it("measures from the start when a pick has no known length, and says so", () => {
    const noLen = fixed("n", "A", 12);
    const next = fixed("m", "A", 12.25, 30);
    const it = buildItinerary([pick("n"), pick("m")], index(noLen, next), corridor);
    expect(it.items[0].endKnown).toBe(false);
    expect(it.gaps[0]).toMatchObject({ minutes: 15, fromStartOnly: true });
  });

  it("reports picks whose listing has gone, and carries on with the rest", () => {
    const it = buildItinerary([pick("a"), pick("gone")], index(a), corridor);
    expect(it.items.map((i) => i.id)).toEqual(["a"]);
    expect(it.missing).toEqual(["gone"]);
  });

  it("is empty with no picks", () => {
    expect(buildItinerary([], index(a), corridor)).toEqual({ items: [], gaps: [], missing: [] });
  });
});

describe("buildItinerary: flexible picks", () => {
  const anchor = fixed("anchor", "A", 12, 60); // A, 12:00 to 13:00 UTC
  // B is passed at 13:00 UTC; slack makes 10:00 to 16:00 UTC possible
  const museum = flexible("museum", "B", [[9, 22]], 90);

  it("places a flexible pick after the fixed pick it would clash with, allowing for the drive", () => {
    const it = buildItinerary([pick("anchor"), pick("museum")], index(anchor, museum), corridor);
    // A to B is 50 km, 60 minutes; free from 13:00, so earliest start is 14:00
    const m = it.items.find((i) => i.id === "museum")!;
    expect(m).toMatchObject({ placed: "auto", startAt: utc(14), endAt: utc(15.5), endKnown: true });
    expect(it.items.map((i) => i.id)).toEqual(["anchor", "museum"]);
  });

  it("starts as early as its hours and the traveller's visit allow when nothing is in the way", () => {
    const it = buildItinerary([pick("museum")], index(museum), corridor);
    // the traveller is at B from 13:00; with three hours of slack, 10:00 is the earliest, and it opens at 9:00
    expect(it.items[0]).toMatchObject({ placed: "auto", startAt: utc(10) });
  });

  it("uses a time the traveller chose", () => {
    const it = buildItinerary([pick("museum", 15)], index(museum), corridor);
    expect(it.items[0]).toMatchObject({ placed: "chosen", startAt: utc(15), endAt: utc(16.5) });
    expect(it.items[0].warning).toBeUndefined();
  });

  it("warns when the chosen time is outside the hours", () => {
    const it = buildItinerary([pick("museum", 23)], index(museum), corridor);
    expect(it.items[0]).toMatchObject({ placed: "chosen", startAt: utc(23), warning: "outside-hours" });
  });

  // C is open both days the traveller is there; a pick made from one day's card stays on that day.
  const twoDays = flexible("twodays", "C", [[13, 21], [37, 45]], 60);

  it("places a pick made from a day's card on that day, and says which day it is", () => {
    const sat = buildItinerary([{ id: "twodays", day: "2026-10-18" }], index(twoDays), corridor, TZ);
    expect(sat.items[0]).toMatchObject({ placed: "auto", startAt: utc(37), day: "2026-10-18" });
    const any = buildItinerary([pick("twodays")], index(twoDays), corridor, TZ);
    expect(any.items[0]).toMatchObject({ placed: "auto", startAt: utc(13), day: "2026-10-17" });
  });

  it("cannot place a pick on a day the place is not open, and keeps the day it was picked for", () => {
    const it = buildItinerary([{ id: "museum", day: "2026-10-19" }], index(museum), corridor, TZ);
    expect(it.items[0]).toMatchObject({ placed: "unplaceable", startAt: null, day: "2026-10-19" });
  });

  it("puts a flexible pick that cannot be fitted at the end, unplaced and with no gap", () => {
    const closed = flexible("closed", "B", [[9, 10]], 90); // closes before it can be reached
    const it = buildItinerary([pick("closed"), pick("anchor")], index(anchor, closed), corridor);
    expect(it.items.map((i) => i.id)).toEqual(["anchor", "closed"]);
    expect(it.items[1]).toMatchObject({ placed: "unplaceable", startAt: null, endAt: null });
    expect(it.gaps).toEqual([]);
  });
});

describe("instantIn", () => {
  it("turns a clock time on a day in the trip's zone into an instant", () => {
    expect(instantIn("2026-10-18", "14:30", TZ)).toBe("2026-10-18T18:30:00.000Z");
    expect(instantIn("2026-12-01", "09:00", TZ)).toBe("2026-12-01T14:00:00.000Z");
    expect(instantIn("2026-10-18", "14:30")).toBe("2026-10-18T14:30:00.000Z");
  });

  it("is null for a time the clocks skip, or one that is not a time", () => {
    expect(instantIn("2026-03-08", "02:30", TZ)).toBeNull();
    expect(instantIn("2026-10-18", "25:00", TZ)).toBeNull();
    expect(instantIn("2026-10-18", "", TZ)).toBeNull();
  });
});
