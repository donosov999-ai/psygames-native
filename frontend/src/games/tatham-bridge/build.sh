#!/bin/bash
set -u
# Где лежит канон Тэтхэма. По умолчанию — рядом с репозиторием; переопределяется PUZZLES_SRC.
# Клонировать: git clone https://git.tartarus.org/simon/puzzles.git
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${PUZZLES_SRC:-$HOME/dev/puzzles}"
[ -d "$SRC" ] || { echo "нет канона Тэтхэма: $SRC (задай PUZZLES_SRC)"; exit 2; }
command -v emcc >/dev/null || { echo "нет emcc — source ~/dev/emsdk/emsdk_env.sh"; exit 2; }
cd "$SRC" || exit 1
# ВСЕ СОРОК головоломок канона (`grep ^puzzle\( CMakeLists.txt` = 41 строка, минус
# `nullgame` — это заглушка сборки, а не игра). Список отсортирован как у автора.
G="blackbox bridges cube dominosa fifteen filling flip flood galaxies guess inertia keen \
lightup loopy magnets map mines mosaic net netslide palisade pattern pearl pegs range rect \
samegame signpost singles sixteen slant solo tents towers tracks twiddle undead unequal \
unruly untangle"
# Папка `unfinished` канона — шестой раздел коллекции, в сорок не входит и на сайте
# не показан. Та же лицензия (корневой LICENCE, своей у папки нет). README автора:
# «half-written, fundamentally flawed, or in other ways unready to be shipped» —
# то есть «не отполировано для широкой публики», а не «не работает».
# Берём два пространственных: Slide (Клоцки, решатель есть) и Sokoban.
U="slide sokoban"
G="$G $U"
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
for g in $G; do if [ -f "$g.c" ]; then SRCS="$SRCS $g.c"; else SRCS="$SRCS unfinished/$g.c"; fi; done
CORE="combi.c divvy.c dsf.c findloop.c grid.c latin.c laydomino.c loopgen.c malloc.c matching.c midend.c misc.c random.c sort.c tdq.c tree234.c version.c penrose.c penrose-legacy.c hat.c spectre.c"
# 🔴 ДВЕ ЗАПЛАТЫ КАНОНА — исправленными КОПИЯМИ во временной папке. Сам канон не трогаем: он общий и
# обновляется `git pull`, правка в нём тихо пропала бы. Не легла заплата — сборка встаёт здесь, а не в игре.
PATCHED=/tmp/psy-patched
rm -rf "$PATCHED"; mkdir -p "$PATCHED"
# 1) «Клоцки», unfinished/slide.c:2290 — `completed ? +1 : 0`, а completed = −1, пока НЕ решено (slide.c:1084):
#    статус 1 сразу после раздачи у 60 раздач из 60. Экран засчитывал уровень при входе, а настоящая победа
#    перехода не давала (задача f0ab1936, замер psygames-spatial-claude-mac 17.09.2026).
sed 's/return state->completed ? +1 : 0;/return state->completed >= 0 ? +1 : 0;/' unfinished/slide.c > "$PATCHED/slide.c"
grep -q 'return state->completed >= 0 ? +1 : 0;' "$PATCHED/slide.c" || { echo "заплата slide.c не легла: канон изменился"; exit 3; }
# 2) midend.c — позиция в истории ходов наружу (`psy_statepos`). PKR_SOME_EFFECT приходит и на MOVE_UI_UPDATE
#    (midend.c:1043): выделение клетки, начало протяжки, шаг курсора. Ход по нему считать нельзя — ход там,
#    где позиция выросла.
grep -q 'int nstates, statesize, statepos;' midend.c || { echo "заплата midend.c не легла: нет поля statepos"; exit 3; }
{ cat midend.c; printf '\nint psy_midend_statepos(midend *me) { return me->statepos; }\n'; } > "$PATCHED/midend.c"
SRCS="${SRCS/unfinished\/slide.c/$PATCHED/slide.c}"
CORE="${CORE/midend.c/$PATCHED/midend.c}"
case "$SRCS $CORE" in *"$PATCHED/slide.c"*"$PATCHED/midend.c"*) ;; *) echo "заплаты не подставлены в список файлов"; exit 3;; esac
emcc -Os -DCOMBINED -I. -I/tmp/gen \
  "$HERE/psy_fe.c" drawing.c /tmp/combined-list.c "$HERE/psy_bridge.c" "$HERE/psy_play.c" $SRCS $CORE \
  -s WASM=1 -s ENVIRONMENT=web,node -s MODULARIZE=1 -s ALLOW_MEMORY_GROWTH=1 \
  -s FILESYSTEM=0 -s SINGLE_FILE=1 -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString \
  -o "$HERE/tatham.js" 2> "$HERE/build.err"
rc=$?
[ $rc -ne 0 ] && { grep -E "error:" "$HERE/build.err" | head -5; exit $rc; }
j=$(stat -f%z "$HERE/tatham.js"); gz=$(gzip -c "$HERE/tatham.js"|wc -c|tr -d ' ')
printf "🟢 ВЕСЬ МОСТ, %d головоломок ОДНИМ файлом: tatham.js %d КБ · gzip %d КБ (wasm внутри, SINGLE_FILE)\n" "$(echo $G|wc -w)" $((j/1024)) $((gz/1024))
