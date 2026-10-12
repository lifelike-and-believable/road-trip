import { describe, expect, it } from "vitest";
import { activeTrips, isActive, legsOf, parseTripInput, presentTrip, tripStatus, type Trip } from "./trip";

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

describe("stay at the turnaround point", () => {
  const rt = { ...base, roundTrip: true };

  it("accepts a stay in whole minutes on a round trip", () => {
    expect(parsed({ ...rt, stay: 2880 }).stay).toBe(2880);
  });

  it("rejects a stay on a one-way trip, or together with a turnaround", () => {
    expect(parseTripInput({ ...base, stay: 600 }, NOW).ok).toBe(false);
    const r = parseTripInput({ ...rt, stay: 600, turnaround: "2026-10-17T16:00:00Z" }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("give either stay or turnaround, not both");
  });

  it("rejects a stay that is not a positive whole number of minutes", () => {
    for (const stay of [0, -5, 1.5, "600", null, Number.NaN]) {
      expect(parseTripInput({ ...rt, stay }, NOW).ok).toBe(false);
    }
  });

  it("rejects a stay as long as the whole trip, which leaves no time to drive", () => {
    // the window is 56 hours: 3360 minutes
    expect(parseTripInput({ ...rt, stay: 3360 }, NOW).ok).toBe(false);
    expect(parseTripInput({ ...rt, stay: 3359 }, NOW).ok).toBe(true);
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

describe("legsOf with a stay", () => {
  const t = () => trip({ roundTrip: true, stay: 1440 });

  it("leaves the outbound end and the return start open until the drive time is known", () => {
    const [out, back] = legsOf(t());
    expect(out).toMatchObject({ id: "out", start: "2026-10-16T14:00:00.000Z", end: null });
    expect(back).toMatchObject({ id: "back", start: null, end: "2026-10-18T22:00:00.000Z" });
  });

  it("starts the return at outbound arrival plus the stay once the drive time is known", () => {
    // 14:00 + 300 minutes driving + 24 hours
    const [out, back] = legsOf(t(), 300);
    expect(out.end).toBe("2026-10-17T19:00:00.000Z");
    expect(back.start).toBe("2026-10-17T19:00:00.000Z");
    expect(back.end).toBe("2026-10-18T22:00:00.000Z");
  });

  it("ignores the drive time when there is a turnaround or neither", () => {
    const withTurn = trip({ roundTrip: true, turnaround: "2026-10-17T16:00:00Z" });
    expect(legsOf(withTurn, 300)).toEqual(legsOf(withTurn));
    const neither = trip({ roundTrip: true });
    expect(legsOf(neither, 300)).toEqual(legsOf(neither));
  });

  it("is reported by presentTrip with the open times as null", () => {
    const shown = presentTrip(t(), NOW);
    expect(shown.stay).toBe(1440);
    expect(shown.legs[0].end).toBeNull();
    expect(shown.legs[1].start).toBeNull();
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
