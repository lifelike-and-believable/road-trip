import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  throws: false,
}));

vi.mock("../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => {
      if (S.throws) throw new Error("redis down");
      return S.docs.get(p) ?? null;
    },
    setDoc: async (p: string, d: unknown) => {
      if (S.throws) throw new Error("redis down");
      S.docs.set(p, d);
    },
    deleteDoc: async (p: string) => {
      S.docs.delete(p);
    },
    listDocs: async (c: string) => {
      if (S.throws) throw new Error("redis down");
      return [...S.docs.entries()]
        .filter(([k]) => k.startsWith(`${c}/`))
        .map(([k, data]) => ({ id: k.slice(c.length + 1), data }));
    },
  };
});

// `after` only works inside a running request; the work it schedules is tested in new-trip.test.ts.
vi.mock("next/server", () => ({ after: () => {} }));

import { GET as list, POST as create } from "./route";
import { DELETE as remove, GET as read } from "./[id]/route";
import { issueCookie } from "../../../lib/auth";

const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const body = (over: Record<string, unknown> = {}) => ({
  from: { label: "Montréal, QC" },
  to: { label: "Québec, QC" },
  start: iso(3),
  end: iso(5),
  roundTrip: false,
  ...over,
});

const signedIn = () => ({ cookie: issueCookie().split(";")[0] });
const post = (b: unknown, headers: Record<string, string> = signedIn()) =>
  new Request("https://x.test/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });
const get = (headers: Record<string, string> = signedIn()) => new Request("https://x.test/api/trips", { headers });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/trips/[id]">;

beforeEach(() => {
  S.docs.clear();
  S.throws = false;
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "job-secret";
});

describe("POST /api/trips", () => {
  it("refuses a request that is not signed in", async () => {
    const res = await create(post(body(), {}));
    expect(res.status).toBe(401);
    expect(S.docs.size).toBe(0);
  });

  it("creates and stores a trip, returning it with an id and status", async () => {
    const res = await create(post(body({ roundTrip: true })));
    expect(res.status).toBe(201);
    const t = await res.json();
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.status).toBe("upcoming");
    expect(t.legs.map((l: { id: string }) => l.id)).toEqual(["out", "back"]);
    expect(S.docs.get(`trips/${t.id}`)).toMatchObject({ id: t.id, from: { label: "Montréal, QC" } });
  });

  it("does not store the derived status or legs", async () => {
    const t = await (await create(post(body()))).json();
    const stored = S.docs.get(`trips/${t.id}`) as Record<string, unknown>;
    expect(stored).not.toHaveProperty("status");
    expect(stored).not.toHaveProperty("legs");
  });

  it("answers 400 with the reasons for invalid input", async () => {
    const res = await create(post(body({ end: iso(1), start: iso(2) })));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("end must be after start");
    expect(S.docs.size).toBe(0);
  });

  it("answers 400 for a body that is not JSON", async () => {
    expect((await create(post("{nope"))).status).toBe(400);
  });

  it("answers 413 for an oversized body", async () => {
    expect((await create(post(JSON.stringify({ pad: "x".repeat(20000) })))).status).toBe(413);
  });

  it("answers 500 without leaking the store error", async () => {
    S.throws = true;
    const res = await create(post(body()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/redis down/);
  });
});

describe("GET /api/trips", () => {
  it("refuses a request that is not signed in", async () => {
    expect((await list(get({}))).status).toBe(401);
  });

  it("lists trips soonest first, with each one's status", async () => {
    await create(post(body({ start: iso(6), end: iso(7) })));
    await create(post(body({ start: iso(1), end: iso(2) })));
    const out = await (await list(get())).json();
    expect(out.trips).toHaveLength(2);
    expect(Date.parse(out.trips[0].start)).toBeLessThan(Date.parse(out.trips[1].start));
    expect(out.trips[0].status).toBe("upcoming");
  });

  it("shows an ended trip as ended, so it stays readable after it stops updating", async () => {
    S.docs.set("trips/old", { id: "old", createdAt: iso(-9), ...body({ start: iso(-5), end: iso(-4) }) });
    const out = await (await list(get())).json();
    expect(out.trips[0]).toMatchObject({ id: "old", status: "ended" });
  });
});

describe("GET and DELETE /api/trips/[id]", () => {
  it("reads one trip", async () => {
    const t = await (await create(post(body()))).json();
    const res = await read(get(), ctx(t.id));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(t.id);
  });

  it("answers 404 for an unknown id and 400 for a malformed one", async () => {
    expect((await read(get(), ctx("11111111-1111-1111-1111-111111111111"))).status).toBe(404);
    expect((await read(get(), ctx("../x"))).status).toBe(400);
  });

  it("requires sign-in to read or delete", async () => {
    const t = await (await create(post(body()))).json();
    expect((await read(get({}), ctx(t.id))).status).toBe(401);
    expect((await remove(get({}), ctx(t.id))).status).toBe(401);
    expect(S.docs.has(`trips/${t.id}`)).toBe(true);
  });

  it("deletes a trip", async () => {
    const t = await (await create(post(body()))).json();
    expect((await remove(get(), ctx(t.id))).status).toBe(200);
    expect(S.docs.has(`trips/${t.id}`)).toBe(false);
  });
});
