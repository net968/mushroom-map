// 🎯 Точна мітка знахідки (11.10.2026): усереднення серії GPS-замірів. Без DOM — тестується node --test.
// Телефонний GPS сам по собі дає ±3–10 м; середнє з кращих замірів за хвилину стоячи — ~1–3 м.
// 0.5 м без RTK-приймача недосяжні: систематичну похибку (відбиття від крон/схилів) усереднення не прибирає.
const R = 6371000;
const fin = v => typeof v === "number" && Number.isFinite(v);

export const MAX_ACC = 50;          // гірше — це вже Wi-Fi/вишки, не GPS

export function average(samples) {
  const ok = (samples || []).filter(s => s && fin(s.lat) && fin(s.lon) && fin(s.acc) && s.acc > 0 && s.acc <= MAX_ACC);
  if (!ok.length) return null;
  const best = Math.min(...ok.map(s => s.acc));
  let keep = ok.filter(s => s.acc <= Math.max(best * 2, best + 3));
  const lat0 = keep[0].lat, lon0 = keep[0].lon, kx = Math.PI / 180 * R * Math.cos(lat0 * Math.PI / 180), ky = Math.PI / 180 * R;
  const xy = s => [(s.lon - lon0) * kx, (s.lat - lat0) * ky];
  const mean = arr => { let sw = 0, x = 0, y = 0;
    for (const s of arr) { const w = 1 / (s.acc * s.acc), p = xy(s); sw += w; x += w * p[0]; y += w * p[1]; }
    return [x / sw, y / sw]; };
  const rms = (arr, m) => Math.sqrt(arr.reduce((a, s) => { const p = xy(s); return a + (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2; }, 0) / arr.length);
  let m = mean(keep), sp = rms(keep, m);
  for (let pass = 0; pass < 2 && keep.length >= 5; pass++) {   // відсів викидів: поріг від МЕДІАНИ відстаней
    const d = keep.map(s => { const p = xy(s); return Math.hypot(p[0] - m[0], p[1] - m[1]); });
    const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
    const lim = Math.max(4 * med, best);
    const k2 = keep.filter((s, i) => d[i] <= lim);
    if (k2.length < 3 || k2.length === keep.length) break;
    keep = k2; m = mean(keep); sp = rms(keep, m);
  }
  const n = keep.length;
  const est = Math.max(n >= 10 ? best / 2 : best / Math.sqrt(Math.min(n, 4)), sp / Math.sqrt(n));
  return { lat: lat0 + m[1] / ky, lon: lon0 + m[0] / kx, n, total: samples.length, best, spread: sp, est };
}

export function quality(est) {
  if (!fin(est)) return "";
  if (est <= 2) return "🟢 відмінно";
  if (est <= 5) return "🟡 добре";
  return "🔴 слабкий сигнал";
}

export function payload(a) {
  const r = (v, d) => Number(v.toFixed(d));
  return JSON.stringify({ t: "pin", lat: r(a.lat, 7), lon: r(a.lon, 7), acc: r(a.est, 1), best: r(a.best, 1), n: a.n });
}
