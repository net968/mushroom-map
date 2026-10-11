// Service worker: оболонка сторінки (precache при install) + плитки супутника з кешу.
const APP = "app-v1", TILES = "tiles-v1";
const SHELL = ['./', 'index.html', 'app.js', 'lib.js', 'vendor/leaflet.js', 'vendor/leaflet.css'];
const TG = "https://telegram.org/js/telegram-web-app.js";

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(APP);
  await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));                 // по одному: збій одного не валить усе
  await c.put(TG, await fetch(TG, { mode: "no-cors" })).catch(() => {});
  self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("app-") && k !== APP) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith((async () => {
    const tiles = await caches.open(TILES), app = await caches.open(APP);
    const hit = (await tiles.match(req)) || (await app.match(req, { ignoreSearch: true }));
    if (req.mode === "navigate") {                                             // оболонка: мережа → кеш
      try { const r = await fetch(req); app.put("index.html", r.clone()); return r; }
      catch (err) { return (await app.match("index.html")) || (await app.match("./")) || Response.error(); }
    }
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (req.url.includes("/World_Imagery/MapServer/tile/")) tiles.put(req, r.clone());   // переглянуті онлайн — теж офлайн
      return r;
    } catch (err) { return Response.error(); }
  })());
});
