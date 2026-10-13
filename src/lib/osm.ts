/* OpenStreetMap's public services: Nominatim to turn a place into a point
   and a point into a town, OSRM's demo server to drive between two points.
   Neither needs a key. Both are meant for light use, so callers pace their
   Nominatim requests (its policy is one a second at most) and identify the
   app in the user agent. Replace with a keyed service if volume outgrows
   them (PLAN.md). */

import type { LonLat } from "./geo";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";
const TIMEOUT_MS = 10_000;

export type OsmErrorCode = "not_found" | "no_route" | "upstream";

export class OsmError extends Error {
  /** `place` is which end of the trip a lookup was for, when the corridor knows. */
  constructor(readonly code: OsmErrorCode, message: string, readonly place?: "from" | "to") {
    super(message);
    this.name = "OsmError";
  }
}

function userAgent(): string {
  const contact = process.env.OSM_CONTACT || "+https://github.com/lifelike-and-believable/road-trip";
  return `RoadTrip/0.1 (${contact})`;
}

async function getJson(url: URL): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url.toString(), {
      headers: { "user-agent": userAgent(), accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new OsmError("upstream", `${url.host} could not be reached`);
  }
  if (!r.ok) throw new OsmError("upstream", `${url.host} answered ${r.status}`);
  try {
    return await r.json();
  } catch {
    throw new OsmError("upstream", `${url.host} sent something that is not JSON`);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export async function geocode(query: string): Promise<{ lat: number; lon: number; displayName: string }> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const body = await getJson(url);
  if (!Array.isArray(body)) throw new OsmError("upstream", "unexpected geocoder reply");
  if (!body.length) throw new OsmError("not_found", `no place found for "${query}"`);
  const hit = body[0];
  const lat = isRecord(hit) ? Number(hit.lat) : NaN;
  const lon = isRecord(hit) ? Number(hit.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new OsmError("upstream", "unexpected geocoder reply");
  const displayName = isRecord(hit) && typeof hit.display_name === "string" ? hit.display_name : query;
  return { lat, lon, displayName };
}

const PLACE_KEYS = ["city", "town", "village", "municipality", "hamlet", "county"] as const;

// OpenStreetMap names many New York, New Jersey and Ontario places by their
// legal form, "Town of Plattsburgh". The bare name is what listings use.
// This also turns "City of Industry, California" into "Industry".
const LEGAL_FORM = /^(?:town|city|village|township|borough|municipality) of\s+(\S.*)$/i;

export function cleanPlaceName(name: string): string {
  const trimmed = name.trim();
  const match = LEGAL_FORM.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/** The town or municipality at a point, or null where the map names none. */
export async function reverseName(lat: number, lon: number): Promise<{ name: string; region?: string } | null> {
  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");
  const body = await getJson(url);
  if (!isRecord(body) || !isRecord(body.address)) return null;
  const address = body.address;
  for (const key of PLACE_KEYS) {
    const name = address[key];
    if (typeof name === "string" && name.trim()) {
      const region = address.state;
      const clean = cleanPlaceName(name);
      return typeof region === "string" && region ? { name: clean, region } : { name: clean };
    }
  }
  return null;
}

export type DriveRoute = { distanceKm: number; durationMin: number; line: LonLat[] };

/** Driving route with no traffic, so the duration is an estimate. */
export async function driveRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<DriveRoute> {
  const url = new URL(`${OSRM}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  const body = await getJson(url);
  if (isRecord(body) && body.code === "NoRoute") throw new OsmError("no_route", "no driving route between the places");
  const route = isRecord(body) && Array.isArray(body.routes) ? body.routes[0] : undefined;
  const coords = isRecord(route) && isRecord(route.geometry) ? route.geometry.coordinates : undefined;
  if (
    !isRecord(route) ||
    typeof route.distance !== "number" ||
    typeof route.duration !== "number" ||
    !Array.isArray(coords) ||
    !coords.length
  ) {
    throw new OsmError("upstream", "unexpected routing reply");
  }
  return {
    distanceKm: route.distance / 1000,
    durationMin: Math.round(route.duration / 60),
    line: coords as LonLat[],
  };
}
