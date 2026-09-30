/// ПРАВИЛА «СОБЕРИ СУММУ» — перенос из frontend/app/games/counter.tsx.
///
/// Сетка чисел, сверху цель: нажимать клетки, пока их сумма не сойдётся с целью.
/// Перебор — ошибка и сброс выбора, просрочка раунда — тоже ошибка. Десять
/// раундов, проход при 80 % решённых.
///
/// 🔴 ЦЕЛЬ ВСЕГДА ДОСТИЖИМА ПО ПОСТРОЕНИЮ: она и есть сумма двух (или, с долей
/// `tripleShare`, трёх) клеток этой же сетки. Но зачёт идёт ПО СУММЕ, а не по
/// тем самым клеткам — любая комбинация с нужной суммой верна.
///
/// 🔴 ЗА ТАБЛИЦЕЙ ЛЕСТНИЦА НЕ ЗАМИРАЕТ. Размер сетки упёрся в вёрстку (9 колонок
/// на 360 px дают клетку ~34 px при пороге нажатия 48), поэтому дальше растут
/// две другие оси: скорость до пола 4 с на L20 и ВЕЛИЧИНА чисел 9 → 11 → 13…
/// за L20, а с L26 долей входят тройки слагаемых.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

/// Обещанный потолок карты; выше — продолжение осей до пола и без потолка.
const int counterMaxLevel = 20;

/// Раундов в уровне.
const int counterTotalRounds = 10;

/// Проход уровня: решено ≥80 % раундов.
const double counterPassAccuracy = 0.8;

/// Каждые столько пройденных уровней — босс.
const int counterBossEvery = 3;

/// Уровень, с которого цель может собираться из ТРЁХ клеток (карточка правила
/// lr_counter_triples; гейт порога сверяет исполнением).
const int counterTriplesFromLevel = 26;

class _Row {
  const _Row(this.size, this.limitSec);
  final int size;
  final int limitSec;
}

/// L1–L15: сетка растёт 3×3 → 9×9, лимит раунда сокращается 15 → 6 с.
/// Больше клеток = больше подходящих пар, поэтому главный пресс — таймер.
const List<_Row> _table = [
  _Row(3, 15), _Row(3, 12), _Row(3, 9),
  _Row(4, 12), _Row(4, 9),
  _Row(5, 12), _Row(5, 9),
  _Row(6, 11), _Row(6, 8),
  _Row(7, 10), _Row(7, 8),
  _Row(8, 9), _Row(8, 7),
  _Row(9, 8), _Row(9, 6),
];

class CounterCfg {
  const CounterCfg({
    required this.gridSize,
    required this.roundLimitMs,
    required this.rounds,
    required this.cellMax,
    required this.tripleShare,
  });

  /// Сторона сетки.
  final int gridSize;

  /// Окно на раунд; просрочка — ошибка-пропуск.
  final int roundLimitMs;

  /// Раундов в уровне.
  final int rounds;

  /// Наибольшее число в клетке.
  final int cellMax;

  /// Доля раундов, где цель собирается из трёх клеток.
  final double tripleShare;

  /// Сколько раундов надо решить для прохода.
  int get passNeed => (rounds * counterPassAccuracy).ceil();
}

CounterCfg counterLevelParams(int level) {
  final l = math.max(level, 1);
  if (l <= _table.length) {
    final row = _table[l - 1];
    return CounterCfg(
      gridSize: row.size,
      roundLimitMs: row.limitSec * 1000,
      rounds: counterTotalRounds,
      cellMax: 9,
      tripleShare: 0,
    );
  }
  final limitSec = math.max(4.0, 6 - (l - 15) * 0.4);   // скорость до пола 4,0 с (L20)
  final cellMax = l <= 20 ? 9 : 9 + (l - 20) * 2;       // дальше рост несут числа
  final tripleShare = l <= counterTriplesFromLevel - 1
      ? 0.0
      : math.min(1.0, (l - (counterTriplesFromLevel - 1)) * 0.2);
  return CounterCfg(
    gridSize: 9,
    roundLimitMs: (limitSec * 1000).round(),
    rounds: counterTotalRounds,
    cellMax: cellMax,
    tripleShare: tripleShare,
  );
}

class CounterRound {
  const CounterRound(this.numbers, this.target);
  final List<int> numbers;
  final int target;
}

/// ⚠️ ПОРЯДОК БРОСКОВ ТОТ ЖЕ, ЧТО В ВЕБЕ: сперва числа всех клеток, потом жребий
/// «двойка или тройка», потом сами клетки. Иначе одна и та же партия по зерну
/// разъедется между стопками.
CounterRound makeCounterRound(int gs, int cellMax, double tripleShare, Rng rnd) {
  final total = gs * gs;
  final numbers = List<int>.generate(total, (_) => (rnd() * cellMax).floor() + 1);
  final picks = <int>{};
  final need = rnd() < tripleShare ? 3 : 2;
  while (picks.length < need) {
    picks.add((rnd() * total).floor());
  }
  var target = 0;
  for (final i in picks) {
    target += numbers[i];
  }
  return CounterRound(numbers, target);
}

/// РАЗМЕР КЛЕТКИ — ТОЖЕ ПРАВИЛО: в нём сидит починка по отчёту 16.09.2026, когда
/// нижние клетки уходили за край экрана, а прокрутки у поля нет. Высота берётся
/// из места, которое сетке ДОСТАЛОСЬ, а не из «экран минус 320»: над сеткой
/// стоят шапка, показатели, две карточки и подсказка, и угаданное число их не
/// знало. Запасной расчёт от экрана работает, пока место не измерено.
double counterCellSize({
  required int gridSize,
  required double width,
  required double height,
  double? placeW,
  double? placeH,
}) {
  final hSpace = placeH != null ? placeH - 8 /* отступ сетки снизу */ : height - 320;
  final wSpace = placeW ?? width - 28;
  return math.max(28.0, math.min(
    math.min(
      (wSpace - (gridSize - 1) * 8) / gridSize,
      (hSpace - (gridSize - 1) * 8) / gridSize,
    ),
    140.0,
  ));
}
