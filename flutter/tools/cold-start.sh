#!/usr/bin/env bash
# Холодный старт: нынешняя версия против Flutter, НА ОДНОМ ТЕЛЕФОНЕ, одним способом.
#
# Зачем скрипт, а не замер на глаз: 364 мс против 102 мс в реф-таблице пилота
# мерены в РАЗНЫХ стендах (браузер против widget-пробы) и показывают только
# порядок разницы. Честное число даёт `am start -W` на живом телефоне: он отдаёт
# TotalTime — от запроса запуска до первого отрисованного кадра.
#
# КАК ЗАПУСКАТЬ:
#   1. На телефоне: Настройки → Об устройстве → 7 раз нажать «Номер сборки» →
#      Для разработчиков → включить «Отладка по USB».
#   2. Воткнуть телефон в мак, на телефоне разрешить отладку этому компьютеру.
#   3. brew install --cask android-platform-tools     (если adb ещё нет)
#   4. bash flutter/tools/cold-start.sh
#
# Нынешнюю версию ставить не надо — скрипт найдёт ту, что стоит из Google Play.
# APK пилота скачивается из последнего зелёного прогона CI (нужен gh).
#
# ⚠️ Имена переменных латиницей нарочно: bash на маке — 3.2, и кириллица в
# именах ломает объявление массива (`local ... spisok=()` → синтаксическая
# ошибка). Проверено 23.09.2026, первый вариант скрипта на этом и упал.
set -u

# ⚠️ ПАКЕТ МАГАЗИНА, А НЕ ИЗ tauri.conf.json. Замер 23.09.2026: в Play живёт
# com.psygames.app (отвечает 200), а com.odv999.psygames — настольная сборка,
# в Play её нет (404). Канон для мобильных берётся у scripts/ios-bundle-id.py.
# Первая редакция этого скрипта искала настольный пакет и не нашла бы приложение.
PKG_OLD=com.psygames.app
PKG_NEW=pro.psygames.psygames_flutter
RUNS=5

have() { command -v "$1" >/dev/null 2>&1; }

have adb || { echo "❌ нет adb. Поставь: brew install --cask android-platform-tools"; exit 1; }

DEV=$(adb devices | awk 'NR>1 && $2=="device" {print $1}' | head -1)
[ -n "$DEV" ] || { echo "❌ телефон не виден. Проверь кабель и разрешение отладки на экране телефона."; exit 1; }
echo "телефон: $DEV · $(adb -s "$DEV" shell getprop ro.product.model | tr -d '\r')"

if ! adb -s "$DEV" shell pm path "$PKG_NEW" 2>/dev/null | grep -q package; then
  have gh || { echo "❌ пилот не установлен, а gh нет — скачай APK из артефактов прогона «Пилот Flutter» вручную"; exit 1; }
  TMP=$(mktemp -d)
  echo "качаю APK пилота из CI…"
  RUN=$(gh run list --repo donosov999-ai/psygames-native \
        --workflow "Пилот Flutter (пробы + сборка Android)" --status success --limit 1 \
        --json databaseId --jq '.[0].databaseId')
  gh run download "$RUN" --repo donosov999-ai/psygames-native -n flutter-pilot-android -D "$TMP" || exit 1
  APK=$(find "$TMP" -name '*.apk' | head -1)
  echo "ставлю пилот…"
  adb -s "$DEV" install -r "$APK" >/dev/null || { echo "❌ не встал: $APK"; exit 1; }
fi

measure() {
  pkg="$1"; label="$2"
  entry=$(adb -s "$DEV" shell cmd package resolve-activity --brief "$pkg" 2>/dev/null | tail -1 | tr -d '\r')
  case "$entry" in
    ''|*"No activity"*) echo "⚠️  $label не установлен — пропускаю"; return ;;
  esac
  times=""
  i=1
  while [ "$i" -le "$RUNS" ]; do
    adb -s "$DEV" shell am force-stop "$pkg" >/dev/null 2>&1
    sleep 2
    t=$(adb -s "$DEV" shell am start -W -n "$entry" 2>/dev/null | awk -F': ' '/TotalTime/{print $2}' | tr -d '\r')
    [ -n "$t" ] && times="$times $t"
    i=$((i + 1))
  done
  [ -n "$times" ] || { echo "⚠️  $label: ни одного замера"; return; }
  med=$(printf '%s\n' $times | sort -n | awk '{a[NR]=$1} END{print (NR%2)?a[(NR+1)/2]:int((a[NR/2]+a[NR/2+1])/2)}')
  printf '%-22s медиана %5s мс   (прогоны:%s)\n' "$label" "$med" "$times"
}

echo
echo "── холодный старт, медиана $RUNS запусков ──"
measure "$PKG_OLD" "нынешняя версия"
measure "$PKG_NEW" "пилот на Flutter"
echo
echo "TotalTime = от запроса запуска до первого отрисованного кадра."
echo "Числа с одного телефона и одним способом — их и надо класть в реф-таблицу пилота."
