import 'dart:math';

import '../../shell/voice.dart';

/// «Цифровой ряд» — правила, перенесённые из `frontend/app/games/digit-span.tsx` и сверенные с
/// эталоном живого TS (`test/fixtures/digit-span-reference.json`; экспортёр в репо:
/// `frontend/src/games/digit-span/tools/record-flutter-reference.gen.ts`). Считать перенос
/// «проверенным» той же формулой, которой переносил, нельзя — такая проба зелёная всегда.
///
/// 🔴 ПЕРЕНОС 01.10.2026 — ВТОРОЙ, ЦЕЛИКОМ. Первый (23.09) играл ОДИН ряд за уровень, а уровень
/// веба — лесенка длин: верно → ряд длиннее, две ошибки на одной длине → конец. Не было подачи
/// голосом и «весь ряд разом», трёх лестниц, темпа шага зарядки, а ось 9 (направление после
/// показа) была объявлена в [LevelParams] и не исполнялась экраном.
enum Direction { forward, backward, ascending }

/// Чем подан стимул: цифру ВИДНО по одной, её СЛЫШНО, или ВЕСЬ РЯД СРАЗУ (веб `Delivery`).
enum Delivery { screen, voice, all }

/// Ступени темпа показа — живые только в шаге зарядки (веб `Pace`, см. [showTiming]).
enum Pace { slow, normal, fast }

/// Потолок объёма: выше него длина ряда больше не растёт, растут другие оси.
const dsVolumeTop = 14;

/// Паузы экрана — как в вебе: после показа до ввода, до проверки набранного, до следующего ряда.
const dsAfterShowMs = 300;
const dsSubmitDelayMs = 250;
const dsNextRowMs = 600;

/// Что задаёт уровень. Перенос `levelParams`.
///
/// 🔴 СЛОЖНОСТЬ РАСТЁТ НЕ ДЛИНОЙ. Замер раздела 07.09.2026: с L14 длина упёрлась
/// в девять цифр, а показ — в своё дно, и сорок семь уровней стали неотличимы.
/// Поэтому выше потолка включаются задержка перед вводом и объявление
/// направления ПОСЛЕ показа: ряд надо держать, не зная, как его отдавать.
class LevelParams {
  const LevelParams({
    required this.startLen,
    required this.showMs,
    required this.gapMs,
    required this.reverse,
    required this.holdMs,
    required this.surpriseDir,
  });

  /// Длина ряда на старте уровня: L1 = 4 … L6 = 9, дальше держим 9.
  final int startLen;

  /// Сколько цифра держится на экране.
  final int showMs;

  /// Через сколько приходит следующая.
  final int gapMs;

  /// С L11 ввод обязательно обратный.
  final bool reverse;

  /// Пауза между показом и вводом — ось задержки, включается выше потолка объёма.
  final int holdMs;

  /// Направление объявляется ПОСЛЕ показа — ось непредсказуемости.
  final bool surpriseDir;

  static LevelParams of(int level) {
    final fast = max(0, level - 6);
    return LevelParams(
      startLen: min(9, 3 + level),
      showMs: max(350, 700 - fast * 45),
      gapMs: max(550, 1100 - fast * 70),
      reverse: level >= 11,
      holdMs: max(0, level - dsVolumeTop) * 700,
      surpriseDir: level > dsVolumeTop,
    );
  }
}

/// ОЖИДАЕМЫЙ ОТВЕТ — ОДНО МЕСТО НА ВСЕ ТРИ НАПРАВЛЕНИЯ: и разбор ввода, и строка «было: …».
List<int> expectedDigits(List<int> seq, Direction dir) {
  switch (dir) {
    case Direction.backward:
      return seq.reversed.toList();
    case Direction.ascending:
      return [...seq]..sort();
    case Direction.forward:
      return [...seq];
  }
}

/// Сколько держать весь ряд на экране: столько же, сколько шёл бы показ по одной (веб `allAtOnceMs`).
int allAtOnceMs(int len, int gapMs) => max(600, len * gapMs);

const _paceMs = {
  Pace.slow: (showMs: 1000, gapMs: 1600),
  Pace.normal: (showMs: 700, gapMs: 1100),
  Pace.fast: (showMs: 450, gapMs: 750),
};

/// Темп партии: в личной игре его целиком задаёт уровень, в шаге зарядки — ступень темпа.
({int showMs, int gapMs}) showTiming({required bool isPreset, required int level, required Pace pace}) {
  if (!isPreset) {
    final p = LevelParams.of(level);
    return (showMs: p.showMs, gapMs: p.gapMs);
  }
  return _paceMs[pace]!;
}

/// ЧЕМ ПОДАЁМ НА САМОМ ДЕЛЕ: голос обещать нельзя, пока говорить нечем — тогда партия идёт
/// экраном, а причина молчания написана на экране настроек. Два экранных способа отдают себя.
Delivery effectiveDelivery(Delivery chosen, VoiceBlock? block) {
  if (chosen == Delivery.voice) return block == null ? Delivery.voice : Delivery.screen;
  return chosen;
}

