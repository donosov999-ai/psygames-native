/// ANT — «Сети внимания», двенадцатая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/ant.tsx` (VER 2); эталон выгружен
/// прогоном живого TS в `test/fixtures/ant-reference.json`.
///
/// 🔴 ТРИ МЕРЫ ИЗ ОДНОЙ ПАРТИИ — и все три РАЗНОСТНЫЕ (Fan et al. 2002,
/// «Testing the Efficiency and Independence of Attentional Networks»):
///   alerting  = RT(без подсказки) − RT(двойная подсказка)
///   orienting = RT(центральная)   − RT(пространственная)
///   executive = RT(конфликтные)   − RT(согласованные)
/// Поэтому каждая проба обязана попасть ровно в одну ячейку по подсказке и ровно
/// в одну по согласованности; иначе разность считается по перемешанным группам.
///
/// 🔴 ДОЛИ ПРОБ ЗАМОРОЖЕНЫ НА КАНОНЕ И ОСЬЮ СЛОЖНОСТИ НЕ ЯВЛЯЮТСЯ: 1/3 : 1/3 : 1/3,
/// одинаково на всех уровнях. До 07.09.2026 доля конфликтных росла 0,30 → 0,55 —
/// и это был дефект, а не отступление: `executive_ms` И ЕСТЬ эффект конфликта,
/// то есть ручка, которой рос уровень, уменьшала величину, ради которой проба
/// существует. Тот же дефект снят у Струпа, Саймона и фланкера; стережётся
/// гейтом `conflict-ratio-is-not-difficulty`.
///
/// СЛОЖНОСТЬ РАСТЁТ НЕПРЕДСКАЗУЕМОСТЬЮ ИНТЕРВАЛОВ, а не долями: разброс
/// пред-паузы 400 → 1520 мс и разброс CTOA 100 → 660 мс. Обе оси канонные для
/// ANT: alerting-сеть нельзя «завести» ритмом, если ритма нет.
library;

import 'dart:math';

/// Доля конфликтных и доля нейтральных проб. Согласованные — остаток.
const double antIncongruentProb = 1 / 3;
const double antNeutralProb = 1 / 3;

const int antMaxLevel = 15;

/// Какая подсказка была перед мишенью.
enum CueType { none, center, double_, spatial }

/// Куда смотрят фланги относительно мишени.
enum Congruence { congruent, incongruent, neutral }

enum Direction { left, right }

enum Position { top, bottom }

/// Одна проба.
class AntTrial {
  const AntTrial({
    required this.cue,
    required this.pos,
    required this.dir,
    required this.cong,
    required this.flankers,
  });

  final CueType cue;
  final Position pos;

  /// Куда смотрит ЦЕЛЬ — средняя стрелка. Это и есть верный ответ.
  final Direction dir;
  final Congruence cong;

  /// Четыре фланга. `null` — нейтральная проба: флангов нет вовсе, а не «они
  /// смотрят куда-то»; отсутствие флангов и есть отсутствие конфликта.
  final List<Direction>? flankers;
}

/// Уровень: объём, окно ответа и два разброса.
class AntLevel {
  const AntLevel({
    required this.trials,
    required this.windowMs,
    required this.preJitterMs,
    required this.ctoaVarMs,
  });

  final int trials;

  /// Окно ответа: 3000 → 1040 мс.
  final int windowMs;

  /// Разброс пред-паузы: 400 → 1520 мс. Момент подсказки нельзя предугадать.
  final int preJitterMs;

  /// Разброс интервала «подсказка → мишень»: 100 → 660 мс.
  final int ctoaVarMs;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТЫ ТРИ МЕРЫ, — В САМУ ПАРТИЮ.
  /// Не «восстановим через levelParams(level)»: поменяется формула — и
  /// накопленное молча станет нечитаемым.
  Map<String, Object?> get condition =>
      {'trials': trials, 'windowMs': windowMs, 'preJitterMs': preJitterMs, 'ctoaVarMs': ctoaVarMs};

  static AntLevel of(int level) => AntLevel(
        trials: level <= 5 ? 12 : (level <= 10 ? 16 : 20),
        windowMs: max(1000, 3000 - (level - 1) * 140),
        preJitterMs: 400 + (level - 1) * 80,
        ctoaVarMs: 100 + (level - 1) * 40,
      );
}

/// Рождение пробы.
///
/// ⚠️ Очередь случайных та же, что в TS: подсказка → позиция → направление →
/// согласованность. Уровень в розыгрыш НЕ входит — доли от него не зависят.
AntTrial makeTrial(double Function() rnd) {
  final cue = CueType.values[(rnd() * CueType.values.length).floor()];
  final pos = Position.values[(rnd() * Position.values.length).floor()];
  final dir = Direction.values[(rnd() * Direction.values.length).floor()];
  final r = rnd();
  final cong = r < antIncongruentProb
      ? Congruence.incongruent
      : (r < antIncongruentProb + antNeutralProb ? Congruence.neutral : Congruence.congruent);
  List<Direction>? flankers;
  switch (cong) {
    case Congruence.congruent:
      flankers = [dir, dir, dir, dir];
    case Congruence.incongruent:
      final opp = dir == Direction.left ? Direction.right : Direction.left;
      flankers = [opp, opp, opp, opp];
    case Congruence.neutral:
      flankers = null;
  }
  return AntTrial(cue: cue, pos: pos, dir: dir, cong: cong, flankers: flankers);
}

