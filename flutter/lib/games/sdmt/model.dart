/// ПРАВИЛА SDMT — перенос из frontend/app/games/sdmt.tsx.
///
/// Под каждым значком своя цифра (легенда сверху), значки идут один за другим —
/// надо как можно быстрее нажимать нужную цифру. Уровень растит три вещи: число
/// значков в легенде (5→9), длительность раунда (60→45 с) и требуемый темп
/// (≈14 → ≈36 верных в минуту).
///
/// 🔴 ЛЕГЕНДА ПЕРЕМЕШИВАЕТСЯ НА КАЖДУЮ ПАРТИЮ, И ОБА ЕЁ КОНЦА. SDMT меряет
/// скорость обработки, только пока соответствие НЕВЫУЧЕНО: заученная легенда
/// превращает пробу в замер моторики, и переоценка показывала бы «рост скорости»,
/// который на деле память. Поэтому перемешаны и порядок значков, и их цифры.
///
/// 🔴 ДЕВЯТЬ РАЗЛИЧИМЫХ ЗНАЧКОВ, А НЕ ПРОСТО ДЕВЯТЬ. Отчёт тестировщика 10.09.2026:
/// «выделяю правильный ответ» — и не засчитывается. На кадре видно почему: огонь и
/// капля в шрифте различались зазубриной и на 22 точках читались как один значок.
/// Огонь заменён на месяц. Правило пополнения набора: значок обязан отличаться
/// СИЛУЭТОМ, а не деталью, и проверяться на 22 точках, а не в редакторе.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng, jsRound;

export '../../shell/js_compat.dart' show Rng, createRng;

const List<String> sdmtSymbols = [
  'star', 'heart', 'leaf', 'flash', 'cloud', 'flower', 'snow', 'water', 'moon',
];

const int sdmtBossEvery = 3;

/// Уровень взят: набрал цель И не меньше 80 % верных.
const double sdmtAccuracyToPass = 0.8;

class KeyMap {
  const KeyMap(this.sym, this.digit);
  final String sym;
  final int digit;
}

List<T> _shuffle<T>(List<T> arr, Rng rnd) {
  final a = List<T>.of(arr);
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

List<KeyMap> buildKeymap(int count, Rng rnd) {
  final syms = _shuffle(sdmtSymbols, rnd).take(count).toList();
  final digits = _shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd).take(count).toList();
  return [for (var i = 0; i < syms.length; i += 1) KeyMap(syms[i], digits[i])];
}

class SdmtParams {
  const SdmtParams({required this.durationSec, required this.symbolCount, required this.targetHits});
  final int durationSec, symbolCount, targetHits;
}

SdmtParams levelParams(int level) {
  final durationSec = level <= 5 ? 60 : (level <= 10 ? 50 : 45);
  final symbolCount = math.min(9, 5 + ((level - 1) / 3).floor());   // 5,5,5,6,6,6,7,7,7,8,8,8,9,9,9
  final ratePerMin = 14 + (level - 1) * 1.6;                        // 14 → 36,4 верных в минуту
  final targetHits = math.max(1, jsRound(ratePerMin * durationSec / 60).toInt());
  return SdmtParams(durationSec: durationSec, symbolCount: symbolCount, targetHits: targetHits);
}

// ───────────────────── Раскладка — правило из живого замера ──────────────────
//
// 🔴 ПАД ЦИФР ЛОЖИЛСЯ В ПЯТЬ РЯДОВ ВМЕСТО ТРЁХ, И ЭТО ПРЯТАЛО ЛЕГЕНДУ ПОД ШАПКУ.
// Замер 16.09.2026 на 390×844 · 375×667 · 360×640 · 320×568 — одно и то же на всех
// четырёх. Причина: полоса ответа отступает по 66 точек С ОБЕИХ сторон (гуттер
// зеркалится), внутри остаётся ширина − 132, а сетка просила больше. Округление,
// в котором я сперва искал причину, ни при чём: запас +2 ничего не менял.

const double topOfField = 119;      // шапка 58 + полоса показателей 61
const double answerGutters = 132;   // отступы полосы ответа с двух сторон
const double fingerSize = 48;

class SdmtLayout {
  const SdmtLayout({required this.fieldW, required this.stim, required this.pad});

  /// Ширина поля под легенду.
  final double fieldW;

  /// Сторона клетки со значком-стимулом.
  final double stim;

  /// Сторона клавиши цифрового пада.
  final double pad;
}

SdmtLayout sdmtLayout(double screenW, double screenH) {
  final fieldW = math.min(screenW - 32, 460.0);
  final stim = math
      .max(fingerSize, math.min(math.min(fieldW * 0.42, 180.0), (screenH - topOfField) * 0.22))
      .floorToDouble();
  final pad = math
      .max(
        fingerSize,
        math.min(
          math.min((screenW - answerGutters - 16 - 2) / 3, 96.0),
          (screenH - topOfField - 120 - stim - (16 + 21)) / 3,
        ),
      )
      .floorToDouble();
  return SdmtLayout(fieldW: fieldW, stim: stim, pad: pad);
}
