/* The plan as plain text, to copy and send to someone. The Montreal board's "Copy plan" writes the
   same shape: a heading for each day, then each pick with its time, where, and its link. */

import { localDay, localTime, type Itinerary } from "./board";
import type { Listing } from "./listing";
import { dayLabel } from "./format";

type Found = { listing: Listing; stop: string };

/** The clock reads "10:00 a.m." with a narrow no-break space before the a.m.; text for a message uses an ordinary space. */
const plain = (s: string) => s.replace(/\s/g, " ");

export function planText(title: string, itinerary: Itinerary, byId: Map<string, Found>, tz?: string): string {
  const head = `MY ROAD TRIP: ${title.toUpperCase()}`;
  if (itinerary.items.length === 0) return `${head}\n\nNothing on the plan yet.`;

  const groups = new Map<string, Itinerary["items"]>();
  for (const item of itinerary.items) {
    const key = item.startAt ? localDay(item.startAt, tz) : "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const days = [...groups.keys()].filter((k) => k).sort();
  if (groups.has("")) days.push("");

  const lines = [head];
  for (const day of days) {
    lines.push("", day ? dayLabel(day).toUpperCase() : "NO TIME THAT FITS");
    for (const item of groups.get(day) ?? []) {
      const found = byId.get(item.id);
      const time = item.startAt ? plain(localTime(item.startAt, tz)) : "";
      const lead = time ? `  ${time}  ` : "  ";
      const pad = " ".repeat(lead.length);
      lines.push(`${lead}${item.title}`);
      if (found) {
        const until = item.endAt ? ` · until ${plain(localTime(item.endAt, tz))}` : "";
        lines.push(`${pad}${found.listing.venue ? `${found.listing.venue}, ` : ""}near ${found.stop}${until}`);
        if (found.listing.url) lines.push(`${pad}${found.listing.url}`);
      }
    }
  }
  return lines.join("\n");
}
