/* The road between the two places, as an ordered list of towns with an
   estimate of when the traveller is in each. Later slices look for events
   at these stops, inside these windows.

   The timing is the router's driving duration spread evenly over the
   distance. It has no traffic, no breaks and no detours, so the corridor
   says it is an estimate. */

import { cumulativeKm, pointAtKm } from "./geo";
import { driveRoute, geocode, reverseName } from "./osm";
import { legsOf, type Place, type Trip } from "./trip";

const MIN_SPACING_KM = 50;
const MAX_ALONG_STOPS = 20;
/** Nominatim's usage policy allows one request a second. */
const NOMINATIM_GAP_MS = 1100;
const MINUTE_MS = 60_000;

export type Located = { label: string; lat: number; lon: number };

export type Stop = {
  name: string;
  region?: string;
  lat: number;
  lon: number;
  kind: "origin" | "along" | "destination";
  /** Distance from the start of the leg. */
  km: number;
  /** The traveller is here from this instant until the next. Equal when passing through. */
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
const iso = (ms: number) => new Date(ms).toISOString();

export async function buildCorridor(trip: Trip, now: Date, deps: CorridorDeps = defaultDeps): Promise<Corridor> {
  let nominatimCalls = 0;
  const nominatim = async <T>(call: () => Promise<T>): Promise<T> => {
    if (nominatimCalls++ > 0) await deps.pause(NOMINATIM_GAP_MS);
    return call();
  };

  const locate = async (place: Place): Promise<Located> => {
    if (place.lat !== undefined && place.lon !== undefined) {
      return { label: place.label, lat: place.lat, lon: place.lon };
    }
    const hit = await nominatim(() => deps.geocode(place.label));
    return { label: place.label, lat: hit.lat, lon: hit.lon };
  };

  const from = await locate(trip.from);
  const to = await locate(trip.to);
  const route = await deps.driveRoute(from, to);

  const cum = cumulativeKm(route.line);
  const totalKm = route.distanceKm;
  const spacing = Math.max(MIN_SPACING_KM, totalKm / MAX_ALONG_STOPS);

  // Towns along the road, from the first sample that names one. A town the
  // road runs through for two samples is listed once.
  type Along = { name: string; region?: string; lat: number; lon: number; km: number };
  const along: Along[] = [];
  for (let km = spacing; km < totalKm - spacing / 2; km += spacing) {
    const p = pointAtKm(route.line, cum, km);
    const town = await nominatim(() => deps.reverseName(p.lat, p.lon));
    if (!town) continue;
    const prev = along.at(-1);
    if (prev && prev.name === town.name && prev.region === town.region) continue;
    along.push({ ...town, lat: p.lat, lon: p.lon, km });
  }

  const [out, back] = legsOf(trip);
  const driveMs = route.durationMin * MINUTE_MS;

  const place = (
    leg: { start: string; end: string },
    ends: [Located, Located],
    stops: Along[],
  ): Pick<LegCorridor, "arriveAt" | "fits" | "stops"> => {
    const start = Date.parse(leg.start);
    const end = Date.parse(leg.end);
    const arrive = start + driveMs;
    const at = (km: number) => iso(start + (km / totalKm) * driveMs);
    return {
      arriveAt: iso(arrive),
      fits: arrive <= end,
      stops: [
        { name: ends[0].label, lat: ends[0].lat, lon: ends[0].lon, kind: "origin", km: 0, from: leg.start, until: leg.start },
        ...stops.map((s): Stop => ({ ...s, kind: "along", km: round1(s.km), from: at(s.km), until: at(s.km) })),
        {
          name: ends[1].label, lat: ends[1].lat, lon: ends[1].lon, kind: "destination",
          km: round1(totalKm), from: iso(arrive), until: iso(Math.max(arrive, end)),
        },
      ],
    };
  };

  const base = { distanceKm: round1(totalKm), driveMinutes: route.durationMin };
  const legs: LegCorridor[] = [{ id: "out", ...base, ...place(out, [from, to], along) }];
  if (back) {
    // The same road driven the other way, so no second route or round of lookups.
    const reversed = [...along].reverse().map((s) => ({ ...s, km: totalKm - s.km }));
    legs.push({ id: "back", ...base, ...place(back, [to, from], reversed) });
  }

  return {
    tripId: trip.id,
    builtAt: now.toISOString(),
    from,
    to,
    sources: {
      geocoding: "OpenStreetMap Nominatim",
      routing: "OSRM driving route (OpenStreetMap data)",
      timing: "Passing times are estimates: the route's driving time spread evenly over its length, without traffic or stops.",
    },
    legs,
  };
}
