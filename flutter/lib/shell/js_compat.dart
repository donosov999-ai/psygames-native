/// АРИФМЕТИКА И СЛУЧАЙНОСТЬ, СОВМЕСТИМЫЕ С JS. Общий модуль для перенесённых игр.
///
/// 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Партии в PsyGames раздаются ПО ЗЕРНУ: одно и то же
/// зерно обязано дать ту же партию в вебе и в нативной версии, иначе прогресс
/// игрока разъедется молча. Зерно крутят FNV-1a и mulberry32, а они определены
/// через 32-битные операции JS (`Math.imul`, `>>>`, ToInt32) и через `Math.round`,
/// который делит ровную половину ВВЕРХ (−2,5 → −2), а не «от нуля», как `round()`
/// в Dart. Первой это понадобилось «Математической шкале», второй — «Трекеру
/// объектов»; дальше повторится у каждой игры с зерном, поэтому живёт в одном месте.
///
/// ⚠️ `Math.imul` здесь записан произведением с обрезкой до 32 бит. Это не
/// упрощение полифила, а равносильная запись: операнды по модулю меньше 2^31,
/// значит произведение укладывается в 64-битное целое Dart без потери битов.
library;

import 'dart:math' as math;

int jsImul(int a, int b) => ((a * b) & 0xFFFFFFFF).toSigned(32);

/// `Math.round` из JS: ровная половина уходит ВВЕРХ (−2,5 → −2), а не «от нуля».
double jsRound(double x) => (x + 0.5).floorToDouble();

const double jsEpsilon = 2.220446049250313e-16;

/// Округление к N знакам так же, как `roundNumber` в веб-ядрах.
double roundNumber(double value, [int digits = 8]) {
  final factor = math.pow(10, digits).toDouble();
  final rounded = jsRound((value + jsEpsilon) * factor) / factor;
  return rounded.abs() < 1e-9 ? 0 : rounded;
}

/// Число в JSON и в подписи: целое печатается без хвоста, как `JSON.stringify`.
num jsNum(double v) => v == v.roundToDouble() && v.abs() < 1e15 ? v.toInt() : v;

typedef Rng = double Function();

int hashSeed(String seed) {
  var hash = 0x811c9dc5.toSigned(32);
  for (var i = 0; i < seed.length; i += 1) {
    hash ^= seed.codeUnitAt(i);
    hash = jsImul(hash, 0x01000193);
  }
  return hash & 0xFFFFFFFF;
}

Rng createRng(String seed) {
  final h = hashSeed(seed);
  var state = h == 0 ? 1 : h;
  return () {
    var st = (state & 0xFFFFFFFF).toSigned(32);
    st = ((st + 0x6d2b79f5) & 0xFFFFFFFF).toSigned(32);
    state = st;
    var value = jsImul(st ^ ((st & 0xFFFFFFFF) >> 15), 1 | st);
    final sum = value + jsImul(value ^ ((value & 0xFFFFFFFF) >> 7), 61 | value);
    value = ((sum & 0xFFFFFFFF).toSigned(32)) ^ value;
    return ((value ^ ((value & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296.0;
  };
}

/// Причёсывание зерна. Запасное имя у каждой игры своё — оно попадает в номер
/// партии, поэтому подставлять чужое нельзя.
String normalizeSeed(String seed, String fallback) {
  final normalized = seed
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[\s_]+'), '-')
      .replaceAll(RegExp(r'-{2,}'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
  return normalized.isEmpty ? fallback : normalized;
}

int randomInt(Rng rng, int min, int max) => min + (rng() * (max - min + 1)).floor();

T pick<T>(Rng rng, List<T> values) => values[(rng() * values.length).floor()];

/// Перемешивание с конца — тем же порядком бросков, что `shuffle` в веб-ядрах.
List<T> shuffle<T>(Rng rng, List<T> values) {
  final result = List<T>.of(values);
  for (var i = result.length - 1; i > 0; i -= 1) {
    final j = randomInt(rng, 0, i);
    final tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}
