/** GeoJSON order: longitude first. */
export type LonLat = [number, number];

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points. */
export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from the start of the line to each vertex. */
export function cumulativeKm(line: LonLat[]): number[] {
  const out: number[] = [];
  let total = 0;
  line.forEach((p, i) => {
    if (i > 0) total += haversineKm(line[i - 1], p);
    out.push(total);
  });
  return out;
}

/** The point `km` along the line, clamped to its ends. `cum` is `cumulativeKm(line)`. */
export function pointAtKm(line: LonLat[], cum: number[], km: number): { lon: number; lat: number } {
  if (!line.length) throw new Error("empty line");
  const last = line.length - 1;
  if (km <= 0 || last === 0) return { lon: line[0][0], lat: line[0][1] };
  if (km >= cum[last]) return { lon: line[last][0], lat: line[last][1] };
  let i = 1;
  while (cum[i] < km) i++;
  const span = cum[i] - cum[i - 1];
  if (span === 0) return { lon: line[i][0], lat: line[i][1] };
  const t = (km - cum[i - 1]) / span;
  return {
    lon: line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
    lat: line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
  };
}
