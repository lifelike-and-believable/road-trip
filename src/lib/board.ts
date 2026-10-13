/* The trip board's logic: what is on each day, and the itinerary built from the
   traveller's picks.

   Plain functions with no Node imports, so the board can run them in the
   browser as picks change. Types are imported only as types for the same reason.

   Like the Montreal board, it says only what it knows. A drive between two picks
   is shown only when the corridor has one, from the routing service's own
   duration for the leg, and is labelled as an estimate without traffic. Where two
   picks are on different legs of a round trip, a stay lies between them and
   nothing is said about driving. */

import type { Corridor, LegCorridor, Stop } from "./corridor";
import type { Listing } from "./listing";
import type { ListingsDoc } from "./refresh";

/** The same three hours as PASS_SLACK_MIN in listing.ts, which this file cannot import (it needs Node). A test keeps them equal. */
export const SLACK_MIN = 180;

const MINUTE_MS = 60_000;

export type Pick = {
  id: string;
  /** When a flexible pick is to start, if the traveller chose a time. */
  at?: string;
  /** The trip-local day of the card a flexible pick was made from; it is placed only within that day's hours. */
  day?: string;
};

export function localDay(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function localTime(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC", hour: "numeric", minute: "2-digit", hour12: true }).format(
    new Date(iso),
  );
}

type Visit = { leg: LegCorridor; stop: Stop; from: number; until: number };

