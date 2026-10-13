import { beforeEach, describe, expect, it, vi } from "vitest";

const S = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("../../../lib/store", async (orig) => ({ ...(await orig<typeof import("../../../lib/store")>()), setDoc: async (p: string, d: unknown) => void S.docs.set(p, d) }));

import { POST } from "./route";
import { issueCookie } from "../../../lib/auth";

const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

beforeEach(() => {
  S.docs.clear();
  process.env.AUTH_SECRET = "s3cret";
});

describe("making a trip", () => {
  it("records at once that it is being got ready, so the board does not start the same work again", async () => {
    const res = await POST(
      new Request("https://x.test/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: issueCookie().split(";")[0] },
        body: JSON.stringify({ from: { label: "Montréal, QC" }, to: { label: "Québec, QC" }, start: iso(3), end: iso(5), roundTrip: false }),
      }),
    );
    const { id } = await res.json();
    expect(S.docs.get(`prep/${id}`)).toMatchObject({ tripId: id, state: "working" });
  });
});
