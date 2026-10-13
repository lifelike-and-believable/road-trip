/* The road between the two places, as an ordered list of towns with an
   estimate of when the traveller is in each. Later slices look for events
   at these stops, inside these windows.

   The timing is the router's driving duration spread evenly over the
   distance. It has no traffic, no breaks and no detours, so the corridor
   says it is an estimate. */

import { cumulativeKm, pointAtKm, simplifyLine, type LonLat } from "./geo";
import { driveRoute, geocode, OsmError, reverseName } from "./osm";
import { legsOf, type Place, type Trip } from "./trip";

const MIN_SPACING_KM = 50;
const MAX_ALONG_STOPS = 20;
/** Left for the two end zones when the spacing is widened to fit MAX_ALONG_STOPS. */
const END_ZONE_RESERVE = 4;
/** Nominatim's usage policy allows one request a second. */
const NOMINATIM_GAP_MS = 1100;
const MINUTE_MS = 60_000;
/** The road kept for the map: enough to follow the bends at the zoom of a whole trip, small enough to store and send. */
export const MAX_LINE_POINTS = 500;

export type Located = { label: string; lat: number; lon: number };

export type Stop = {
  name: string;
  region?: string;
  lat: number;
  lon: number;
  /** Distance from the start of the leg. */
  km: number;
  /** The traveller passes through at this instant. */
  from: string;
  until: string;
};

export type LegCorridor = {
  id: "out" | "back";
  distanceKm: number;
  driveMinutes: number;
  arriveAt: string;
  /** False when the drive does not finish inside the leg's window. */
  fits: boolean;
  stops: Stop[];
};

export type Corridor = {
  tripId: string;
  builtAt: string;
  from: Located;
  to: Located;
  sources: { geocoding: string; routing: string; timing: string };
  /** The road, start to end, for the map. A corridor built before the map existed has none. */
  line?: LonLat[];
  legs: LegCorridor[];
};

export type CorridorDeps = {
  geocode: typeof geocode;
  reverseName: typeof reverseName;
  driveRoute: typeof driveRoute;
  pause: (ms: number) => Promise<void>;
};

const defaultDeps: CorridorDeps = {
  geocode,
  reverseName,
  driveRoute,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Distances along the route at which to name the town, nearest the start first.

    The two end places are not stops (the traveller knows what is there), but
    the road just after the start and just before the end still has towns worth
    stopping in, so within two spacings of each end the step is halved. The dense samples are measured from each end, so
    the first and last gap are both one step. Very long routes widen the
    spacing to keep the number of lookups bounded. */
export function samplePositions(totalKm: number): number[] {
  if (!(totalKm > 0)) return [];
  const spacing = Math.max(MIN_SPACING_KM, totalKm / (MAX_ALONG_STOPS - END_ZONE_RESERVE));
  const step = spacing / 2;
  const zone = spacing * 2;

  const ends: number[] = [];
  for (let k = step; k <= zone; k += step) {
    if (k <= totalKm - step) ends.push(k);
    if (totalKm - k >= step) ends.push(totalKm - k);
  }
  const middle: number[] = [];
  for (let km = spacing; km < totalKm - zone; km += spacing) {
    if (km > zone && ends.every((e) => Math.abs(e - km) >= step / 2)) middle.push(km);
  }

  const kept: number[] = [];
  for (const km of [...ends, ...middle].map(round1).sort((a, b) => a - b)) {
    if (kept.length === 0 || km - kept[kept.length - 1] >= step / 2) kept.push(km);
  }
  return kept;
}
const iso = (ms: number) => new Date(ms).toISOString();

export async function buildCorridor(trip: Trip, now: Date, deps: CorridorDeps = defaultDeps): Promise<Corridor> {
  let nominatimCalls = 0;
  const nominatim = async <T>(call: () => Promise<T>): Promise<T> => {
    if (nominatimCalls++ > 0) await deps.pause(NOMINATIM_GAP_MS);
    return call();
  };

  const locate = async (place: Place, end: "from" | "to"): Promise<Located> => {
    if (place.lat !== undefined && place.lon !== undefined) {
      return { label: place.label, lat: place.lat, lon: place.lon };
    }
    try {
      const hit = await nominatim(() => deps.geocode(place.label));
      return { label: place.label, lat: hit.lat, lon: hit.lon };
    } catch (e) {
      // Said with the end it was for, so the board can tell the traveller which name to change.
      if (e instanceof OsmError && e.code === "not_found") throw new OsmError("not_found", e.message, end);
      throw e;
    }
  };

  const from = await locate(trip.from, "from");
  const to = await locate(trip.to, "to");
  const route = await deps.driveRoute(from, to);

  const cum = cumulativeKm(route.line);
  const totalKm = route.distanceKm;

  // Towns along the road, from the first sample that names one. A town the
  // road runs through for two samples is listed once.
  type Along = { name: string; region?: string; lat: number; lon: number; km: number };
  const along: Along[] = [];
  for (const km of samplePositions(totalKm)) {
    const p = pointAtKm(route.line, cum, km);
    const town = await nominatim(() => deps.reverseName(p.lat, p.lon));
    if (!town) continue;
    const prev = along.at(-1);
    if (prev && prev.name === town.name && prev.region === town.region) continue;
    along.push({ ...town, lat: p.lat, lon: p.lon, km });
  }

  const [out, back] = legsOf(trip, route.durationMin);
  const driveMs = route.durationMin * MINUTE_MS;

  const place = (leg: { start: string; end: string }, stops: Along[]): Pick<LegCorridor, "arriveAt" | "fits" | "stops"> => {
    const start = Date.parse(leg.start);
    const end = Date.parse(leg.end);
    const arrive = start + driveMs;
    const at = (km: number) => iso(start + (km / totalKm) * driveMs);
    return {
      arriveAt: iso(arrive),
      fits: arrive <= end,
      stops: stops.map((s): Stop => ({ ...s, km: round1(s.km), from: at(s.km), until: at(s.km) })),
    };
  };

  const base = { distanceKm: round1(totalKm), driveMinutes: route.durationMin };
  const legs: LegCorridor[] = [{ id: "out", ...base, ...place(out, along) }];
  if (back) {
    // The same road driven the other way, so no second route or round of lookups.
    const reversed = [...along].reverse().map((s) => ({ ...s, km: totalKm - s.km }));
    legs.push({ id: "back", ...base, ...place(back, reversed) });
  }

  const roundTo5 = (n: number) => Math.round(n * 1e5) / 1e5;
  const line = simplifyLine(route.line, MAX_LINE_POINTS).map(([lon, lat]): LonLat => [roundTo5(lon), roundTo5(lat)]);

  return {
    tripId: trip.id,
    builtAt: now.toISOString(),
    from,
    to,
    line,
    sources: {
      geocoding: "OpenStreetMap Nominatim",
      routing: "OSRM driving route (OpenStreetMap data)",
      timing: "Passing times are estimates: the route's driving time spread evenly over its length, without traffic or stops.",
    },
    legs,
  };
}
