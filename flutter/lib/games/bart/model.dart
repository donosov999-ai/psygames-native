/// BART — «Воздушный шар», пятнадцатая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/bart.tsx` (VER 3); эталон выгружен
/// прогоном живого TS в `test/fixtures/bart-reference.json`.
///
/// 🔴 КЛЮЧЕВОЙ БИОМАРКЕР — `adj_avg_pumps`: среднее число нажатий по НЕ
/// лопнувшим шарам. Лопнувшие в него не входят намеренно: там число нажатий
/// задано не решением человека, а точкой взрыва, и подмешав их, мы мерили бы
/// генератор, а не поведение.
///
/// 🔴 ТРЕТЬЯ ОСЬ — РАЗБРОС ТОЧКИ ВЗРЫВА, а не ещё одна ручка предела.
/// Мера ПРЯМО привязана к пределу: при равномерной точке взрыва выгоднее всего
/// качать до половины предела, поэтому рост `maxBurst` 16 → 128 поднимает саму
/// измеряемую величину примерно в восемь раз. Разброс устроен иначе: предел
/// каждого шара тянется СИММЕТРИЧНО вокруг `maxBurst`, среднее не меняется —
/// растёт только неопределённость. Выучить одно безопасное число больше нельзя,
/// а мера остаётся сравнимой сама с собой.
library;

import 'dart:math';

enum Difficulty { easy, medium, hard }

/// Пределы классических пресетов. ⚠️ Норма батареи `adj_avg_pumps` = 16±5
/// откалибрована на medium: предел 32, оптимум качать до 16.
const Map<Difficulty, int> maxBurstByDiff = {Difficulty.easy: 64, Difficulty.medium: 32, Difficulty.hard: 16};

const int bartMaxLevel = 15;

/// Уровень: три оси.
class BartLevel {
  const BartLevel({required this.balloons, required this.maxBurst, required this.burstSpread});

  /// Шаров за партию: 8 → 20 (больше подходов к риску за раунд).
  final int balloons;

  /// Верхняя граница точки взрыва: 16 → 128 (упирается уже на L13).
  final int maxBurst;

  /// Разброс предела между шарами: 0 → 0,5. На L1 все шары одинаковы.
  final double burstSpread;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА, — В САМУ ПАРТИЮ: `adj_avg_pumps` привязан
  /// к пределу, и два одинаковых на вид числа с разных уровней означают разное.
  Map<String, Object?> get condition =>
      {'balloons': balloons, 'maxBurst': maxBurst, 'burstSpread': burstSpread};

  static BartLevel of(int level) => BartLevel(
        balloons: level <= 3 ? 8 : (level <= 6 ? 12 : (level <= 9 ? 16 : 20)),
        maxBurst: min(128, 16 + (level - 1) * 10),
        burstSpread: min(0.5, (level - 1) * 0.036),
      );
}

/// Предел ОТДЕЛЬНОГО шара: симметричный разброс вокруг `maxBurst`.
///
/// ⚠️ Вынесено отдельно, чтобы гейт мог прогнать генератор, а не читать формулу
/// глазами: среднее обязано совпадать с `maxBurst`, иначе третья ось начнёт
/// двигать меру прохода — ровно то, чего она призвана избежать.
/// Пол 4 держит шар осмысленным при большом разбросе.
int burstCapForBalloon(int maxBurst, double spread, double Function() rnd) {
  if (spread <= 0) return maxBurst;
  final deviation = maxBurst * spread * (2 * rnd() - 1);
  return max(4, (maxBurst + deviation).round());
}

/// Итог одного шара.
class BalloonRecord {
  const BalloonRecord({required this.pumps, required this.popped});
  final int pumps;
  final bool popped;
}

/// Меры партии.
class BartMetrics {
  const BartMetrics({
    required this.adjAvgPumps,
    required this.popRate,
    required this.popped,
    required this.loseShift,
    required this.balloonsPlayed,
  });

  /// Среднее нажатий по НЕ лопнувшим шарам — биомаркер риска.
  final double adjAvgPumps;

  final double popRate;
  final int popped;

  /// Как меняются нажатия после исхода предыдущего шара.
  /// > 0 — после взрыва рискует МЕНЬШЕ, чем после успешного обналичивания.
  final double loseShift;

  final int balloonsPlayed;
}

