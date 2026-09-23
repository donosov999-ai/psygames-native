/// «Торможение» — одиннадцатая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/inhibition.tsx` (VER 4);
/// эталон выгружен прогоном живого TS в `test/fixtures/inhibition-reference.json`.
///
/// 🔴 ДВЕ ПАРАДИГМЫ В ОДНОЙ ИГРЕ, и режим — это ПРАВИЛО, а не сложность:
/// «Go/No-Go» (не жми на запретный), «Стоп-сигнал» (жми, но отмени по сигналу)
/// и «Микс» (через раунд). Лестница у всех трёх общая.
///
/// 🔴 ДОЛИ ЗАМОРОЖЕНЫ И ОСЬЮ СЛОЖНОСТИ НЕ ЯВЛЯЮТСЯ.
/// Было: `stopProb = min(0.35, 0.20 + (level−1)·0.011)`. Замер 16.09.2026:
/// стоп-проб на партию 4,0 (L1) → 11,2 (L15), рост в 2,8 раза. Мера прохода тут —
/// ошибки торможения: больше стоп-проб = больше возможностей ошибиться, то есть
/// число ошибок растёт САМО, без роста трудности. Этот же дефект снят в разделе
/// уже семь раз (stroop, simon, flanker, ant, stroop-emotional, switching-task,
/// go-no-go) и стережётся гейтом `conflict-ratio-is-not-difficulty`.
///
/// 📚 Канон стоп-сигнала — 25 % стоп-проб: Verbruggen F. et al. (2019), eLife
/// 8:e46323, «For standard stop-signal studies, 25% stop signals is recommended».
/// Отступления нет.
///
/// 📚 ОТСТУПЛЕНИЕ ОТ КАНОНА, ЧИСЛОМ. Та же работа, Recommendation 4: задержку
/// стоп-сигнала вести адаптивной лестницей (успешный стоп → SSD больше, шаг 50 мс,
/// сходится к p(respond|signal) ≈ 0,50). Здесь SSD на уровне ОДНА: 150 мс на L1
/// и 480 мс на L15, шаг между уровнями 24 мс. Поэтому SSRT по этим партиям НЕ
/// считается — канон с лестницей и SSRT живёт на отдельном экране «Стоп-сигнал»
/// (`lib/games/stop_signal/ladder.dart`).
library;

import 'dart:math';

/// Доля стоп-проб в режиме «Стоп-сигнал».
const double inhibitionStopProb = 0.25;

/// Доля запретных в режиме Go/No-Go.
///
/// ⚠️ Значение то же, что у отдельного экрана go-no-go (`nogoProb`), и это не
/// совпадение: в веб-версии оно берётся импортом, чтобы два экрана с одним
/// game_type не могли разойтись. До 17.09.2026 здесь стояло 0,30 при обещанных
/// в комментарии 25 % — и в одной истории лежали партии с двумя разными долями.
const double inhibitionNogoProb = 0.25;

const int inhibitionMaxLevel = 15;

/// Какую парадигму играем.
enum SubMode { goNoGo, stopSignal, mixed }

/// Что за проба идёт сейчас: Go/No-Go или стоп-сигнальная.
enum TrialKind { gng, ss }

/// Стимул режима Go/No-Go.
enum GngStim { go, nogo }

/// Что стоит на экране в стоп-сигнальной пробе.
enum SsSignal { idle, go, stop, feedback }

/// Исход пробы. Имена общие для обеих парадигм: попадание, пропуск, ложная
/// тревога (ошибка торможения) и верное торможение.
enum InhibitionOutcome { hit, miss, falseAlarm, correctReject }

/// Уровень: объём, задержка стоп-сигнала и окно ответа.
class InhibitionLevel {
  const InhibitionLevel({
    required this.trials,
    required this.stopProb,
    required this.ssdMs,
    required this.goWindowMs,
  });

  /// Проб в партии: 20 → 26 → 32. Дольше держать режим.
  final int trials;

