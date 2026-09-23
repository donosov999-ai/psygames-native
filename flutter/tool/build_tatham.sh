#!/bin/bash
# СБОРКА ДВИЖКА ТЭТХЭМА ПОД ХОСТ — для проб Dart FFI.
#
# 🔴 ЗАЧЕМ ЭТОТ ФАЙЛ. Веб-версия зовёт тот же движок через emscripten (tatham.js, 996 КБ).
# Во Flutter его НЕ переносят в Dart: те же исходники компилируются нативно и зовутся
# через dart:ffi тем же API psy_*. Этот скрипт собирает их под машину разработчика,
# чтобы пробы гоняли НАСТОЯЩИЙ движок, а не заглушку.
#
# Замер 23.09.2026: 42 игры + 21 файл ядра + наш мост (567 строк) = 13 секунд clang,
# 1,4 МБ dylib, 25 экспортов psy_*.
#
# ⚠️ Сборка для iOS и Android — отдельный разговор: она трогает ios/ и android/, то есть
# общий каркас приложения. Здесь только хост.
#
# Канон: git clone https://git.tartarus.org/simon/puzzles.git ~/dev/puzzles
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
FLUTTER_DIR="$(cd "$HERE/.." && pwd)"
BRIDGE="${PSY_BRIDGE:-$(cd "$FLUTTER_DIR/../frontend/src/games/tatham-bridge" && pwd)}"
SRC="${PUZZLES_SRC:-$HOME/dev/puzzles}"
OUT="${OUT_DIR:-$FLUTTER_DIR/build/tatham}"

[ -d "$SRC" ] || { echo "нет канона Тэтхэма: $SRC — git clone https://git.tartarus.org/simon/puzzles.git $SRC"; exit 2; }
[ -f "$BRIDGE/psy_play.c" ] || { echo "нет моста: $BRIDGE"; exit 2; }

case "$(uname -s)" in
  Darwin) LIB="libtatham.dylib" ;;
  *)      LIB="libtatham.so" ;;
esac

mkdir -p "$OUT/gen" "$OUT/patched"
# Под хостом KEEPALIVE значит «экспортировать символ» — заглушка вместо emscripten.h.
printf '#pragma once\n#define EMSCRIPTEN_KEEPALIVE __attribute__((visibility("default"), used))\n' > "$OUT/gen/emscripten.h"

# Тот же список игр, что у веб-сборки (build.sh): 40 канонных плюс два из unfinished.
GAMES="blackbox bridges cube dominosa fifteen filling flip flood galaxies guess inertia keen \
lightup loopy magnets map mines mosaic net netslide palisade pattern pearl pegs range rect \
samegame signpost singles sixteen slant solo tents towers tracks twiddle undead unequal \
unruly untangle slide sokoban"

: > "$OUT/gen/generated-games.h"
for g in $GAMES; do echo "GAME($g)" >> "$OUT/gen/generated-games.h"; done
{
  echo '#include "puzzles.h"'
  printf 'const game *gamelist[] = { '
  for g in $GAMES; do printf '&%s, ' "$g"; done
  echo '};'
  printf 'const int gamecount = %d;\n' "$(echo $GAMES | wc -w)"
} > "$OUT/gen/combined-list.c"

# Две заплаты канона — копиями, сам канон не трогаем (он общий и обновляется git pull).
sed 's/return state->completed ? +1 : 0;/return state->completed >= 0 ? +1 : 0;/' \
  "$SRC/unfinished/slide.c" > "$OUT/patched/slide.c"
grep -q 'return state->completed >= 0 ? +1 : 0;' "$OUT/patched/slide.c" \
  || { echo "заплата slide.c не легла: канон изменился"; exit 3; }
grep -q 'int nstates, statesize, statepos;' "$SRC/midend.c" \
  || { echo "заплата midend.c не легла: нет поля statepos"; exit 3; }
{ cat "$SRC/midend.c"; printf '\nint psy_midend_statepos(midend *me) { return me->statepos; }\n'; } \
  > "$OUT/patched/midend.c"

SRCS=""
for g in $GAMES; do
  if [ "$g" = "slide" ]; then SRCS="$SRCS $OUT/patched/slide.c"
  elif [ -f "$SRC/$g.c" ]; then SRCS="$SRCS $SRC/$g.c"
  else SRCS="$SRCS $SRC/unfinished/$g.c"; fi
done
CORE=""
for f in combi divvy dsf findloop grid latin laydomino loopgen malloc matching misc random \
         sort tdq tree234 version penrose penrose-legacy hat spectre; do
  CORE="$CORE $SRC/$f.c"
done
CORE="$CORE $OUT/patched/midend.c"

clang -O2 -DCOMBINED -fvisibility=hidden -fPIC -I"$OUT/gen" -I"$SRC" -shared -o "$OUT/$LIB" \
  "$BRIDGE/psy_fe.c" "$SRC/drawing.c" "$OUT/gen/combined-list.c" \
  "$BRIDGE/psy_bridge.c" "$BRIDGE/psy_play.c" $SRCS $CORE 2> "$OUT/build.err"
rc=$?
if [ $rc -ne 0 ]; then
  grep -E "error:" "$OUT/build.err" | head -5
  exit $rc
fi
echo "$OUT/$LIB · $(wc -c < "$OUT/$LIB" | tr -d ' ') байт"
