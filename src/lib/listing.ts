/* A listing is one thing to do near a stop: an event or an attraction, read
   from a source page for the days the traveller is there.

   It is either fixed (a concert or play: a set start time and, if known, a
   length) or flexible (a museum or park: opening hours, and how long a visit
   usually takes). The trip board uses the difference: a fixed pick anchors the
   day, a flexible pick is placed in a gap within its hours.

   The text comes from Claude reading web pages, so it is validated, not
   trusted: https links only, real instants, bounded lengths, known kinds. */

import { createHash } from "node:crypto";
import { cleanUrl, jsonObjectIn } from "./sources";
import { parseInstant } from "./trip";

export type Category = "music" | "theatre" | "museum" | "festival" | "sports" | "food" | "outdoors" | "family" | "other";
export type Cost = "free" | "ticketed" | "unknown";

export type Schedule =
  | { kind: "fixed"; start: string; durationMin?: number }
  | { kind: "flexible"; hours: Array<{ opens: string; closes: string }>; typicalMin?: number };

export type Listing = {
  /** Stable across refreshes, so a pick or star made on it stays valid. */
  id: string;
  stop: string;
  title: string;
  url?: string;
  venue?: string;
  category: Category;
  cost: Cost;
  schedule: Schedule;
  /** The page it was read from. */
  source: string;
  notes?: string;
};

export type Window = { from: string; until: string };

/** How far outside the time the traveller is at a stop a listing can fall and still be worth showing:
    long enough to stop for a meal or a show on the way past. */
export const PASS_SLACK_MIN = 180;

const CATEGORIES: Category[] = ["music", "theatre", "museum", "festival", "sports", "food", "outdoors", "family", "other"];
const COSTS: Cost[] = ["free", "ticketed", "unknown"];
const MAX_PER_STOP = 40;
const MAX_TEXT = 120;
const MAX_NOTES = 300;
const MAX_HOURS = 14;
const MAX_FIXED_MIN = 24 * 60;
const MAX_TYPICAL_MIN = 600;
const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const wholeMinutes = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : undefined;

function parseSchedule(raw: unknown): Schedule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;

  if (s.kind === "fixed") {
    const start = parseInstant(s.start);
    if (start === null) return null;
    const durationMin = wholeMinutes(s.durationMin, MAX_FIXED_MIN);
    return durationMin
      ? { kind: "fixed", start: new Date(start).toISOString(), durationMin }
      : { kind: "fixed", start: new Date(start).toISOString() };
  }

  if (s.kind === "flexible" && Array.isArray(s.hours)) {
    const seen = new Set<string>();
    const hours: Array<{ opens: string; closes: string }> = [];
    for (const h of s.hours) {
      if (typeof h !== "object" || h === null) continue;
      const opens = parseInstant((h as Record<string, unknown>).opens);
      const closes = parseInstant((h as Record<string, unknown>).closes);
      if (opens === null || closes === null || closes <= opens || closes - opens > DAY_MS) continue;
      const entry = { opens: new Date(opens).toISOString(), closes: new Date(closes).toISOString() };
      const key = `${entry.opens}|${entry.closes}`;
      if (!seen.has(key)) {
        seen.add(key);
        hours.push(entry);
      }
    }
    if (!hours.length) return null;
    hours.sort((a, b) => a.opens.localeCompare(b.opens));
    const typicalMin = wholeMinutes(s.typicalMin, MAX_TYPICAL_MIN);
    return typicalMin
      ? { kind: "flexible", hours: hours.slice(0, MAX_HOURS), typicalMin }
      : { kind: "flexible", hours: hours.slice(0, MAX_HOURS) };
  }
  return null;
}

/** A flexible listing's id leaves out its hours, which change from week to week. */
function idOf(stop: string, title: string, schedule: Schedule): string {
  const when = schedule.kind === "fixed" ? schedule.start : "flexible";
  return createHash("sha1").update(`${stop}|${title.toLowerCase()}|${when}`).digest("hex").slice(0, 12);
}

/** Validate a reply for one stop. Whatever does not check out is dropped, not repaired. */
export function parseListings(replyText: string, stop: string): Listing[] {
  const data = jsonObjectIn(replyText);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  const items = (data as { listings?: unknown }).listings;
  if (!Array.isArray(items)) return [];

  const out = new Map<string, Listing>();
  for (const item of items) {
    if (out.size >= MAX_PER_STOP) break;
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;

    const title = text(r.title, MAX_TEXT);
    const source = cleanUrl(r.source);
    const schedule = parseSchedule(r.schedule);
    if (!title || !source || !schedule) continue;

    const listing: Listing = {
      id: idOf(stop, title, schedule),
      stop,
      title,
      category: CATEGORIES.find((c) => c === r.category) ?? "other",
      cost: COSTS.find((c) => c === r.cost) ?? "unknown",
      schedule,
      source,
    };
    const url = cleanUrl(r.url);
    const venue = text(r.venue, MAX_TEXT);
    const notes = text(r.notes, MAX_NOTES);
    if (url) listing.url = url;
    if (venue) listing.venue = venue;
    if (notes) listing.notes = notes;
    if (!out.has(listing.id)) out.set(listing.id, listing);
  }
  return [...out.values()];
}

function intervals(l: Listing): Array<[number, number]> {
  if (l.schedule.kind === "fixed") {
    const start = Date.parse(l.schedule.start);
    return [[start, start + (l.schedule.durationMin ?? 0) * MINUTE_MS]];
  }
  return l.schedule.hours.map((h): [number, number] => [Date.parse(h.opens), Date.parse(h.closes)]);
}

/** Is the listing on at some point when the traveller is at the stop, give or take the slack? */
export function inWindows(listing: Listing, windows: Window[], slackMin = PASS_SLACK_MIN): boolean {
  const slack = slackMin * MINUTE_MS;
  return intervals(listing).some(([begin, end]) =>
    windows.some((w) => begin <= Date.parse(w.until) + slack && end >= Date.parse(w.from) - slack),
  );
}
