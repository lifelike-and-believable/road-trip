/* A live check of the corridor and the event sources against the real
   services. Not a unit test: it needs network access and, for the sources,
   an ANTHROPIC_API_KEY, and the sources step spends money.

     npm run live                      corridor only: free, uses OpenStreetMap
     LIVE_SOURCES=1 npm run live       also find sources with Claude: spends money
     LIVE_LISTINGS=1 npm run live      also read the first few places for events: spends more
                                       (this finds the sources first, so LIVE_SOURCES is not also needed)

   Optional settings:
     LIVE_FROM, LIVE_TO     place names (default Montréal, QC to New York City, NY)
     LIVE_STAY_MIN          minutes to stay at the destination (default 2880)
     LIVE_MAX_STOPS         how many places to read for listings (default 3)
     LIVE_PRICE_PER_MTOK    "input,output" dollars per million tokens, to show a token cost
                            (for example "4,20"; check the model's current price)

   Everything printed is also written in full to live-output/ (ignored by git).
   Inside the Claude cloud sandbox, run it with NODE_USE_ENV_PROXY=1 and
   NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt so Node's fetch uses the proxy. */

import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { askModel, makeAsk } from "../src/lib/anthropic";
import { buildCorridor, type Corridor } from "../src/lib/corridor";
import { refreshListings } from "../src/lib/refresh";
import { buildSources, stopBatches, type SourceList } from "../src/lib/sources";
import { parseTripInput, type Trip } from "../src/lib/trip";

const HOUR = 3_600_000;
const out: Record<string, unknown> = {};
let trip: Trip;
let corridor: Corridor;
let sourceList: SourceList;
const wantListings = process.env.LIVE_LISTINGS === "1";
const wantSources = process.env.LIVE_SOURCES === "1" || wantListings;

const fmt = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";

function save() {
  mkdirSync("live-output", { recursive: true });
  const file = `live-output/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nFull output written to ${file}`);
}

afterAll(() => save());

describe("live check", () => {
  it("builds the corridor", async () => {
    const now = new Date();
    const start = new Date(Math.ceil((now.getTime() + 4 * 24 * HOUR) / HOUR) * HOUR);
    const parsed = parseTripInput(
      {
        from: { label: process.env.LIVE_FROM || "Montréal, QC" },
        to: { label: process.env.LIVE_TO || "New York City, NY" },
        start: start.toISOString(),
        end: new Date(start.getTime() + 84 * HOUR).toISOString(),
        roundTrip: true,
        stay: Number(process.env.LIVE_STAY_MIN || 2880),
      },
      now,
    );
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    trip = { id: "live-check", createdAt: now.toISOString(), ...parsed.value };

    const t0 = Date.now();
    corridor = await buildCorridor(trip, now);
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    out.trip = trip;
    out.corridor = corridor;

    console.log(`\nCorridor: ${trip.from.label} to ${trip.to.label}, built in ${seconds}s`);
    for (const leg of corridor.legs) {
      console.log(`\n${leg.id}: ${leg.distanceKm} km, ${leg.driveMinutes} min, arrives ${fmt(leg.arriveAt)}, fits=${leg.fits}`);
      for (const s of leg.stops) {
        const window = s.until === s.from ? fmt(s.from) : `${fmt(s.from)} to ${fmt(s.until)}`;
        console.log(`  ${String(s.km).padStart(6)} km  ${s.name}${s.region ? ` (${s.region})` : ""}  ${window}`);
      }
    }
    expect(corridor.legs.length).toBeGreaterThan(0);
  });

  it.runIf(wantSources)("finds sources with Claude", async () => {
    const batches = stopBatches(corridor);
    console.log(`\nAsking ${askModel()} about ${batches.flat().length} places in ${batches.length} requests (up to 6 web searches each). This spends money.`);

    const t0 = Date.now();
    const list = await buildSources(trip, corridor, new Date(), { ask: makeAsk(), model: askModel() });
    sourceList = list;
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    out.sources = list;

    console.log(`\nSources: ${list.sources.length} found in ${seconds}s with ${list.searches} web searches`);
    for (const s of list.sources) {
      console.log(`  [${s.kind}; ${s.covers.join("+")}] ${s.name}\n      ${s.url}\n      near: ${s.near.join(", ")}${s.notes ? `\n      ${s.notes}` : ""}`);
    }
    const uncovered = list.stopsSearched.filter((n) => !list.sources.some((s) => s.near.includes(n)));
    if (uncovered.length) console.log(`\nPlaces with no source: ${uncovered.join(", ")}`);

    console.log(`\nTokens: ${list.usage.inputTokens} in, ${list.usage.outputTokens} out`);
    const price = (process.env.LIVE_PRICE_PER_MTOK || "").split(",").map(Number);
    if (price.length === 2 && price.every(Number.isFinite)) {
      const dollars = (list.usage.inputTokens * price[0] + list.usage.outputTokens * price[1]) / 1_000_000;
      console.log(`Token cost at $${price[0]} / $${price[1]} per million: about $${dollars.toFixed(2)} (web searches are billed separately)`);
    } else {
      console.log("Set LIVE_PRICE_PER_MTOK=input,output to show a token cost. Web searches are billed separately.");
    }
    expect(list.sources.length).toBeGreaterThan(0);
  });

  it.runIf(wantListings)("reads the first few places for events", async () => {
    const maxStops = Number(process.env.LIVE_MAX_STOPS || 3);
    console.log(`\nReading up to ${maxStops} places with ${askModel()} (web searches and page reads each). This spends money.`);

    const t0 = Date.now();
    const { doc, report } = await refreshListings(trip, corridor, sourceList, null, new Date(), {
      ask: makeAsk(),
      maxStops,
    });
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    out.listings = { doc, report };

    console.log(`\nListings: read in ${seconds}s. Updated: ${report.updated.join(", ") || "none"}. Failed: ${report.failed.map((f) => `${f.stop} (${f.code})`).join(", ") || "none"}. Not reached: ${report.remaining}. No sources: ${report.noSources.join(", ") || "none"}.`);
    for (const [stop, entry] of Object.entries(doc.stops)) {
      const fixedCount = entry.listings.filter((l) => l.schedule.kind === "fixed").length;
      console.log(`\n${stop}: ${entry.listings.length} listings (${fixedCount} fixed, ${entry.listings.length - fixedCount} flexible)`);
      for (const l of entry.listings) {
        const when = l.schedule.kind === "fixed" ? fmt(l.schedule.start) : `open ${l.schedule.hours.map((h) => `${fmt(h.opens)}-${fmt(h.closes).slice(-6)}`).join(", ")}`;
        console.log(`  [${l.category}; ${l.cost}] ${l.title}${l.venue ? ` at ${l.venue}` : ""}, ${when}\n      ${l.url ?? l.source}`);
      }
    }
    console.log(`\nTokens: ${report.usage.inputTokens} in, ${report.usage.outputTokens} out`);
    expect(report.failed).toEqual([]);
  });
});
