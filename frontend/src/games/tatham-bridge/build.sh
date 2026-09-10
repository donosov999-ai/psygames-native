#!/bin/bash
set -u
# Где лежит канон Тэтхэма. По умолчанию — рядом с репозиторием; переопределяется PUZZLES_SRC.
# Клонировать: git clone https://git.tartarus.org/simon/puzzles.git
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${PUZZLES_SRC:-$HOME/dev/puzzles}"
[ -d "$SRC" ] || { echo "нет канона Тэтхэма: $SRC (задай PUZZLES_SRC)"; exit 2; }
command -v emcc >/dev/null || { echo "нет emcc — source ~/dev/emsdk/emsdk_env.sh"; exit 2; }
cd "$SRC" || exit 1
G="unruly keen towers unequal singles tents magnets pearl slant map signpost filling dominosa tracks pattern galaxies solo fifteen lightup loopy"
mkdir -p /tmp/gen
: > /tmp/gen/generated-games.h
for g in $G; do echo "GAME($g)" >> /tmp/gen/generated-games.h; done
{
  echo '#include "puzzles.h"'
  printf 'const game *gamelist[] = { '
  for g in $G; do printf '&%s, ' "$g"; done
  echo '};'
  printf 'const int gamecount = %d;\n' "$(echo $G | wc -w)"
} > /tmp/combined-list.c
SRCS=""
for g in $G; do SRCS="$SRCS $g.c"; done
CORE="combi.c divvy.c dsf.c findloop.c grid.c latin.c laydomino.c loopgen.c malloc.c matching.c midend.c misc.c random.c sort.c tdq.c tree234.c version.c penrose.c penrose-legacy.c hat.c spectre.c"
emcc -Os -DCOMBINED -I. -I/tmp/gen \
  "$HERE/psy_fe.c" drawing.c /tmp/combined-list.c "$HERE/psy_bridge.c" "$HERE/psy_play.c" $SRCS $CORE \
  -s WASM=1 -s ENVIRONMENT=web,node -s MODULARIZE=1 -s ALLOW_MEMORY_GROWTH=1 \
  -s FILESYSTEM=0 -s SINGLE_FILE=1 -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString \
  -o "$HERE/tatham.js" 2> "$HERE/build.err"
rc=$?
[ $rc -ne 0 ] && { grep -E "error:" "$HERE/build.err" | head -5; exit $rc; }
j=$(stat -f%z "$HERE/tatham.js"); gz=$(gzip -c "$HERE/tatham.js"|wc -c|tr -d ' ')
printf "🟢 ВЕСЬ МОСТ, %d головоломок ОДНИМ файлом: tatham.js %d КБ · gzip %d КБ (wasm внутри, SINGLE_FILE)\n" "$(echo $G|wc -w)" $((j/1024)) $((gz/1024))
