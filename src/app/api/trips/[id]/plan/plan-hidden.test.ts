import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../../lib/store")>();
  return {
    ...real,
    getDoc: async (p: string) => S.docs.get(p) ?? null,
    setDoc: async (p: string, d: unknown) => void S.docs.set(p, d),
  };
});

import { GET, PUT } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const owner = () => ({ cookie: issueCookie().split(";")[0] });
const ctx = () => ({ params: Promise.resolve({ id: ID }) }) as RouteContext<"/api/trips/[id]/plan">;
const req = (method: string, body?: unknown) =>
  new Request(`https://x.test/api/trips/${ID}/plan`, { method, headers: owner(), body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  S.docs.clear();
  S.docs.set(`trips/${ID}`, { id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false });
  process.env.AUTH_SECRET = "s3cret";
});

describe("the plan route and hidden entries", () => {
  it("stores the hidden list with the plan and gives it back", async () => {
    const put = await PUT(req("PUT", { picks: [], starred: [], hidden: ["cccccccccccc"] }), ctx());
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ hidden: ["cccccccccccc"] });
    expect(await (await GET(req("GET"), ctx())).json()).toMatchObject({ hidden: ["cccccccccccc"] });
  });

  it("refuses a hidden list that is not ids, and stores nothing", async () => {
    const res = await PUT(req("PUT", { picks: [], starred: [], hidden: ["nope"] }), ctx());
    expect(res.status).toBe(400);
    expect(S.docs.has(`plans/${ID}`)).toBe(false);
  });
});
