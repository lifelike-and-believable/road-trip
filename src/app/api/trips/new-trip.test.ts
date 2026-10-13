import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({
  later: [] as Array<() => Promise<void> | void>,
  prepared: [] as Array<{ id: string; by: string }>,
  fired: [] as string[],
  fail: false,
}));

vi.mock("next/server", () => ({ after: (fn: () => Promise<void> | void) => void S.later.push(fn) }));
vi.mock("../../../lib/store", async (orig) => ({ ...(await orig<typeof import("../../../lib/store")>()), setDoc: async () => {} }));
vi.mock("../../../lib/live-deps", () => ({ liveDeps: () => ({}) }));
vi.mock("../../../lib/fire-routine", () => ({ fireRoutine: async (id: string) => (S.fired.push(id), { fired: true }) }));
vi.mock("../../../lib/on-create", () => ({
  prepareNewTrip: async (trip: { id: string }, o: { by: string; fire: (id: string) => Promise<unknown> }) => {
    if (S.fail) throw new Error("boom");
    S.prepared.push({ id: trip.id, by: o.by });
    await o.fire(trip.id);
    return {};
  },
}));

import { POST } from "./route";
import { issueCookie } from "../../../lib/auth";

const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const post = () =>
  new Request("https://x.test/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: issueCookie().split(";")[0] },
    body: JSON.stringify({ from: { label: "Montréal, QC" }, to: { label: "Québec, QC" }, start: iso(3), end: iso(5), roundTrip: false }),
  });

beforeEach(() => {
  S.later.length = 0;
  S.prepared.length = 0;
  S.fired.length = 0;
  S.fail = false;
  process.env.AUTH_SECRET = "s3cret";
  delete process.env.LISTINGS_BY;
});

describe("making a trip", () => {
  it("answers first, and then prepares the trip and starts the routine for it", async () => {
    const res = await POST(post());
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(S.prepared).toEqual([]);
    expect(S.later).toHaveLength(1);

    await S.later[0]();
    expect(S.prepared).toEqual([{ id, by: "routine" }]);
    expect(S.fired).toEqual([id]);
  });

  it("passes the cron setting on, so the server reads the places itself", async () => {
    process.env.LISTINGS_BY = "cron";
    await POST(post());
    await S.later[0]();
    expect(S.prepared[0].by).toBe("cron");
  });

  it("still answers when the work afterwards fails", async () => {
    S.fail = true;
    const res = await POST(post());
    expect(res.status).toBe(201);
    await expect(S.later[0]()).resolves.toBeUndefined();
  });

  it("schedules nothing for a trip that was refused", async () => {
    const res = await POST(new Request("https://x.test/api/trips", { method: "POST", headers: { "content-type": "application/json", cookie: issueCookie().split(";")[0] }, body: "{}" }));
    expect(res.status).toBe(400);
    expect(S.later).toHaveLength(0);
  });
});
