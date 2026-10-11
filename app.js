// Інтерактивна карта грибних зон (етап 3, 10.10.2026). Дані — лише з #фрагмента посилання.
import { decode, BadLink, colour, statusLine, nearestOnRing, pointInRing, fmtDist, bearingName, tilesForCircle, tileUrl, TILE_URL } from "./lib.js";

const $ = id => document.getElementById(id);
const TILES = "tiles-v1";
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fail(text) { const m = $("msg"); m.textContent = text; m.style.display = "flex"; }

function tg() { return window.Telegram && window.Telegram.WebApp; }
let tgDone = false;
function tgInit() {                                       // ідемпотентно
  const w = tg(); if (!w || tgDone) return;
  tgDone = true;
  try { w.ready(); w.expand(); w.disableVerticalSwipes && w.disableVerticalSwipes(); } catch (e) {}
}

async function main() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let dsOk = typeof DecompressionStream !== "undefined";
  if (dsOk) { try { new DecompressionStream("deflate-raw"); } catch (e) { dsOk = false; } }
  if (!dsOk) return fail("Онови Android System WebView — ця версія не вміє відкрити карту.");
  let data;
  try { data = await decode(location.hash); }
  catch (e) { return fail(e instanceof BadLink ? "Посилання пошкоджене — відкрий карту з бота ще раз." : "Помилка: " + e); }
  tgInit();                                               // скрипт Telegram вантажиться async:
  const tgScript = $("tg-script"); if (tgScript) tgScript.addEventListener("load", tgInit);
  for (let i = 1; i <= 20; i++) setTimeout(tgInit, i * 500);

  const map = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 13 }).setView(data.c, 15);
  const list = tilesForCircle(data.c[0], data.c[1], data.r);
  const nativeZ = list.length ? Math.max(...list.map(t => t.z)) : 17;
  L.tileLayer(TILE_URL, { maxZoom: 19, maxNativeZoom: nativeZ, crossOrigin: true, attribution: "Esri World Imagery" }).addTo(map);
  L.circle(data.c, { radius: data.r * 1000, color: "#fff", weight: 1.5, fill: false, interactive: false }).addTo(map);
  L.circleMarker(data.c, { radius: 6, color: "#fff", weight: 2, fillColor: "#1e90ff", fillOpacity: 1 }).addTo(map)
    .bindPopup(`📍 Точка аналізу · ${esc(data.d)}`);

  let pos = null;
  const bounds = L.latLngBounds([data.c]);
  for (const z of data.zones) {
    if (!z.ring) continue;
    const col = colour(z.p);
    const poly = L.polygon(z.ring, { color: col, weight: 3, fillColor: col, fillOpacity: 0.45 }).addTo(map);
    poly.bindPopup(() => {
      let d = "";
      if (pos) d = pointInRing(pos, z.ring) ? "<br>🍄 ти тут" : (() => { const e = nearestOnRing(pos, z.ring); return `<br>до краю ${fmtDist(e.dist)} на ${bearingName(pos, [e.lat, e.lon])}`; })();
      return `<b>Зона ${esc(Number(z.n))} · ${esc(Number(z.p))}%</b>${z.a ? ` · ~${esc(Number(z.a))} га` : ""}${z.s.length ? "<br>" + esc(z.s.join(", ").toLowerCase()) : ""}${d}`;
    });
    const top = z.ring.reduce((a, p) => (p[0] > a[0] ? p : a), z.ring[0]);
    L.marker([top[0], z.c[1]], { interactive: false,
      icon: L.divIcon({ className: "zone-label", html: `<b style="background:${col}">${esc(Number(z.n))}</b><i>${esc(Number(z.p))}%</i>`, iconSize: [0, 0] }) }).addTo(map);
    bounds.extend(poly.getBounds());
  }
  map.fitBounds(bounds.pad(0.15));

  // GPS: браузерний watchPosition; якщо відмовлено — Telegram LocationManager раз на 10 с
  let me = null, acc = null, tgFallback = false;
  const show = (lat, lon, a) => {
    pos = [lat, lon];
    if (!me) { me = L.circleMarker(pos, { radius: 8, color: "#fff", weight: 3, fillColor: "#1e90ff", fillOpacity: 1 }).addTo(map);
               acc = L.circle(pos, { radius: a || 0, color: "#1e90ff", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map); }
    me.setLatLng(pos); acc.setLatLng(pos).setRadius(a || 0);
    $("status").textContent = statusLine(pos, data.zones);
  };
  $("status").textContent = "шукаю GPS…";
  const noGeo = () => { if (!pos) $("status").textContent = statusLine(null, data.zones); };
  const tgPoll = () => {
    const lm = tg() && tg().LocationManager; if (!lm) return;
    lm.init(() => { if (!lm.isLocationAvailable) return;
      const tick = () => lm.getLocation(l => { if (l) show(l.latitude, l.longitude, l.horizontal_accuracy); });
      tick(); setInterval(tick, 10000); });
  };
  if (navigator.geolocation) navigator.geolocation.watchPosition(p => show(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    err => { noGeo(); if ((err.code === 1 || err.code === 2) && !tgFallback) { tgFallback = true; tgPoll(); } }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  else { noGeo(); tgPoll(); }
  $("me").onclick = () => { if (pos) map.setView(pos, Math.max(map.getZoom(), 16)); };

  // Офлайн: плитки кола в Cache Storage (service worker віддає їх без мережі)
  const saveBtn = $("save");
  const cached = async () => { const c = await caches.open(TILES); let n = 0;
    for (const t of list) if (await c.match(tileUrl(t), { ignoreVary: true })) n++; return n; };
  cached().then(n => { if (n === list.length) saveBtn.textContent = "✅ Офлайн"; }).catch(() => {});
  saveBtn.onclick = async () => {
    try { navigator.storage?.persist?.(); } catch (e) {}
    saveBtn.disabled = true; const c = await caches.open(TILES); let done = 0, ok = 0;
    const queue = list.slice();
    const worker = async () => { while (queue.length) { const t = queue.shift(), u = tileUrl(t);
      try { if (!(await c.match(u, { ignoreVary: true }))) { const r = await fetch(u, { mode: "cors" });
              if (!r.ok) throw new Error(r.status); await c.put(u, r); } ok++; } catch (e) {}
      done++; saveBtn.textContent = `💾 ${done}/${list.length}`; } };
    await Promise.all(Array.from({ length: 6 }, worker));
    saveBtn.textContent = ok === list.length ? "✅ Офлайн" : `⚠️ ${ok}/${list.length}`; saveBtn.disabled = false;
  };
}
main();
