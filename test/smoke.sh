#!/bin/bash
# Смоук: headless Chromium відкриває сторінку з фікстурою; перевіряємо плями, номери, статус, SW-оболонку.
set -e
cd "$(dirname "$0")/.."
PORT=8765
python3 -m http.server $PORT >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
FRAG=$(python3 -c "import json;print(json.load(open('test/fixture-v1.json'))['fragment'])")
DOM=$(chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=8000 --dump-dom "http://localhost:$PORT/#$FRAG" 2>/dev/null)
echo "$DOM" | grep -q 'zone-label' || { echo "FAIL: немає номерів зон"; exit 1; }
echo "$DOM" | grep -q 'leaflet-interactive' || { echo "FAIL: немає плям"; exit 1; }
echo "$DOM" | grep -q 'id="status"' || { echo "FAIL: немає рядка статусу"; exit 1; }
BAD=$(chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=4000 --dump-dom "http://localhost:$PORT/#v1.@@@" 2>/dev/null)
echo "$BAD" | grep -q 'Посилання пошкоджене' || { echo "FAIL: немає повідомлення про пошкоджене посилання"; exit 1; }
TGF=$(chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=8000 --dump-dom "http://localhost:$PORT/#$FRAG?tgWebAppData=abc&tgWebAppVersion=9.6" 2>/dev/null)
echo "$TGF" | grep -q 'zone-label' || { echo "FAIL: параметри Telegram ламають посилання"; exit 1; }
XSS=$(node -e '
const z=require("zlib");const j={c:[4824230,2343000],r:2,d:"2026-10-10",z:[{n:"<img src=x onerror=document.body.dataset.pwned=1>",p:40,a:null,s:[],o:[0,0,10,0,0,10]}]};
process.stdout.write("v1."+z.deflateRawSync(Buffer.from(JSON.stringify(j))).toString("base64url"))')
XD=$(chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "http://localhost:$PORT/#$XSS" 2>/dev/null)
echo "$XD" | grep -q 'Посилання пошкоджене' || { echo "FAIL: XSS-посилання не відхилено"; exit 1; }
echo "$XD" | grep -q 'data-pwned' && { echo "FAIL: XSS виконався"; exit 1; }
grep -q "'app.js'" sw.js && grep -q "'vendor/leaflet.js'" sw.js || { echo "FAIL: sw.js не кешує оболонку"; exit 1; }
PIN=$(chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=4000 --dump-dom "http://localhost:$PORT/pin.html" 2>/dev/null)
echo "$PIN" | grep -q 'Точна мітка знахідки' || { echo "FAIL: pin.html не відкрилась"; exit 1; }
echo "$PIN" | grep -q 'id="ok" disabled' || { echo "FAIL: кнопка мітки активна без замірів"; exit 1; }
echo "SMOKE OK"
