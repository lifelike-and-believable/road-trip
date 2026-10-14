import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

const redis = async () => (await (await GET(new Request("https://x.test/"))).json()).config.redis;

// The store needs its address and its token; with either missing every read fails, so health must not say it is set.
describe("GET /api/health reports the store", () => {
  it("as set only when both its address and its token are", async () => {
    process.env.KV_REST_API_URL = "https://redis.test";
    expect(await redis()).toBe(false);
    process.env.KV_REST_API_TOKEN = "t";
    expect(await redis()).toBe(true);
  });

  it("under either pair of names Vercel and Upstash use", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    expect(await redis()).toBe(true);
  });
});