  /// Доля стоп-проб. ⚠️ Одна и та же на всех уровнях.
  final double stopProb;

  /// Задержка стоп-сигнала: 150 → 480 мс. Сигнал приходит позже, отменить труднее.
  ///
  /// ⚠️ ОСЬЮ БЫТЬ МОЖЕТ, но с оговоркой: при фиксированной задержке доля
  /// неудавшихся торможений зависит от самой задержки, поэтому ошибки ДВУХ
  /// РАЗНЫХ уровней между собой не сравнимы. Сравнивать можно человека с собой
  /// на одном уровне — и ровно для этого `ssd_ms` кладётся в запись партии.
  final int ssdMs;

  /// Окно ответа: 1300 → 852 мс.
  final int goWindowMs;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА ПРОХОДА, — В САМУ ПАРТИЮ.
  /// Не «восстановим через levelParams(level)»: поменяется формула уровня — и
  /// накопленное молча станет нечитаемым.
  Map<String, Object?> get condition =>
      {'trials': trials, 'stopProb': stopProb, 'ssd': ssdMs, 'goWindow': goWindowMs};

  static InhibitionLevel of(int level) => InhibitionLevel(
        trials: level <= 5 ? 20 : (level <= 10 ? 26 : 32),
        stopProb: inhibitionStopProb,
        ssdMs: min(480, 150 + (level - 1) * 24),
        goWindowMs: max(850, 1300 - (level - 1) * 32),
      );
}

/// Какую пробу играем в этом раунде.
///
/// ⚠️ В «Миксе» — строго через раунд, по ЧЁТНОСТИ номера, а не случайно:
/// случайный выбор дал бы партии с перекосом в одну парадигму, и два человека
/// с одинаковым числом ошибок ошибались бы в разном.
TrialKind pickTrialKind(SubMode mode, int roundIndex) {
  switch (mode) {
    case SubMode.goNoGo:
      return TrialKind.gng;
    case SubMode.stopSignal:
      return TrialKind.ss;
    case SubMode.mixed:
      return roundIndex % 2 == 0 ? TrialKind.gng : TrialKind.ss;
  }
}

/// Стимул Go/No-Go.
GngStim pickGngStimulus(double Function() rnd) =>
    rnd() < inhibitionNogoProb ? GngStim.nogo : GngStim.go;

/// Партия.
class InhibitionGame {
  InhibitionGame({
    required this.level,
    this.mode = SubMode.goNoGo,
    Random? rnd,
    int Function()? nowMs,
    int? trialsOverride,
  })  : params = InhibitionLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? InhibitionLevel.of(level).trials;

  final int level;
  final SubMode mode;
  final InhibitionLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int misses = 0;
  int falseAlarms = 0;
  int correctRejections = 0;
  final List<int> rts = [];

  TrialKind? kind;
  GngStim? gngStim;
  SsSignal ssSignal = SsSignal.idle;
  bool _isStopTrial = false;
  bool _responded = true;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _responded;
  bool get isStopTrial => _isStopTrial;

  void begin() => _startedAt = _now();

