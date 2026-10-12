import { describe, expect, it, vi } from "vitest";
import type { Corridor, Stop } from "./corridor";
import { buildSources, parseSources, stopBatches, SourcesError, type Ask } from "./sources";
import type { Trip } from "./trip";

const NOW = new Date("2026-10-12T12:00:00Z");

const stop = (name: string, kind: Stop["kind"], km: number, from = "2026-10-16T14:00:00.000Z"): Stop => ({
  name, region: "Québec", lat: 0, lon: 0, kind, km, from, until: from,
});

function corridor(names: string[], back = true): Corridor {
  const out = names.map((n, i) => stop(n, i === 0 ? "origin" : i === names.length - 1 ? "destination" : "along", i * 50));
  const legs: Corridor["legs"] = [{ id: "out", distanceKm: 1, driveMinutes: 1, arriveAt: "x", fits: true, stops: out }];
  if (back) legs.push({ id: "back", distanceKm: 1, driveMinutes: 1, arriveAt: "x", fits: true, stops: [...out].reverse() });
  return {
    tripId: "t1", builtAt: NOW.toISOString(),
    from: { label: names[0], lat: 0, lon: 0 }, to: { label: names.at(-1)!, lat: 0, lon: 0 },
    sources: { geocoding: "g", routing: "r", timing: "t" }, legs,
  };
}

const trip: Trip = {
  id: "t1", createdAt: NOW.toISOString(),
  from: { label: "Alpha" }, to: { label: "Omega" },
  start: "2026-10-16T14:00:00.000Z", end: "2026-10-18T22:00:00.000Z", roundTrip: true,
};

const STOPS = ["Alpha", "Beta", "Gamma"];
const reply = (sources: unknown[]) => JSON.stringify({ sources });
const good = (over: Record<string, unknown> = {}) => ({
  name: "Beta Tourism", url: "https://beta-tourisme.example/evenements", kind: "tourism",
  near: ["Beta"], covers: ["fixed", "flexible"], ...over,
});

describe("parseSources", () => {
  it("accepts a well-formed list, also when wrapped in prose or a code fence", () => {
    const wrapped = "Here you go:\n```json\n" + reply([good()]) + "\n```\nHope that helps.";
    expect(parseSources(wrapped, STOPS)).toEqual([
      { name: "Beta Tourism", url: "https://beta-tourisme.example/evenements", kind: "tourism", near: ["Beta"], covers: ["fixed", "flexible"] },
    ]);
  });

  it("keeps only https URLs with a real host and no credentials", () => {
    const bad = [
      "http://example.com/a", "javascript:alert(1)", "ftp://example.com/x", "https://localhost/a",
      "https://user:pw@example.com/a", "https://192.168.0.1/a", "https://nodot/a", "not a url", "",
    ].map((url) => good({ url }));
    expect(parseSources(reply(bad), STOPS)).toEqual([]);
  });

  it("drops the query string and fragment so a tracking link or a token is not stored", () => {
    const [s] = parseSources(reply([good({ url: "https://a.example/events?utm=1&token=abc#top" })]), STOPS);
    expect(s.url).toBe("https://a.example/events");
  });

  it("lists a page once, however it is spelled", () => {
    const list = [
      good({ url: "https://a.example/events/" }),
      good({ url: "https://A.EXAMPLE/events?x=1", name: "Again" }),
    ];
    expect(parseSources(reply(list), STOPS)).toHaveLength(1);
  });

  it("ignores stops the model invented, and a source near none of the asked stops", () => {
    const list = [good({ near: ["Beta", "Atlantis"] }), good({ url: "https://b.example/x", near: ["Atlantis"] })];
    const out = parseSources(reply(list), STOPS);
    expect(out).toHaveLength(1);
    expect(out[0].near).toEqual(["Beta"]);
  });

  it("falls back to 'other' for an unknown kind and drops unknown timing values", () => {
    const [s] = parseSources(reply([good({ kind: "casino", covers: ["fixed", "whenever"] })]), STOPS);
    expect(s.kind).toBe("other");
    expect(s.covers).toEqual(["fixed"]);
  });

  it("defaults covers to both kinds of activity when none is given", () => {
    const [s] = parseSources(reply([good({ covers: undefined })]), STOPS);
    expect(s.covers).toEqual(["fixed", "flexible"]);
  });

  it("limits the length of text it keeps", () => {
    const [s] = parseSources(reply([good({ name: "N".repeat(500), notes: "x".repeat(2000) })]), STOPS);
    expect(s.name.length).toBeLessThanOrEqual(120);
    expect(s.notes!.length).toBeLessThanOrEqual(300);
  });

  it("returns nothing for text that is not the expected JSON", () => {
    for (const t of ["", "no json here", "{broken", '{"sources": "nope"}', "[1,2,3]", '{"other": []}']) {
      expect(parseSources(t, STOPS)).toEqual([]);
    }
  });
});

