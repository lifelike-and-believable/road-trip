/* A traveller's plan for one trip: the listings they have picked (and, for a
   flexible pick, when they chose to go) and the ones they have starred.

   The Montreal board keeps picks and stars the same way, keyed by listing id.
   A listing's id is stable across refreshes, so a pick made on it stays valid.
   The body comes from the browser, so it is validated here, not trusted. */

import type { Pick } from "./board";
import { parseInstant } from "./trip";

export type PlanDoc = { tripId: string; updatedAt: string; picks: Pick[]; starred: string[] };

export type PlanParse = { ok: true; picks: Pick[]; starred: string[] } | { ok: false; errors: string[] };

const LISTING_ID = /^[0-9a-f]{12}$/;
/** The board is for choosing one or two stops from a larger set; this is far more than that and still small. */
export const MAX_PICKS = 30;
export const MAX_STARS = 300;

export function parsePlan(raw: unknown): PlanParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["send {picks: [...], starred: [...]}"] };
  }
  const body = raw as { picks?: unknown; starred?: unknown };
  const errors: string[] = [];
  if (!Array.isArray(body.picks)) errors.push("picks must be a list");
  if (!Array.isArray(body.starred)) errors.push("starred must be a list");
  if (errors.length) return { ok: false, errors };

  const rawPicks = body.picks as unknown[];
  const rawStars = body.starred as unknown[];
  if (rawPicks.length > MAX_PICKS) errors.push(`picks may hold at most ${MAX_PICKS}`);
  if (rawStars.length > MAX_STARS) errors.push(`starred may hold at most ${MAX_STARS}`);
  if (errors.length) return { ok: false, errors };

  const picks: Pick[] = [];
  const pickIds = new Set<string>();
  rawPicks.forEach((p, i) => {
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      errors.push(`picks[${i}] must be {id, at?}`);
      return;
    }
    const { id, at } = p as { id?: unknown; at?: unknown };
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
    if (pickIds.has(id)) return;
    pickIds.add(id);
    picks.push(chosen ? { id, at: chosen } : { id });
  });

  const starred: string[] = [];
  rawStars.forEach((s, i) => {
    if (typeof s !== "string" || !LISTING_ID.test(s)) {
      errors.push(`starred[${i}] must be a listing id`);
      return;
    }
    if (!starred.includes(s)) starred.push(s);
  });

  return errors.length ? { ok: false, errors } : { ok: true, picks, starred };
}
