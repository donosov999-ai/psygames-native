#!/usr/bin/env bash
# psygames-sim-run · VER 4 · 03.09.2026
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

# 🔴 ТРЕТИЙ СЛОЙ ТОЙ ЖЕ ЛОВУШКИ: BASEURL. В `app.json` стоит
# `baseUrl: "/psygames-web"` — он нужен зеркалу на GitHub Pages. Внутри приложения
# страницы отдаёт схема `tauri://localhost`, и ссылка `/psygames-web/_expo/…`
# указывает в пустоту: HTML отрисуется (он предрендерен), а НИ ОДИН скрипт не
# загрузится. Внешне это выглядит как полностью готовый экран, на котором просто
# ничего не нажимается: нажатия молчат, эффекты не идут, значки остаются
# квадратиками. Замер 03.09.2026: так и было — в WebView 404 на
# `/psygames-web/_expo/static/js/web/entry-*.js`.
# CI это знает и делает шаг «Build web for Tauri (baseUrl="")»; локальный запуск —
# не делал.
echo "▶ сборка веба (baseUrl пустой, как в CI)"
cp frontend/app.json /tmp/psygames-app.json.bak
sed -i '' 's|"baseUrl": "/psygames-web"|"baseUrl": ""|' frontend/app.json
( cd frontend && npx expo export --platform web --output-dir dist --clear >/dev/null 2>&1 ) || true
mv /tmp/psygames-app.json.bak frontend/app.json
grep -q '"baseUrl": "/psygames-web"' frontend/app.json || { echo "❌ app.json не вернулся к рабочему виду"; exit 1; }

# И проверяем, что в собранном index.html ссылки БЕЗ префикса зеркала.
grep -q '/psygames-web/_expo' frontend/dist/index.html && {
  echo "❌ в сборке остался префикс /psygames-web — внутри приложения скрипты не загрузятся"; exit 1; } || true

# 🔴 НАСТОЯЩАЯ ПРИЧИНА ВЧЕРАШНЕГО ЭКРАНА: TAURI БЕРЁТ ВЕБ НЕ ОТТУДА, КУДА ЕГО КЛАДЁТ
# СБОРКА. В `tauri.conf.json` стоит `frontendDist: "./dist"`, и путь этот
# ОТНОСИТЕЛЬНО `src-tauri/`, то есть `src-tauri/dist`. Expo же собирает в
# `frontend/dist`. CI это знает и переносит каталог перед каждой платформенной
# сборкой (`rm -rf src-tauri/dist && mv frontend/dist src-tauri/dist`), а локальный
# запуск — не знал.
#
# Замер 03.09.2026: `src-tauri/dist` лежал от 2 сентября 15:22 — то есть КАЖДАЯ
# локальная сборка с тех пор вшивала веб двухдневной давности, а `Info.plist`
# показывал свежую версию, потому что её правит сам Tauri CLI. Отсюда и три вывода
# «правка не помогла», сделанные по вчерашнему экрану, и последующая проверка
# версии, которая честно говорила «2.37.3» — она смотрела на надпись, а не на код.
# Поймано так: в словарь поставлена видимая метка, собралась в бандл (проверено
# грепом по `dist`), а на экране осталась старая строка.
#
# ⚠️ Синхронизируем КОПИЕЙ, а не `mv`: локально `frontend/dist` нужен и сам по себе
# (веб-гейты, first-paint-audit гоняются по нему).
rm -rf src-tauri/dist
cp -R frontend/dist src-tauri/dist

# И тронуть крейт, чтобы вшивание точно повторилось: cargo решает по своим
# признакам, а нам нужна гарантия.
touch src-tauri/src/*.rs src-tauri/build.rs 2>/dev/null || true
echo "▶ сборка под симулятор"
cargo tauri ios build --debug --target aarch64-sim 2>&1 | tail -3 || true

APP="src-tauri/gen/apple/build/arm64-sim/PsyGames.app"
[ -d "$APP" ] || { echo "❌ артефакта нет: сборка не дошла до конца"; exit 1; }

BUILT="$(python3 -c "import plistlib;print(plistlib.load(open('$APP/Info.plist','rb'))['CFBundleShortVersionString'])")"
[ "$BUILT" = "$WANT" ] || { echo "❌ собрана $BUILT, а в исходниках $WANT — сборка взяла старое"; exit 1; }

# 🔴 И ОТДЕЛЬНО — ЧТО ВНУТРИ СВЕЖЕЕ, А НЕ ТОЛЬКО НАДПИСЬ СНАРУЖИ. Библиотека со
# вшитыми страницами обязана быть НОВЕЕ веб-сборки: иначе в приложении лежит
# прошлый `dist`, а версия в plist всё равно совпадёт.
# Во-первых, вшивается именно то, что собрано: имя файла точки входа обязано
# совпасть у `frontend/dist` и `src-tauri/dist` — оно содержит хеш содержимого,
# поэтому совпадение имён и есть совпадение бандлов.
ENTRY_SRC="$(basename "$(ls frontend/dist/_expo/static/js/web/entry-*.js | head -1)")"
ENTRY_TAU="$(basename "$(ls src-tauri/dist/_expo/static/js/web/entry-*.js | head -1)")"
[ "$ENTRY_SRC" = "$ENTRY_TAU" ] || {
  echo "❌ в приложение вшит ЧУЖОЙ бандл"; echo "   собрано: $ENTRY_SRC"; echo "   вшито:   $ENTRY_TAU"; exit 1; }

# Во-вторых, библиотека со вшитыми страницами новее самих страниц.
LIB="src-tauri/target/aarch64-apple-ios-sim/debug/libpsygames_lib.a"
if [ -f "$LIB" ] && [ "$LIB" -ot "src-tauri/dist/index.html" ]; then
  echo "❌ библиотека старше веб-сборки: страницы внутри приложения ВЧЕРАШНИЕ"
  echo "   lib:  $(stat -f '%Sm' "$LIB")"
  echo "   dist: $(stat -f '%Sm' src-tauri/dist/index.html)"
  exit 1
fi

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
echo "✅ на симуляторе запущена $INSTALLED, и страницы внутри неё от этой же сборки"
