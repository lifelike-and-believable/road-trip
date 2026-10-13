import { describe, expect, it, vi } from "vitest";
import { fireRoutine, routineFireConfig } from "./fire-routine";

const URL_OK = "https://api.anthropic.com/v1/claude_code/routines/trig_abc/fire";
const env = { ROUTINE_FIRE_URL: URL_OK, ROUTINE_FIRE_TOKEN: "tok" };

describe("routineFireConfig", () => {
  it("needs both settings, and an https address", () => {
    expect(routineFireConfig(env)).toEqual({ url: URL_OK, token: "tok" });
    expect(routineFireConfig({ ROUTINE_FIRE_URL: URL_OK })).toBeNull();
    expect(routineFireConfig({ ROUTINE_FIRE_TOKEN: "tok" })).toBeNull();
    expect(routineFireConfig({ ...env, ROUTINE_FIRE_URL: "http://api.anthropic.com/x" })).toBeNull();
    expect(routineFireConfig({ ...env, ROUTINE_FIRE_URL: "not a url" })).toBeNull();
  });
});

describe("fireRoutine", () => {
  it("posts the trip to the routine with its bearer token and the version header", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ type: "routine_fire" }), { status: 200 }));
    const result = await fireRoutine("trip-1", { env, fetch: fetcher as unknown as typeof fetch });
    expect(result).toEqual({ fired: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init.body)).text).toContain("trip-1");
  });

  it("does nothing when the routine is not set up", async () => {
    const fetcher = vi.fn();
    expect(await fireRoutine("trip-1", { env: {}, fetch: fetcher as unknown as typeof fetch })).toEqual({ fired: false, reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("says why when the routine refuses, without the response body or the token", async () => {
    const fetcher = vi.fn(async () => new Response("tok leaked here", { status: 429 }));
    const result = await fireRoutine("trip-1", { env, fetch: fetcher as unknown as typeof fetch });
    expect(result).toEqual({ fired: false, reason: "http_429" });
  });

  it("does not throw when the network fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await fireRoutine("trip-1", { env, fetch: fetcher as unknown as typeof fetch })).toEqual({ fired: false, reason: "network" });
  });

  it("does not wait forever", async () => {
    const fetcher = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    const result = await fireRoutine("trip-1", { env, fetch: fetcher as unknown as typeof fetch, timeoutMs: 20 });
    expect(result).toEqual({ fired: false, reason: "network" });
  });
});
