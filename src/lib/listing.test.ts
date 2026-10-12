import { describe, expect, it } from "vitest";
import { inWindows, parseListings, PASS_SLACK_MIN, type Listing } from "./listing";

const wrap = (items: unknown[]) => JSON.stringify({ listings: items });

const fixed = (over: Record<string, unknown> = {}) => ({
  title: "Jazz at the Pier",
  url: "https://pier.example/jazz",
  venue: "The Pier",
  category: "music",
  cost: "ticketed",
  source: "https://tourisme.example/agenda",
  schedule: { kind: "fixed", start: "2026-10-17T20:00:00-04:00", durationMin: 120 },
  ...over,
});

const flexible = (over: Record<string, unknown> = {}) => ({
  title: "Hudson River Museum",
  url: "https://museum.example/visit",
  category: "museum",
  cost: "ticketed",
  source: "https://museum.example/visit",
  schedule: {
    kind: "flexible",
    hours: [{ opens: "2026-10-17T10:00:00-04:00", closes: "2026-10-17T17:00:00-04:00" }],
    typicalMin: 90,
  },
  ...over,
});

describe("parseListings", () => {
  it("accepts a fixed and a flexible listing and normalises their times to UTC", () => {
    const out = parseListings(wrap([fixed(), flexible()]), "Albany");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      stop: "Albany", title: "Jazz at the Pier", url: "https://pier.example/jazz", venue: "The Pier",
      category: "music", cost: "ticketed", source: "https://tourisme.example/agenda",
      schedule: { kind: "fixed", start: "2026-10-18T00:00:00.000Z", durationMin: 120 },
    });
    expect(out[1].schedule).toEqual({
      kind: "flexible",
      hours: [{ opens: "2026-10-17T14:00:00.000Z", closes: "2026-10-17T21:00:00.000Z" }],
      typicalMin: 90,
    });
  });

  it("finds the JSON inside prose or a code fence", () => {
    const text = "Found these:\n```json\n" + wrap([fixed()]) + "\n```";
    expect(parseListings(text, "Albany")).toHaveLength(1);
  });

  it("strips tracking from links, and keeps a listing whose own link is unusable", () => {
    const [a] = parseListings(wrap([fixed({ url: "https://pier.example/jazz?utm=1&token=x#top" })]), "Albany");
    expect(a.url).toBe("https://pier.example/jazz");
    const [b] = parseListings(wrap([fixed({ url: "javascript:alert(1)" })]), "Albany");
    expect(b.title).toBe("Jazz at the Pier");
    expect(b).not.toHaveProperty("url");
  });

  it("drops a listing with no usable source page", () => {
    for (const source of [undefined, "http://insecure.example/a", "https://nodot/a", "not a url"]) {
      expect(parseListings(wrap([fixed({ source })]), "Albany")).toEqual([]);
    }
  });

  it("drops a listing with no title, and falls back on unknown category and cost", () => {
    expect(parseListings(wrap([fixed({ title: "  " })]), "Albany")).toEqual([]);
    const [l] = parseListings(wrap([fixed({ category: "rodeo", cost: "cheap" })]), "Albany");
    expect(l.category).toBe("other");
    expect(l.cost).toBe("unknown");
  });

  describe("fixed", () => {
    const withSchedule = (schedule: unknown) => parseListings(wrap([fixed({ schedule })]), "Albany");

    it("needs a start time with an offset", () => {
      expect(withSchedule({ kind: "fixed", start: "2026-10-17T20:00:00" })).toEqual([]);
      expect(withSchedule({ kind: "fixed", start: "tonight" })).toEqual([]);
      expect(withSchedule({ kind: "fixed" })).toEqual([]);
    });

    it("omits a length that is not a sensible number of minutes, but keeps the listing", () => {
      for (const durationMin of [0, -5, 1.5, "long", 5000]) {
        const [l] = withSchedule({ kind: "fixed", start: "2026-10-17T20:00:00-04:00", durationMin });
        expect(l.schedule).toEqual({ kind: "fixed", start: "2026-10-18T00:00:00.000Z" });
      }
    });
  });

  describe("flexible", () => {
    const withHours = (hours: unknown, extra: Record<string, unknown> = {}) =>
      parseListings(wrap([flexible({ schedule: { kind: "flexible", hours, ...extra } })]), "Albany");
    const day = (n: number, from = "10:00", to = "17:00") => ({
      opens: `2026-10-${17 + n}T${from}:00-04:00`, closes: `2026-10-${17 + n}T${to}:00-04:00`,
    });

    it("keeps the valid opening hours and drops the invalid ones", () => {
      const [l] = withHours([day(0), { opens: "2026-10-18T17:00:00-04:00", closes: "2026-10-18T10:00:00-04:00" }, { opens: "x", closes: "y" }, day(2)]);
      expect(l.schedule.kind === "flexible" && l.schedule.hours).toHaveLength(2);
    });

    it("drops the listing when no hours are usable", () => {
      expect(withHours([])).toEqual([]);
      expect(withHours("9 to 5")).toEqual([]);
      expect(withHours([{ opens: "2026-10-17T10:00:00-04:00" }])).toEqual([]);
    });

    it("does not accept a span longer than a day as one opening", () => {
      expect(withHours([{ opens: "2026-10-17T10:00:00-04:00", closes: "2026-10-19T10:00:00-04:00" }])).toEqual([]);
    });

    it("keeps at most 14 days of hours", () => {
      const [l] = withHours(Array.from({ length: 20 }, (_, i) => day(i % 9)));
      expect(l.schedule.kind === "flexible" && l.schedule.hours.length).toBeLessThanOrEqual(14);
    });

    it("omits a visit length that is not sensible but keeps the listing", () => {
      for (const typicalMin of [0, -1, 2.5, "a while", 2000]) {
        const [l] = withHours([day(0)], { typicalMin });
        expect(l.schedule).not.toHaveProperty("typicalMin");
      }
    });
  });

  it("drops a listing whose schedule kind is unknown or missing", () => {
    expect(parseListings(wrap([fixed({ schedule: { kind: "sometimes" } })]), "Albany")).toEqual([]);
    expect(parseListings(wrap([fixed({ schedule: undefined })]), "Albany")).toEqual([]);
  });

  describe("ids", () => {
    it("are 12 hex characters and the same for the same listing", () => {
      const [a] = parseListings(wrap([fixed()]), "Albany");
      const [b] = parseListings(wrap([fixed({ url: "https://other.example/x" })]), "Albany");
      expect(a.id).toMatch(/^[0-9a-f]{12}$/);
      expect(b.id).toBe(a.id);
    });

    it("differ by stop, title and, for a fixed listing, start time", () => {
      const ids = new Set([
        parseListings(wrap([fixed()]), "Albany")[0].id,
        parseListings(wrap([fixed()]), "Troy")[0].id,
        parseListings(wrap([fixed({ title: "Blues at the Pier" })]), "Albany")[0].id,
        parseListings(wrap([fixed({ schedule: { kind: "fixed", start: "2026-10-18T20:00:00-04:00" } })]), "Albany")[0].id,
      ]);
      expect(ids.size).toBe(4);
    });

    it("do not change for a flexible listing when its hours change, so a pick stays valid across refreshes", () => {
      const a = parseListings(wrap([flexible()]), "Albany")[0];
      const b = parseListings(wrap([flexible({ schedule: { kind: "flexible", hours: [{ opens: "2026-10-18T09:00:00-04:00", closes: "2026-10-18T16:00:00-04:00" }] } })]), "Albany")[0];
      expect(b.id).toBe(a.id);
    });

    it("ignore case and surrounding space in the title", () => {
      const a = parseListings(wrap([flexible()]), "Albany")[0];
      const b = parseListings(wrap([flexible({ title: "  hudson river MUSEUM " })]), "Albany")[0];
      expect(b.id).toBe(a.id);
    });
  });

  it("lists a repeated listing once and caps the list at 40", () => {
    expect(parseListings(wrap([fixed(), fixed()]), "Albany")).toHaveLength(1);
    const many = Array.from({ length: 70 }, (_, i) => fixed({ title: `Show ${i}` }));
    expect(parseListings(wrap(many), "Albany")).toHaveLength(40);
  });

  it("bounds the length of text it keeps", () => {
    const [l] = parseListings(wrap([fixed({ title: "T".repeat(500), venue: "V".repeat(500), notes: "N".repeat(2000) })]), "Albany");
    expect(l.title.length).toBeLessThanOrEqual(120);
    expect(l.venue!.length).toBeLessThanOrEqual(120);
    expect(l.notes!.length).toBeLessThanOrEqual(300);
  });

  it("returns nothing for text that is not the expected JSON", () => {
    for (const t of ["", "none", "{broken", '{"listings":"x"}', "[1]", '{"sources":[]}']) {
      expect(parseListings(t, "Albany")).toEqual([]);
    }
  });
});

