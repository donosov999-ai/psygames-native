/// PRL — «Смена правил», четырнадцатая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/prl.tsx` (VER 3); эталон выгружен
/// прогоном живого TS в `test/fixtures/prl-reference.json`.
///
/// Два варианта: вероятностный исход (верный выбор награждается не всегда) и
/// СКРЫТЫЙ РАЗВОРОТ — после нескольких верных подряд хорошая и плохая карточки
/// молча меняются местами.
///
/// 🔴 ПРАВИЛО ПОКАЗЫВАЕТСЯ СРАЗУ, С ПЕРВОГО УРОВНЯ. Отчёт тестировщицы
/// 15.08.2026 дословно: «Что значит скрытно меняется? Как угадать???? Что за
/// тупая игра». Это не каприз: правило действительно не было объяснено, и
/// человек искренне решил, что от него требуют угадать. Угадывать не нужно —
/// нужно заметить смену по обратной связи и переключиться.
///
/// 🔴 ТРЕТЬЮ ОСЬ ЗДЕСЬ НЕЛЬЗЯ ВЗЯТЬ ЛЮБУЮ. Мера прохода — насколько быстро
/// человек замечает разворот и не упрямится ли со старым выбором. Любая ручка,
/// трогающая ВЕРОЯТНОСТИ НАГРАДЫ или ЧАСТОТУ РАЗВОРОТОВ, сдвигает саму эту
/// величину: шум уже служит осью (0,90 → 0,68), а частота разворотов меняет
/// число событий, по которым мера и считается. Задержка обратной связи свободна
/// от этого: вероятности и частота не меняются вовсе, но связать свой выбор с
/// исходом труднее — между нажатием и ответом проходит до 0,8 секунды.
library;

import 'dart:math';

enum Choice { a, b }

const int prlMaxLevel = 15;

/// Порог прохода уровня — 60 % верных на пост-разворотных блоках.
const double prlPassAccuracy = 0.6;

/// Классические пресеты — их выбирает человек, осью сложности они не являются.
class PrlPreset {
  const PrlPreset({required this.rewardProb, required this.trialsTotal, required this.revMin, required this.revMax});
  final double rewardProb;
  final int trialsTotal;
  final int revMin;
  final int revMax;
}

const Map<String, PrlPreset> prlClassicPresets = {
  'easy': PrlPreset(rewardProb: 0.90, trialsTotal: 40, revMin: 8, revMax: 10),
  'medium': PrlPreset(rewardProb: 0.80, trialsTotal: 60, revMin: 8, revMax: 12),
  'hard': PrlPreset(rewardProb: 0.70, trialsTotal: 80, revMin: 10, revMax: 16),
};

/// Уровень: три оси.
class PrlLevel {
  const PrlLevel({
    required this.rewardProb,
    required this.trialsTotal,
    required this.revMin,
    required this.revMax,
    required this.feedbackDelayMs,
  });

  /// Вероятность, что верный выбор будет награждён: 0,90 → 0,68 (шумнее).
  final double rewardProb;

  final int trialsTotal;

  /// Границы порога «верных подряд» до разворота: 8→3 (развороты чаще).
  final int revMin;
  final int revMax;

  /// Задержка обратной связи: 0 → 798 мс.
  final int feedbackDelayMs;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА, — В САМУ ПАРТИЮ.
  Map<String, Object?> get condition => {
        'rewardProb': rewardProb,
        'trialsTotal': trialsTotal,
        'revMin': revMin,
        'revMax': revMax,
        'feedbackDelayMs': feedbackDelayMs,
      };

  static PrlLevel of(int level) {
    final revMin = max(3, 8 - ((level - 1) * 0.5).floor());
    return PrlLevel(
      trialsTotal: level <= 4 ? 30 : (level <= 8 ? 40 : 50),
      rewardProb: max(0.68, 0.90 - (level - 1) * 0.022),
      revMin: revMin,
      revMax: revMin + 2,
      feedbackDelayMs: min(800, ((level - 1) * 57).round()),
    );
  }
}

