#!/bin/bash
# СБОРКА ДВИЖКА ТЭТХЭМА ПОД iOS — СТАТИЧЕСКОЙ БИБЛИОТЕКОЙ, А НЕ .dylib.
#
# 🔴 ПОЧЕМУ НЕ .dylib, КАК НА ХОСТЕ. iOS не даёт приложению открыть чужую
# динамическую библиотеку из файловой системы: `DynamicLibrary.open` найдёт её
# только внутри подписанного .framework, и App Store такую сборку отклонит.
# Рабочий путь один — собрать C СТАТИЧЕСКИ и влинковать в само приложение;
# тогда символы `psy_*` лежат в процессе, и Dart берёт их через
# `DynamicLibrary.process()`, без файла и без пути.
#
# Отсюда и разница с Android: там .so кладётся в APK как есть и открывается по
# имени. Один и тот же C, две разные упаковки — это свойство площадок.
#
# Запуск: flutter/tool/build_tatham_ios.sh [arm64|x86_64]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
FLUTTER_DIR="$(cd "$HERE/.." && pwd)"
BRIDGE="${PSY_BRIDGE:-$(cd "$FLUTTER_DIR/../frontend/src/games/tatham-bridge" && pwd)}"
SRC="${PUZZLES_SRC:-$HOME/dev/puzzles}"
ARCH="${1:-arm64}"
OUT="${OUT_DIR:-$FLUTTER_DIR/build/tatham-ios-$ARCH}"

[ -d "$SRC" ] || { echo "нет канона Тэтхэма: $SRC"; exit 2; }
[ -f "$BRIDGE/psy_play.c" ] || { echo "нет моста: $BRIDGE"; exit 2; }

# 🔴 СИМУЛЯТОР ЛИНКУЕТСЯ ДВУМЯ АРХИТЕКТУРАМИ ДАЖЕ НА APPLE SILICON, и это отдельная
# цель, а не «x86_64 сойдёт». Замер chess-чата 23.09 на живом устройстве: без
# arm64-слайса симулятора линковка падает семью «Undefined symbol», хотя телефонная
# сборка при этом зелёная. Поэтому целей три, а симуляторная склеивается из двух:
#   bash tool/build_tatham_ios.sh sim     — собрать обе и склеить в одну
case "$ARCH" in
  arm64)     SDK=iphoneos;        TARGET="arm64-apple-ios13.0" ;;
  arm64-sim) SDK=iphonesimulator; TARGET="arm64-apple-ios13.0-simulator" ;;
  x86_64)    SDK=iphonesimulator; TARGET="x86_64-apple-ios13.0-simulator" ;;
  sim)
    # Склейка: обе симуляторные цели одной командой, как в рецепте.
    bash "$0" arm64-sim || exit $?
    bash "$0" x86_64 || exit $?
    FAT="${OUT_DIR:-$FLUTTER_DIR/build/tatham-ios-simulator}"
    mkdir -p "$FAT"
    xcrun lipo -create \
      "$FLUTTER_DIR/build/tatham-ios-arm64-sim/libtatham.a" \
      "$FLUTTER_DIR/build/tatham-ios-x86_64/libtatham.a" \
      -output "$FAT/libtatham.a" || exit 5
    echo "$FAT/libtatham.a · $(wc -c < "$FAT/libtatham.a" | tr -d ' ') байт"
    echo "архитектуры: $(xcrun lipo -archs "$FAT/libtatham.a")"
    echo "экспортов psy_*: $(xcrun nm -g "$FAT/libtatham.a" 2>/dev/null | grep -c ' T _psy_')"
    exit 0 ;;
  *) echo "неизвестная архитектура: $ARCH (arm64 | arm64-sim | x86_64 | sim)"; exit 2 ;;
esac
SDKROOT="$(xcrun --sdk $SDK --show-sdk-path)"

mkdir -p "$OUT/gen" "$OUT/patched" "$OUT/obj"
# ⚠️ На iOS символы НЕ прячем: они ищутся в процессе по имени. На хосте
# видимость скрыта и открыта только у psy_*, здесь же -fvisibility=hidden
# оставил бы нас без единого экспорта, и lookup упал бы в рантайме.
printf '#pragma once\n#define EMSCRIPTEN_KEEPALIVE __attribute__((visibility("default"), used))\n' > "$OUT/gen/emscripten.h"

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

# Те же две заплаты, что у хостовой сборки: канон не трогаем, правим копии.
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
for f in combi divvy dsf findloop grid latin laydomino loopgen malloc matching misc random \
         sort tdq tree234 version penrose penrose-legacy hat spectre; do
  SRCS="$SRCS $SRC/$f.c"
done
SRCS="$SRCS $OUT/patched/midend.c $BRIDGE/psy_fe.c $SRC/drawing.c $OUT/gen/combined-list.c \
  $BRIDGE/psy_bridge.c $BRIDGE/psy_play.c"

: > "$OUT/build.err"
OBJS=""
for f in $SRCS; do
  o="$OUT/obj/$(basename "${f%.c}").o"
  xcrun --sdk $SDK clang -O2 -DCOMBINED -target "$TARGET" -isysroot "$SDKROOT" \
    -I"$OUT/gen" -I"$SRC" -c "$f" -o "$o" 2>> "$OUT/build.err" || { grep -m5 "error:" "$OUT/build.err"; exit 4; }
  OBJS="$OBJS $o"
done
xcrun --sdk $SDK libtool -static -o "$OUT/libtatham.a" $OBJS 2>> "$OUT/build.err" || { tail -5 "$OUT/build.err"; exit 5; }

echo "$OUT/libtatham.a · $(wc -c < "$OUT/libtatham.a" | tr -d ' ') байт"
echo "экспортов psy_*: $(xcrun nm -g "$OUT/libtatham.a" 2>/dev/null | grep -c ' T _psy_')"
