/// ЖРЕБИЙ ПО ЗЕРНУ — перенос `services/seed.ts` до последнего бита.
///
/// 🔴 ЗАЧЕМ ТОЧНОСТЬ ДО БИТА. Дерево «Бездны» не хранится: узлы рождаются от (зерно,
/// путь). Разойдётся жребий — у человека, продолжающего старую партию, рука встанет на
/// клетки, которых в новой доске нет пустыми. Поэтому здесь не «похожий генератор», а
/// тот же mulberry32 с тем же FNV-1a, и проба сверяет первые числа с живым JS.
///
/// ⚠️ ТОНКОСТЬ ПЕРЕНОСА: в JS все эти операции идут в 32 битах (`|0`, `>>>`,
/// `Math.imul`), а в Dart целое 64-битное. Поэтому каждая операция домножается маской
/// 0xFFFFFFFF, а сдвиг вправо делается как беззнаковый. Без этого числа разойдутся не
/// сразу, а на третьем-четвёртом вызове — и поймать это можно только сверкой.
library;

/// Строка → 32-битное зерно. FNV-1a, как в вебе.
int hashSeed(String seed) {
  var h = 0x811c9dc5;
  for (var i = 0; i < seed.length; i++) {
    h ^= seed.codeUnitAt(i);   // UTF-16, как charCodeAt — кириллица считается так же
    h = (h * 0x01000193) & 0xFFFFFFFF;
  }
  return h & 0xFFFFFFFF;
}

/// Генератор из строки: одна строка — одна и та же последовательность, всегда.
class Rng {
  Rng(String seed) : _a = hashSeed(seed) == 0 ? 1 : hashSeed(seed);

  int _a;

  static int _imul(int x, int y) => (x * y) & 0xFFFFFFFF;

  double next() {
    _a = (_a + 0x6d2b79f5) & 0xFFFFFFFF;
    var t = _imul(_a ^ (_a >> 15), 1 | _a);
    t = ((t + _imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t;
    t &= 0xFFFFFFFF;
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296;
  }

  /// Целое от 0 до n−1 — тем же способом, что в вебе (`Math.floor(rnd() * n)`).
  int nextInt(int n) => (next() * n).floor();
}

/// Приведение зерна к виду, в котором оно участвует в жребии.
String normalizeSeed(String input) => input
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[\s_]+'), '-')
    .replaceAll(RegExp(r'-{2,}'), '-')
    .replaceAll(RegExp(r'^-|-$'), '');
