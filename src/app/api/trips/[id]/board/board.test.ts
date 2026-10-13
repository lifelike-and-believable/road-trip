import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>(), throws: false }));

vi.mock("../../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => {
      if (S.throws) throw new Error("redis down");
      return S.docs.get(p) ?? null;
    },
  };
});

import { GET } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const owner = () => ({ cookie: issueCookie().split(";")[0] });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/board">;
const req = (headers: Record<string, string> = owner()) => new Request(`https://x.test/api/trips/${ID}/board`, { headers });

beforeEach(() => {
  S.docs.clear();
  S.throws = false;
  S.docs.set(`trips/${ID}`, {
    id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false, tz: "America/Toronto",
  });
  process.env.AUTH_SECRET = "s3cret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/trips/[id]/board", () => {
  it("needs sign-in", async () => {
    expect((await GET(req({}), ctx())).status).toBe(401);
  });

  it("returns the trip with everything the board needs, and says what is not built yet", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip).toMatchObject({ id: ID, status: "upcoming", tz: "America/Toronto" });
    expect(body.corridor).toBeNull();
    expect(body.sources).toBeNull();
    expect(body.listings).toBeNull();
    expect(body.plan).toMatchObject({ tripId: ID, picks: [], starred: [] });
  });

  it("includes the corridor, the number of sources, the listings and the plan once they exist", async () => {
    S.docs.set(`corridors/${ID}`, { tripId: ID, legs: [] });
    S.docs.set(`sources/${ID}`, { tripId: ID, sources: [{ name: "a" }, { name: "b" }] });
    S.docs.set(`listings/${ID}`, { tripId: ID, updatedAt: at(-1), stops: {} });
    S.docs.set(`plans/${ID}`, { tripId: ID, updatedAt: at(-1), picks: [{ id: "aaaaaaaaaaaa" }], starred: [] });
    const body = await (await GET(req(), ctx())).json();
    expect(body.corridor).toEqual({ tripId: ID, legs: [] });
    expect(body.sources).toEqual({ count: 2 });
    expect(body.listings).toMatchObject({ tripId: ID });
    expect(body.plan.picks).toEqual([{ id: "aaaaaaaaaaaa" }]);
  });

  it("is 404 for a trip that does not exist and 400 for an id that is not a trip's", async () => {
    S.docs.delete(`trips/${ID}`);
    expect((await GET(req(), ctx())).status).toBe(404);
    expect((await GET(req(), ctx("nope"))).status).toBe(400);
  });

  it("answers a store failure without the details", async () => {
    S.throws = true;
    const res = await GET(req(), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("redis down");
  });
});