describe("inWindows", () => {
  const f = (start: string, durationMin?: number): Listing => ({
    id: "a", stop: "S", title: "t", category: "music", cost: "free", source: "https://s.example/",
    schedule: { kind: "fixed", start, ...(durationMin ? { durationMin } : {}) },
  });
  const flex = (hours: Array<[string, string]>): Listing => ({
    id: "b", stop: "S", title: "t", category: "museum", cost: "free", source: "https://s.example/",
    schedule: { kind: "flexible", hours: hours.map(([opens, closes]) => ({ opens, closes })) },
  });
  const noon = { from: "2026-10-17T16:00:00.000Z", until: "2026-10-17T16:00:00.000Z" }; // passing through
  const stay = { from: "2026-10-16T19:00:00.000Z", until: "2026-10-17T19:00:00.000Z" }; // a day at the destination
  const slice = PASS_SLACK_MIN * 60_000;

  it("keeps a fixed listing that starts inside the window", () => {
    expect(inWindows(f("2026-10-17T02:00:00.000Z"), [stay])).toBe(true);
  });

  it("allows the slack either side of a window, and no more", () => {
    const at = (ms: number) => new Date(Date.parse(noon.from) + ms).toISOString();
    expect(inWindows(f(at(slice)), [noon])).toBe(true);
    expect(inWindows(f(at(-slice)), [noon])).toBe(true);
    expect(inWindows(f(at(slice + 60_000)), [noon])).toBe(false);
    expect(inWindows(f(at(-slice - 60_000)), [noon])).toBe(false);
  });

  it("counts a fixed listing that began before the window but is still running", () => {
    const early = new Date(Date.parse(noon.from) - slice - 90 * 60_000).toISOString();
    expect(inWindows(f(early, 60), [noon])).toBe(false);
    expect(inWindows(f(early, 120), [noon])).toBe(true);
  });

  it("uses any of several windows, as when the road is driven both ways", () => {
    const back = { from: "2026-10-18T19:00:00.000Z", until: "2026-10-18T19:00:00.000Z" };
    expect(inWindows(f("2026-10-18T20:00:00.000Z"), [noon, back])).toBe(true);
    expect(inWindows(f("2026-10-18T20:00:00.000Z"), [noon])).toBe(false);
  });

  it("keeps a flexible listing that is open at some point in the window", () => {
    expect(inWindows(flex([["2026-10-17T14:00:00.000Z", "2026-10-17T21:00:00.000Z"]]), [noon])).toBe(true);
    expect(inWindows(flex([["2026-10-19T14:00:00.000Z", "2026-10-19T21:00:00.000Z"]]), [noon])).toBe(false);
    expect(inWindows(flex([["2026-10-19T14:00:00.000Z", "2026-10-19T21:00:00.000Z"], ["2026-10-17T14:00:00.000Z", "2026-10-17T21:00:00.000Z"]]), [noon])).toBe(true);
  });

  it("rejects everything when there is no window", () => {
    expect(inWindows(f("2026-10-17T16:00:00.000Z"), [])).toBe(false);
  });
});
