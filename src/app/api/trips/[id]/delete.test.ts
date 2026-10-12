import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../lib/store")>();
  return {
    ...real,
    deleteDoc: async (p: string) => {
      S.docs.delete(p);
    },
  };
});

import { DELETE } from "./route";
import { issueCookie } from "../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";
const ctx = () => ({ params: Promise.resolve({ id: ID }) }) as RouteContext<"/api/trips/[id]">;

beforeEach(() => {
  S.docs.clear();
  process.env.AUTH_SECRET = "s3cret";
});

describe("DELETE /api/trips/[id]", () => {
  it("deletes a trip's corridor along with the trip", async () => {
    S.docs.set(`trips/${ID}`, { id: ID });
    S.docs.set(`corridors/${ID}`, { tripId: ID });
    const res = await DELETE(
      new Request("https://x.test/", { method: "DELETE", headers: { cookie: issueCookie().split(";")[0] } }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(S.docs.has(`trips/${ID}`)).toBe(false);
    expect(S.docs.has(`corridors/${ID}`)).toBe(false);
  });
});
