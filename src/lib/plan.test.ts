import { describe, expect, it } from "vitest";
import { parsePlan } from "./plan";

const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";
const C = "cccccccccccc";

describe("parsePlan", () => {
  it("takes picks, an optional chosen time with an offset, and stars", () => {
    const r = parsePlan({ picks: [{ id: A }, { id: B, at: "2026-10-17T14:00:00-04:00" }], starred: [C] });
    expect(r).toEqual({ ok: true, picks: [{ id: A }, { id: B, at: "2026-10-17T18:00:00.000Z" }], starred: [C] });
  });

  it("keeps the day a flexible pick was made for, and refuses one that is not a date", () => {
    const ok = parsePlan({ picks: [{ id: A, day: "2026-10-18" }], starred: [] });
    expect(ok).toEqual({ ok: true, picks: [{ id: A, day: "2026-10-18" }], starred: [] });
    for (const day of ["18 October", "2026-02-30", 20261018]) {
      expect(parsePlan({ picks: [{ id: A, day }], starred: [] }).ok).toBe(false);
    }
  });

  it("accepts an empty plan, which is how a pick is taken back", () => {
    expect(parsePlan({ picks: [], starred: [] })).toEqual({ ok: true, picks: [], starred: [] });
  });

  it("keeps the first of a repeated pick or star", () => {
    expect(parsePlan({ picks: [{ id: A }, { id: A, at: "2026-10-17T14:00:00Z" }], starred: [C, C] })).toEqual({
      ok: true, picks: [{ id: A }], starred: [C],
    });
  });

  it("refuses anything that is not a plan, naming what is wrong", () => {
    for (const bad of [null, [], "x", {}, { picks: [] }, { starred: [] }, { picks: "a", starred: [] }, { picks: [], starred: "a" }]) {
      const r = parsePlan(bad);
      expect(r.ok).toBe(false);
    }
    const r = parsePlan({ picks: [{ id: "nope" }, { id: A, at: "2026-10-17T14:00:00" }, 5], starred: ["zz"] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/picks\[0\]\.id/);
    expect(r.errors.join(" ")).toMatch(/picks\[1\]\.at/);
    expect(r.errors.join(" ")).toMatch(/picks\[2\]/);
    expect(r.errors.join(" ")).toMatch(/starred\[0\]/);
  });

  it("is bounded", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ id: i.toString(16).padStart(12, "0") }));
    expect(parsePlan({ picks: many, starred: [] }).ok).toBe(false);
    const stars = Array.from({ length: 301 }, (_, i) => i.toString(16).padStart(12, "0"));
    expect(parsePlan({ picks: [], starred: stars }).ok).toBe(false);
  });
});
