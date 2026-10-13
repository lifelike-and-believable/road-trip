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

/** Distance from p to the segment a-b, in degrees on a plane scaled so a degree of longitude is as long as it is at p's latitude. Only used to compare, never shown. */
function offLine(p: LonLat, a: LonLat, b: LonLat): number {
  const k = Math.cos(rad(p[1]));
  const px = p[0] * k;
  const ax = a[0] * k;
  const bx = b[0] * k;
  const dx = bx - ax;
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(line: LonLat[], tolerance: number): LonLat[] {
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop() ?? [0, 0];
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const d = offLine(line[i], line[from], line[to]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at] = true;
      stack.push([from, at], [at, to]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** A road drawn with far fewer points. The ends and the bends stay; the tolerance widens until the line has at most `maxPoints`. */
export function simplifyLine(line: LonLat[], maxPoints: number): LonLat[] {
  if (line.length <= 2) return line;
  let tolerance = 1e-5;
  let out = douglasPeucker(line, tolerance);
  while (out.length > Math.max(2, maxPoints)) {
    tolerance *= 1.6;
    out = douglasPeucker(line, tolerance);
  }
  return out;
}
