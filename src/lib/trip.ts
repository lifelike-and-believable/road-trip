/* A trip is two places, a window of time, and whether the traveller comes
   back. Everything downstream (route, sources, listings) hangs off it.

   Times are stored as instants. A form sends them with the traveller's own
   offset, because the server cannot know which clock "2 p.m." meant on a
   route that crosses a time zone. `tz` is kept only for display. */

export type Place = { label: string; lat?: number; lon?: number };

export type TripInput = {
  from: Place;
  to: Place;
  start: string;
  end: string;
  roundTrip: boolean;
  /** When the return leg begins. Round trips only; the midpoint if neither this nor `stay` is given. */
  turnaround?: string;
  /** Minutes spent at the destination, counted from arrival. Round trips only, and not with `turnaround`. */
  stay?: number;
  tz?: string;
};

export type Trip = TripInput & { id: string; createdAt: string };

/** A leg's times are open (null) when a stay is set and the drive time is not yet known. */
export type Leg = { id: "out" | "back"; from: Place; to: Place; start: string | null; end: string | null };
export type ResolvedLeg = Leg & { start: string; end: string };

export type TripStatus = "upcoming" | "underway" | "ended";

export type ParseResult = { ok: true; value: TripInput } | { ok: false; errors: string[] };

const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_LABEL = 200;
const MINUTE_MS = 60_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function instant(v: unknown): number | null {
  if (typeof v !== "string" || !WITH_OFFSET.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

export { instant as parseInstant };

function parsePlace(name: string, v: unknown, errors: string[]): Place | null {
  if (!isRecord(v)) {
    errors.push(`${name}.label is required`);
    return null;
  }
  const label = typeof v.label === "string" ? v.label.trim() : "";
  if (!label) {
    errors.push(`${name}.label is required`);
    return null;
  }
  if (label.length > MAX_LABEL) {
    errors.push(`${name}.label is too long`);
    return null;
  }
  const hasLat = v.lat !== undefined;
  const hasLon = v.lon !== undefined;
  if (!hasLat && !hasLon) return { label };
  const lat = v.lat;
  const lon = v.lon;
  if (
    typeof lat !== "number" || typeof lon !== "number" ||
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    errors.push(`${name} needs both a latitude within ±90 and a longitude within ±180`);
    return null;
  }
  return { label, lat, lon };
}

function validZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validate untrusted input (SEC-002). Unknown fields are dropped. */
export function parseTripInput(raw: unknown, now: Date): ParseResult {
  if (!isRecord(raw)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];

  const from = parsePlace("from", raw.from, errors);
  const to = parsePlace("to", raw.to, errors);

  const start = instant(raw.start);
  const end = instant(raw.end);
  if (start === null) errors.push("start must be a date and time with an offset, such as 2026-10-16T14:00:00Z");
  if (end === null) errors.push("end must be a date and time with an offset, such as 2026-10-18T22:00:00Z");
  if (start !== null && end !== null) {
    if (end <= start) errors.push("end must be after start");
    else if (end <= now.getTime()) errors.push("end has already passed");
  }

  if (typeof raw.roundTrip !== "boolean") errors.push("roundTrip must be true or false");

  let turnaround: number | null = null;
  if (raw.turnaround !== undefined) {
    if (raw.roundTrip !== true) {
      errors.push("turnaround applies to round trips only");
    } else {
      turnaround = instant(raw.turnaround);
      if (turnaround === null) errors.push("turnaround must be a date and time with an offset");
      else if (start !== null && end !== null && (turnaround <= start || turnaround >= end)) {
        errors.push("turnaround must fall between start and end");
        turnaround = null;
      }
    }
  }

  if (raw.stay !== undefined) {
    if (raw.roundTrip !== true) errors.push("stay applies to round trips only");
    else if (raw.turnaround !== undefined) errors.push("give either stay or turnaround, not both");
    else if (typeof raw.stay !== "number" || !Number.isInteger(raw.stay) || raw.stay <= 0) {
      errors.push("stay must be a positive whole number of minutes");
    } else if (start !== null && end !== null && raw.stay * MINUTE_MS >= end - start) {
      errors.push("stay must be shorter than the trip");
    }
  }

  if (raw.tz !== undefined && !validZone(raw.tz)) errors.push("tz must be an IANA time zone name");

  if (errors.length || !from || !to || start === null || end === null) return { ok: false, errors };

  const value: TripInput = {
    from,
    to,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    roundTrip: raw.roundTrip as boolean,
  };
  if (turnaround !== null) value.turnaround = new Date(turnaround).toISOString();
  if (typeof raw.stay === "number") value.stay = raw.stay;
  if (raw.tz !== undefined) value.tz = raw.tz as string;
  return { ok: true, value };
}

/** The outbound leg, and for a round trip the return leg.

    With a `stay`, the return begins at arrival plus the stay, and arrival
    depends on the drive time, which only the route knows. Pass it as
    `driveMinutes` to resolve the times; without it they are null. */
export function legsOf(trip: TripInput, driveMinutes: number): ResolvedLeg[];
export function legsOf(trip: TripInput): Leg[];
export function legsOf(trip: TripInput, driveMinutes?: number): Leg[] {
  if (!trip.roundTrip) {
    return [{ id: "out", from: trip.from, to: trip.to, start: trip.start, end: trip.end }];
  }
  const s = Date.parse(trip.start);
  const e = Date.parse(trip.end);
  let turn: string | null;
  if (trip.stay !== undefined) {
    turn = driveMinutes === undefined ? null : new Date(s + (driveMinutes + trip.stay) * MINUTE_MS).toISOString();
  } else {
    turn = trip.turnaround ?? new Date(s + (e - s) / 2).toISOString();
  }
  return [
    { id: "out", from: trip.from, to: trip.to, start: trip.start, end: turn },
    { id: "back", from: trip.to, to: trip.from, start: turn, end: trip.end },
  ];
}

export function tripStatus(trip: TripInput, now: Date): TripStatus {
  const t = now.getTime();
  if (t >= Date.parse(trip.end)) return "ended";
  if (t >= Date.parse(trip.start)) return "underway";
  return "upcoming";
}

/** A trip is kept up to date from the day it is made until its end instant. */
export function isActive(trip: TripInput, now: Date): boolean {
  return tripStatus(trip, now) !== "ended";
}

export function activeTrips<T extends TripInput>(trips: T[], now: Date): T[] {
  return trips.filter((t) => isActive(t, now));
}

/** What the API returns: the stored trip plus what is derived from it. */
export function presentTrip(trip: Trip, now: Date) {
  return { ...trip, status: tripStatus(trip, now), legs: legsOf(trip) };
}

const TRIP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isTripId(id: string): boolean {
  return TRIP_ID.test(id);
}
