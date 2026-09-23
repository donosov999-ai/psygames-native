#!/bin/bash
# ГЕЙТ «ДВИЖОК ДОЕХАЛ»: в собранном файле есть ВСЕ экспорты, а не «какие-то».
#
# 🔴 ПОЧЕМУ ПРОВЕРЯТЬ НАДО ИМЕННО ВСЕ. У нас сорок два режима на одном движке, и мост
# зовёт его по именам уже во время работы (`DynamicLibrary.process().lookup`). Потеря
# ОДНОГО имени не роняет приложение — она отваливает ту часть, которую не зовёт
# стартовый код: человек открывает «Нежить» и видит пустой экран, а сборка при этом
# зелёная и остальные игры работают. Ни один обычный гейт такого не ловит.
#
# Две ловушки линковки, из-за которых символы пропадают (замер chess-чата 23.09 на
# устройстве: бинарник 294 КБ вообще без движка при зелёной сборке):
#   · `-force_load` загружает архив, а `DEAD_CODE_STRIPPING=YES` выбрасывает обратно —
#     лечится `-Wl,-u,_имя` на каждый экспорт;
#   · `STRIP_STYLE=all` в релизе срезает таблицу символов целиком — нужен `non-global`.
#
# Запуск:
#   tool/check_engine_symbols.sh build/tatham-ios-arm64/libtatham.a      # библиотека
#   tool/check_engine_symbols.sh "путь/Runner.app/Runner"                # собранное приложение
set -u
FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "нет файла: ${FILE:-<не задан>}"; exit 2; }

# Список снят с собранной библиотеки (`nm -gU`), а не написан по памяти.
EXPECTED="psy_board psy_can_solve psy_click psy_colours psy_count psy_cursor psy_draw \
psy_free psy_generate psy_has_board psy_height psy_key psy_name psy_open psy_pointer \
psy_preset_name psy_preset_params psy_presets psy_redo psy_solve psy_statepos psy_status \
psy_status_text psy_undo psy_width"

# ⚠️ Срезать надо ВЕДУЩЕЕ подчёркивание, а не все: `tr -d '_'` превращал `_psy_board`
# в `psyboard`, и первая редакция гейта отчиталась «0 из 25» на исправной библиотеке.
have="$(xcrun nm -g "$FILE" 2>/dev/null | awk '$2 == "T" || $2 == "t" {print $3}' | sed 's/^_//' | sort -u)"
missing=""
count=0
for sym in $EXPECTED; do
  if echo "$have" | grep -qx "$sym"; then
    count=$((count + 1))
  else
    missing="$missing $sym"
  fi
done

total=$(echo $EXPECTED | wc -w | tr -d ' ')
if [ -n "$missing" ]; then
  echo "🔴 движок доехал НЕ ВЕСЬ: $count из $total"
  echo "   пропали:$missing"
  echo "   лечится: -Wl,-u,_<имя> на каждый экспорт и STRIP_STYLE=non-global"
  exit 1
fi
echo "✓ все $total экспортов на месте ($(wc -c < "$FILE" | tr -d ' ') байт)"
