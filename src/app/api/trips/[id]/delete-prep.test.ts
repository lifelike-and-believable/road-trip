import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../../../lib/store", async (orig) => ({ ...(await orig<typeof import("../../../../lib/store")>()), deleteDoc: async (p: string) => void S.docs.delete(p) }));

import { DELETE } from "./route";
import { issueCookie } from "../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  S.docs.clear();
  process.env.AUTH_SECRET = "s3cret";
});

describe("DELETE /api/trips/[id]", () => {
  it("removes the record of getting the trip ready along with the rest", async () => {
    S.docs.set(`trips/${ID}`, { id: ID });
    S.docs.set(`prep/${ID}`, { tripId: ID });
    await DELETE(new Request("https://x.test/", { method: "DELETE", headers: { cookie: issueCookie().split(";")[0] } }), { params: Promise.resolve({ id: ID }) } as RouteContext<"/api/trips/[id]">);
    expect(S.docs.has(`prep/${ID}`)).toBe(false);
  });
});
