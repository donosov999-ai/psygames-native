#!/bin/sh
# 🔴 ГЕЙТ «ДВИЖОК ДОЕХАЛ ДО iPhone». Гонять ПОСЛЕ сборки под устройство и ПЕРЕД заливкой:
#     flutter build ipa && tool/check_ios_engine.sh
#
# ЧТО ЛОВИТ. Линковка молчит, когда движок выпадает из бинарника: сборка зелёная, размер
# правдоподобный, а приложение падает на ПЕРВОМ ходе — уже у человека, потому что Dart
# ищет символы по имени в рантайме. Замер чата «Шахматы» 23.09.2026 на том же классе:
# `-force_load` стоял в команде линковки, .a содержал символы, бинарник вышел 294 КБ
# вообще без движка, и ничего красного не загорелось. С флагами `-u` — 993 КБ.
#
# ⚠️ Отличие от пробы tatham_ios_symbols_test: та сверяет СПИСОК с исходником моста и
# работает на любом бегунке. Эта смотрит НАСТОЯЩУЮ таблицу символов готового .app, и без
# сборки под устройство её запустить нельзя. Нужны обе: список может сойтись, а линкер —
# всё равно выбросить код.
set -e
# ⚠️ Путь к бинарнику зависит от того, чем собирали: `flutter build ios` кладёт его
# в build/ios/iphoneos, а `flutter build ipa` — ещё и в архив. Гейт, знающий один
# путь, на другой сборке молча пропустил бы проверку, а это хуже отсутствия гейта.
BIN="${1:-}"
if [ -z "$BIN" ]; then
  for p in build/ios/iphoneos/Runner.app/Runner \
           build/ios/archive/Runner.xcarchive/Products/Applications/Runner.app/Runner; do
    [ -f "$p" ] && { BIN="$p"; break; }
  done
fi
[ -n "$BIN" ] && [ -f "$BIN" ] || {
  echo "НЕ НАШЁЛ БИНАРНИК (искал build/ios/iphoneos и build/ios/archive) — сперва flutter build ios|ipa"
  exit 1
}
echo "бинарник: $BIN"

# Список берётся из ТОГО, ЧТО ИЩЕТ DART, а не из моста: в мосте 26 экспортов, а Dart
# зовёт 15 — среди прочих есть psy_midend_statepos, служебная заплата канона, которую
# никто не ищет по имени. Требовать её в бинарнике значило бы приучать обходить гейт.
ENGINE="${PSY_ENGINE:-lib/games/puzzles/engine.dart}"
[ -f "$ENGINE" ] || { echo "НЕТ $ENGINE — гейт не знает, что искать"; exit 2; }
SYMS=$(grep -oE "'psy_[a-z_0-9]+'" "$ENGINE" | tr -d "'" | sort -u)
[ -n "$SYMS" ] || { echo "НЕ НАШЁЛ ИМЁН В $ENGINE — сломался разбор, а не движок"; exit 2; }

MISSING=""
COUNT=0
for s in $SYMS; do
  COUNT=$((COUNT + 1))
  nm -gU "$BIN" 2>/dev/null | grep -q " _$s\$" || MISSING="$MISSING $s"
done

SIZE=$(wc -c < "$BIN" | tr -d ' ')
if [ -n "$MISSING" ]; then
  echo "🔴 ДВИЖОК НЕ ДОЕХАЛ. В бинарнике ($SIZE байт) нет символов:$MISSING"
  echo "   Проверь -Wl,-u для каждого в ios/Flutter/Release.xcconfig и STRIP_STYLE=non-global."
  echo "   ⚠️ Такая сборка соберётся и упадёт на первом ходе у человека."
  exit 1
fi
echo "✅ движок в бинарнике: $COUNT символов psy_*, $SIZE байт"