function visitsOf(corridor: Corridor, name: string): Visit[] {
  const out: Visit[] = [];
  for (const leg of corridor.legs) {
    for (const stop of leg.stops) {
      if (stop.name === name) out.push({ leg, stop, from: Date.parse(stop.from), until: Date.parse(stop.until) });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Is any part of [begin, end] within the slack of a time the traveller is at the stop? */
function near(visits: Visit[], begin: number, end: number): boolean {
  const slack = SLACK_MIN * MINUTE_MS;
  return visits.some((v) => begin <= v.until + slack && end >= v.from - slack);
}

export type Option = {
  /** The listing's id. A flexible listing is open on several days and appears once for each, with the same id. */
  id: string;
  listing: Listing;
  stop: string;
  region?: string;
  kind: "fixed" | "flexible";
  day: string;
  /** A fixed listing's start, or a flexible listing's opening time on this day. */
  start: string;
  /** A fixed listing's end if its length is known, or a flexible listing's closing time on this day. */
  end: string | null;
  /** A flexible listing's opening periods on this day, in order; more than one when it closes in between. */
  periods?: Array<{ opens: string; closes: string }>;
};

export type Day = { day: string; options: Option[] };

/** Everything worth stopping for, by the day it is on, in time order. */
export function boardDays(corridor: Corridor, listings: ListingsDoc | null, tz?: string): Day[] {
  const byDay = new Map<string, Option[]>();
  const add = (o: Option) => {
    const list = byDay.get(o.day) ?? [];
    list.push(o);
    byDay.set(o.day, list);
  };

  for (const [name, entry] of Object.entries(listings?.stops ?? {})) {
    const visits = visitsOf(corridor, name);
    const region = visits[0]?.stop.region;
    for (const listing of entry.listings) {
      const base = { id: listing.id, listing, stop: name, region };
      if (listing.schedule.kind === "fixed") {
        const begin = Date.parse(listing.schedule.start);
        const end = listing.schedule.durationMin ? begin + listing.schedule.durationMin * MINUTE_MS : begin;
        if (!near(visits, begin, end)) continue;
        add({
          ...base, kind: "fixed", day: localDay(listing.schedule.start, tz), start: listing.schedule.start,
          end: listing.schedule.durationMin ? new Date(end).toISOString() : null,
        });
      } else {
        // One entry a day, however many times the place opens that day, so its id is not listed twice.
        const today = new Map<string, Option>();
        const hours = [...listing.schedule.hours].sort((a, b) => Date.parse(a.opens) - Date.parse(b.opens));
        for (const h of hours) {
          if (!near(visits, Date.parse(h.opens), Date.parse(h.closes))) continue;
          const day = localDay(h.opens, tz);
          const seen = today.get(day);
          if (seen) {
            seen.periods?.push({ opens: h.opens, closes: h.closes });
            if (Date.parse(h.closes) > Date.parse(seen.end ?? seen.start)) seen.end = h.closes;
            continue;
          }
          const option: Option = { ...base, kind: "flexible", day, start: h.opens, end: h.closes, periods: [{ opens: h.opens, closes: h.closes }] };
          today.set(day, option);
          add(option);
        }
      }
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, options]) => ({
      day,
      options: options.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.listing.title.localeCompare(b.listing.title)),
    }));
}

/** When the traveller is at a town on a day, from the corridor's estimate, or null when the road does not pass it then. */
export function passingNote(corridor: Corridor, stop: string, day: string, tz?: string): string | null {
  const v = visitsOf(corridor, stop).find((x) => localDay(iso(x.from), tz) <= day && day <= localDay(iso(x.until), tz));
  if (!v) return null;
  const at = (ms: number) => localTime(iso(ms), tz);
  if (v.until - v.from < 30 * MINUTE_MS) return `You pass ${stop} about ${at(v.from)} (estimated)`;
  const fromDay = localDay(iso(v.from), tz);
  const untilDay = localDay(iso(v.until), tz);
  if (fromDay === untilDay) return `You are near ${stop} from ${at(v.from)} to ${at(v.until)} (estimated)`;
  const weekday = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long" }).format(new Date(`${d}T12:00:00Z`));
  return `You are near ${stop} from ${at(v.from)} ${weekday(fromDay)} to ${at(v.until)} ${weekday(untilDay)} (estimated)`;
}

export type ItineraryRow = { item: ItineraryItem; /** To the next pick, only when it is on the same day. */ gap?: Gap };

/** The itinerary by day. A gap across midnight is not free time, so it is left out; picks that could not be placed come last, with no day. */
export function itineraryDays(itinerary: Itinerary, tz?: string): Array<{ day: string | null; rows: ItineraryRow[] }> {
  const out: Array<{ day: string | null; rows: ItineraryRow[] }> = [];
  const placed = itinerary.items.filter((i): i is ItineraryItem & { startAt: string } => i.startAt !== null);
  const dayOf = (i: ItineraryItem & { startAt: string }) => i.day ?? localDay(i.startAt, tz);
  placed.forEach((item, i) => {
    const day = dayOf(item);
    const next = placed[i + 1];
    const row: ItineraryRow = next && dayOf(next) === day && itinerary.gaps[i] ? { item, gap: itinerary.gaps[i] } : { item };
    const last = out.at(-1);
    if (last && last.day === day) last.rows.push(row);
    else out.push({ day, rows: [row] });
  });
  const unplaced = itinerary.items.filter((i) => i.startAt === null);
  if (unplaced.length) out.push({ day: null, rows: unplaced.map((item) => ({ item })) });
  return out;
}

/** "09:00" for a time field: the 24-hour clock reading of an instant in the trip's zone. */
export function clockTime(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** A clock time ("14:30") on a trip-local day, as an instant. Null for a time the clocks skip that day, or one that is not a time. */
export function instantIn(day: string, time: string, tz?: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // The zone's offset at a moment, from how that moment reads on its clock.
  const offset = (ms: number) => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz ?? "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(ms));
    const n = (type: string) => Number(p.find((x) => x.type === type)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - ms;
  };
  // Twice, so a guess on the far side of a clock change settles on the offset in force at the result.
  let ms = wall - offset(wall);
  ms = wall - offset(ms);
  return localDay(new Date(ms).toISOString(), tz) === day && offset(ms) === wall - ms ? new Date(ms).toISOString() : null;
}

export type Band = "morning" | "afternoon" | "evening" | "late";

/** Morning to 11:59, afternoon from noon, evening from 5 p.m., late from 8:30 p.m., as on the Montreal board. */
export const BAND_LABELS: Record<Band, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late: "Late" };

export function bandOf(iso: string, tz?: string): Band {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const minutes = at("hour") * 60 + at("minute");
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 20 * 60 + 30) return "evening";
  return "late";
}

export type DayGroups = { bands: Array<{ band: Band; options: Option[] }>; open: Option[] };

const BAND_ORDER: Band[] = ["morning", "afternoon", "evening", "late"];

/** A day's scheduled events by time of day, and apart from them the places that are open all day, which have no start time to sort by. */
export function groupDay(options: Option[], tz?: string): DayGroups {
  const byTime = (a: Option, b: Option) => Date.parse(a.start) - Date.parse(b.start) || a.listing.title.localeCompare(b.listing.title);
  const sorted = [...options].sort(byTime);
  const bands = BAND_ORDER.map((band) => ({
    band,
    options: sorted.filter((o) => o.kind === "fixed" && bandOf(o.start, tz) === band),
  })).filter((b) => b.options.length > 0);
  return { bands, open: sorted.filter((o) => o.kind === "flexible") };
}

export type StopSummary = { name: string; region?: string; lat: number; lon: number; count: number; picked: boolean };

