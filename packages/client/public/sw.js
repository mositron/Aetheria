// Minimal "network-first, cache fallback" service worker so the game can
// be installed as a PWA and load offline (after first visit).
const CACHE = "aetheria-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Don't intercept the WebSocket or auth requests
  const url = new URL(req.url);
  if (url.pathname.startsWith("/auth") || url.protocol === "ws:" || url.protocol === "wss:") return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful basic responses
        if (res.ok && (req.destination === "script" || req.destination === "style" || req.destination === "image" || req.destination === "font" || req.destination === "document")) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || new Response("offline", { status: 503 })))
  );
});
