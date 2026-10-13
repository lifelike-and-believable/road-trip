import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  later: [] as Array<() => Promise<void> | void>,
  prepared: [] as string[],
  fired: [] as string[],
}));

vi.mock("next/server", () => ({ after: (fn: () => Promise<void> | void) => void S.later.push(fn) }));
vi.mock("../../../../../lib/store", async (orig) => ({
  ...(await orig<typeof import("../../../../../lib/store")>()),
  getDoc: async (p: string) => S.docs.get(p) ?? null,
  setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
}));
vi.mock("../../../../../lib/live-deps", () => ({ liveDeps: () => ({}) }));
vi.mock("../../../../../lib/fire-routine", () => ({ fireRoutine: async (id: string) => (S.fired.push(id), { fired: true }) }));
vi.mock("../../../../../lib/on-create", () => ({
  prepareNewTrip: async (trip: { id: string }, o: { fire: (id: string) => Promise<unknown> }) => {
    S.prepared.push(trip.id);
    await o.fire(trip.id);
    return {};
  },
}));

import { POST } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/prepare">;
const req = (headers: Record<string, string> = { cookie: issueCookie().split(";")[0] }) => new Request(`https://x.test/api/trips/${ID}/prepare`, { method: "POST", headers });
const trip = { id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false };
const prep = (state: string, updatedAt: string) => ({ tripId: ID, state, startedAt: updatedAt, updatedAt });

beforeEach(() => {
  S.docs.clear();
  S.later.length = 0;
  S.prepared.length = 0;
  S.fired.length = 0;
  S.docs.set(`trips/${ID}`, trip);
  process.env.AUTH_SECRET = "s3cret";
  delete process.env.LISTINGS_BY;
});

describe("POST /api/trips/[id]/prepare", () => {
  it("needs sign-in", async () => {
    expect((await POST(req({}), ctx())).status).toBe(401);
  });

  it("refuses an id that is not a trip's and a trip that does not exist", async () => {
    expect((await POST(req(), ctx("nope"))).status).toBe(400);
    expect((await POST(req(), ctx("22222222-2222-2222-2222-222222222222"))).status).toBe(404);
  });

  it("does nothing for a trip that is over", async () => {
    S.docs.set(`trips/${ID}`, { ...trip, start: at(-48), end: at(-24) });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
    expect(S.later).toHaveLength(0);
  });

  it("starts the work after answering, and records that it is under way", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ started: true, prep: { state: "working" } });
    expect(S.docs.get(`prep/${ID}`)).toMatchObject({ state: "working" });
    expect(S.prepared).toEqual([]);
    await S.later[0]();
    expect(S.prepared).toEqual([ID]);
    expect(S.fired).toEqual([ID]);
  });

  it("does not start a second run while one is under way", async () => {
    S.docs.set(`prep/${ID}`, prep("working", at(-0.05)));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ started: false });
    expect(S.later).toHaveLength(0);
  });

  it("starts again after a failure, or when the earlier run has gone quiet", async () => {
    S.docs.set(`prep/${ID}`, prep("failed", at(-1)));
    expect((await POST(req(), ctx())).status).toBe(202);
    S.later.length = 0;
    S.docs.set(`prep/${ID}`, prep("working", at(-1)));
    expect((await POST(req(), ctx())).status).toBe(202);
    expect(S.later).toHaveLength(1);
  });
});
