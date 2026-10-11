// Service worker: оболонка сторінки (precache при install) + плитки супутника з кешу.
const APP = "app-v2", TILES = "tiles-v1";
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
    if (req.mode === "navigate") {                                             // оболонка: мережа (≤3 с) → кеш
      const cachedShell = async () => (await app.match("index.html")) || (await app.match("./")) || Response.error();
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
        if (r.ok) app.put("index.html", r.clone()).catch(() => {});
        return r;
      } catch (err) { return cachedShell(); }
    }
    const isTile = req.url.includes("/World_Imagery/MapServer/tile/");
    if (isTile) {
      const hit = await tiles.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok) tiles.put(req, r.clone()).catch(() => {});                   // переглянуті онлайн — теж офлайн
        return r;
      } catch (err) { return Response.error(); }
    }
    const hit = await app.match(req, { ignoreSearch: true });                  // решта: stale-while-revalidate
    const net = fetch(req).then(r => { if (r.ok && new URL(req.url).origin === self.location.origin) app.put(req, r.clone()).catch(() => {}); return r; });
    if (hit) { net.catch(() => {}); return hit; }
    try { return await net; } catch (err) { return Response.error(); }
  })());
});
