import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

type Handler = (event: unknown) => void;

/** Runs the worker in a sandbox with a fake `self`, `caches` and `fetch`, and returns what it registered. */
function load(fetchImpl: (req: Request) => Promise<Response> = async () => new Response("net")) {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: Request | string) => m.get(typeof r === "string" ? r : new URL(r.url).pathname)?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(typeof r === "string" ? r : new URL(r.url).pathname, res.clone()),
      addAll: async (urls: string[]) => void urls.forEach((u) => m.set(u, new Response(`cached ${u}`))),
    };
  };
  const caches = {
    open: async (n: string) => cache(n),
    match: async (r: Request | string) => {
      for (const n of stores.keys()) {
        const hit = await cache(n).match(r);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const self = {
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: "https://app.test" },
  };
  const fetchSpy = vi.fn(fetchImpl);
  vm.runInNewContext(source, { self, caches, fetch: fetchSpy, URL, Response, Request, Promise });
  return { handlers, caches, fetchSpy, self, stores };
}

/** Fires a fetch event and returns what the worker answered, or null if it left the request alone. */
async function dispatch(handlers: Record<string, Handler>, url: string, init: { method?: string; mode?: RequestMode } = {}) {
  const request = Object.assign(new Request(url, { method: init.method ?? "GET" }), {});
  Object.defineProperty(request, "mode", { value: init.mode ?? "no-cors" });
  let answered: Promise<Response> | null = null;
  handlers.fetch({ request, respondWith: (p: Promise<Response>) => void (answered = p) });
  return answered ? await (answered as Promise<Response>) : null;
}

describe("the service worker", () => {
  it("never touches /api, whatever the method", async () => {
    const { handlers, fetchSpy } = load();
    expect(await dispatch(handlers, "https://app.test/api/trips")).toBeNull();
    expect(await dispatch(handlers, "https://app.test/api/trips/x/board")).toBeNull();
    expect(await dispatch(handlers, "https://app.test/api/trips", { method: "POST" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves other requests that are not page loads or built files alone", async () => {
    const { handlers } = load();
    expect(await dispatch(handlers, "https://other.test/_next/static/a.js")).toBeNull();
    expect(await dispatch(handlers, "https://tile.openstreetmap.org/5/10/10.png")).toBeNull();
    expect(await dispatch(handlers, "https://app.test/trips/abc")).toBeNull();
    expect(await dispatch(handlers, "https://app.test/", { method: "POST", mode: "navigate" })).toBeNull();
  });

  it("keeps built files and serves them from the cache next time", async () => {
    let calls = 0;
    const { handlers } = load(async () => new Response(`v${++calls}`));
    const first = await dispatch(handlers, "https://app.test/_next/static/chunks/a.js");
    expect(await first!.text()).toBe("v1");
    const second = await dispatch(handlers, "https://app.test/_next/static/chunks/a.js");
    expect(await second!.text()).toBe("v1");
    expect(calls).toBe(1);
  });

  it("does not keep a built file the network refused", async () => {
    const { handlers, stores } = load(async () => new Response("nope", { status: 404 }));
    await dispatch(handlers, "https://app.test/_next/static/chunks/gone.js");
    expect([...stores.values()].every((m) => m.size === 0)).toBe(true);
  });

  it("shows the offline page, and only then, when a page load cannot reach the network", async () => {
    const online = load();
    const ok = await dispatch(online.handlers, "https://app.test/", { mode: "navigate" });
    expect(await ok!.text()).toBe("net");

    const offline = load(async () => {
      throw new TypeError("offline");
    });
    let installed: Promise<unknown> = Promise.resolve();
    offline.handlers.install({ waitUntil: (p: Promise<unknown>) => void (installed = p) });
    await installed;
    const res = await dispatch(offline.handlers, "https://app.test/trips/abc", { mode: "navigate" });
    expect(await res!.text()).toBe("cached /offline.html");
  });

  it("takes over at once and removes caches of an older version", async () => {
    const { handlers, self, stores, caches } = load();
    await caches.open("road-trip-v0-old");
    let waited: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => void (waited = p) });
    await waited;
    expect(self.skipWaiting).toHaveBeenCalled();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => void (waited = p) });
    await waited;
    expect(self.clients.claim).toHaveBeenCalled();
    expect([...stores.keys()]).not.toContain("road-trip-v0-old");
  });
});
