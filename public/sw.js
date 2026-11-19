/* ARKHEIA DVE™ offline-shell service worker.
 *
 * Caches the static app shell ONLY. Verification traffic — /api/*, /risk/*,
 * and /health — is NEVER cached or intercepted, so every ClearCheck™ and
 * RiskCheck™ call is strictly live and deterministic.
 */
const CACHE_NAME = "arkheia-dve-shell-v1";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
];

// Paths that must always hit the network — never cached, never intercepted.
const NETWORK_ONLY_PREFIXES = ["/api/", "/risk/", "/health"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (e.g. the CPS backend or fonts).
  if (url.origin !== self.location.origin) return;

  // Never intercept verification/API traffic — stays strictly live.
  if (NETWORK_ONLY_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  // Navigations: network-first with cached shell fallback for offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets: cache-first, populate on miss (hashed Vite assets are
  // immutable, so this is safe).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (response.type === "basic" || response.type === "default")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