/// Запись одной верной пробы: по каким ячейкам её разносить.
class AntRt {
  const AntRt({required this.cue, required this.cong, required this.rt});
  final CueType cue;
  final Congruence cong;
  final int rt;
}

/// Три сети внимания плюс среднее время.
class AntNetworks {
  const AntNetworks({
    required this.alertingMs,
    required this.orientingMs,
    required this.executiveMs,
    required this.meanRtMs,
  });

  final int alertingMs;
  final int orientingMs;
  final int executiveMs;
  final int meanRtMs;
}

/// Подсчёт трёх сетей.
///
/// ⚠️ Пустая ячейка даёт 0, и разность считается как есть — так же в веб-версии.
/// Это НЕ «сети нет»: ноль здесь неотличим от настоящего нуля, и читать такую
/// цифру можно только вместе с числом проб. Партия в 12 проб на четыре вида
/// подсказки — примерно по три на ячейку.
AntNetworks calcNetworks(List<AntRt> data) {
  double mean(bool Function(AntRt) pred) {
    final xs = data.where(pred).map((r) => r.rt).toList();
    if (xs.isEmpty) return 0;
    return xs.reduce((a, b) => a + b) / xs.length;
  }

  final alerting = mean((r) => r.cue == CueType.none) - mean((r) => r.cue == CueType.double_);
  final orienting = mean((r) => r.cue == CueType.center) - mean((r) => r.cue == CueType.spatial);
  final executive = mean((r) => r.cong == Congruence.incongruent) - mean((r) => r.cong == Congruence.congruent);
  final meanRt = data.isEmpty ? 0.0 : data.map((r) => r.rt).reduce((a, b) => a + b) / data.length;
  return AntNetworks(
    alertingMs: alerting.round(),
    orientingMs: orienting.round(),
    executiveMs: executive.round(),
    meanRtMs: meanRt.round(),
  );
}

/// Примеры для разбора — ДАННЫЕ: согласованная проба со ПРОСТРАНСТВЕННОЙ
/// подсказкой и конфликтная БЕЗ подсказки.
///
/// Обе половины упражнения видны сразу: подсказка говорит, КУДА смотреть
/// (ориентир), фланги мешают ответу (исполнение). Ответ в обеих — направление
/// СРЕДНЕЙ стрелки.
List<AntTrial> antDemoTrials() => const [
      AntTrial(
        cue: CueType.spatial,
        pos: Position.top,
        dir: Direction.right,
        cong: Congruence.congruent,
        flankers: [Direction.right, Direction.right, Direction.right, Direction.right],
      ),
      AntTrial(
        cue: CueType.none,
        pos: Position.bottom,
        dir: Direction.right,
        cong: Congruence.incongruent,
        flankers: [Direction.left, Direction.left, Direction.left, Direction.left],
      ),
    ];

enum AntOutcome { hit, wrong, miss }

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double antPassAccuracy = 0.8;

/// Партия.
class AntGame {
  AntGame({
    required this.level,
    Random? rnd,
    int Function()? nowMs,
    int? trialsOverride,
  })  : params = AntLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? AntLevel.of(level).trials;

  final int level;
  final AntLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;
  final List<AntRt> records = [];

  AntTrial? trial;
  bool _answered = true;
  bool _targetShown = false;
  int _targetAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get targetShown => _targetShown;

  void begin() => _startedAt = _now();

  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    trial = makeTrial(_next);
    _answered = false;
    _targetShown = false;
    return true;
  }

  /// Пред-пауза до подсказки: 400 мс плюс разброс уровня.
  int preDelayMs() => 400 + (_next() * params.preJitterMs).floor();

  /// Пауза между исчезновением подсказки и мишенью.
  ///
  /// ⚠️ Без подсказки пауза длиннее на 100 мс — ровно на то время, что подсказка
  /// висела бы. Иначе пробы «без подсказки» шли бы раньше остальных, и alerting
  /// мерил бы разницу в моменте, а не в готовности.
  int blankMs(CueType cue) {
    final base = cue == CueType.none ? 400 : 300;
    return base + (_next() * params.ctoaVarMs).floor();
  }

  /// Сколько висит подсказка.
  static const int cueMs = 100;

  /// Мишень на экране — с этого момента идёт отсчёт.
  void showTarget() {
    _targetShown = true;
    _targetAt = _now();
  }

  AntOutcome answer(Direction d) {
    final t = trial;
    if (t == null || _answered || !_targetShown) return AntOutcome.miss;
    _answered = true;
    final rt = _now() - _targetAt;
    if (d == t.dir) {
      hits += 1;
      // ⚠️ В ячейки идут ТОЛЬКО верные пробы: время ошибочного ответа не про
      // скорость сети, и попав в разность, оно её исказит.
      records.add(AntRt(cue: t.cue, cong: t.cong, rt: rt));
      return AntOutcome.hit;
    }
    errors += 1;
    return AntOutcome.wrong;
  }

  AntOutcome timeout() {
    if (_answered) return AntOutcome.miss;
    _answered = true;
    errors += 1;
    return AntOutcome.miss;
  }

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  AntNetworks get networks => calcNetworks(records);

  int? get meanRtMs {
    if (records.isEmpty) return null;
    return (records.map((r) => r.rt).reduce((a, b) => a + b) / records.length).round();
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
