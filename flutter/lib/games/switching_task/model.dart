/// «Переключение задач» — девятая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/switching-task.tsx`; эталон выгружен
/// прогоном живого TS в `test/fixtures/switching-reference.json`.
///
/// 🔴 ЦЕНА ПЕРЕКЛЮЧЕНИЯ — РАЗНОСТЬ SWITCH- И REPEAT-ПРОБ, А НЕ SWITCH И «ВСЕХ».
/// Общее среднее само содержит switch-пробы, поэтому разность со средним даёт
/// заниженную в (1 − p) раз величину: при p = 0,5 — ровно вдвое.
///
/// 🔴 ДОЛЯ ПЕРЕКЛЮЧЕНИЙ ЗАМОРОЖЕНА НА КАНОНЕ 0,5 и осью сложности не является:
/// цена переключения зависит от доли, и ручка двигала бы саму меру.
///
/// ⚠️ ПОМЕХИ БЕРУТСЯ ИЗ ОБЩЕГО МОДУЛЯ РАЗДЕЛА (`makeDecoys` рядом со Струпом) —
/// своей копии тут нет: у веб-версии они тоже общие (`src/games/attention/decoys.ts`).
library;

import 'dart:math';

import '../stroop/model.dart' show makeDecoys, decoysMax;


/// Чем показывают стимул. Задачи внутри режима свои, но правило одно: «ОЦЕНИ»
/// сверху говорит, что именно сейчас оценивать.
enum StimMode { mix, num2, num3, letters }

/// Доля проб со сменой задачи. Канон парадигмы — случайная последовательность.
const double switchProb = 0.5;

/// Потолок лестницы.
const int switchingMaxLevel = 15;

const List<String> _digits = ['2', '3', '4', '5', '6', '7', '8', '9'];
const List<String> _letters = ['A', 'E', 'I', 'U', 'B', 'D', 'F', 'G', 'K', 'M', 'N', 'P', 'R', 'S', 'T'];
final List<String> _allLetters = List.generate(26, (i) => String.fromCharCode(65 + i));
const Set<String> _vowels = {'A', 'E', 'I', 'O', 'U'};

/// Порог «меньше / не меньше» для числовых режимов.
int midFor(StimMode mode) => mode == StimMode.num3 ? 500 : 50;

/// Одна проба: какая задача сейчас, чем показан стимул и что считается «левым».
class SwitchTrial {
  const SwitchTrial({
    required this.taskIdx,
    required this.num,
    required this.letter,
    required this.full,
    required this.correctLeft,
    required this.isSwitch,
    required this.decoys,
  });

  /// 0 или 1 — какая из двух задач режима сейчас активна.
  final int taskIdx;
  final int num;
  final String letter;

  /// Что человек видит на экране.
  final String full;

  /// Верный ответ — левая кнопка.
  final bool correctLeft;

  /// Задача сменилась по сравнению с прошлой пробой.
  final bool isSwitch;
  final List<String> decoys;
}

/// Что задаёт уровень: объём, окно ответа и число помех.
class SwitchLevel {
  const SwitchLevel({
    required this.trials,
    required this.switchProbability,
    required this.windowMs,
    required this.decoys,
  });

  final int trials;
  final double switchProbability;

  /// Окно ответа, мс: 3400 → 1400.
  final int windowMs;

  /// Помех вокруг стимула: 0 → 2 → 4. ⚠️ Границы (4 и 9) намеренно НЕ совпадают
  /// с границами объёма (6 и 11): оси переключаются вразнобой и дают больше
  /// различимых ступеней.
  final int decoys;

  static SwitchLevel of(int level) {
    final l = level;
    return SwitchLevel(
      trials: l <= 5 ? 12 : (l <= 10 ? 16 : 20),
      switchProbability: switchProb,
      windowMs: max(1400, 3400 - (l - 1) * 145),
      decoys: l <= 3 ? 0 : (l <= 8 ? 2 : decoysMax),
    );
  }
}

/// Стимул режима. ⚠️ Порядок обращений к случайности тот же, что в TS.
({int num, String letter, String full}) genStim(StimMode mode, double Function() rnd) {
  switch (mode) {
    case StimMode.mix:
      final num = int.parse(_digits[(rnd() * _digits.length).floor()]);
      final letter = _letters[(rnd() * _letters.length).floor()];
      return (num: num, letter: letter, full: '$num$letter');
    case StimMode.num2:
      final num = 10 + (rnd() * 90).floor();
      return (num: num, letter: '', full: '$num');
    case StimMode.num3:
      final num = 100 + (rnd() * 900).floor();
      return (num: num, letter: '', full: '$num');
    case StimMode.letters:
      final letter = _allLetters[(rnd() * _allLetters.length).floor()];
      return (num: 0, letter: letter, full: letter);
  }
}

