/* Listings read by something other than this server: the routine that plays
   the part of the Montreal Weekend Board's daily refresh.

   The routine reads the trip's sources and posts what it found, place by
   place. The text came from web pages, so it goes through the same validation
   as a read made here (parseListings), is kept only if it falls in a visit
   window, and follows the same rules as refreshListings: a place that comes
   back with nothing never blanks what was found before, and a place the
   traveller has passed is left alone. A payload with no listings anywhere is
   refused, as the Montreal board refuses an empty weekend. */

import type { Corridor } from "./corridor";
import { inWindows, parseListings, PASS_SLACK_MIN } from "./listing";
import { stopPoint, stopWindows, type ListingsDoc, type StopListings } from "./refresh";

export type IngestReport = {
  updated: string[];
  /** Nothing usable came back, so the earlier listings were kept. */
  kept: string[];
  /** The traveller has been and gone. */
  passed: string[];
  /** Not a place on this trip's route. */
  unknown: string[];
};

export type IngestResult =
  | { ok: true; doc: ListingsDoc; report: IngestReport }
  | { ok: false; code: "bad_payload" | "empty_payload"; error: string };

/** More than parseListings keeps for one place, so a long reply is cut before it is checked. */
const MAX_ITEMS_PER_STOP = 100;

export function ingestListings(
  corridor: Corridor,
  previous: ListingsDoc | null,
  payload: unknown,
  now: Date,
): IngestResult {
  const stops = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? (payload as { stops?: unknown }).stops
    : undefined;
  if (typeof stops !== "object" || stops === null || Array.isArray(stops) || !Object.values(stops).every(Array.isArray)) {
    return { ok: false, code: "bad_payload", error: "send {stops: {<place>: [listing, ...]}}" };
  }
  const sent = Object.entries(stops as Record<string, unknown[]>);
  if (!sent.some(([, items]) => items.length)) {
    return { ok: false, code: "empty_payload", error: "no listings for any place; refusing to blank the trip" };
  }

  const windows = stopWindows(corridor);
  const slack = PASS_SLACK_MIN * 60_000;
  const report: IngestReport = { updated: [], kept: [], passed: [], unknown: [] };
  const merged: Record<string, StopListings> = { ...(previous?.stops ?? {}) };

  for (const [name, items] of sent) {
    const visit = windows.get(name);
    if (!visit) {
      report.unknown.push(name);
      continue;
    }
    if (Math.max(...visit.windows.map((w) => Date.parse(w.until))) + slack < now.getTime()) {
      report.passed.push(name);
      continue;
    }
    const found = parseListings(JSON.stringify({ listings: items.slice(0, MAX_ITEMS_PER_STOP) }), name, stopPoint(corridor, name))
      .filter((l) => inWindows(l, visit.windows));
    const before = merged[name]?.listings ?? [];
    const keep = !found.length && before.length > 0;
    merged[name] = { refreshedAt: now.toISOString(), listings: keep ? before : found };
    (keep ? report.kept : report.updated).push(name);
  }

  return { ok: true, doc: { tripId: corridor.tripId, updatedAt: now.toISOString(), stops: merged }, report };
}