/// Одна проба.
class PrlTrial {
  const PrlTrial({
    required this.index,
    required this.choice,
    required this.rewardedChoice,
    required this.rewarded,
    required this.isError,
    required this.blockIndex,
    required this.trialInBlock,
  });

  final int index;
  final Choice choice;

  /// Какая карточка была «хорошей» в этой пробе.
  final Choice rewardedChoice;

  /// Пришла ли награда. ⚠️ НЕ то же самое, что «выбор верный»: исход
  /// вероятностный, и верный выбор иногда наказывается.
  final bool rewarded;

  final bool isError;

  /// 0 — исходное правило, 1 — после первого разворота, и так далее.
  final int blockIndex;
  final int trialInBlock;
}

/// Меры партии.
class PrlMetrics {
  const PrlMetrics({
    required this.totalErrors,
    required this.accuracy,
    required this.reversalErrors,
    required this.perseverativeErrors,
    required this.winStayRate,
    required this.loseShiftRate,
    required this.postReversalAcc,
    required this.adaptAcc,
    required this.reversals,
  });

  final int totalErrors;
  final double accuracy;

  /// Ошибки ПОСЛЕ первого разворота.
  final int reversalErrors;

  /// Упрямство: третья подряд ошибка тем же выбором.
  final int perseverativeErrors;

  /// Держится ли человек за выбор после награды.
  final double winStayRate;

  /// Уходит ли после наказания.
  final double loseShiftRate;

  /// Точность в первых пяти пробах после каждого разворота.
  final double postReversalAcc;

  /// Доля верных на ВСЕХ пост-разворотных блоках — по ней идёт проход уровня.
  final double adaptAcc;

  final int reversals;
}

PrlMetrics calcMetrics(List<PrlTrial> trials) {
  final totalErrors = trials.where((t) => t.isError).length;
  final accuracy = trials.isEmpty ? 0.0 : (trials.length - totalErrors) / trials.length;
  final reversalErrors = trials.where((t) => t.blockIndex > 0 && t.isError).length;

  // Упрямство: ошибка, перед которой были ещё две ошибки ТЕМ ЖЕ выбором.
  var perseverative = 0;
  for (var i = 2; i < trials.length; i++) {
    if (trials[i].isError &&
        trials[i - 1].isError &&
        trials[i - 2].isError &&
        trials[i].choice == trials[i - 1].choice &&
        trials[i].choice == trials[i - 2].choice) {
      perseverative++;
    }
  }

  // ⚠️ Win-stay и lose-shift считаются по ИСХОДУ, а не по верности выбора:
  // человек видит только награду или наказание, верное правило от него скрыто.
  var winN = 0, winStay = 0, loseN = 0, loseShift = 0;
  for (var i = 0; i < trials.length - 1; i++) {
    if (trials[i].rewarded) {
      winN++;
      if (trials[i + 1].choice == trials[i].choice) winStay++;
    } else {
      loseN++;
      if (trials[i + 1].choice != trials[i].choice) loseShift++;
    }
  }

  final postTrials = trials.where((t) => t.blockIndex > 0 && t.trialInBlock < 5).toList();
  final postCorrect = postTrials.where((t) => !t.isError).length;

  final adaptTrials = trials.where((t) => t.blockIndex > 0).toList();
  final adaptCorrect = adaptTrials.where((t) => !t.isError).length;

  return PrlMetrics(
    totalErrors: totalErrors,
    accuracy: accuracy,
    reversalErrors: reversalErrors,
    perseverativeErrors: perseverative,
    winStayRate: winN > 0 ? winStay / winN : 0,
    loseShiftRate: loseN > 0 ? loseShift / loseN : 0,
    postReversalAcc: postTrials.isEmpty ? 0 : postCorrect / postTrials.length,
    // ⚠️ Разворота не случилось (короткая партия) — падаем на общую точность,
    // чтобы не заваливать уровень ПУСТОЙ пост-разворотной выборкой.
    adaptAcc: adaptTrials.isEmpty ? accuracy : adaptCorrect / adaptTrials.length,
    reversals: trials.isEmpty ? 0 : trials.last.blockIndex,
  );
}

