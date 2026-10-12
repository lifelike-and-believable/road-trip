import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanPlaceName, reverseName } from "./osm";

describe("cleanPlaceName", () => {
  it("drops the administrative prefix OpenStreetMap puts on New York places", () => {
    expect(cleanPlaceName("Town of Plattsburgh")).toBe("Plattsburgh");
    expect(cleanPlaceName("City of Albany")).toBe("Albany");
    expect(cleanPlaceName("Village of Saddle River")).toBe("Saddle River");
    expect(cleanPlaceName("Township of Montclair")).toBe("Montclair");
    expect(cleanPlaceName("Borough of Hawthorne")).toBe("Hawthorne");
    expect(cleanPlaceName("Municipality of Clarington")).toBe("Clarington");
  });

  it("ignores case and surrounding space", () => {
    expect(cleanPlaceName("  town of Lewis ")).toBe("Lewis");
  });

  it("leaves other names alone", () => {
    for (const n of ["Saint-Hyacinthe", "Drummondville", "Saratoga Springs", "Townsend", "Cityview"]) {
      expect(cleanPlaceName(n)).toBe(n);
    }
  });

  it("only strips a leading prefix, and never to nothing", () => {
    expect(cleanPlaceName("Mount of Town of Oaks")).toBe("Mount of Town of Oaks");
    expect(cleanPlaceName("Town of ")).toBe("Town of");
  });
});

describe("reverseName cleans what it returns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ address: { town: "Town of Schroon", state: "New York" } }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the bare town name with its region", async () => {
    expect(await reverseName(43.8, -73.7)).toEqual({ name: "Schroon", region: "New York" });
  });
});
