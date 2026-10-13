/* A traveller's plan for one trip: the listings they have picked (and, for a
   flexible pick, when they chose to go), the ones they have starred, and the
   ones they have hidden from their board.

   The Montreal board keeps picks, stars and hidden entries the same way, keyed by listing id.
   A listing's id is stable across refreshes, so a pick made on it stays valid.
   The body comes from the browser, so it is validated here, not trusted. */

import type { Pick } from "./board";
import { parseInstant } from "./trip";

/** `hidden` is left out when nothing is hidden, so a plan made before hiding existed reads the same. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type PlanDoc = { tripId: string; updatedAt: string; picks: Pick[]; starred: string[]; hidden?: string[] };

export type PlanParse = { ok: true; picks: Pick[]; starred: string[]; hidden?: string[] } | { ok: false; errors: string[] };

const LISTING_ID = /^[0-9a-f]{12}$/;
/** The board is for choosing one or two stops from a larger set; this is far more than that and still small. */
export const MAX_PICKS = 30;
export const MAX_STARS = 300;
export const MAX_HIDDEN = 300;

export function parsePlan(raw: unknown): PlanParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["send {picks: [...], starred: [...]}"] };
  }
  const body = raw as { picks?: unknown; starred?: unknown; hidden?: unknown };
  const errors: string[] = [];
  if (!Array.isArray(body.picks)) errors.push("picks must be a list");
  if (!Array.isArray(body.starred)) errors.push("starred must be a list");
  if (body.hidden !== undefined && !Array.isArray(body.hidden)) errors.push("hidden must be a list");
  if (errors.length) return { ok: false, errors };

  const rawPicks = body.picks as unknown[];
  const rawStars = body.starred as unknown[];
  if (rawPicks.length > MAX_PICKS) errors.push(`picks may hold at most ${MAX_PICKS}`);
  if (rawStars.length > MAX_STARS) errors.push(`starred may hold at most ${MAX_STARS}`);
  const rawHidden = (body.hidden ?? []) as unknown[];
  if (rawHidden.length > MAX_HIDDEN) errors.push(`hidden may hold at most ${MAX_HIDDEN}`);
  if (errors.length) return { ok: false, errors };

  const picks: Pick[] = [];
  const pickIds = new Set<string>();
  rawPicks.forEach((p, i) => {
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      errors.push(`picks[${i}] must be {id, at?, day?}`);
      return;
    }
    const { id, at, day } = p as { id?: unknown; at?: unknown; day?: unknown };
    if (typeof id !== "string" || !LISTING_ID.test(id)) {
      errors.push(`picks[${i}].id must be a listing id`);
      return;
    }
    let chosen: string | undefined;
    if (at !== undefined) {
      const ms = parseInstant(at);
      if (ms === null) {
        errors.push(`picks[${i}].at must be a time with an offset`);
        return;
      }
      chosen = new Date(ms).toISOString();
    }
    // The trip-local day of the card a flexible pick was made from, which keeps it on that day.
    if (day !== undefined && (typeof day !== "string" || !DAY.test(day) || parseInstant(`${day}T00:00Z`) === null)) {
      errors.push(`picks[${i}].day must be a date such as 2026-10-17`);
      return;
    }
    if (pickIds.has(id)) return;
    pickIds.add(id);
    picks.push({ id, ...(chosen ? { at: chosen } : {}), ...(day !== undefined ? { day } : {}) });
  });

  const starred: string[] = [];
  rawStars.forEach((s, i) => {
    if (typeof s !== "string" || !LISTING_ID.test(s)) {
      errors.push(`starred[${i}] must be a listing id`);
      return;
    }
    if (!starred.includes(s)) starred.push(s);
  });

  const hidden: string[] = [];
  rawHidden.forEach((h, i) => {
    if (typeof h !== "string" || !LISTING_ID.test(h)) {
      errors.push(`hidden[${i}] must be a listing id`);
      return;
    }
    if (!hidden.includes(h)) hidden.push(h);
  });

  if (errors.length) return { ok: false, errors };
  return hidden.length ? { ok: true, picks, starred, hidden } : { ok: true, picks, starred };
}