/// Партия.
class PrlGame {
  PrlGame({
    required this.level,
    this.classic = false,
    PrlPreset? preset,
    Random? rnd,
  })  : params = preset == null
            ? PrlLevel.of(level)
            : PrlLevel(
                rewardProb: preset.rewardProb,
                trialsTotal: preset.trialsTotal,
                revMin: preset.revMin,
                revMax: preset.revMax,
                // В классике задержки нет: она ось лестницы, а лестницы там нет.
                feedbackDelayMs: 0,
              ),
        _rnd = rnd ?? Random();

  final int level;

  /// Классический режим — без лестницы и без записи условия уровня.
  final bool classic;
  final PrlLevel params;
  final Random _rnd;

  final List<PrlTrial> trials = [];
  int bank = 0;

  /// Какая карточка сейчас «хорошая». Человеку НЕ показывается.
  Choice good = Choice.a;
  int blockIndex = 0;
  int trialInBlock = 0;
  int _consecutiveCorrect = 0;
  bool _locked = false;

  PrlTrial? pending;
  bool revealed = false;

  bool get finished => trials.length >= params.trialsTotal;
  bool get locked => _locked;
  int get consecutiveCorrect => _consecutiveCorrect;

  double _next() => _rnd.nextDouble();

  void begin() {
    trials.clear();
    bank = 0;
    good = Choice.a;
    blockIndex = 0;
    trialInBlock = 0;
    _consecutiveCorrect = 0;
    _locked = false;
    pending = null;
    revealed = false;
  }

  /// Выбор карточки. `null` — нажатие не засчитано.
  ///
  /// ⚠️ Банк здесь НЕ двигается: он меняется вместе с показом исхода.
  /// Прыгнувшее число выдавало бы результат до обратной связи, и задержка не
  /// нагружала бы ничего.
  PrlTrial? choose(Choice c) {
    if (_locked || finished) return null;
    _locked = true;
    final isCorrect = c == good;
    final r = _next();
    // Исход вероятностный в ОБЕ стороны: верный выбор иногда наказывается,
    // неверный иногда награждается. Иначе разворот читался бы с первой ошибки.
    final rewarded = isCorrect ? r < params.rewardProb : r >= params.rewardProb;
    final t = PrlTrial(
      index: trials.length,
      choice: c,
      rewardedChoice: good,
      rewarded: rewarded,
      isError: !isCorrect,
      blockIndex: blockIndex,
      trialInBlock: trialInBlock,
    );
    trials.add(t);
    trialInBlock += 1;
    if (isCorrect) {
      _consecutiveCorrect += 1;
    } else {
      _consecutiveCorrect = 0;
    }
    pending = t;
    revealed = false;
    return t;
  }

  /// Показать исход и подвинуть счёт.
  void revealPending() {
    final t = pending;
    if (t == null || revealed) return;
    bank += t.rewarded ? 10 : -5;
    revealed = true;
  }

  /// Закрыть пробу: может случиться разворот.
  ///
  /// ⚠️ Порог разворота розыгрывается КАЖДЫЙ раз заново в [revMin, revMax]:
  /// при ровном пороге человек считал бы верные и знал момент смены.
  /// true — правило развернулось.
  bool closeTrial() {
    final threshold = params.revMin + (_next() * (params.revMax - params.revMin + 1)).floor();
    var reversed = false;
    if (_consecutiveCorrect >= threshold) {
      good = good == Choice.a ? Choice.b : Choice.a;
      blockIndex += 1;
      trialInBlock = 0;
      _consecutiveCorrect = 0;
      reversed = true;
    }
    pending = null;
    revealed = false;
    _locked = false;
    return reversed;
  }

  PrlMetrics get metrics => calcMetrics(trials);

  /// Уровень взят? В классике исхода нет вовсе.
  bool get passed => !classic && metrics.adaptAcc >= prlPassAccuracy;
}
