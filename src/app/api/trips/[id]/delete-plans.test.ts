import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ deleted: [] as string[] }));

vi.mock("../../../../lib/store", async (orig) => {
  const real = await orig<typeof import("../../../../lib/store")>();
  return { ...real, deleteDoc: async (p: string) => void S.deleted.push(p) };
});

import { DELETE } from "./route";
import { issueCookie } from "../../../../lib/auth";

const ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  S.deleted.length = 0;
  process.env.AUTH_SECRET = "s3cret";
});

describe("DELETE /api/trips/[id]", () => {
  it("removes the plan with the trip, so no picks outlive it", async () => {
    const res = await DELETE(
      new Request("https://x.test/", { method: "DELETE", headers: { cookie: issueCookie().split(";")[0] } }),
      { params: Promise.resolve({ id: ID }) } as RouteContext<"/api/trips/[id]">,
    );
    expect(res.status).toBe(200);
    expect(S.deleted).toContain(`plans/${ID}`);
  });
});
