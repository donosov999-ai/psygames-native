/// СЛУЧАЙНОСТЬ «МЫСЛЕННОГО ВРАЩЕНИЯ» — ТОТ ЖЕ ПОТОК, ЧТО В TS.
///
/// Перенос `frontend/src/games/mental-rotation/core/rng.ts` (mulberry32 + FNV-1a).
/// Совпадение обязано быть ПОБИТОВЫМ: задания сравниваются с эталонами, выгруженными прогоном
/// живого TS, а любое расхождение в младшем бите даёт другую фигуру и другой порядок вариантов.
///
/// 🔴 ДЖАВАСКРИПТ СЧИТАЕТ В 32 БИТАХ, DART — В 64. Поэтому каждое умножение здесь сначала режется
/// до 32 бит со знаком (`_imul`), а сдвиги вправо делаются по БЕЗЗНАКОВОМУ значению — иначе
/// отрицательное состояние размножит единицы слева, и потоки разойдутся на втором-третьем броске.
library;

/// Случайное число [0,1) — тот же вид, что у `Rng` в TS.
typedef Rng = double Function();

int _imul(int a, int b) => ((a.toSigned(32) * b.toSigned(32)) & 0xFFFFFFFF).toSigned(32);

/// FNV-1a по кодовым единицам UTF-16 — как `charCodeAt` в TS.
int hashSeed(String seed) {
  var hash = 0x811c9dc5.toSigned(32);
  for (final unit in seed.codeUnits) {
    hash = (hash ^ unit).toSigned(32);
    hash = _imul(hash, 0x01000193);
  }
  return hash & 0xFFFFFFFF;
}

Rng createRng(String seed) {
  var state = hashSeed(seed);
  if (state == 0) state = 1;
  state = state.toSigned(32);
  return () {
    state = (state + 0x6d2b79f5).toSigned(32);
    var value = _imul(state ^ ((state & 0xFFFFFFFF) >> 15), 1 | state);
    value = (value + _imul(value ^ ((value & 0xFFFFFFFF) >> 7), 61 | value)).toSigned(32) ^ value;
    return ((value ^ ((value & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296;
  };
}

int randomInt(Rng rng, int min, int max) {
  if (max < min) throw RangeError('пустой диапазон: $min..$max');
  return min + (rng() * (max - min + 1)).floor();
}

T pick<T>(Rng rng, List<T> values) {
  if (values.isEmpty) throw RangeError('выбор из пустого набора');
  return values[randomInt(rng, 0, values.length - 1)];
}

List<T> shuffle<T>(Rng rng, List<T> values) {
  final result = [...values];
  for (var index = result.length - 1; index > 0; index -= 1) {
    final target = randomInt(rng, 0, index);
    final swap = result[index];
    result[index] = result[target];
    result[target] = swap;
  }
  return result;
}