/** The towns along the road where something has been found, once each in route order, with how many listings are near each and whether a pick is. */
export function stopSummaries(
  corridor: Corridor,
  days: Day[],
  picks: Pick[],
  byId: Map<string, { stop: string }>,
): StopSummary[] {
  const listed = new Map<string, Set<string>>();
  for (const d of days) for (const o of d.options) listed.set(o.stop, (listed.get(o.stop) ?? new Set()).add(o.id));
  const picked = new Set(picks.map((p) => byId.get(p.id)?.stop).filter((s): s is string => s !== undefined));

  const out = new Map<string, StopSummary>();
  for (const leg of corridor.legs) {
    for (const s of leg.stops) {
      const count = listed.get(s.name)?.size ?? 0;
      if (out.has(s.name) || count === 0) continue;
      out.set(s.name, { name: s.name, region: s.region, lat: s.lat, lon: s.lon, count, picked: picked.has(s.name) });
    }
  }
  return [...out.values()];
}

export type Place = { id: string; title: string; lat: number; lon: number; category: Listing["category"]; stop: string; picked: boolean };

/** The listings that can go on the map: each once, in the order they are listed, with whether a pick on the plan is it. */
export function placesOf(days: Day[], picks: Pick[]): Place[] {
  const onPlan = new Set(picks.map((p) => p.id));
  const out = new Map<string, Place>();
  for (const d of days) {
    for (const o of d.options) {
      const { lat, lon } = o.listing;
      if (out.has(o.id) || lat === undefined || lon === undefined) continue;
      out.set(o.id, { id: o.id, title: o.listing.title, lat, lon, category: o.listing.category, stop: o.stop, picked: onPlan.has(o.id) });
    }
  }
  return [...out.values()];
}

export type Placement = "fixed" | "chosen" | "auto" | "unplaceable";

export type ItineraryItem = {
  id: string;
  title: string;
  stop: string;
  kind: "fixed" | "flexible";
  placed: Placement;
  startAt: string | null;
  /** Null when the length is not known. */
  endAt: string | null;
  endKnown: boolean;
  warning?: "outside-hours";
  /** The trip-local day a flexible pick is on, or was picked for when it cannot be placed. */
  day?: string;
};

export type GapState = "ok" | "tight" | "overlap" | "back-to-back";

export type Gap = {
  /** From the end of one pick to the start of the next; negative when they overlap. */
  minutes: number;
  /** Estimated drive between the two stops, or null when the corridor cannot say. */
  travelMin: number | null;
  /** What supplied the drive time. */
  travelSource: string | null;
  state: GapState;
  /** The first pick has no known length, so the gap is measured from its start. */
  fromStartOnly: boolean;
};

export type Itinerary = {
  /** Placed picks in time order, then any that could not be placed. */
  items: ItineraryItem[];
  /** gaps[i] is between items[i] and items[i + 1], for the placed items only. */
  gaps: Gap[];
  /** Picked listings that are no longer listed. */
  missing: string[];
};

type Travel = { min: number; source: string };

function legFor(corridor: Corridor, name: string, atMs: number): { leg: LegCorridor; stop: Stop } | null {
  let best: { leg: LegCorridor; stop: Stop } | null = null;
  let bestDistance = Infinity;
  for (const v of visitsOf(corridor, name)) {
    const distance = atMs < v.from ? v.from - atMs : atMs > v.until ? atMs - v.until : 0;
    if (distance < bestDistance) {
      best = { leg: v.leg, stop: v.stop };
      bestDistance = distance;
    }
  }
  return best;
}

/** The route's own duration for the distance between two stops on one leg. Null across legs, where a stay lies between. */
function travel(corridor: Corridor, a: { stop: string; at: number }, b: { stop: string; at: number }): Travel | null {
  const from = legFor(corridor, a.stop, a.at);
  const to = legFor(corridor, b.stop, b.at);
  if (!from || !to || from.leg !== to.leg || from.leg.distanceKm <= 0) return null;
  const km = Math.abs(from.stop.km - to.stop.km);
  return { min: Math.round((km * from.leg.driveMinutes) / from.leg.distanceKm), source: `${corridor.sources.routing}, estimated without traffic` };
}

