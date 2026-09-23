/// ПРАВИЛА «СОСТАВА ЧИСЛА» — перенос ядра frontend/src/games/counting/numberBondsLadder.ts.
///
/// На поле фишки, сверху цель: собрать её сумму из нескольких фишек. Лестница
/// переделана 06.09.2026 по замеру: детский вход (L1–L3 — пары, состав до 10 и
/// до 20, БЕЗ таймера), затем тройки входят долей, а не рубильником, и окно на
/// задачу считается из прогноза времени, а не падает линейно.
///
/// 🔴 ЗА ТАБЛИЦЕЙ ЛЕСТНИЦА НЕ ЗАМИРАЕТ. Раньше L21+ были клонами двадцатой
/// строки. Теперь растут две оси сразу: величины по коэффициенту и доля пятёрок,
/// которая плавно вытесняет тройки — одна величина давала клоны через уровень,
/// потому что поиск доминируется СОСТАВОМ решения.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

/// Число уровней таблицы. Выше — открытый хвост.
const int nbMaxLevel = 20;

class BondsCfg {
  const BondsCfg({
    required this.pool,
    required this.maxV,
    required this.sizeWeights,
    required this.trials,
    required this.windowMs,
    this.targetMax,
  });

  /// Сколько фишек на поле.
  final int pool;

  /// Наибольшее значение фишки.
  final int maxV;

  /// Размер решения → вес.
  final Map<int, double> sizeWeights;

  /// Потолок цели — «состав до N» на детских уровнях.
  final int? targetMax;

  /// Задач в раунде.
  final int trials;

  /// Окно на задачу; 0 — таймера нет.
  final int windowMs;
}

class _Row {
  const _Row(this.pool, this.maxV, this.sizeWeights, this.trials, this.winS, [this.targetMax]);
  final int pool, maxV, trials, winS;
  final Map<int, double> sizeWeights;
  final int? targetMax;
}

/// Окна посчитаны из прогноза времени: winS = clamp(2,5 × прогноз, 40, 300).
/// Потолок 300 с — страховка от застревания, а не стена; на детских уровнях окна нет.
const List<_Row> _levels = [
  _Row(6, 8, {2: 1}, 6, 0, 10),
  _Row(7, 12, {2: 1}, 6, 0, 20),
  _Row(8, 14, {2: 1}, 6, 0),
  _Row(8, 12, {2: 0.86, 3: 0.14}, 6, 40),
  _Row(8, 13, {2: 0.69, 3: 0.31}, 6, 40),
  _Row(8, 14, {2: 0.5, 3: 0.5}, 6, 45),
  _Row(9, 16, {2: 0.5, 3: 0.5}, 6, 50),
  _Row(9, 18, {2: 0.5, 3: 0.5}, 6, 55),
  _Row(9, 18, {2: 0.42, 3: 0.51, 4: 0.07}, 8, 75),
  _Row(9, 20, {2: 0.3, 3: 0.55, 4: 0.15}, 8, 100),
  _Row(10, 22, {2: 0.24, 3: 0.56, 4: 0.20}, 8, 140),
  _Row(10, 23, {2: 0.15, 3: 0.55, 4: 0.30}, 8, 165),
  _Row(10, 24, {2: 0.10, 3: 0.50, 4: 0.40}, 8, 205),
  _Row(10, 26, {3: 0.55, 4: 0.45}, 8, 220),
  _Row(10, 28, {3: 0.50, 4: 0.50}, 8, 255),
  _Row(10, 30, {3: 0.45, 4: 0.45, 5: 0.10}, 6, 300),
  _Row(11, 32, {3: 0.40, 4: 0.44, 5: 0.16}, 6, 300),
  _Row(11, 34, {3: 0.32, 4: 0.44, 5: 0.24}, 6, 300),
  _Row(12, 36, {3: 0.27, 4: 0.44, 5: 0.29}, 6, 300),
  _Row(12, 40, {3: 0.20, 4: 0.45, 5: 0.35}, 6, 300),
];

int _jsRoundInt(double v) => (v + 0.5).floor();

