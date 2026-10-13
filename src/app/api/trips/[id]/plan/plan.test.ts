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
    setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
  };
});

import { GET, PUT } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const trip = (over: Record<string, unknown> = {}) => ({
  id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false, ...over,
});
const owner = () => ({ cookie: issueCookie().split(";")[0] });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]/plan">;
const req = (method: string, headers: Record<string, string> = owner(), body?: unknown) =>
  new Request(`https://x.test/api/trips/${ID}/plan`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const plan = { picks: [{ id: "aaaaaaaaaaaa" }], starred: ["bbbbbbbbbbbb"] };

beforeEach(() => {
  S.docs.clear();
  S.throws = false;
  S.docs.set(`trips/${ID}`, trip());
  process.env.AUTH_SECRET = "s3cret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/trips/[id]/plan", () => {
  it("needs sign-in", async () => {
    expect((await GET(req("GET", {}), ctx())).status).toBe(401);
  });

  it("is an empty plan before anything is picked", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tripId: ID, picks: [], starred: [] });
  });

  it("returns what was stored", async () => {
    await PUT(req("PUT", owner(), plan), ctx());
    expect(await (await GET(req("GET"), ctx())).json()).toMatchObject({ picks: [{ id: "aaaaaaaaaaaa" }], starred: ["bbbbbbbbbbbb"] });
  });

  it("refuses an id that is not a trip's", async () => {
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(400);
  });
});

describe("PUT /api/trips/[id]/plan", () => {
  it("needs sign-in", async () => {
    expect((await PUT(req("PUT", {}, plan), ctx())).status).toBe(401);
    expect(S.docs.has(`plans/${ID}`)).toBe(false);
  });

  it("stores the validated plan, stamped, and returns it", async () => {
    const res = await PUT(req("PUT", owner(), plan), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ tripId: ID, picks: [{ id: "aaaaaaaaaaaa" }], starred: ["bbbbbbbbbbbb"] });
    expect(typeof body.updatedAt).toBe("string");
    expect(S.docs.get(`plans/${ID}`)).toEqual(body);
  });

  it("refuses a bad plan without storing anything", async () => {
    const res = await PUT(req("PUT", owner(), { picks: [{ id: "x" }], starred: [] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("bad_plan");
    expect(S.docs.has(`plans/${ID}`)).toBe(false);
  });

  it("refuses a trip that does not exist, and one that is over", async () => {
    S.docs.delete(`trips/${ID}`);
    expect((await PUT(req("PUT", owner(), plan), ctx())).status).toBe(404);
    S.docs.set(`trips/${ID}`, trip({ start: at(-48), end: at(-24) }));
    const ended = await PUT(req("PUT", owner(), plan), ctx());
    expect(ended.status).toBe(409);
    expect((await ended.json()).code).toBe("trip_ended");
  });

  it("answers a store failure without the details", async () => {
    S.throws = true;
    const res = await PUT(req("PUT", owner(), plan), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("redis down");
  });
});
