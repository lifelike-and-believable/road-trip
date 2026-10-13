import { describe, expect, it } from "vitest";
import { MAX_HIDDEN, parsePlan } from "./plan";

const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";

describe("parsePlan and hidden entries", () => {
  it("takes a list of hidden listing ids", () => {
    expect(parsePlan({ picks: [], starred: [], hidden: [A, B] })).toEqual({ ok: true, picks: [], starred: [], hidden: [A, B] });
  });

  it("has no hidden list when nothing is hidden, so a plan without one is unchanged", () => {
    expect(parsePlan({ picks: [], starred: [] })).toEqual({ ok: true, picks: [], starred: [] });
    expect(parsePlan({ picks: [], starred: [], hidden: [] })).toEqual({ ok: true, picks: [], starred: [] });
  });

  it("keeps the first of a repeated id", () => {
    expect(parsePlan({ picks: [], starred: [], hidden: [A, A] })).toMatchObject({ ok: true, hidden: [A] });
  });

  it("refuses a hidden list that is not a list of listing ids, naming what is wrong", () => {
    for (const bad of ["a", 5, {}, [5], ["nope"]]) {
      const r = parsePlan({ picks: [], starred: [], hidden: bad });
      expect(r.ok).toBe(false);
    }
    const r = parsePlan({ picks: [], starred: [], hidden: ["zz"] });
    if (r.ok) throw new Error("expected a refusal");
    expect(r.errors.join(" ")).toMatch(/hidden/);
  });

  it("is bounded", () => {
    const many = Array.from({ length: MAX_HIDDEN + 1 }, (_, i) => i.toString(16).padStart(12, "0"));
    expect(parsePlan({ picks: [], starred: [], hidden: many }).ok).toBe(false);
  });
});
