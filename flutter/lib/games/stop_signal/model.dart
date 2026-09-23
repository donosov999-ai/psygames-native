import 'dart:math';

import 'ladder.dart';
import 'ssrt.dart';

export 'ladder.dart';
export 'ssrt.dart';

/// Партия «Стоп-сигнала».
///
/// Порядок пробы: пауза фиксации → GO (стрелка) → в стоп-пробе через `ssdMs`
/// появляется знак «стоп» → окно ответа кончается.
///
/// 🔴 ЛЕСТНИЦА ЖИВЁТ ДОЛЬШЕ ПАРТИИ. `startSsd` приходит снаружи (из хранилища,
/// общего с веб-версией), а `ssdMs` двигается после КАЖДОЙ стоп-пробы. В конце
/// партии экран обязан сохранить и ступень, и пробы: за три-пять стоп-проб
/// одного захода лестница до точки схождения не доходит.
enum StopOutcome {
  /// Нажал на GO вовремя — верно.
  go,

  /// Не нажал на GO — пропуск.
  goMiss,

  /// Удержался в стоп-пробе — верно, лестница идёт вверх.
  inhibited,

  /// Сорвался в стоп-пробе (в том числе нажал ДО сигнала) — лестница вниз.
  failedStop,
}

class StopSignalGame {
  StopSignalGame({
    required this.level,
    int? startSsd,
    Random? rnd,
    int Function()? nowMs,
    int? trialsOverride,
  })  : params = StopSignalLevel.of(level),
        ssdMs = startSsd ?? ssdStartMs,
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? StopSignalLevel.of(level).trials;

  final int level;
  final StopSignalLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  /// Текущая ступень лестницы. Переживает партию.
  int ssdMs;

  int round = 0;
  int hits = 0;
  int misses = 0;
  int inhibited = 0;
  int failedStops = 0;

  /// Пробы ЭТОЙ партии — их экран добавит к накопленному окну.
  final List<StopSignalTrial> runTrials = [];
  final List<int> goRts = [];

  /// Сейчас идёт стоп-проба.
  bool isStopTrial = false;

  /// Ступень, назначенная ЭТОЙ пробе (в среднюю задержку входит даже при
  /// преждевременном нажатии).
  int trialSsd = ssdStartMs;

  /// Пауза фиксации текущей пробы, мс.
  int fixationMs = 700;

  bool _answered = true;
  bool _goShown = false;
  bool _stopShown = false;
  int _goAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get goShown => _goShown;
  bool get stopShown => _stopShown;

  void begin() => _startedAt = _now();

  /// Следующая проба. Очередь случайных: вид пробы → пауза фиксации.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    isStopTrial = _next() < params.stopProbability;
    fixationMs = params.fixMinMs + (_next() * params.fixJitterMs).floor();
    trialSsd = ssdMs;
    _answered = false;
    _goShown = false;
    _stopShown = false;
    return true;
  }

  /// Показан GO — отсюда идёт отсчёт времени реакции.
  void showGo() {
    _goShown = true;
    _goAt = _now();
  }

  /// В стоп-пробе через `trialSsd` после GO появляется знак «стоп».
  void showStop() {
    if (isStopTrial) _stopShown = true;
  }

  /// Нажатие человека.
  StopOutcome? press() {
    if (_answered || !_goShown) return null;
    _answered = true;
    final rt = _now() - _goAt;
    if (isStopTrial) {
      // ⚠️ Сорвался — даже если нажал ДО появления знака: методика требует
      // считать это ответом в стоп-пробе и вести лестницу вниз.
      failedStops += 1;
      runTrials.add(StopSignalTrial(
        isStop: true,
        ssdMs: trialSsd,
        rtMs: rt,
        goWindowMs: params.goWindowMs,
      ));
      ssdMs = nextSsd(ssdMs, false);
      return StopOutcome.failedStop;
    }
    hits += 1;
    goRts.add(rt);
    runTrials.add(StopSignalTrial(
      isStop: false,
      ssdMs: null,
      rtMs: rt,
      goWindowMs: params.goWindowMs,
    ));
    return StopOutcome.go;
  }

  /// Окно ответа кончилось.
  StopOutcome closeTrial() {
    if (_answered) {
      return isStopTrial ? StopOutcome.failedStop : StopOutcome.go;
    }
    _answered = true;
    if (isStopTrial) {
      inhibited += 1;
      runTrials.add(StopSignalTrial(
        isStop: true,
        ssdMs: trialSsd,
        rtMs: null,
        goWindowMs: params.goWindowMs,
      ));
      ssdMs = nextSsd(ssdMs, true);
      return StopOutcome.inhibited;
    }
    misses += 1;
    runTrials.add(StopSignalTrial(
      isStop: false,
      ssdMs: null,
      rtMs: null,
      goWindowMs: params.goWindowMs,
    ));
    return StopOutcome.goMiss;
  }

  /// Точность партии: верное нажатие на GO и верное удержание в стоп-пробе.
  double get accuracy => trialsTotal == 0 ? 0 : (hits + inhibited) / trialsTotal;

  /// Среднее время реакции по нажатым GO. Пусто, когда их не было.
  int? get meanGoRtMs {
    if (goRts.isEmpty) return null;
    return (goRts.reduce((a, b) => a + b) / goRts.length).round();
  }

  /// Очки — формулой веб-версии: попадание 50, удержание 100, ошибка −60.
  int get score => max(0, hits * 50 + inhibited * 100 - (misses + failedStops) * 60);

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
