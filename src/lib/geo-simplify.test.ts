import { describe, expect, it } from "vitest";
import { simplifyLine, type LonLat } from "./geo";

describe("simplifyLine", () => {
  it("keeps both ends and drops points that lie on the straight line between their neighbours", () => {
    const straight: LonLat[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    expect(simplifyLine(straight, 100)).toEqual([[0, 0], [4, 0]]);
  });

  it("keeps a bend", () => {
    const bent: LonLat[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
    expect(simplifyLine(bent, 100)).toEqual([[0, 0], [2, 0], [2, 2]]);
  });

  it("returns a line that already fits unchanged, including a line of one or two points", () => {
    expect(simplifyLine([], 10)).toEqual([]);
    expect(simplifyLine([[1, 2]], 10)).toEqual([[1, 2]]);
    expect(simplifyLine([[1, 2], [3, 4]], 10)).toEqual([[1, 2], [3, 4]]);
  });

  it("never returns more points than asked for, and still starts and ends where the road does", () => {
    // a wiggly line of 5000 points
    const wiggle: LonLat[] = Array.from({ length: 5000 }, (_, i): LonLat => [i / 50, Math.sin(i / 7) * 0.05]);
    const out = simplifyLine(wiggle, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.length).toBeGreaterThan(2);
    expect(out[0]).toEqual(wiggle[0]);
    expect(out.at(-1)).toEqual(wiggle.at(-1));
  });

  it("keeps the points in their original order and only points that were in the line", () => {
    const wiggle: LonLat[] = Array.from({ length: 800 }, (_, i): LonLat => [i / 10, Math.cos(i / 5) * 0.1]);
    const out = simplifyLine(wiggle, 60);
    const positions = out.map((p) => wiggle.findIndex((q) => q[0] === p[0] && q[1] === p[1]));
    expect(positions.every((i) => i >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
