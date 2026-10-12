import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanPath, deleteDoc, getDoc, listDocs, setDoc } from "./store";

type Call = { url: string; body: unknown };
let calls: Call[];
let replies: unknown[];

beforeEach(() => {
  calls = [];
  replies = [];
  process.env.DOC_SALT = "SALT";
  process.env.KV_REST_API_URL = "https://redis.test/";
  process.env.KV_REST_API_TOKEN = "tok";
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => replies.shift() };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DOC_SALT;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("cleanPath", () => {
  it("accepts plain paths and trims slashes", () => {
    expect(cleanPath("/trips/abc-1/")).toBe("trips/abc-1");
  });
  it("rejects traversal, odd characters, empty and long paths", () => {
    for (const p of ["../x", "a/../b", "a//b", "a b", "a?b", "", null, "x".repeat(201)]) {
      expect(cleanPath(p)).toBeNull();
    }
  });
});

describe("documents", () => {
  it("sets a document and adds its id to the collection, under the salt", async () => {
    replies = [[{ result: "OK" }, { result: 1 }]];
    await setDoc("trips/t1", { a: 1 });
    expect(calls[0].url).toBe("https://redis.test/pipeline");
    expect(calls[0].body).toEqual([
      ["SET", "doc:SALT:trips/t1", '{"a":1}'],
      ["SADD", "col:SALT:trips", "t1"],
    ]);
  });

  it("reads a stored document back", async () => {
    replies = [{ result: '{"a":1}' }];
    expect(await getDoc("trips/t1")).toEqual({ a: 1 });
    expect(calls[0].url).toBe("https://redis.test");
    expect(calls[0].body).toEqual(["GET", "doc:SALT:trips/t1"]);
  });

  it("returns null for a missing or unparseable document", async () => {
    replies = [{ result: null }, { result: "{oops" }];
    expect(await getDoc("trips/a")).toBeNull();
    expect(await getDoc("trips/b")).toBeNull();
  });

  it("deletes a document and its collection entry", async () => {
    replies = [[{ result: 1 }, { result: 1 }]];
    await deleteDoc("trips/t1");
    expect(calls[0].body).toEqual([
      ["DEL", "doc:SALT:trips/t1"],
      ["SREM", "col:SALT:trips", "t1"],
    ]);
  });

  it("lists a collection and drops members whose document is gone", async () => {
    replies = [
      { result: ["a", "b"] },
      [{ result: '{"n":1}' }, { result: null }],
      [{ result: 1 }],
    ];
    const out = await listDocs("trips");
    expect(out).toEqual([{ id: "a", data: { n: 1 } }]);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].body).toEqual([["SREM", "col:SALT:trips", "b"]]);
  });

  it("lists an empty collection without a second call", async () => {
    replies = [{ result: [] }];
    expect(await listDocs("trips")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("throws when Redis reports an error", async () => {
    replies = [{ error: "WRONGTYPE" }];
    await expect(getDoc("trips/t1")).rejects.toThrow("WRONGTYPE");
  });

  it("throws a clear message when configuration is missing", async () => {
    delete process.env.DOC_SALT;
    await expect(getDoc("trips/t1")).rejects.toThrow("DOC_SALT is not set");
    process.env.DOC_SALT = "SALT";
    delete process.env.KV_REST_API_URL;
    await expect(getDoc("trips/t1")).rejects.toThrow("Redis is not configured");
  });
});