describe("stopBatches", () => {
  it("lists each place once, in route order, including the return leg's places", () => {
    const names = stopBatches(corridor(["A", "B", "C", "D"])).flat().map((s) => s.name);
    expect(names).toEqual(["A", "B", "C", "D"]);
  });

  it("groups stops in fives", () => {
    const sizes = stopBatches(corridor(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"])).map((b) => b.length);
    expect(sizes).toEqual([5, 5, 2]);
  });
});

describe("buildSources", () => {
  const fake = (replies: string[]): Ask & ReturnType<typeof vi.fn> => {
    let i = 0;
    return vi.fn(async () => ({ text: replies[i++] ?? reply([]), searches: 3 })) as never;
  };

  it("asks once per batch, naming the stops and the trip's dates", async () => {
    const ask = fake([reply([good()])]);
    await buildSources(trip, corridor(STOPS), NOW, { ask, model: "m" });
    expect(ask).toHaveBeenCalledTimes(1);
    const { system, user } = ask.mock.calls[0][0];
    for (const n of STOPS) expect(user).toContain(n);
    expect(user).toContain("2026-10-16");
    expect(system).toMatch(/untrusted/i);
    expect(system).toMatch(/concert|play/i);
    expect(system).toMatch(/museum/i);
  });

  it("merges the batches, de-duplicates across them, and totals the searches", async () => {
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    const ask = fake([
      reply([good({ near: ["A"], url: "https://one.example/e" }), good({ near: ["B"], url: "https://shared.example/e" })]),
      reply([good({ near: ["F"], url: "https://shared.example/e/" }), good({ near: ["G"], url: "https://two.example/e" })]),
    ]);
    const list = await buildSources(trip, corridor(names), NOW, { ask, model: "m" });
    expect(list.sources.map((s) => s.url).sort()).toEqual([
      "https://one.example/e", "https://shared.example/e", "https://two.example/e",
    ]);
    expect(list.searches).toBe(6);
    expect(list.stopsSearched).toEqual(names);
    expect(list).toMatchObject({ tripId: "t1", builtAt: NOW.toISOString(), model: "m" });
  });

  it("fails the whole build when any batch fails, so no half-covered road is stored", async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce({ text: reply([good({ near: ["A"] })]), searches: 1 })
      .mockRejectedValueOnce(new SourcesError("upstream", "overloaded"));
    await expect(
      buildSources(trip, corridor(["A", "B", "C", "D", "E", "F", "G"]), NOW, { ask, model: "m" }),
    ).rejects.toMatchObject({ code: "upstream" });
  });

  it("fails when nothing usable came back", async () => {
    const ask = fake([reply([good({ url: "http://insecure.example/x" })])]);
    await expect(buildSources(trip, corridor(STOPS), NOW, { ask, model: "m" })).rejects.toMatchObject({ code: "no_sources" });
  });

  it("caps the stored list", async () => {
    const many = Array.from({ length: 80 }, (_, i) => good({ url: `https://s${i}.example/e` }));
    const list = await buildSources(trip, corridor(STOPS), NOW, { ask: fake([reply(many)]), model: "m" });
    expect(list.sources.length).toBeLessThanOrEqual(60);
  });
});