  /// Новая проба. false — партия кончилась.
  ///
  /// Стимул Go/No-Go показывается сразу; стоп-сигнальная проба сперва держит
  /// паузу (`fixationMs`), и только потом зажигает «жми».
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    kind = pickTrialKind(mode, round);
    round += 1;
    _responded = false;
    ssSignal = SsSignal.idle;
    gngStim = null;
    if (kind == TrialKind.gng) {
      gngStim = pickGngStimulus(_next);
      _stimAt = _now();
    } else {
      // Мишень пробы решается ДО паузы, как в веб-версии: иначе розыгрыш
      // пришёлся бы на момент показа и сдвинул очередь случайных.
      _isStopTrial = _next() < params.stopProb;
    }
    return true;
  }

  /// Пауза перед «жми» в стоп-сигнальной пробе: 600…1000 мс.
  ///
  /// ⚠️ Разброс обязателен: при ровной паузе человек начинает жать по счёту, а
  /// не по сигналу, и проба перестаёт мерить реакцию.
  int fixationMs() => 600 + (_next() * 400).floor();

  /// Стоп-сигнальная проба зажгла «жми».
  void showSsGo() {
    ssSignal = SsSignal.go;
    _stimAt = _now();
  }

  /// Пришёл стоп-сигнал. Если человек уже ответил, сигнал не зажигается —
  /// отменять нечего.
  void showSsStop() {
    if (_responded) return;
    ssSignal = SsSignal.stop;
  }

  /// Нажатие.
  InhibitionOutcome? press() {
    if (_responded) return null;
    if (kind == TrialKind.gng) {
      if (gngStim == null) return null;
      _responded = true;
      final rt = _now() - _stimAt;
      if (gngStim == GngStim.go) {
        hits += 1;
        rts.add(rt);
        return InhibitionOutcome.hit;
      }
      falseAlarms += 1;
      return InhibitionOutcome.falseAlarm;
    }
    // Стоп-сигнальная: жать можно только когда «жми» или «стоп» уже на экране.
    if (ssSignal != SsSignal.go && ssSignal != SsSignal.stop) return null;
    _responded = true;
    final rt = _now() - _stimAt;
    if (_isStopTrial) {
      falseAlarms += 1;
      return InhibitionOutcome.falseAlarm;
    }
    hits += 1;
    rts.add(rt);
    return InhibitionOutcome.hit;
  }

  /// Окно ответа истекло.
  InhibitionOutcome? timeout() {
    if (_responded) return null;
    _responded = true;
    ssSignal = SsSignal.feedback;
    final stopLike = kind == TrialKind.gng ? gngStim == GngStim.nogo : _isStopTrial;
    if (stopLike) {
      correctRejections += 1;
      return InhibitionOutcome.correctReject;
    }
    misses += 1;
    return InhibitionOutcome.miss;
  }

  /// Убрать стимул с экрана после ответа.
  ///
  /// 🔴 БЕЗ ЭТОГО КРУГ ВИСИТ ВСЮ ПАУЗУ ДО СЛЕДУЮЩЕЙ ПРОБЫ, и человек не видит
  /// границы проб: зелёный круг, который не гас, читается как «всё ещё жми».
  /// В веб-версии стимул гасится тем же местом (`setGngStim(null)` перед
  /// планированием следующего раунда).
  void clearStimulus() {
    gngStim = null;
    ssSignal = SsSignal.idle;
  }

  /// Пауза между пробами Go/No-Go: 500…799 мс.
  ///
  /// ⚠️ Берётся из ТОГО ЖЕ розыгрыша, что и стимулы: своя `Random()` сделала бы
  /// партию неповторимой по времени, даже если стимулы повторимы, и пробы
  /// экрана снова начали бы плавать.
  int gngGapMs() => 500 + (_next() * 300).floor();

  int get total => hits + misses + falseAlarms + correctRejections;

  double get accuracy => total == 0 ? 0 : (hits + correctRejections) / total;

  int? get meanRtMs {
    if (rts.isEmpty) return null;
    return (rts.reduce((a, b) => a + b) / rts.length).round();
  }

  /// Мера прохода: ошибки торможения. ⚠️ СВОЁ имя поля в записи партии —
  /// `inhibition_commission`, а не общее `falseAlarms`: у go-no-go мера уже
  /// называется так, а здесь число значит другое — ошибки собраны на ДВУХ
  /// парадигмах сразу и при зафиксированной задержке, поэтому читаются они
  /// только вместе с `submode` и `ssd_ms`.
  int get inhibitionCommission => falseAlarms;

  /// Очки формулой веб-версии.
  int get score => hits * 10 + correctRejections * 5 - falseAlarms * 12 - misses * 5;

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double inhibitionPassAccuracy = 0.8;
