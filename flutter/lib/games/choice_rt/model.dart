import 'dart:math';

/// «Выбор-реакция» — пятая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/choice-rt.tsx` и общего модуля
/// наклона `frontend/src/games/attention/hick.ts`. Эталон выгружен прогоном
/// живого TS в `test/fixtures/choicert-reference.json`.
///
/// 🔴 МЕРА ЭТОЙ ПАРАДИГМЫ — НАКЛОН ХИКА, а не среднее время. Закон Хика:
/// RT ≈ a + b·log₂(n); клиническое значение у b — скорость перебора вариантов,
/// мс на бит. Чтобы его посчитать, число альтернатив меняется БЛОКАМИ ВНУТРИ
/// партии при ОДНОМ окне ответа: иначе две точки сняты при разных условиях и
/// несравнимы.
enum ChoiceDirection { left, right, up, down }

/// Начертание знака: три вида, чтобы различение усложнялось отдельной осью.
enum ChoiceGlyph { arrow, chevron, bracket }

/// Доля «пустых» проб, на которые жать нельзя. ЗАМОРОЖЕНА.
///
/// 🔴 Нейтраль защищает саму меру: без неё быстрое время могло бы означать не
/// скорость, а нажатие ДО появления знака — промахнуться некуда, упреждение не
/// наказано. Растить её долю с уровнем нельзя: чем чаще нейтрали, тем осторожнее
/// игрок, и время растёт от осторожности, а не от трудности выбора.
const double neutralRate = 0.15;

/// Пол окна ответа, мс. Не круглое число «на глазок»: при четырёх альтернативах
/// предсказанное законом Хика среднее 550–650 мс, и более короткий срок срезал бы
/// правый хвост сильнее при четырёх вариантах, чем при двух, — то есть уплощал бы
/// сам наклон, ради которого проба существует.
const int choiceRtWindowFloorMs = 1000;
const int choiceRtWindowStartMs = 2000;

/// Уровней в лестнице — столько же, сколько у остальных проб раздела.
const int choiceRtLevels = 15;

/// Живые направления блока из n вариантов. Порядок постоянен.
List<ChoiceDirection> dirsForBlock(int n) =>
    ChoiceDirection.values.sublist(0, max(2, min(4, n)));

/// Блоки уровня: сколько вариантов живо в каждом отрезке партии.
/// ⚠️ Порядок фиксирован от меньшего к большему: при случайном порядке наклон
/// поехал бы от обучения по ходу партии, а не от числа вариантов.
List<int> hickBlocks(int level) => level <= 5 ? const [2, 3] : const [2, 3, 4];

/// Что задаёт уровень.
class ChoiceRtLevel {
  const ChoiceRtLevel({
    required this.trials,
    required this.dirs,
    required this.windowMs,
    required this.glyph,
    required this.blocks,
  });

  /// Проб в партии: 12 → 16 → 20.
  final int trials;

  /// Наибольший набор направлений уровня.
  final List<ChoiceDirection> dirs;

  /// Окно ответа, мс: 2000 → 1000 ровно за пятнадцать ступеней.
  final int windowMs;

  /// Начертание знака. ⚠️ Границы (4 и 9) намеренно НЕ совпадают с границами
  /// числа направлений (6 и 11): две оси переключаются вразнобой и дают больше
  /// различимых ступеней.
  final ChoiceGlyph glyph;

  /// Блоки Хика внутри партии.
  final List<int> blocks;

  static ChoiceRtLevel of(int level) {
    final l = level;
    final trials = l <= 5 ? 12 : (l <= 10 ? 16 : 20);
    final dirs = l <= 5
        ? dirsForBlock(2)
        : (l <= 10 ? dirsForBlock(3) : dirsForBlock(4));
    // ⚠️ Шаг НЕ подобран вручную, а считается из пола: спуск от 2000 до пола
    // ровно за пятнадцать уровней. Подобранный на глаз шаг давал на L15 окно
    // 1006 — проба «лестница сужается хотя бы вдвое» краснела на шести мс.
    final step = (choiceRtWindowStartMs - choiceRtWindowFloorMs) / (choiceRtLevels - 1);
    final windowMs = max(choiceRtWindowFloorMs, (choiceRtWindowStartMs - (l - 1) * step).round());
    final glyph = l <= 3 ? ChoiceGlyph.arrow : (l <= 8 ? ChoiceGlyph.chevron : ChoiceGlyph.bracket);
    return ChoiceRtLevel(
      trials: trials,
      dirs: dirs,
      windowMs: windowMs,
      glyph: glyph,
      blocks: hickBlocks(level),
    );
  }
}