/// Верный ли ответ «левая кнопка» для этой задачи режима.
bool judgeLeft(StimMode mode, int idx, int num, String letter) {
  switch (mode) {
    case StimMode.mix:
      return idx == 0 ? num % 2 == 1 : _vowels.contains(letter);
    case StimMode.num2:
    case StimMode.num3:
      return idx == 0 ? num % 2 == 1 : num < midFor(mode);
    case StimMode.letters:
      return idx == 0 ? _vowels.contains(letter) : letter.compareTo('M') <= 0;
  }
}

/// Рождение пробы. Поток СВЯЗНЫЙ: следующая задача зависит от предыдущей,
/// поэтому предыдущая передаётся явно.
///
/// ⚠️ Очередь случайных: выбор задачи → стимул (одно число или два) → помехи.
SwitchTrial makeTrial(StimMode mode, int level, int? last, double Function() rnd) {
  final params = SwitchLevel.of(level);
  int taskIdx;
  if (last == null) {
    taskIdx = rnd() < 0.5 ? 0 : 1;
  } else if (rnd() < params.switchProbability) {
    taskIdx = last == 0 ? 1 : 0;
  } else {
    taskIdx = last;
  }
  final isSwitch = last != null && last != taskIdx;
  final stim = genStim(mode, rnd);
  // Помехи рождаются ВМЕСТЕ с пробой, а не в отрисовке: иначе они менялись бы на
  // каждом кадре, и мельтешение добавляло бы к пробе другую нагрузку.
  final decoys = makeDecoys(params.decoys, rnd);
  return SwitchTrial(
    taskIdx: taskIdx,
    num: stim.num,
    letter: stim.letter,
    full: stim.full,
    correctLeft: judgeLeft(mode, taskIdx, stim.num, stim.letter),
    isSwitch: isSwitch,
    decoys: decoys,
  );
}

/// Цена переключения: среднее switch-проб минус среднее repeat-проб.
///
/// ⚠️ Пустое подмножество — цены НЕТ, возвращается 0: разность со «случайным
/// нулём» была бы числом, которому нельзя верить. Так же устроено в веб-версии.
int switchCostMs(List<int> switchRts, List<int> repeatRts) {
  if (switchRts.isEmpty || repeatRts.isEmpty) return 0;
  double mean(List<int> xs) => xs.reduce((a, b) => a + b) / xs.length;
  return (mean(switchRts) - mean(repeatRts)).round();
}

enum SwitchOutcome { hit, wrong, miss }

/// Партия.
class SwitchingGame {
  SwitchingGame({
    required this.level,
    this.mode = StimMode.mix,
    Random? rnd,
    int Function()? nowMs,
    int? trialsOverride,
  })  : params = SwitchLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? SwitchLevel.of(level).trials;

  final int level;
  final StimMode mode;
  final SwitchLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;

  final List<int> rts = [];
  final List<int> switchRts = [];
  final List<int> repeatRts = [];

  SwitchTrial? trial;
  int? _lastTask;
  bool _answered = true;
  bool _shown = false;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get stimulusShown => _shown;

  void begin() => _startedAt = _now();

  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    final t = makeTrial(mode, level, _lastTask, _next);
    _lastTask = t.taskIdx;
    trial = t;
    _answered = false;
    _shown = false;
    return true;
  }

  void showStimulus() {
    _shown = true;
    _stimAt = _now();
  }

  /// Ответ человека: левая кнопка или правая.
  SwitchOutcome answer(bool left) {
    final t = trial;
    if (t == null || _answered || !_shown) return SwitchOutcome.miss;
    _answered = true;
    final rt = _now() - _stimAt;
    if (left == t.correctLeft) {
      hits += 1;
      rts.add(rt);
      // Два плеча цены переключения копятся порознь.
      if (t.isSwitch) {
        switchRts.add(rt);
      } else {
        repeatRts.add(rt);
      }
      return SwitchOutcome.hit;
    }
    errors += 1;
    return SwitchOutcome.wrong;
  }

  SwitchOutcome timeout() {
    if (_answered) return SwitchOutcome.miss;
    _answered = true;
    errors += 1;
    return SwitchOutcome.miss;
  }

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  int? get meanRtMs {
    if (rts.isEmpty) return null;
    return (rts.reduce((a, b) => a + b) / rts.length).round();
  }

  /// Мера пробы: цена переключения. Норма батареи 150 ± 80.
  int get switchCost => switchCostMs(switchRts, repeatRts);

  /// Очки — формулой веб-версии.
  int get score {
    final mean = meanRtMs ?? 0;
    return max(0, (hits * 80 - errors * 50 - mean * 0.05).round());
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
