#!/bin/bash
# СБОРКА ДВИЖКА ТЭТХЭМА ПОД ANDROID — .so НА КАЖДУЮ АРХИТЕКТУРУ.
#
# 🔴 ОТЛИЧИЕ ОТ iOS, И ОНО НЕ КОСМЕТИЧЕСКОЕ. На iOS движок линкуется в приложение
# статически, а Dart берёт символы из процесса: динамическую библиотеку оттуда
# просто не открыть. На Android наоборот — обычный .so лежит в APK и открывается
# ПО ИМЕНИ (`DynamicLibrary.open('libtatham.so')`), система сама ищет его в
# lib/<abi>/. Один и тот же C, две упаковки: это свойство площадок, а не прихоть.
#
# Кладём в android/app/src/main/jniLibs/<abi>/ — оттуда Flutter забирает .so в APK
# и AAB сам, без правки gradle.
#
# ⚠️ Нужен NDK. На маке его нет — сборку делает CI (шаг в flutter-pilot.yml), как
# и с APK: замер 23.09.2026, Android SDK на этой машине не стоит.
#
# Запуск: ANDROID_NDK_HOME=<путь> flutter/tool/build_tatham_android.sh
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
FLUTTER_DIR="$(cd "$HERE/.." && pwd)"
BRIDGE="${PSY_BRIDGE:-$(cd "$FLUTTER_DIR/../frontend/src/games/tatham-bridge" && pwd)}"
SRC="${PUZZLES_SRC:-$HOME/puzzles}"
NDK="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
OUT="$FLUTTER_DIR/android/app/src/main/jniLibs"
WORK="${OUT_DIR:-$FLUTTER_DIR/build/tatham-android}"

[ -n "$NDK" ] || { echo "нет ANDROID_NDK_HOME — на этой машине NDK не стоит, собирает CI"; exit 2; }
[ -d "$SRC" ] || { echo "нет канона Тэтхэма: $SRC"; exit 2; }
[ -f "$BRIDGE/psy_play.c" ] || { echo "нет моста: $BRIDGE"; exit 2; }

TOOLCHAIN="$NDK/toolchains/llvm/prebuilt"
HOSTDIR="$(ls "$TOOLCHAIN" 2>/dev/null | head -1)"
[ -n "$HOSTDIR" ] || { echo "не нашёл набор инструментов в $TOOLCHAIN"; exit 3; }
BIN="$TOOLCHAIN/$HOSTDIR/bin"
API=21

mkdir -p "$WORK/gen" "$WORK/patched"
# Под Android KEEPALIVE значит «экспортировать символ»: Dart ищет их по имени.
printf '#pragma once\n#define EMSCRIPTEN_KEEPALIVE __attribute__((visibility("default"), used))\n' \
  > "$WORK/gen/emscripten.h"

GAMES="blackbox bridges cube dominosa fifteen filling flip flood galaxies guess inertia keen \
lightup loopy magnets map mines mosaic net netslide palisade pattern pearl pegs range rect \
samegame signpost singles sixteen slant solo tents towers tracks twiddle undead unequal \
unruly untangle slide sokoban"

: > "$WORK/gen/generated-games.h"
for g in $GAMES; do echo "GAME($g)" >> "$WORK/gen/generated-games.h"; done
{
  echo '#include "puzzles.h"'
  printf 'const game *gamelist[] = { '
  for g in $GAMES; do printf '&%s, ' "$g"; done
  echo '};'
  printf 'const int gamecount = %d;\n' "$(echo $GAMES | wc -w)"
} > "$WORK/gen/combined-list.c"

# Те же две заплаты, что у хостовой и iOS-сборки: канон не трогаем, правим копии.
sed 's/return state->completed ? +1 : 0;/return state->completed >= 0 ? +1 : 0;/' \
  "$SRC/unfinished/slide.c" > "$WORK/patched/slide.c"
grep -q 'return state->completed >= 0 ? +1 : 0;' "$WORK/patched/slide.c" \
  || { echo "заплата slide.c не легла: канон изменился"; exit 4; }
grep -q 'int nstates, statesize, statepos;' "$SRC/midend.c" \
  || { echo "заплата midend.c не легла: нет поля statepos"; exit 4; }
{ cat "$SRC/midend.c"; printf '\nint psy_midend_statepos(midend *me) { return me->statepos; }\n'; } \
  > "$WORK/patched/midend.c"

SRCS=""
for g in $GAMES; do
  if [ "$g" = "slide" ]; then SRCS="$SRCS $WORK/patched/slide.c"
  elif [ -f "$SRC/$g.c" ]; then SRCS="$SRCS $SRC/$g.c"
  else SRCS="$SRCS $SRC/unfinished/$g.c"; fi
done
for f in combi divvy dsf findloop grid latin laydomino loopgen malloc matching misc random \
         sort tdq tree234 version penrose penrose-legacy hat spectre; do
  SRCS="$SRCS $SRC/$f.c"
done
SRCS="$SRCS $WORK/patched/midend.c $BRIDGE/psy_fe.c $SRC/drawing.c $WORK/gen/combined-list.c \
  $BRIDGE/psy_bridge.c $BRIDGE/psy_play.c"

# Те же четыре архитектуры, что кладёт Flutter в APK.
for abi in arm64-v8a armeabi-v7a x86_64; do
  case "$abi" in
    arm64-v8a)   TARGET=aarch64-linux-android ;;
    armeabi-v7a) TARGET=armv7a-linux-androideabi ;;
    x86_64)      TARGET=x86_64-linux-android ;;
  esac
  CC="$BIN/clang"
  mkdir -p "$OUT/$abi"
  "$CC" --target=$TARGET$API -O2 -DCOMBINED -fvisibility=hidden -fPIC \
    -I"$WORK/gen" -I"$SRC" -shared -o "$OUT/$abi/libtatham.so" $SRCS 2> "$WORK/build-$abi.err" || {
      grep -E "error:" "$WORK/build-$abi.err" | head -5; exit 5; }
  SZ=$(wc -c < "$OUT/$abi/libtatham.so" | tr -d ' ')
  N=$("$BIN/llvm-nm" -D --defined-only "$OUT/$abi/libtatham.so" 2>/dev/null | grep -c ' T psy_' || true)
  echo "$abi · $SZ байт · экспортов psy_*: $N"
  # ⚠️ Библиотека без экспортов собирается молча и падает на первом ходе у человека.
  [ "$N" -ge 15 ] || { echo "🔴 в $abi нет экспортов psy_* — Dart не найдёт их по имени"; exit 6; }
done