/// Раздача одной пробы. `null` — нейтраль: знака направления нет, жать нельзя.
///
/// 🔴 Уровень сюда НЕ передаётся, и это не упущение: не имея уровня, функция
/// физически не может раздавать нейтрали чаще на верхних ступенях. Заморозку
/// доли нечем нарушить.
/// ⚠️ Сравнение строгое: розыгрыш ровно 0,15 — уже НЕ нейтраль (строка в эталоне).
ChoiceDirection? nextStim(List<ChoiceDirection> dirs, double Function() rnd) {
  if (rnd() < neutralRate) return null;
  return dirs[(rnd() * dirs.length).floor()];
}

/// Точка замера наклона: сколько вариантов было живо и сколько мс занял ответ.
class HickPoint {
  const HickPoint(this.n, this.rt);
  final int n;
  final int rt;
}

/// Среднее время по одному числу вариантов.
class HickMean {
  const HickMean({required this.n, required this.meanRt, required this.trials});
  final int n;
  final int meanRt;
  final int trials;
}

/// Итог наклона Хика.
class HickSlope {
  const HickSlope({
    required this.slopeMsPerBit,
    required this.interceptMs,
    required this.distinctN,
    required this.trials,
    required this.byN,
  });

  /// Наклон b в RT ≈ a + b·log₂(n), мс на бит. Пусто — посчитать нельзя.
  final int? slopeMsPerBit;
  final int? interceptMs;
  final int distinctN;
  final int trials;
  final List<HickMean> byN;
}

/// Наклон по методу наименьших квадратов на оси log₂(n).
///
/// ⚠️ ВОЗВРАЩАЕТ ПУСТО, А НЕ НОЛЬ, когда точек мало: ноль означал бы «перебор
/// бесплатен» — сильное клиническое утверждение на пустом месте.
/// ⚠️ Регрессия по СРЕДНИМ, а не по всем пробам: иначе n с большим числом проб
/// перетянет прямую на себя просто количеством.
HickSlope hickSlope(List<HickPoint> points) {
  final good = points.where((p) => p.rt > 0 && p.n >= 2).toList();
  final byNumber = <int, List<int>>{};
  for (final p in good) {
    byNumber.putIfAbsent(p.n, () => []).add(p.rt);
  }
  final byN = byNumber.entries
      .map((e) => HickMean(
            n: e.key,
            meanRt: (e.value.reduce((a, b) => a + b) / e.value.length).round(),
            trials: e.value.length,
          ))
      .toList()
    ..sort((a, b) => a.n.compareTo(b.n));

  if (byN.length < 2) {
    return HickSlope(
      slopeMsPerBit: null,
      interceptMs: null,
      distinctN: byN.length,
      trials: good.length,
      byN: byN,
    );
  }
  final xs = byN.map((m) => log(m.n) / ln2).toList();
  final ys = byN.map((m) => m.meanRt.toDouble()).toList();
  final mx = xs.reduce((a, b) => a + b) / xs.length;
  final my = ys.reduce((a, b) => a + b) / ys.length;
  var top = 0.0;
  var bottom = 0.0;
  for (var i = 0; i < xs.length; i++) {
    top += (xs[i] - mx) * (ys[i] - my);
    bottom += (xs[i] - mx) * (xs[i] - mx);
  }
  if (bottom == 0) {
    return HickSlope(
      slopeMsPerBit: null,
      interceptMs: null,
      distinctN: byN.length,
      trials: good.length,
      byN: byN,
    );
  }
  final b = top / bottom;
  return HickSlope(
    slopeMsPerBit: b.round(),
    interceptMs: (my - b * mx).round(),
    distinctN: byN.length,
    trials: good.length,
    byN: byN,
  );
}

