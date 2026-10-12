import { describe, expect, it } from "vitest";
import type { Corridor, Stop } from "./corridor";
import { ingestListings } from "./ingest";
import type { Listing } from "./listing";
import type { ListingsDoc } from "./refresh";

const NOW = new Date("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H).toISOString();

const stop = (name: string, from: string, until = from): Stop => ({
  name, region: "NY", lat: 0, lon: 0, kind: "along", km: 0, from, until,
});

// B is visited tomorrow, A has already been passed, C is visited in four days
const corridor: Corridor = {
  tripId: "t1", builtAt: NOW.toISOString(),
  from: { label: "A", lat: 0, lon: 0 }, to: { label: "C", lat: 0, lon: 0 },
  sources: { geocoding: "g", routing: "r", timing: "t" },
  legs: [{
    id: "out", distanceKm: 1, driveMinutes: 1, arriveAt: "x", fits: true,
    stops: [stop("A", at(-30)), stop("B", at(30)), stop("C", at(100))],
  }],
};

const fixed = (title: string, startIso: string, over: Record<string, unknown> = {}) => ({
  title, source: "https://a.example/events", category: "music", cost: "free",
  schedule: { kind: "fixed", start: startIso, durationMin: 90 }, ...over,
});

const earlier = (title: string): Listing => ({
  id: "old", stop: "B", title, category: "music", cost: "free", source: "https://a.example/events",
  schedule: { kind: "fixed", start: at(30) },
});

const ingest = (payload: unknown, previous: ListingsDoc | null = null) =>
  ingestListings(corridor, previous, payload, NOW);

describe("ingestListings", () => {
  it("validates what the routine sends the way a read by the server is validated, and stores it with the time of the read", () => {
    const r = ingest({
      stops: {
        B: [
          fixed("Jazz night", at(31)),
          fixed("Plain http link", at(31), { source: "http://a.example/events" }),
          fixed("No time", "not a time"),
        ],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.updated).toEqual(["B"]);
    const entry = r.doc.stops.B;
    expect(entry.refreshedAt).toBe(NOW.toISOString());
    expect(entry.listings.map((l) => l.title)).toEqual(["Jazz night"]);
    expect(entry.listings[0]).toMatchObject({ stop: "B", category: "music", cost: "free" });
    expect(entry.listings[0].id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("drops a listing that is not on while the traveller is at that stop", () => {
    const r = ingest({ stops: { B: [fixed("Today only", at(2)), fixed("Tomorrow evening", at(31))] } });
    if (!r.ok) throw new Error("expected ok");
    expect(r.doc.stops.B.listings.map((l) => l.title)).toEqual(["Tomorrow evening"]);
  });

  it("gives a listing the same id as the server's own read would, so picks and stars survive a change of who reads", () => {
    const a = ingest({ stops: { B: [fixed("Jazz night", at(31))] } });
    const b = ingest({ stops: { B: [fixed("Jazz night", at(31), { venue: "Elsewhere" })] } });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.doc.stops.B.listings[0].id).toBe(b.doc.stops.B.listings[0].id);
  });

  it("leaves places the payload does not mention exactly as they were", () => {
    const previous: ListingsDoc = {
      tripId: "t1", updatedAt: at(-5),
      stops: { C: { refreshedAt: at(-5), listings: [{ ...earlier("Kept"), stop: "C", schedule: { kind: "fixed", start: at(100) } }] } },
    };
    const r = ingest({ stops: { B: [fixed("Jazz night", at(31))] } }, previous);
    if (!r.ok) throw new Error("expected ok");
    expect(r.doc.stops.C).toEqual(previous.stops.C);
    expect(r.doc.updatedAt).toBe(NOW.toISOString());
  });

  it("keeps the earlier listings when a place comes back with nothing usable", () => {
    const previous: ListingsDoc = { tripId: "t1", updatedAt: at(-5), stops: { B: { refreshedAt: at(-5), listings: [earlier("Earlier find")] } } };
    const r = ingest({ stops: { B: [fixed("Far too late", at(500))], C: [fixed("Concert", at(101))] } }, previous);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kept).toEqual(["B"]);
    expect(r.report.updated).toEqual(["C"]);
    expect(r.doc.stops.B.listings.map((l) => l.title)).toEqual(["Earlier find"]);
    expect(r.doc.stops.B.refreshedAt).toBe(NOW.toISOString());
  });

  it("ignores a place the traveller has passed and a place that is not on the route, and says so", () => {
    const r = ingest({ stops: { A: [fixed("Gone", at(-29))], Z: [fixed("Nowhere", at(31))], B: [fixed("Jazz night", at(31))] } });
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.passed).toEqual(["A"]);
    expect(r.report.unknown).toEqual(["Z"]);
    expect(Object.keys(r.doc.stops)).toEqual(["B"]);
  });

  it("refuses a payload with no listings anywhere instead of blanking the trip", () => {
    for (const payload of [{ stops: {} }, { stops: { B: [] } }]) {
      const r = ingest(payload);
      expect(r).toMatchObject({ ok: false, code: "empty_payload" });
    }
  });

  it("refuses a payload that is not a set of places each with a list", () => {
    for (const payload of [null, [], "x", {}, { stops: [] }, { stops: { B: "events" } }, { stops: { B: { title: "x" } } }]) {
      expect(ingest(payload)).toMatchObject({ ok: false, code: "bad_payload" });
    }
  });

  it("reads at most a bounded number of items for a place", () => {
    const many = Array.from({ length: 500 }, (_, i) => fixed(`Show ${i}`, at(31)));
    const r = ingest({ stops: { B: many } });
    if (!r.ok) throw new Error("expected ok");
    expect(r.doc.stops.B.listings.length).toBeLessThanOrEqual(40);
  });
});