/// Ключ лестницы для способа подачи. Экранный остаётся на прежнем `digit_span` — накопленный
/// уровень переезжает сам; голос и «разом» — свои лестницы с первого уровня.
String ladderIdFor(Delivery chosen, VoiceBlock? block) {
  final eff = effectiveDelivery(chosen, block);
  return eff == Delivery.screen ? 'digit_span' : 'digit_span_${eff.name}';
}

/// Что стоит рекордом в шапке по ходу партии: незачётная партия его не двигает даже на экране.
int? hudRecord(int? stored, int span, bool counts) {
  if (!counts) return stored;
  if (stored == null) return span > 0 ? span : null;
  return max(stored, span);
}

/// Ряд цифр — `len` раз по `floor(rng() * 10)`, как веб `generateSeq`.
List<int> generateSeq(int len, double Function() rng) => [for (var i = 0; i < len; i++) (rng() * 10).floor()];

/// Ось 9: направление разыгрывается ОДИН раз на партию, до первого ряда (веб `drawDirection`).
Direction drawDirection(double Function() rng) => Direction.values[(rng() * Direction.values.length).floor()];

/// Шаг лесенки длин — веб `spanStep`: верно → длина +1 и счёт ошибок на длине с нуля; неверно →
/// +1 ошибка на ЭТОЙ длине, две — стоп (и стоп на двенадцатом раунде).
({int nextLen, bool cont, int atLenErrors}) spanStep({
  required int seqLen,
  required int round,
  required int atLenErrors,
  required bool correct,
}) {
  if (correct) return (nextLen: seqLen + 1, cont: true, atLenErrors: 0);
  final at = atLenErrors + 1;
  return (nextLen: seqLen, cont: !(at >= 2 || round >= 12), atLenErrors: at);
}

/// Партия кончена — веб `spanFinished`.
bool spanFinished(({int nextLen, bool cont, int atLenErrors}) step) => !step.cont || step.nextLen > 12;

/// Метки партии в статистике — веб `sessionLabels`: шаг «Оценки» пишет свои (diff + направление),
/// личная игра — направление и последнюю длину.
({String difficulty, String mode}) sessionLabels({
  required bool isPreset,
  required String diff,
  required Direction direction,
  required int finalLength,
}) =>
    isPreset ? (difficulty: diff, mode: direction.name) : (difficulty: direction.name, mode: 'start$finalLength');

/// Партия — лесенка длин уровня. Что показали, что набрано, докуда дошли.
class DigitSpanSession {
  DigitSpanSession({required this.level, required this.isPreset, required this.direction, required this.startLen})
      : seqLen = startLen;

  /// Уровень правил партии: в шаге зарядки — первый (веб `effLevel`).
  final int level;
  final bool isPreset;
  final Direction direction;
  final int startLen;

  int seqLen;
  int round = 1;
  int atLenErrors = 0;
  int correctRounds = 0;
  int maxSpan = 0;
  int errors = 0;
  bool finished = false;
  List<int> sequence = const [];
  final List<int> entered = [];

  /// Новый ряд текущей длины.
  void deal(double Function() rng) {
    sequence = generateSeq(seqLen, rng);
    entered.clear();
  }

  List<int> get expected => expectedDigits(sequence, direction);

  bool get full => entered.length >= seqLen;

  /// Ввод цифры. false — ряд уже набран: экран гасит клавиши, а не набирает лишнее молча.
  bool enter(int digit) {
    if (finished || full || digit < 0 || digit > 9) return false;
    entered.add(digit);
    return true;
  }

  void undo() {
    if (entered.isNotEmpty) entered.removeLast();
  }

  /// Набранный ряд целиком совпал с ожидаемым.
  bool get rowCorrect {
    if (!full) return false;
    final e = expected;
    for (var i = 0; i < e.length; i++) {
      if (entered[i] != e[i]) return false;
    }
    return true;
  }

  /// Сдать ряд — шаг лесенки. true — партия кончена (длина и раунд тогда не двигаются).
  bool submit() {
    final correct = rowCorrect;
    final step = spanStep(seqLen: seqLen, round: round, atLenErrors: atLenErrors, correct: correct);
    if (correct) {
      correctRounds += 1;
      maxSpan = max(maxSpan, seqLen);
    } else {
      errors += 1;
    }
    atLenErrors = step.atLenErrors;
    if (spanFinished(step)) return finished = true;
    if (correct) seqLen = step.nextLen;
    round += 1;
    return false;
  }

  /// Уровень взят — хотя бы один верный ряд; шаг зарядки лестницу не двигает.
  bool get passed => !isPreset && correctRounds >= 1;

  int get score => maxSpan * 10;
}
