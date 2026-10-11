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
grep -q "'app.js'" sw.js && grep -q "'vendor/leaflet.js'" sw.js || { echo "FAIL: sw.js не кешує оболонку"; exit 1; }
echo "SMOKE OK"
