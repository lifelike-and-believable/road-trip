import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => S.docs.get(p) ?? null,
    setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
    deleteDoc: async (p: string) => void S.docs.delete(p),
    listDocs: async (c: string) =>
      [...S.docs].filter(([k]) => k.startsWith(`${c}/`)).map(([k, data]) => ({ id: k.split("/").pop()!, data })),
  };
});
vi.mock("../../lib/anthropic", () => ({ makeAsk: () => vi.fn(), askModel: () => "m" }));
vi.mock("../../lib/corridor", async (orig) => ({ ...(await orig<object>()), buildCorridor: vi.fn() }));

import { issueCookie } from "../../lib/auth";
import * as trips from "./trips/route";
import * as trip from "./trips/[id]/route";
import * as plan from "./trips/[id]/plan/route";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const ctx = { params: Promise.resolve({ id: ID }) };
const asCtx = <T>() => ctx as unknown as T;

const call = (method: string, headers: Record<string, string>, body?: unknown) =>
  new Request(`https://x.test/api/x`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  S.docs.clear();
  S.docs.set(`trips/${ID}`, {
    id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false,
  });
  S.docs.set(`plans/${ID}`, { tripId: ID, updatedAt: at(-1), picks: [], starred: ["x"] });
  process.env.AUTH_SECRET = "s3cret";
  process.env.REFRESH_SECRET = "refresh-secret";
  process.env.CRON_SECRET = "cron-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/* The refresh and cron tokens are for the daily job and the build steps it shares.
   Making, deleting and planning a trip belong to the traveller, so a leaked job token
   cannot wipe or rewrite them. */
describe("what the job's tokens cannot do", () => {
  for (const token of ["refresh-secret", "cron-secret"]) {
    it(`${token} cannot make a trip, delete one, or change its plan`, async () => {
      const job = { authorization: `Bearer ${token}` };
      const denied = [
        await trips.POST(call("POST", job, { from: "A" })),
        await trip.DELETE(call("DELETE", job), asCtx<Parameters<typeof trip.DELETE>[1]>()),
        await plan.PUT(call("PUT", job, { picks: [], starred: [] }), asCtx<Parameters<typeof plan.PUT>[1]>()),
      ];
      expect(denied.map((r) => r.status)).toEqual([401, 401, 401]);
      expect(S.docs.has(`trips/${ID}`)).toBe(true);
      expect(S.docs.get(`plans/${ID}`)).toMatchObject({ starred: ["x"] });
    });
  }

  it("a signed-in traveller still can", async () => {
    const owner = { cookie: issueCookie().split(";")[0] };
    const res = await plan.PUT(call("PUT", owner, { picks: [], starred: [] }), asCtx<Parameters<typeof plan.PUT>[1]>());
    expect(res.status).toBe(200);
    expect((await trip.DELETE(call("DELETE", owner), asCtx<Parameters<typeof trip.DELETE>[1]>())).status).toBe(200);
  });
});
