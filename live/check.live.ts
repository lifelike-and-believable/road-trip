/* A live check of the corridor and the event sources against the real
   services. Not a unit test: it needs network access and, for the sources,
   an ANTHROPIC_API_KEY, and the sources step spends money.

     npm run live                      corridor only: free, uses OpenStreetMap
     LIVE_SOURCES=1 npm run live       also find sources with Claude: spends money

   Optional settings:
     LIVE_FROM, LIVE_TO     place names (default Montréal, QC to New York City, NY)
     LIVE_STAY_MIN          minutes to stay at the destination (default 2880)
     LIVE_PRICE_PER_MTOK    "input,output" dollars per million tokens, to show a token cost
                            (for example "4,20"; check the model's current price)

   Everything printed is also written in full to live-output/ (ignored by git).
   Inside the Claude cloud sandbox, run it with NODE_USE_ENV_PROXY=1 and
   NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt so Node's fetch uses the proxy. */

import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { askModel, makeAsk } from "../src/lib/anthropic";
import { buildCorridor, type Corridor } from "../src/lib/corridor";
import { buildSources, stopBatches } from "../src/lib/sources";
import { parseTripInput, type Trip } from "../src/lib/trip";

const HOUR = 3_600_000;
const out: Record<string, unknown> = {};
let trip: Trip;
let corridor: Corridor;

const fmt = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";

function save() {
  mkdirSync("live-output", { recursive: true });
  const file = `live-output/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nFull output written to ${file}`);
}

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
        console.log(`  ${String(s.km).padStart(6)} km  ${s.kind.padEnd(11)} ${s.name}${s.region ? ` (${s.region})` : ""}  ${window}`);
      }
    }
    expect(corridor.legs.length).toBeGreaterThan(0);
    if (process.env.LIVE_SOURCES !== "1") save();
  });

  it.runIf(process.env.LIVE_SOURCES === "1")("finds sources with Claude", async () => {
    const batches = stopBatches(corridor);
    console.log(`\nAsking ${askModel()} about ${batches.flat().length} places in ${batches.length} requests (up to 6 web searches each). This spends money.`);

    const t0 = Date.now();
    const list = await buildSources(trip, corridor, new Date(), { ask: makeAsk(), model: askModel() });
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
    save();
  });
});
