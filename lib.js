// Чисті функції інтерактивної карти (етап 3, 10.10.2026). Без DOM — тестується node --test.
export class BadLink extends Error {}

export const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const tileUrl = ({ z, x, y }) => TILE_URL.replace("{z}", z).replace("{y}", y).replace("{x}", x);

function b64urlToBytes(s) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new BadLink("bad base64");
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, ch => ch.charCodeAt(0));
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder().decode(buf);
}

const fin = v => typeof v === "number" && Number.isFinite(v);
const bad = m => { throw new BadLink(m); };

export async function decode(hash) {
  const h = (hash || "").replace(/^#/, "").split(/[?&]/)[0];      // Telegram дописує свої параметри після payload
  if (!h.startsWith("v1.") || h.length < 5) throw new BadLink("unknown format");
  let j;
  try { j = JSON.parse(await inflateRaw(b64urlToBytes(h.slice(3)))); }
  catch (e) { throw e instanceof BadLink ? e : new BadLink(String(e)); }
  if (!j || typeof j !== "object") bad("bad payload");
  if (!Array.isArray(j.c) || j.c.length !== 2 || !j.c.every(fin)) bad("bad c");
  if (!fin(j.r) || !(j.r > 0)) bad("bad r");
  if (typeof j.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(j.d)) bad("bad d");
  if (!Array.isArray(j.z)) bad("bad z");
  const zones = j.z.map(z => {
    if (!z || typeof z !== "object") bad("bad zone");
    if (!Number.isInteger(z.n) || z.n < 1 || z.n > 99) bad("bad n");
    if (!fin(z.p) || z.p < 0 || z.p > 100) bad("bad p");
    if (z.a != null && (!fin(z.a) || z.a < 0)) bad("bad a");
    if (z.s != null && (!Array.isArray(z.s) || z.s.length > 10 || !z.s.every(x => typeof x === "string" && x.length <= 60))) bad("bad s");
    if (z.o != null && (!Array.isArray(z.o) || z.o.length < 6 || z.o.length % 2 || !z.o.every(Number.isInteger))) bad("bad o");
    let ring = null;
    if (z.o) {
      ring = []; let cur = j.c.slice();
      for (let k = 0; k < z.o.length; k += 2) { cur = [cur[0] + z.o[k], cur[1] + z.o[k + 1]]; ring.push([cur[0] / 1e5, cur[1] / 1e5]); }
    }
    const c = ring ? [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length] : null;
    return { n: z.n, p: z.p, a: z.a ?? null, s: z.s || [], ring, c };
  });
  return { c: [j.c[0] / 1e5, j.c[1] / 1e5], r: j.r, d: j.d, zones };
}

export const colour = p => (p >= 55 ? "#2ecc40" : p >= 30 ? "#ffc800" : "#ff783c");

const K = 111320;
const xy = (ref, p) => [(p[1] - ref[1]) * K * Math.cos(ref[0] * Math.PI / 180), (p[0] - ref[0]) * K];

export function pointInRing(pt, ring) {
  const ps = ring.map(p => xy(pt, p)); let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [xi, yi] = ps[i], [xj, yj] = ps[j];
    if ((yi > 0) !== (yj > 0) && 0 < (xj - xi) * (0 - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function nearestOnRing(pt, ring) {
  const ps = ring.map(p => xy(pt, p)); let best = null;
  for (let i = 0; i < ps.length; i++) {
    const [ax, ay] = ps[i], [bx, by] = ps[(i + 1) % ps.length], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (!best || d < best.dist) best = { dist: d, x, y };
  }
  return { lat: pt[0] + best.y / K, lon: pt[1] + best.x / (K * Math.cos(pt[0] * Math.PI / 180)), dist: best.dist };
}

const DIRS = ["пн", "пн-сх", "сх", "пд-сх", "пд", "пд-зх", "зх", "пн-зх"];
export function bearingName(from, to) {
  const [x, y] = xy(from, to);
  const ang = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  return DIRS[Math.floor((ang + 22.5) / 45) % 8];
}

export const fmtDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1)} км`);

export function statusLine(pos, zones) {
  if (!pos) return "увімкни геолокацію для відстаней";
  let best = null;
  for (const z of zones) {
    if (!z.ring) continue;
    if (pointInRing(pos, z.ring)) return `🍄 ти в зоні ${z.n}`;
    const e = nearestOnRing(pos, z.ring);
    if (!best || e.dist < best.e.dist) best = { z, e };
  }
  if (!best) return "";
  return `до зони ${best.z.n} — ${fmtDist(best.e.dist)} на ${bearingName(pos, [best.e.lat, best.e.lon])}`;
}

function tile(lat, lon, z) {
  const n = 2 ** z;
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n];
}

export function tilesForCircle(lat, lon, rKm, zmin = 13, zmax = 17, cap = 1500) {
  const R = rKm * 1000 * 1.15;
  for (let top = zmax; top >= zmin; top--) {
    const out = [];
    for (let z = zmin; z <= top; z++) {
      const mpt = 156543.03 * Math.cos(lat * Math.PI / 180) / 2 ** z * 256;       // метрів у плитці
      const [cx, cy] = tile(lat, lon, z), span = R / mpt;
      for (let x = Math.floor(cx - span); x <= Math.floor(cx + span); x++)
        for (let y = Math.floor(cy - span); y <= Math.floor(cy + span); y++) {
          const nx = Math.max(x, Math.min(cx, x + 1)), ny = Math.max(y, Math.min(cy, y + 1));   // найближча точка плитки до центру
          if (Math.hypot(nx - cx, ny - cy) * mpt <= R) out.push({ z, x, y });
        }
    }
    if (out.length <= cap) return out;
  }
  return [];
}
