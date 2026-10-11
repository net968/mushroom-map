// 🎯 Точна мітка: збирає GPS-заміри, усереднює і віддає боту через Telegram.WebApp.sendData.
import { average, quality, payload } from "./pinlib.js";

const $ = id => document.getElementById(id);
const TARGET_S = 60, MIN_N = 5;
const tg = () => window.Telegram && window.Telegram.WebApp;
try { tg() && (tg().ready(), tg().expand()); } catch (e) {}

let samples = [], t0 = Date.now(), last = null;
const fmt = v => v < 10 ? v.toFixed(1) : Math.round(v).toString();

function render() {
  const a = average(samples), secs = Math.round((Date.now() - t0) / 1000);
  $("prog").style.width = Math.min(100, 100 * secs / TARGET_S) + "%";
  if (!a) {
    $("big").textContent = "…";
    $("info").textContent = last ? `Сигнал слабкий (±${Math.round(last)} м) — чекаю GPS…` : "Шукаю супутники…";
    $("ok").disabled = true; return null;
  }
  $("big").textContent = `±${fmt(a.est)} м`;
  $("q").textContent = quality(a.est) + (a.est > 5 ? " — якщо можеш, відійди з-під густих крон і повернись" : "");
  $("info").innerHTML = `Замірів: ${a.n} з ${samples.length} · ${secs} с<br>GPS телефону зараз ±${fmt(last)} м, найкраще ±${fmt(a.best)} м`;
  $("coords").textContent = `${a.lat.toFixed(7)}, ${a.lon.toFixed(7)}`;
  $("ok").disabled = a.n < MIN_N;
  $("ok").textContent = a.n < MIN_N ? `✅ Поставити мітку (ще ${MIN_N - a.n} заміри)` :
    secs < TARGET_S ? `✅ Поставити мітку (краще почекати ${TARGET_S - secs} с)` : "✅ Поставити мітку";
  return a;
}

function add(lat, lon, acc) { last = acc; samples.push({ lat, lon, acc }); render(); }

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(p => add(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    err => { $("info").textContent = err.code === 1 ? "Дай Telegram доступ до геолокації (точної) і відкрий ще раз." : "GPS: " + err.message; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
} else {
  $("info").textContent = "Цей пристрій не віддає GPS сторінці.";
}
setInterval(render, 1000);

$("again").onclick = () => { samples = []; t0 = Date.now(); render(); };
$("ok").onclick = () => {
  const a = render(); if (!a || a.n < MIN_N) return;
  const w = tg();
  if (w && w.sendData && w.initData !== undefined) { try { w.sendData(payload(a)); return; } catch (e) {} }
  $("info").textContent = "Відкрий цю сторінку кнопкою «🎯 Точна мітка» в боті — тоді мітка збережеться. Координати:";
};