BondsCfg levelParams(int level) {
  final l = math.max(1, _jsRoundInt(level.toDouble()));
  if (l > nbMaxLevel) {
    final base = levelParams(nbMaxLevel);
    final k = 1 + (l - nbMaxLevel) * 0.15;
    final w5 = math.min(0.85, 0.35 + (l - nbMaxLevel) * 0.05);
    final w3 = math.max(0.0, 0.20 - (l - nbMaxLevel) * 0.04);
    return BondsCfg(
      pool: base.pool,
      maxV: _jsRoundInt(base.maxV * k),
      sizeWeights: {3: w3, 4: math.max(0.15, 1 - w5 - w3), 5: w5},
      targetMax: base.targetMax,
      trials: base.trials,
      windowMs: base.windowMs,
    );
  }
  final row = _levels[l - 1];
  return BondsCfg(
    pool: row.pool,
    maxV: row.maxV,
    sizeWeights: row.sizeWeights,
    targetMax: row.targetMax,
    trials: row.trials,
    windowMs: row.winS * 1000,
  );
}

/// Размер решения по весам уровня.
int pickSolSize(Map<int, double> weights, Rng rnd) {
  final entries = weights.entries.toList();
  var total = 0.0;
  for (final e in entries) {
    total += e.value;
  }
  var roll = rnd() * total;
  for (final e in entries) {
    roll -= e.value;
    if (roll <= 0) return e.key;
  }
  return entries.last.key;
}

class BondsPuzzle {
  const BondsPuzzle(this.target, this.chips);
  final int target;
  final List<int> chips;
}

/// Задача уровня. Размер решения — по весам; на детских уровнях решение
/// пересобирается, пока цель не уложится в «состав до N». Отвлекающие фишки —
/// равномерно 1..maxV, запрещено только значение, равное цели.
BondsPuzzle makePuzzle(BondsCfg cfg, Rng rnd) {
  var sol = <int>[];
  var target = 0;
  var guard = 0;
  do {
    final solSize = pickSolSize(cfg.sizeWeights, rnd);
    final used = <int>{};
    sol = [];
    while (sol.length < solSize) {
      final v = 1 + (rnd() * cfg.maxV).floor();
      if (!used.contains(v)) {
        used.add(v);
        sol.add(v);
      }
    }
    target = sol.fold(0, (a, b) => a + b);
    guard += 1;
  } while (cfg.targetMax != null && target > cfg.targetMax! && guard < 300);

  final distractors = <int>[];
  var dGuard = 0;
  while (distractors.length < cfg.pool - sol.length && dGuard < 200) {
    final v = 1 + (rnd() * cfg.maxV).floor();
    if (v != target) distractors.add(v);
    dGuard += 1;
  }
  final chips = [...sol, ...distractors];
  // Перемешивание с конца: решение не должно лежать первым куском.
  for (var i = chips.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = chips[i];
    chips[i] = chips[j];
    chips[j] = t;
  }
  return BondsPuzzle(target, chips);
}

/// Перенос прогресса старой лестницы (1..15) в новую (1..20) — по РАВНОЙ РАБОТЕ
/// поиска, а не по номеру: старый L4 = новый L8 параметр в параметр.
const List<int> _migrateOldToNew = [6, 6, 7, 8, 13, 13, 14, 14, 15, 18, 18, 18, 19, 19, 19];

int migrateOldLevel(int oldLevel) {
  if (oldLevel <= 1) return 1;
  return _migrateOldToNew[math.min(oldLevel, 15) - 1];
}

// ───────────────────────────── Правила партии ────────────────────────────────

/// Уровень взят при двух ошибках и меньше за раунд. Просрочка окна — тоже ошибка.
const int bondsErrorsAllowed = 2;

/// Меньше двух фишек — не ответ: нажатие «Проверить» с одной фишкой считается ошибкой.
const int bondsMinPicked = 2;

// ────────────────── Раскладка поля — фишка под высоту каркаса ────────────────

/// Размер фишки в вебе — 60 точек. Здесь поле получает высоту ЧИСЛОМ, поэтому
/// на низком экране фишка ужимается, пока все ряды не влезут: иначе нижний ряд
/// уезжает под липкий низ — та же семья дефектов, что чинилась у «Паттернов».
double chipSize(double width, double height, int count, {double gap = 10}) {
  for (final size in [60.0, 54.0, 48.0]) {
    final perRow = math.max(1, ((width + gap) / (size + gap)).floor());
    final rows = (count / perRow).ceil();
    if (rows * size + (rows - 1) * gap <= height) return size;
  }
  return 44;
}