type Slot = {
  id: string;
  title: string;
  stop: string;
  kind: "fixed" | "flexible";
  placed: Placement;
  start: number;
  end: number | null;
  warning?: "outside-hours";
  pickDay?: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

export function buildItinerary(
  picks: Pick[],
  byId: Map<string, { listing: Listing; stop: string }>,
  corridor: Corridor,
  tz?: string,
): Itinerary {
  const missing: string[] = [];
  const seen = new Set<string>();
  const anchored: Slot[] = [];
  const toPlace: Array<{ pick: Pick; listing: Listing; stop: string }> = [];

  for (const pick of picks) {
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    const found = byId.get(pick.id);
    if (!found) {
      missing.push(pick.id);
      continue;
    }
    const { listing, stop } = found;
    const s = listing.schedule;
    if (s.kind === "fixed") {
      const start = Date.parse(s.start);
      anchored.push({
        id: listing.id, title: listing.title, stop, kind: "fixed", placed: "fixed", start,
        end: s.durationMin ? start + s.durationMin * MINUTE_MS : null,
      });
    } else if (pick.at) {
      const start = Date.parse(pick.at);
      const length = (s.typicalMin ?? 0) * MINUTE_MS;
      const inside = s.hours.some((h) => Date.parse(h.opens) <= start && start + length <= Date.parse(h.closes));
      anchored.push({
        id: listing.id, title: listing.title, stop, kind: "flexible", placed: "chosen", start,
        end: s.typicalMin ? start + length : null, ...(inside ? {} : { warning: "outside-hours" as const }),
      });
    } else {
      toPlace.push({ pick, listing, stop });
    }
  }

  const placed = [...anchored];
  const unplaceable: Slot[] = [];

  // Flexible picks with no chosen time, the one that opens soonest first.
  const openingOf = (l: Listing) => (l.schedule.kind === "flexible" ? Math.min(...l.schedule.hours.map((h) => Date.parse(h.opens))) : 0);
  toPlace.sort((a, b) => openingOf(a.listing) - openingOf(b.listing) || a.listing.id.localeCompare(b.listing.id));

  const slack = SLACK_MIN * MINUTE_MS;
  for (const { pick, listing, stop } of toPlace) {
    if (listing.schedule.kind !== "flexible") continue;
    const length = (listing.schedule.typicalMin ?? 0) * MINUTE_MS;
    const visits = visitsOf(corridor, stop);
    const hours = listing.schedule.hours
      .filter((h) => !pick.day || localDay(h.opens, tz) === pick.day)
      .sort((a, b) => Date.parse(a.opens) - Date.parse(b.opens));
    let start: number | null = null;

    search: for (const h of hours) {
      const opens = Date.parse(h.opens);
      const closes = Date.parse(h.closes);
      for (const v of visits) {
        const earliest = Math.max(opens, v.from - slack);
        const latest = Math.min(closes - length, v.until + slack);
        if (earliest > latest) continue;

        // Move the start along until it clears every pick already placed, drive included.
        let s = earliest;
        for (let pass = 0; pass <= placed.length; pass++) {
          let moved = false;
          for (const p of placed) {
            const pEnd = p.end ?? p.start;
            const into = (travel(corridor, { stop: p.stop, at: pEnd }, { stop, at: s })?.min ?? 0) * MINUTE_MS;
            const out = (travel(corridor, { stop, at: s }, { stop: p.stop, at: p.start })?.min ?? 0) * MINUTE_MS;
            const clear = s >= pEnd + into || s + length + out <= p.start;
            if (!clear) {
              s = pEnd + into;
              moved = true;
            }
          }
          if (!moved) break;
        }
        if (s <= latest) {
          start = s;
          break search;
        }
      }
    }

    const slot: Slot = {
      id: listing.id, title: listing.title, stop, kind: "flexible", placed: start === null ? "unplaceable" : "auto",
      start: start ?? 0, end: start !== null && listing.schedule.typicalMin ? start + length : null,
      ...(pick.day ? { pickDay: pick.day } : {}),
    };
    (start === null ? unplaceable : placed).push(slot);
  }

  placed.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const toItem = (s: Slot): ItineraryItem => ({
    id: s.id, title: s.title, stop: s.stop, kind: s.kind, placed: s.placed,
    startAt: s.placed === "unplaceable" ? null : iso(s.start),
    endAt: s.placed === "unplaceable" || s.end === null ? null : iso(s.end),
    endKnown: s.placed !== "unplaceable" && s.end !== null,
    ...(s.warning ? { warning: s.warning } : {}),
    ...(s.kind === "flexible" ? (s.placed === "unplaceable" ? (s.pickDay ? { day: s.pickDay } : {}) : { day: localDay(iso(s.start), tz) }) : {}),
  });

  const gaps: Gap[] = [];
  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i];
    const b = placed[i + 1];
    const minutes = Math.round((b.start - (a.end ?? a.start)) / MINUTE_MS);
    const t = travel(corridor, { stop: a.stop, at: a.end ?? a.start }, { stop: b.stop, at: b.start });
    const state: GapState = minutes < 0 ? "overlap" : minutes === 0 ? "back-to-back" : t && minutes < t.min ? "tight" : "ok";
    gaps.push({ minutes, travelMin: t?.min ?? null, travelSource: t?.source ?? null, state, fromStartOnly: a.end === null });
  }

  return { items: [...placed, ...unplaceable].map(toItem), gaps, missing };
}
