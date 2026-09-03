#!/usr/bin/env bash
# psygames-sim-run · VER 1 · 03.09.2026
#
# 🔴 ЗАПУСК НА СИМУЛЯТОРЕ С ПРОВЕРКОЙ, ЧТО ЗАПУЩЕНО ИМЕННО ТО, ЧТО СОБРАНО.
#
# ЗАЧЕМ. 03.09.2026 я трижды «чинил» один дефект вёрстки, каждый раз пересобирал,
# ставил `xcrun simctl install`, смотрел кадр — кадр не менялся, и я делал вывод
# «правка не помогла». На четвёртый раз открыл Info.plist установленного
# приложения: 2.32.0, собрана НАКАНУНЕ. Сборка падала на шаге архива
# («failed to rename app … Directory not empty») и свежий артефакт не создавала, а
# `simctl install` молча ставил старый каталог. Три вывода подряд были сделаны по
# вчерашнему бинарнику.
#
# ⚠️ ИМЕНА ПЕРЕМЕННЫХ ТОЛЬКО ЛАТИНИЦЕЙ. Первая редакция звала их по-русски, и гейт
# `shell-scripts-ascii-vars` справедливо покраснел: bash на кириллическом имени падает
# молча — это уже стоило дня в другом проекте, и урок записан. Гейт поймал раньше, чем
# скрипт успел кого-нибудь подвести.
#
# ⚠️ ГЛАВНОЕ ЗДЕСЬ — НЕ СБОРКА, А ПОСЛЕДНЯЯ ПРОВЕРКА: версия в УСТАНОВЛЕННОМ пакете
# сверяется с package.json, и при расхождении скрипт падает. Пока её не было,
# «поставил» и «стоит» были разными фактами, а выглядели одним.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEVICE="${1:-iPhone 17 Pro Max}"
BUNDLE="com.psygames.app"
WANT="$(python3 -c "import json;print(json.load(open('frontend/package.json'))['version'])")"
echo "▶ версия в исходниках: $WANT"

UDID="$(xcrun simctl list devices available -j | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
for runtime, lst in d.items():
    for dev in lst:
        if dev['name'] == '''$DEVICE''': print(dev['udid']); raise SystemExit
raise SystemExit('устройство не найдено: $DEVICE')")"
echo "▶ симулятор: $DEVICE ($UDID)"
xcrun simctl boot "$UDID" 2>/dev/null || true

# ⚠️ Старый архив сносим ДО сборки: именно он валил её на шаге переименования,
# и именно из-за него оставался вчерашний артефакт.
rm -rf src-tauri/gen/apple/build/psygames_iOS.xcarchive src-tauri/gen/apple/build/arm64-sim

echo "▶ сборка веба"
( cd frontend && npx expo export --platform web --output-dir dist --clear >/dev/null 2>&1 )
echo "▶ сборка под симулятор"
cargo tauri ios build --debug --target aarch64-sim 2>&1 | tail -3 || true

APP="src-tauri/gen/apple/build/arm64-sim/PsyGames.app"
[ -d "$APP" ] || { echo "❌ артефакта нет: сборка не дошла до конца"; exit 1; }

BUILT="$(python3 -c "import plistlib;print(plistlib.load(open('$APP/Info.plist','rb'))['CFBundleShortVersionString'])")"
[ "$BUILT" = "$WANT" ] || { echo "❌ собрана $BUILT, а в исходниках $WANT — сборка взяла старое"; exit 1; }

xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
# ⚠️ БЕЗ `uninstall` ПО УМОЛЧАНИЮ: он стирает прогресс тестировщика — пройденные
# уровни, звёзды, профиль. За день это несколько партий, снесённых ради проверки
# вёрстки. Сносим только если обычная установка не прошла (сменилась подпись или
# структура пакета), и тогда говорим об этом вслух.
if ! xcrun simctl install "$UDID" "$APP" 2>/dev/null; then
  echo "⚠️  обычная установка не прошла — сношу приложение (прогресс на симуляторе будет стёрт)"
  xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl install "$UDID" "$APP"
fi

# 🔴 ПОСЛЕДНЯЯ И ГЛАВНАЯ ПРОВЕРКА: что реально СТОИТ на устройстве.
CONTAINER="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" app)"
INSTALLED="$(python3 -c "import plistlib;print(plistlib.load(open('$CONTAINER/Info.plist','rb'))['CFBundleShortVersionString'])")"
[ "$INSTALLED" = "$WANT" ] || { echo "❌ установлена $INSTALLED, а ожидалась $WANT — смотреть этот экран нельзя"; exit 1; }

xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
echo "✅ на симуляторе запущена $INSTALLED — это ровно то, что в исходниках"
