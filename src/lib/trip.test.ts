import { describe, expect, it } from "vitest";
import { activeTrips, isActive, legsOf, parseTripInput, tripStatus, type Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");

const base = {
  from: { label: "Montréal, QC" },
  to: { label: "Québec, QC" },
  start: "2026-10-16T14:00:00Z",
  end: "2026-10-18T22:00:00Z",
  roundTrip: false,
};

function parsed(raw: unknown, now = NOW) {
  const r = parseTripInput(raw, now);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
}

function trip(overrides: Record<string, unknown> = {}): Trip {
  return { id: "t1", createdAt: NOW.toISOString(), ...parsed({ ...base, ...overrides }) };
}

describe("parseTripInput", () => {
  it("accepts a one-way trip and normalises the instants", () => {
    const v = parsed({ ...base, start: "2026-10-16T10:00:00-04:00" });
    expect(v.start).toBe("2026-10-16T14:00:00.000Z");
    expect(v.end).toBe("2026-10-18T22:00:00.000Z");
    expect(v.roundTrip).toBe(false);
    expect(v.turnaround).toBeUndefined();
  });

  it("trims place labels and keeps valid coordinates", () => {
    const v = parsed({ ...base, from: { label: "  Montréal  ", lat: 45.5, lon: -73.56 } });
    expect(v.from).toEqual({ label: "Montréal", lat: 45.5, lon: -73.56 });
  });

  it("rejects non-objects", () => {
    for (const raw of [null, undefined, "x", 3, []]) {
      expect(parseTripInput(raw, NOW).ok).toBe(false);
    }
  });

  it("requires a label for each place", () => {
    const r = parseTripInput({ ...base, from: { label: "  " }, to: {} }, NOW);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.errors).toEqual(expect.arrayContaining(["from.label is required", "to.label is required"]));
  });

  it("rejects coordinates out of range or given singly", () => {
    expect(parseTripInput({ ...base, from: { label: "A", lat: 91, lon: 0 } }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, from: { label: "A", lat: 10, lon: 181 } }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, from: { label: "A", lat: 10 } }, NOW).ok).toBe(false);
  });

  it("rejects times that do not parse or carry no offset", () => {
    expect(parseTripInput({ ...base, start: "next friday" }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, end: 12345 }, NOW).ok).toBe(false);
    // no offset: the server cannot know which clock was meant
    expect(parseTripInput({ ...base, start: "2026-10-16T14:00" }, NOW).ok).toBe(false);
  });

  it("rejects an end that is not after the start", () => {
    expect(parseTripInput({ ...base, end: base.start }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, end: "2026-10-16T13:00:00Z" }, NOW).ok).toBe(false);
  });

  it("rejects a trip that has already ended", () => {
    const r = parseTripInput({ ...base, start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" }, NOW);
    expect(r).toMatchObject({ ok: false });
  });

  it("accepts a trip already under way", () => {
    expect(parseTripInput({ ...base, start: "2026-10-12T08:00:00Z" }, NOW).ok).toBe(true);
  });

  it("requires roundTrip to be a boolean", () => {
    expect(parseTripInput({ ...base, roundTrip: "yes" }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, roundTrip: undefined }, NOW).ok).toBe(false);
  });

  it("accepts a turnaround inside the window on a round trip", () => {
    const v = parsed({ ...base, roundTrip: true, turnaround: "2026-10-17T16:00:00Z" });
    expect(v.turnaround).toBe("2026-10-17T16:00:00.000Z");
  });

  it("rejects a turnaround outside the window, or on a one-way trip", () => {
    expect(parseTripInput({ ...base, roundTrip: true, turnaround: "2026-10-16T14:00:00Z" }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, roundTrip: true, turnaround: "2026-10-18T22:00:00Z" }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...base, roundTrip: false, turnaround: "2026-10-17T16:00:00Z" }, NOW).ok).toBe(false);
  });

  it("keeps only a valid IANA zone name", () => {
    expect(parsed({ ...base, tz: "America/Toronto" }).tz).toBe("America/Toronto");
    expect(parseTripInput({ ...base, tz: "Mars/Olympus" }, NOW).ok).toBe(false);
  });

  it("ignores fields it does not know", () => {
    const v = parsed({ ...base, id: "evil", createdAt: "x", extra: 1 });
    expect(v).not.toHaveProperty("id");
    expect(v).not.toHaveProperty("extra");
  });
});

describe("legsOf", () => {
  it("gives one outbound leg for a one-way trip", () => {
    const t = trip();
    expect(legsOf(t)).toEqual([
      { id: "out", from: t.from, to: t.to, start: t.start, end: t.end },
    ]);
  });

  it("splits a round trip at the given turnaround, reversing the places", () => {
    const t = trip({ roundTrip: true, turnaround: "2026-10-17T16:00:00Z" });
    expect(legsOf(t)).toEqual([
      { id: "out", from: t.from, to: t.to, start: t.start, end: "2026-10-17T16:00:00.000Z" },
      { id: "back", from: t.to, to: t.from, start: "2026-10-17T16:00:00.000Z", end: t.end },
    ]);
  });

  it("splits at the midpoint when no turnaround is given", () => {
    const t = trip({ roundTrip: true });
    const [out, back] = legsOf(t);
    expect(out.end).toBe("2026-10-17T18:00:00.000Z");
    expect(back.start).toBe(out.end);
  });
});

describe("tripStatus and isActive", () => {
  it("is upcoming before the start, underway during, ended from the end instant", () => {
    const t = trip();
    expect(tripStatus(t, new Date("2026-10-12T12:00:00Z"))).toBe("upcoming");
    expect(tripStatus(t, new Date("2026-10-16T14:00:00Z"))).toBe("underway");
    expect(tripStatus(t, new Date("2026-10-18T21:59:59Z"))).toBe("underway");
    expect(tripStatus(t, new Date("2026-10-18T22:00:00Z"))).toBe("ended");
  });

  it("counts upcoming and underway trips as active, so a trip is updated while it is being planned", () => {
    const t = trip();
    expect(isActive(t, new Date("2026-10-12T12:00:00Z"))).toBe(true);
    expect(isActive(t, new Date("2026-10-17T00:00:00Z"))).toBe(true);
    expect(isActive(t, new Date("2026-10-18T22:00:00Z"))).toBe(false);
  });

  it("selects only active trips", () => {
    const live = trip();
    const old = { ...trip(), id: "t2", end: "2026-10-11T00:00:00.000Z", start: "2026-10-10T00:00:00.000Z" };
    expect(activeTrips([live, old], NOW).map((t) => t.id)).toEqual(["t1"]);
  });
});
