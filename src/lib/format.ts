/* How the board writes days and lengths of time. Canadian English, as on the Montreal board. */

import type { Gap } from "./board";

/** "2026-10-17" as "Saturday 17 October". The date is a calendar day, so no time zone applies. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", ...opts }).format(d);
  return `${part({ weekday: "long" })} ${d.getUTCDate()} ${part({ month: "long" })}`;
}

/** "Saturday 17 October", or "Saturday 17 October to Monday 19 October" when the trip spans days. */
export function dateRangeLabel(startDay: string, endDay: string): string {
  return startDay === endDay ? dayLabel(startDay) : `${dayLabel(startDay)} to ${dayLabel(endDay)}`;
}

export function durationLabel(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The line between two picks. A drive time is only ever the corridor's own estimate, and is said to be about that long. */
export function describeGap(gap: Gap): { text: string; warn: boolean } {
  const drive = gap.travelMin ?? null;
  let text: string;
  let warn = false;
  if (gap.state === "overlap") {
    text = `Overlaps by ${durationLabel(-gap.minutes)}`;
    warn = true;
  } else if (gap.state === "back-to-back") {
    text = drive ? `Back to back, and the drive is about ${durationLabel(drive)}` : "Back to back";
    warn = true;
  } else if (gap.state === "tight") {
    text = `${durationLabel(gap.minutes)} between them, but the drive is about ${durationLabel(drive ?? 0)}`;
    warn = true;
  } else {
    text = `${durationLabel(gap.minutes)} free${drive ? ` · about ${durationLabel(drive)} drive` : drive === 0 ? " · same stop" : ""}`;
  }
  if (gap.fromStartOnly && gap.state !== "overlap") text += " (counted from its start; its length is not known)";
  return { text, warn };
}
