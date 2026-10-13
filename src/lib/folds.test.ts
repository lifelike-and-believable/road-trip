import { describe, expect, it } from "vitest";
import { readFolds, writeFolds, type FoldStorage } from "./folds";

const memory = (): FoldStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const broken: FoldStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("which days the traveller folded", () => {
  it("is kept for each trip separately, and read back", () => {
    const s = memory();
    writeFolds(s, "trip-a", { "2026-10-17": true, "2026-10-18": false });
    writeFolds(s, "trip-b", { "2026-10-17": false });
    expect(readFolds(s, "trip-a")).toEqual({ "2026-10-17": true, "2026-10-18": false });
    expect(readFolds(s, "trip-b")).toEqual({ "2026-10-17": false });
  });

  it("reads as nothing chosen when nothing was saved", () => {
    expect(readFolds(memory(), "trip-a")).toEqual({});
  });

  it("ignores anything saved that is not a day mapped to true or false", () => {
    const s = memory();
    s.setItem("rt-folds-trip-a", JSON.stringify({ "2026-10-17": true, "nope": true, "2026-10-18": "yes", "2026-10-19": null }));
    expect(readFolds(s, "trip-a")).toEqual({ "2026-10-17": true });
    s.setItem("rt-folds-trip-a", "not json");
    expect(readFolds(s, "trip-a")).toEqual({});
    s.setItem("rt-folds-trip-a", JSON.stringify([1, 2]));
    expect(readFolds(s, "trip-a")).toEqual({});
  });

  it("works without storage, as in a private window or a blocked browser, and never throws", () => {
    expect(readFolds(undefined, "trip-a")).toEqual({});
    expect(readFolds(broken, "trip-a")).toEqual({});
    expect(() => writeFolds(undefined, "trip-a", { "2026-10-17": true })).not.toThrow();
    expect(() => writeFolds(broken, "trip-a", { "2026-10-17": true })).not.toThrow();
  });
});
