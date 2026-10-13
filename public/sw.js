/* Road Trip's service worker. It does two things and nothing else:
   - keeps the built files under /_next/static/ (their names change with their content), so the app opens quickly;
   - shows /offline.html when a page cannot be loaded because there is no network.
   It never touches /api, any request that is not a GET to this site, or a page that loaded, so the board always
   shows what the server says and a pick is never answered from a stale copy. */
const CACHE = "road-trip-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("road-trip-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) =>
            response.ok ? caches.open(CACHE).then((cache) => cache.put(request, response.clone())).then(() => response) : response,
          ),
      ),
    );
  }
});
