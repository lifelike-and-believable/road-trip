import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveRoute, geocode, OsmError, reverseName } from "./osm";

type Seen = { url: URL; headers: Record<string, string> };
let seen: Seen[];
let reply: { status?: number; body: unknown };

beforeEach(() => {
  seen = [];
  reply = { body: [] };
  vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push({ url: new URL(url), headers: init?.headers ?? {} });
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OSM_CONTACT;
});

describe("geocode", () => {
  it("returns the first match as numbers, and identifies the app to Nominatim", async () => {
    reply = { body: [{ lat: "45.5031824", lon: "-73.5698065", display_name: "Montréal, Québec, Canada" }] };
    const r = await geocode("Montréal, QC");
    expect(r).toEqual({ lat: 45.5031824, lon: -73.5698065, displayName: "Montréal, Québec, Canada" });
    expect(seen[0].url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(seen[0].url.pathname).toBe("/search");
    expect(seen[0].url.searchParams.get("q")).toBe("Montréal, QC");
    expect(seen[0].url.searchParams.get("limit")).toBe("1");
    expect(seen[0].headers["user-agent"]).toMatch(/^RoadTrip\/\d/);
  });

  it("puts a configured contact in the user agent", async () => {
    process.env.OSM_CONTACT = "ops@example.com";
    reply = { body: [{ lat: "1", lon: "2", display_name: "x" }] };
    await geocode("x");
    expect(seen[0].headers["user-agent"]).toContain("ops@example.com");
  });

  it("fails with not_found when nothing matches", async () => {
    await expect(geocode("zzzz")).rejects.toMatchObject({ name: "OsmError", code: "not_found" });
  });

  it("fails with upstream when the service errors or sends nonsense", async () => {
    reply = { status: 503, body: {} };
    await expect(geocode("x")).rejects.toMatchObject({ code: "upstream" });
    reply = { body: [{ lat: "north", lon: "2", display_name: "x" }] };
    await expect(geocode("x")).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("reverseName", () => {
  const ask = () => reverseName(46.1, -72.9);

  it("prefers the most local place name and keeps the region", async () => {
    reply = { body: { address: { village: "Saint-Hyacinthe", county: "Les Maskoutains", state: "Québec" } } };
    expect(await ask()).toEqual({ name: "Saint-Hyacinthe", region: "Québec" });
    expect(seen[0].url.pathname).toBe("/reverse");
    expect(seen[0].url.searchParams.get("zoom")).toBe("10");
  });

  it("falls back from city to town, municipality, county", async () => {
    reply = { body: { address: { county: "Pontiac", state: "Québec" } } };
    expect(await ask()).toEqual({ name: "Pontiac", region: "Québec" });
  });

  it("returns null where Nominatim has no place for the point", async () => {
    reply = { body: { error: "Unable to geocode" } };
    expect(await ask()).toBeNull();
    reply = { body: { address: { country: "Canada" } } };
    expect(await ask()).toBeNull();
  });

  it("fails with upstream on an HTTP error", async () => {
    reply = { status: 429, body: {} };
    await expect(ask()).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("driveRoute", () => {
  const route = {
    code: "Ok",
    routes: [{ distance: 261234.5, duration: 9000, geometry: { coordinates: [[-73.5, 45.5], [-71.2, 46.8]] } }],
  };

  it("asks for longitude then latitude and converts to km and minutes", async () => {
    reply = { body: route };
    const r = await driveRoute({ lat: 45.5, lon: -73.5 }, { lat: 46.8, lon: -71.2 });
    expect(r.distanceKm).toBeCloseTo(261.2, 1);
    expect(r.durationMin).toBe(150);
    expect(r.line).toEqual([[-73.5, 45.5], [-71.2, 46.8]]);
    expect(seen[0].url.host).toBe("router.project-osrm.org");
    expect(seen[0].url.pathname).toBe("/route/v1/driving/-73.5,45.5;-71.2,46.8");
    expect(seen[0].url.searchParams.get("geometries")).toBe("geojson");
    expect(seen[0].url.searchParams.get("overview")).toBe("full");
  });

  it("fails with no_route when OSRM finds none", async () => {
    reply = { body: { code: "NoRoute", routes: [] } };
    await expect(driveRoute({ lat: 0, lon: 0 }, { lat: 1, lon: 1 })).rejects.toMatchObject({ code: "no_route" });
  });

  it("fails with upstream on an HTTP error or a malformed body", async () => {
    reply = { status: 500, body: {} };
    await expect(driveRoute({ lat: 0, lon: 0 }, { lat: 1, lon: 1 })).rejects.toBeInstanceOf(OsmError);
    reply = { body: { code: "Ok", routes: [{ distance: "far" }] } };
    await expect(driveRoute({ lat: 0, lon: 0 }, { lat: 1, lon: 1 })).rejects.toMatchObject({ code: "upstream" });
  });
});
