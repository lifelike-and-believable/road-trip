import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../../../../lib/store", async (orig) => ({ ...(await orig<typeof import("../../../../../lib/store")>()), getDoc: async (p: string) => S.docs.get(p) ?? null }));

import { GET } from "./route";
import { issueCookie } from "../../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const get = () => GET(new Request(`https://x.test/api/trips/${ID}/board`, { headers: { cookie: issueCookie().split(";")[0] } }), { params: Promise.resolve({ id: ID }) } as RouteContext<"/api/trips/[id]/board">);

beforeEach(() => {
  S.docs.clear();
  S.docs.set(`trips/${ID}`, { id: ID, createdAt: at(-1), from: { label: "A" }, to: { label: "B" }, start: at(24), end: at(96), roundTrip: false });
  process.env.AUTH_SECRET = "s3cret";
});

describe("GET /api/trips/[id]/board", () => {
  it("carries the record of getting the trip ready, or null when there is none", async () => {
    expect((await (await get()).json()).prep).toBeNull();
    S.docs.set(`prep/${ID}`, { tripId: ID, state: "working", startedAt: at(0), updatedAt: at(0) });
    expect((await (await get()).json()).prep).toMatchObject({ state: "working" });
  });
});