BartMetrics calcMetrics(List<BalloonRecord> history, int balloonsTotal) {
  final nonBurst = history.where((h) => !h.popped).toList();
  final adj = nonBurst.isEmpty
      ? 0.0
      : nonBurst.map((h) => h.pumps).reduce((a, b) => a + b) / nonBurst.length;
  final popped = history.where((h) => h.popped).length;

  final afterBurst = <int>[], afterCash = <int>[];
  for (var i = 1; i < history.length; i++) {
    (history[i - 1].popped ? afterBurst : afterCash).add(history[i].pumps);
  }
  double mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;
  // ⚠️ Пустое плечо — меры НЕТ, и возвращается 0: разность со «случайным нулём»
  // была бы числом, которому нельзя верить. Так же в веб-версии.
  final shift = (afterBurst.isEmpty || afterCash.isEmpty)
      ? 0.0
      : ((mean(afterCash) - mean(afterBurst)) * 10).round() / 10;

  return BartMetrics(
    adjAvgPumps: (adj * 10).round() / 10,
    popRate: balloonsTotal == 0 ? 0 : popped / balloonsTotal,
    popped: popped,
    loseShift: shift,
    balloonsPlayed: history.length,
  );
}

/// Порог прохода: разумное среднее (не робко) БЕЗ частых взрывов (не
/// безрассудно). Порог среднего масштабируется от предела уровня — иначе он
/// означал бы разное на разных уровнях.
const double bartMinAdjShare = 0.20;
const double bartMaxPopRate = 0.6;

enum PumpOutcome { grew, popped }

/// Партия.
class BartGame {
  BartGame({
    required this.level,
    this.useLevels = true,
    Difficulty? classicDifficulty,
    int? balloonsOverride,
    Random? rnd,
  })  : params = classicDifficulty == null
            ? BartLevel.of(level)
            : BartLevel(
                balloons: balloonsOverride ?? 15,
                maxBurst: maxBurstByDiff[classicDifficulty]!,
                // В классике разброса нет: это ось лестницы, а лестницы там нет.
                burstSpread: 0,
              ),
        _rnd = rnd ?? Random();

  final int level;

  /// Уровневый режим. В классике и пресете лестница НЕ трогается.
  final bool useLevels;
  final BartLevel params;
  final Random _rnd;

  int bank = 0;
  int round = 0;
  int pumps = 0;
  bool popped = false;

  /// Шар уже обналичен. ⚠️ Отдельно от `popped`: без этого признака кнопка
  /// «забрать» срабатывала дважды по одному шару — второй раз клала в банк те же
  /// нажатия и добавляла в историю второй шар. В веб-версии то же самое держит
  /// отклик `feedback`, но опираться на показ нельзя: он живёт в экране.
  bool cashed = false;

  /// Предел ТЕКУЩЕГО шара. Человеку не показывается.
  int burstAt = 0;

  final List<BalloonRecord> history = [];

  double _next() => _rnd.nextDouble();

  bool get finished => history.length >= params.balloons;

  /// Сколько заберёт человек, если обналичит сейчас.
  int get pending => (popped || cashed) ? 0 : pumps;

  /// Шар закрыт — лопнул или обналичен.
  bool get closed => popped || cashed;

  void begin() {
    bank = 0;
    round = 0;
    history.clear();
    newBalloon();
  }

  /// Новый шар: свой предел и свой порог взрыва.
  ///
  /// ⚠️ Точка взрыва равномерна в [1, предел]: при этом выгоднее всего качать до
  /// ПОЛОВИНЫ предела (EV(k) = k·(N−k)/N), и норма батареи посчитана именно так.
  void newBalloon() {
    final cap = burstCapForBalloon(params.maxBurst, params.burstSpread, _next);
    burstAt = 1 + (_next() * cap).floor();
    pumps = 0;
    popped = false;
    cashed = false;
  }

  /// Накачать. Возвращает исход нажатия.
  PumpOutcome? pump() {
    if (closed || finished) return null;
    pumps += 1;
    if (pumps >= burstAt) {
      popped = true;
      history.add(BalloonRecord(pumps: pumps, popped: true));
      round += 1;
      // ⚠️ Лопнувший шар денег НЕ приносит — в этом вся проба.
      return PumpOutcome.popped;
    }
    return PumpOutcome.grew;
  }

  /// Забрать накачанное. `false` — забирать нечего.
  bool cashOut() {
    if (closed || pumps == 0 || finished) return false;
    cashed = true;
    bank += pumps;
    history.add(BalloonRecord(pumps: pumps, popped: false));
    round += 1;
    return true;
  }

  BartMetrics get metrics => calcMetrics(history, params.balloons);

  /// Уровень взят? В классике и пресете исхода нет.
  bool get passed {
    if (!useLevels) return false;
    final m = metrics;
    return m.adjAvgPumps >= params.maxBurst * bartMinAdjShare && m.popRate <= bartMaxPopRate;
  }
}
