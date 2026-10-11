import { test } from "node:test";
import assert from "node:assert/strict";
import { average, quality, payload } from "../pinlib.js";

const M = 1 / 111195;                       // 1 м у градусах широти
const at = (dn, de, acc, lat = 48.2, lon = 23.4) => ({ lat: lat + dn * M, lon: lon + de * M / Math.cos(lat * Math.PI / 180), acc });

test("average: шум навколо точки → середнє ближче за окремі заміри", () => {
  const pts = [[2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [0.5, -0.5], [-0.5, 0.5]];
  const a = average(pts.map(([n, e]) => at(n, e, 4)));
  assert.ok(Math.abs(a.lat - 48.2) / M < 0.05 && a.n === 10);
  assert.ok(a.est <= 2.0 && a.est >= 1.0, String(a.est));
});

test("average: погані заміри (Wi-Fi ±60 м, ±25 м при кращих ±4) відкидаються", () => {
  const s = [at(0, 0, 4), at(0.5, 0, 4), at(-0.5, 0, 5), at(30, 30, 25), at(200, 0, 60)];
  const a = average(s);
  assert.equal(a.n, 3); assert.equal(a.total, 5);
  assert.ok(Math.hypot((a.lat - 48.2) / M) < 0.5);
});

test("average: викид із нормальною точністю відсіюється", () => {
  const s = [0, 1, 2, 3, 4, 5, 6, 7].map(i => at(0.3 * Math.sin(i), 0.3 * Math.cos(i), 3)).concat([at(15, 0, 3)]);
  const a = average(s);
  assert.equal(a.n, 8);
  assert.ok(Math.abs(a.lat - 48.2) / M < 0.3);
});

test("average: порожньо / сміття → null", () => {
  assert.equal(average([]), null);
  assert.equal(average([{ lat: NaN, lon: 1, acc: 3 }, at(0, 0, 80)]), null);
});

test("quality і payload", () => {
  assert.equal(quality(1.5), "🟢 відмінно"); assert.equal(quality(4), "🟡 добре"); assert.equal(quality(9), "🔴 слабкий сигнал");
  const p = JSON.parse(payload({ lat: 48.123456789, lon: 23.987654321, est: 1.234, best: 3.21, n: 12 }));
  assert.deepEqual(p, { t: "pin", lat: 48.1234568, lon: 23.9876543, acc: 1.2, best: 3.2, n: 12 });
});
