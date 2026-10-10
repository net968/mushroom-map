import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decode, BadLink, colour, pointInRing, nearestOnRing, bearingName, fmtDist, statusLine, tilesForCircle, tileUrl } from "../lib.js";

const fx = JSON.parse(readFileSync(new URL("./fixture-v1.json", import.meta.url)));
const RING = [[48.243, 23.43], [48.243, 23.431], [48.244, 23.431], [48.244, 23.43]];

test("decode: фікстура, згенерована ботом (Python)", async () => {
  const d = await decode("#" + fx.fragment);
  assert.deepEqual(d.c, fx.expect.c);
  assert.equal(d.r, 2); assert.equal(d.d, "2026-10-10");
  assert.equal(d.zones.length, 2);
  const [z1, z2] = d.zones;
  assert.deepEqual([z1.n, z1.p, z1.a, z1.s], [1, 34, 2.0, ["Опеньок осінній"]]);
  z1.ring.forEach((p, i) => { assert.ok(Math.abs(p[0] - fx.expect.zones[0].ring[i][0]) < 1e-9); assert.ok(Math.abs(p[1] - fx.expect.zones[0].ring[i][1]) < 1e-9); });
  assert.equal(z2.ring, null); assert.equal(z2.a, null);
});

test("decode: пошкоджені посилання → BadLink", async () => {
  for (const h of ["", "#", "#v1.", "#v1.@@@", "#v2.abc", "#v1." + fx.fragment.slice(3, 20)])
    await assert.rejects(decode(h), BadLink, h);
});

test("colour: межі як на PNG", () => {
  assert.equal(colour(55), "#2ecc40"); assert.equal(colour(54), "#ffc800");
  assert.equal(colour(30), "#ffc800"); assert.equal(colour(29), "#ff783c");
});

test("геометрія: точка в кільці, найближча точка краю, напрям", () => {
  assert.equal(pointInRing([48.2435, 23.4305], RING), true);
  assert.equal(pointInRing([48.2420, 23.4305], RING), false);
  const n = nearestOnRing([48.2420, 23.4305], RING);
  assert.ok(Math.abs(n.lat - 48.243) < 1e-9 && Math.abs(n.lon - 23.4305) < 1e-6);
  assert.ok(n.dist > 105 && n.dist < 117);
  assert.equal(bearingName([48.0, 23.0], [48.01, 23.0]), "пн");
  assert.equal(bearingName([48.0, 23.0], [47.99, 22.985]), "пд-зх");
  assert.equal(fmtDist(417), "420 м"); assert.equal(fmtDist(1234), "1.2 км"); assert.equal(fmtDist(4), "0 м");
});

test("statusLine: у плямі, найближча за краєм, зона без контуру ігнорується, без GPS", () => {
  const zones = [{ n: 3, p: 40, ring: RING, c: [48.2435, 23.4305] },
                 { n: 5, p: 33, ring: [[48.250, 23.4304], [48.250, 23.4306], [48.2501, 23.4305]], c: [48.25003, 23.4305] },
                 { n: 6, p: 31, ring: null, c: null }];
  assert.equal(statusLine([48.2435, 23.4305], zones), "🍄 ти в зоні 3");
  assert.equal(statusLine([48.2420, 23.4305], zones), "до зони 3 — 110 м на пн");
  assert.equal(statusLine([48.2520, 23.4305], zones), "до зони 5 — 210 м на пд");
  assert.equal(statusLine(null, zones), "увімкни геолокацію для відстаней");
  assert.equal(statusLine([48.2420, 23.4305], [zones[2]]), "");
});

test("tilesForCircle: 2 км — усі зуми, 5 км — обрізано до ліміту", () => {
  const t2 = tilesForCircle(48.2423, 23.4292, 2);
  assert.deepEqual([...new Set(t2.map(t => t.z))].sort(), [13, 14, 15, 16, 17]);
  assert.ok(t2.length > 200 && t2.length <= 1500);
  assert.equal(new Set(t2.map(t => `${t.z}/${t.x}/${t.y}`)).size, t2.length);
  const t5 = tilesForCircle(48.2423, 23.4292, 5);
  assert.ok(t5.length <= 1500 && Math.max(...t5.map(t => t.z)) < 17);
  assert.equal(tileUrl({ z: 16, x: 37031, y: 22785 }),
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/22785/37031");
});
