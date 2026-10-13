import { describe, expect, it } from "vitest";
import { dateRangeLabel, dayLabel, durationLabel, statusLabel, zoneName } from "./format";

describe("dayLabel", () => {
  it("names the day the way the Montreal board does: weekday, day, month", () => {
    expect(dayLabel("2026-10-17")).toBe("Saturday 17 October");
    expect(dayLabel("2026-12-01")).toBe("Tuesday 1 December");
  });
});

describe("durationLabel", () => {
  it("is short and exact", () => {
    expect(durationLabel(0)).toBe("0 min");
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(90)).toBe("1 h 30 min");
    expect(durationLabel(125)).toBe("2 h 5 min");
  });

  it("rounds to whole minutes", () => {
    expect(durationLabel(59.6)).toBe("1 h");
  });
});

import { describeGap } from "./format";
import type { Gap } from "./board";

const gap = (over: Partial<Gap>): Gap => ({ minutes: 60, travelMin: null, travelSource: null, state: "ok", fromStartOnly: false, ...over });

describe("describeGap", () => {
  it("says how long is free, and the estimated drive when the corridor has one", () => {
    expect(describeGap(gap({ minutes: 90, travelMin: 45 }))).toEqual({ text: "1 h 30 min free · about 45 min drive", warn: false });
    expect(describeGap(gap({ minutes: 90, travelMin: 0 }))).toEqual({ text: "1 h 30 min free · same stop", warn: false });
    expect(describeGap(gap({ minutes: 90 }))).toEqual({ text: "1 h 30 min free", warn: false });
  });

  it("warns when the drive is longer than the gap", () => {
    expect(describeGap(gap({ minutes: 30, travelMin: 120, state: "tight" }))).toEqual({
      text: "30 min between them, but the drive is about 2 h", warn: true,
    });
  });

  it("warns about an overlap and a back to back", () => {
    expect(describeGap(gap({ minutes: -20, state: "overlap" }))).toEqual({ text: "Overlaps by 20 min", warn: true });
    expect(describeGap(gap({ minutes: 0, state: "back-to-back", travelMin: 0 }))).toEqual({ text: "Back to back", warn: true });
    expect(describeGap(gap({ minutes: 0, state: "back-to-back", travelMin: 25 })).text).toBe("Back to back, and the drive is about 25 min");
  });

  it("says when the first pick's length is not known", () => {
    expect(describeGap(gap({ minutes: 15, fromStartOnly: true })).text).toBe("15 min free (counted from its start; its length is not known)");
  });
});

describe("dateRangeLabel", () => {
  it("names the day once for a trip that starts and ends on it, and both days otherwise", () => {
    expect(dateRangeLabel("2026-10-17", "2026-10-17")).toBe("Saturday 17 October");
    expect(dateRangeLabel("2026-10-17", "2026-10-19")).toBe("Saturday 17 October to Monday 19 October");
  });
});

describe("statusLabel", () => {
  it("says where a trip stands in plain words", () => {
    expect(statusLabel("upcoming")).toBe("Coming up");
    expect(statusLabel("underway")).toBe("On the road");
    expect(statusLabel("ended")).toBe("Over");
  });
});

describe("zoneName", () => {
  it("names the trip's time zone as a person would, for the date given", () => {
    expect(zoneName("America/Toronto", "2026-10-17T12:00:00Z")).toBe("Eastern Daylight Time");
    expect(zoneName("America/Toronto", "2026-12-17T12:00:00Z")).toBe("Eastern Standard Time");
    expect(zoneName(undefined, "2026-10-17T12:00:00Z")).toBe("Coordinated Universal Time");
  });
});