enum ChoiceOutcome { hit, wrong, miss, heldOnNeutral, falseAlarm }

/// Партия: блоки Хика внутри партии, окно ответа уровня, нейтрали.
///
/// ⚠️ Часы передаются снаружи (`nowMs`): проба играет партию на поддельных часах.
class ChoiceRtGame {
  ChoiceRtGame({required this.level, Random? rnd, int Function()? nowMs, int? trialsOverride})
      : params = ChoiceRtLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? ChoiceRtLevel.of(level).trials {
    activeDirs = dirsForBlock(params.blocks.first);
  }

  final int level;
  final ChoiceRtLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int falseAlarms = 0;
  int correctRejections = 0;
  int neutralTrials = 0;
  final List<int> rts = [];
  final List<HickPoint> hickPoints = [];

  /// Живые направления текущего блока.
  late List<ChoiceDirection> activeDirs;

  /// Знак текущей пробы. Пусто — нейтраль.
  ChoiceDirection? stimulus;
  bool _isNeutral = false;

  /// Подготовительный интервал текущей пробы, мс: 600–1800, как в веб-версии.
  int preDelayMs = 600;
  bool _answered = true;
  bool _shown = false;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get stimulusShown => _shown;
  bool get isNeutral => _isNeutral;

  void begin() => _startedAt = _now();

  /// Следующая проба. Сначала выбирается БЛОК по номеру пробы, потом знак.
  ///
  /// Очередь случайных: нейтраль/направление (одно число на нейтрали, два иначе)
  /// → подготовительный интервал.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    final blocks = params.blocks;
    final perBlock = max(1, (trialsTotal / blocks.length).ceil());
    final index = min(blocks.length - 1, (round - 1) ~/ perBlock);
    activeDirs = dirsForBlock(blocks[index]);
    final stim = nextStim(activeDirs, _next);
    stimulus = stim;
    _isNeutral = stim == null;
    if (_isNeutral) neutralTrials += 1;
    preDelayMs = 600 + (_next() * 1200).floor();
    _answered = false;
    _shown = false;
    return true;
  }

  void showStimulus() {
    _shown = true;
    _stimAt = _now();
  }

  /// Ответ человека.
  ///
  /// 🔴 Точка наклона берётся ТОЛЬКО с верного ответа и только с направления:
  /// время ошибочной пробы означает промах, а не перебор; у нейтрали выбора нет
  /// вовсе, и n для неё не определено.
  ChoiceOutcome answer(ChoiceDirection chosen) {
    if (_answered || !_shown) return ChoiceOutcome.miss;
    _answered = true;
    final rt = _now() - _stimAt;
    if (_isNeutral) {
      // Нажал там, где правило запрещает: это ложная тревога, а не промах.
      falseAlarms += 1;
      errors += 1;
      return ChoiceOutcome.falseAlarm;
    }
    if (chosen == stimulus) {
      hits += 1;
      rts.add(rt);
      hickPoints.add(HickPoint(activeDirs.length, rt));
      return ChoiceOutcome.hit;
    }
    errors += 1;
    return ChoiceOutcome.wrong;
  }

  /// Окно вышло без нажатия.
  ///
  /// 🔴 На НЕЙТРАЛИ молчание — ВЕРНЫЙ ответ, а не пропуск: считать его ошибкой
  /// значило бы требовать нажатия там, где правило его запрещает.
  ChoiceOutcome timeout() {
    if (_answered) return ChoiceOutcome.miss;
    _answered = true;
    if (_isNeutral) {
      correctRejections += 1;
      hits += 1;
      return ChoiceOutcome.heldOnNeutral;
    }
    errors += 1;
    return ChoiceOutcome.miss;
  }

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  /// Среднее время по верным ответам на направление. Пусто, когда их нет.
  int? get meanRtMs {
    if (rts.isEmpty) return null;
    return (rts.reduce((a, b) => a + b) / rts.length).round();
  }

  /// Наклон Хика по накопленным точкам.
  HickSlope get hick => hickSlope(hickPoints);

  /// Очки — формулой веб-версии.
  int get score {
    final mean = meanRtMs ?? 0;
    return max(0, (hits * 100 - errors * 50 - mean * 0.1).round());
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
