import 'dart:math';

/// «Кубики Корси» — классический тест зрительно-пространственного объёма.
///
/// Правила перенесены из `frontend/app/games/corsi.tsx` и сверены с эталонами,
/// выгруженными прогоном ЖИВОГО TS (`test/fixtures/corsi-reference.json`).
/// Проверять перенос той же формулой, которой переносил, нельзя — такая проба
/// зелёная всегда; поэтому числа уровней приходят из выгрузки, а ход партии
/// стережёт отдельная проба, играющая нажатиями.

/// Потолок объёма. Выше него длина ряда и темп показа уже на пределе, и растёт
/// другая ось — задержка между показом и вводом (правило раздела «потолков нет»).
const corsiVolumeTop = 14;

/// Блоков на доске всегда девять — это и есть предел длины ряда.
const corsiBlocks = 9;

/// Две ошибки заканчивают партию. Так устроен классический Корси: после первой
/// ошибки даётся вторая попытка на ТОЙ ЖЕ длине, после второй — конец.
const corsiErrorsToStop = 2;

/// Доска Корси нерегулярная: блоки стоят вразнобой, иначе ряд запоминался бы
/// как узор на сетке, а не как путь. Координаты — из веб-версии (доска 400×420),
/// экран масштабирует их под своё поле.
const corsiBoardWidth = 400.0;
const corsiBoardHeight = 420.0;
const corsiPositions = <({double x, double y})>[
  (x: 70, y: 80), (x: 200, y: 50), (x: 320, y: 90),
  (x: 50, y: 200), (x: 220, y: 180), (x: 340, y: 220),
  (x: 80, y: 320), (x: 240, y: 320), (x: 320, y: 360),
];

/// Что задаёт уровень.
class LevelParams {
  const LevelParams({
    required this.startSpan,
    required this.tickMs,
    required this.flashMs,
    required this.reverse,
    required this.holdMs,
  });

  /// С какой длины ряда начинается партия: L1 = 3 … L6 = 8.
  final int startSpan;

  /// Шаг показа: сколько проходит от вспышки до вспышки.
  final int tickMs;

  /// Сколько горит сам блок.
  final int flashMs;

  /// С L10 ряд повторяется в обратном порядке.
  final bool reverse;

  /// Пауза между концом показа и открытием ввода — ось задержки выше потолка объёма.
  final int holdMs;

  static LevelParams of(int level) {
    final fast = max(0, level - 6);
    return LevelParams(
      startSpan: min(8, 2 + level),
      tickMs: max(480, 800 - fast * 45),
      flashMs: max(280, 500 - fast * 30),
      reverse: level >= 10,
      holdMs: max(0, level - corsiVolumeTop) * 700,
    );
  }
}

/// Чем кончилось нажатие.
enum TapOutcome {
  /// Нажатие не в счёт: партия кончилась или блока нет.
  ignored,

  /// Верно, но ряд ещё не набран.
  progress,

  /// Ряд повторён целиком — круг взят.
  roundWon,

  /// Промах: этот блок не тот, который ждали на этом месте.
  roundLost,
}

/// Партия: ряды растут, пока человек их берёт; две ошибки — конец.
class CorsiGame {
  CorsiGame({required this.level, List<int>? sequence, Random? rnd})
      : params = LevelParams.of(level),
        _rnd = rnd ?? Random() {
    _seq = sequence ?? drawSequence(params.startSpan);
  }

  final int level;
  final LevelParams params;
  final Random _rnd;

  List<int> _seq = const [];
  final List<int> _answer = [];

  /// Лучшая взятая длина ряда за партию.
  int span = 0;
  int errors = 0;
  bool finished = false;

  /// Ряд, который показали.
  List<int> get sequence => List.unmodifiable(_seq);

  /// Что человек уже нажал.
  List<int> get answer => List.unmodifiable(_answer);

  /// Ожидаемый порядок ответа. Выше L9 ряд повторяется задом наперёд.
  List<int> get expected => params.reverse ? _seq.reversed.toList() : List.of(_seq);

  /// Уровень пройден, если взята длина, с которой уровень начинается.
  bool get passed => span >= params.startSpan;

  /// Счёт партии — как в веб-версии: длина ряда дороже ошибок.
  int get score => max(0, span * 200 - errors * 50);

  /// Случайный ряд из РАЗНЫХ блоков: повтор блока в одном ряду сделал бы
  /// «нажми дважды сюда», а это уже другая задача.
  List<int> drawSequence(int len) {
    final all = List.generate(corsiBlocks, (i) => i)..shuffle(_rnd);
    return all.take(min(len, corsiBlocks)).toList();
  }

  /// Следующий круг — на один блок длиннее.
  void nextRound([List<int>? sequence]) {
    _seq = sequence ?? drawSequence(min(corsiBlocks, _seq.length + 1));
    _answer.clear();
  }

  /// Тот же круг заново — вторая попытка после первой ошибки.
  void retryRound([List<int>? sequence]) {
    _seq = sequence ?? drawSequence(_seq.length);
    _answer.clear();
  }

  TapOutcome tap(int block) {
    if (finished || block < 0 || block >= corsiBlocks) return TapOutcome.ignored;
    _answer.add(block);
    final exp = expected;
    if (_answer.last != exp[_answer.length - 1]) {
      errors += 1;
      if (errors >= corsiErrorsToStop) finished = true;
      return TapOutcome.roundLost;
    }
    if (_answer.length == exp.length) {
      span = max(span, _seq.length);
      // Девять блоков — предел доски: расти ряду дальше некуда.
      if (_seq.length >= corsiBlocks) finished = true;
      return TapOutcome.roundWon;
    }
    return TapOutcome.progress;
  }
}
