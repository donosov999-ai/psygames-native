import 'dart:math';

/// «Цифровой ряд» — третий экран пилота и первый ДРУГОГО типа: здесь нет поля,
/// по которому водят пальцем, а есть показ по таймеру и ввод цифр.
///
/// Правила перенесены из `frontend/app/games/digit-span.tsx` (у этой игры нет
/// отдельного ядра — они живут прямо в экране, как и у большинства остальных 92).
/// Сверка идёт не на глаз: эталоны выгружены из живого TS и лежат в
/// `test/fixtures/digit-span-reference.json`.
enum Direction { forward, backward, ascending }

/// Потолок объёма: выше него длина ряда больше не растёт, растут другие оси.
const dsVolumeTop = 14;

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

/// ОЖИДАЕМЫЙ ОТВЕТ — ОДНО МЕСТО НА ВСЕ ТРИ НАПРАВЛЕНИЯ.
///
/// ⚠️ В React-версии это правило однажды было записано дважды — в разборе ввода
/// и в строке «было: …» после ошибки. Любой новый режим разъезжался ровно
/// посередине: ответ считался по одному правилу, а показывался по другому.
/// Здесь оно одно, и обе стороны зовут его.
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

/// Партия: что показали, что человек ввёл, чем кончилось.
class DigitSpanGame {
  DigitSpanGame({required this.level, required this.direction, List<int>? sequence, Random? rnd})
      : params = LevelParams.of(level),
        sequence = sequence ?? _make(LevelParams.of(level).startLen, rnd ?? Random());

  final int level;
  final Direction direction;
  final LevelParams params;
  final List<int> sequence;

  final List<int> entered = [];

  static List<int> _make(int len, Random rnd) => List.generate(len, (_) => rnd.nextInt(10));

  List<int> get expected => expectedDigits(sequence, direction);

  bool get full => entered.length >= sequence.length;

  /// Ввод цифры. Возвращает false, когда ряд уже набран — экран по этому
  /// признаку гасит клавиши, а не набирает лишнее молча.
  bool enter(int digit) {
    if (full || digit < 0 || digit > 9) return false;
    entered.add(digit);
    return true;
  }

  void undo() {
    if (entered.isNotEmpty) entered.removeLast();
  }

  void clear() => entered.clear();

  /// Победа — только когда ряд набран ПОЛНОСТЬЮ и совпал с ожидаемым.
  bool get isWon {
    if (!full) return false;
    final e = expected;
    for (var i = 0; i < e.length; i++) {
      if (entered[i] != e[i]) return false;
    }
    return true;
  }

  /// На какой позиции первая ошибка (для разбора после партии); -1 — ошибок нет.
  int get firstWrong {
    final e = expected;
    for (var i = 0; i < entered.length && i < e.length; i++) {
      if (entered[i] != e[i]) return i;
    }
    return -1;
  }
}
