/// ПРАВИЛА «ТАБЛИЦЫ ШУЛЬТЕ» — ПЕРЕНОС С ЖИВОГО TS, А НЕ ПЕРЕСКАЗ.
///
/// Источники переноса: `frontend/src/games/schulte/core/table.ts` (раскладка и
/// порядок целей), `levelParams` из `frontend/app/games/schulte.tsx` (лестница),
/// `frontend/src/games/schulte/core/blocks.ts` (серия трёх блоков).
///
/// 🔴 Сверка — не этой же формулой: `test/schulte_test.dart` сравнивает каждое
/// число с эталонами `test/fixtures/schulte-reference.json`, которые выгружены
/// ПРОГОНОМ того самого TS. Броски случайности в эталоне лежат списком, поэтому
/// раскладка сверяется поэлементно, без общего генератора.
library;

import 'dart:math';

enum ContentMode { numbers, letters, mixed }

enum Direction { forward, backward, centerOut }

/// Настройки ступени. Оси: объём (сторона), строгость порядка (обратный ход),
/// сходство (буквы, Горбов), двойная задача (цвет) и непредсказуемость
/// (правило объявляется после показа, клетки убегают).
class LevelParams {
  const LevelParams({
    required this.gridSize,
    required this.contentMode,
    required this.direction,
    required this.colorMode,
    required this.surpriseStart,
    required this.moving,
  });

  final int gridSize;
  final ContentMode contentMode;
  final Direction direction;

  /// Клетки раскрашены — цвет не несёт правила, он помеха.
  final bool colorMode;

  /// Ось 9: с чего начнётся чередование Горбова, известно не сразу.
  final bool surpriseStart;

  /// Ось 9: после каждого верного нажатия клетки меняются местами.
  final bool moving;

  /// Ступени 1…15 остались побайтно такими же, как были до оси 9 — трудность
  /// уже пройденного не переписывают задним числом.
  static LevelParams of(int level) {
    const numbers = ContentMode.numbers;
    const letters = ContentMode.letters;
    const mixed = ContentMode.mixed;
    const fwd = Direction.forward;
    const back = Direction.backward;
    LevelParams p(int size, ContentMode mode, Direction dir,
            {bool color = false, bool surprise = false, bool moving = false}) =>
        LevelParams(
          gridSize: size,
          contentMode: mode,
          direction: dir,
          colorMode: color,
          surpriseStart: surprise,
          moving: moving,
        );
    if (level <= 1) return p(5, numbers, fwd);
    if (level == 2) return p(6, numbers, fwd);
    if (level == 3) return p(7, numbers, fwd);
    if (level == 4) return p(5, numbers, back);
    if (level == 5) return p(6, numbers, back);
    if (level == 6) return p(5, letters, fwd);
    if (level == 7) return p(5, letters, back);
    if (level == 8) return p(5, numbers, fwd, color: true);
    if (level == 9) return p(6, numbers, fwd, color: true);
    if (level == 10) return p(5, letters, fwd, color: true);
    if (level == 11) return p(5, letters, back, color: true);
    if (level == 12) return p(5, mixed, fwd);
    if (level == 13) return p(6, mixed, fwd);
    if (level == 14) return p(5, mixed, fwd, color: true);
    if (level == 15) return p(6, mixed, fwd, color: true);
    // Ось 9 включается здесь. Растёт не размером: у Горбова сторону выше шести
    // поднять нельзя — греческий алфавит (24 знака) не обслуживает 7×7.
    if (level == 16) return p(6, mixed, fwd, surprise: true);
    if (level == 17) return p(6, mixed, fwd, color: true, surprise: true);
    return p(6, mixed, fwd, color: true, surprise: true, moving: true); // L18+
  }

  String get signature =>
      '$gridSize|$contentMode|$direction|$colorMode|$surpriseStart|$moving';
}

/// Докуда лестница РЕАЛЬНО растёт — считается прогоном, а не вписано числом:
/// вписанное разошлось бы с правилами при первой их правке молча.
final int schulteLevelsTop = () {
  var last = 1;
  var prev = LevelParams.of(1).signature;
  for (var level = 2; level <= 200; level += 1) {
    final cur = LevelParams.of(level).signature;
    if (cur != prev) {
      last = level;
      prev = cur;
    }
  }
  return last;
}();

/// Наибольшая сторона, которую письменность вообще обслуживает.
/// У Горбова буквами занята половина клеток, поэтому греческий (24 знака)
/// держит ровно 6×6 — выше партия не собралась бы вовсе.
int maxGridFor(ContentMode mode, int alphabetSize) {
  if (mode == ContentMode.numbers) return 10;
  for (var n = 10; n >= 2; n -= 1) {
    final need = mode == ContentMode.letters ? n * n : (n * n + 1) ~/ 2;
    if (need <= alphabetSize) return n;
  }
  return 2;
}

/// От центра наружу: h, h+1, h−1, h+2, h−2… Зовётся ЧИСЛОМ КЛЕТОК.
List<int> centerOutOrder(int n) {
  final mid = (n + 1) ~/ 2;
  final order = <int>[mid];
  var lo = mid - 1;
  var hi = mid + 1;
  while (order.length < n) {
    if (hi <= n) order.add(hi++);
    if (order.length < n && lo >= 1) order.add(lo--);
  }
  return order;
}

/// Клетка — число или знак письменности. Сравнение идёт по значению, то есть
/// по тому, что человек видит на клетке.
typedef SchulteCell = Object;

class SchulteTable {
  const SchulteTable({required this.items, required this.sequence});

  /// Что лежит по клеткам слева направо и сверху вниз.
  final List<SchulteCell> items;

  /// Что искать по порядку.
  final List<SchulteCell> sequence;
}

/// Цели по порядку и набор клеток ДО перемешивания.
SchulteTable schulteSequence({
  required int size,
  required ContentMode contentMode,
  required Direction direction,
  required String alphabet,
  bool lettersFirst = false,
}) {
  final totalCells = size * size;
  List<SchulteCell> items;
  List<SchulteCell> sequence;

  if (contentMode == ContentMode.numbers) {
    items = List<SchulteCell>.generate(totalCells, (i) => i + 1);
    sequence = direction == Direction.centerOut
        ? centerOutOrder(totalCells).cast<SchulteCell>().toList()
        : List<SchulteCell>.from(items);
  } else if (contentMode == ContentMode.letters) {
    final chars = alphabet.characters(totalCells);
    items = List<SchulteCell>.from(chars);
    sequence = List<SchulteCell>.from(chars);
  } else {
    // Горбов: 1, А, 2, Б… — обратный ход и «от центра» к нему не применяются.
    final half = (totalCells + 1) ~/ 2;
    final numbers = List<int>.generate(half, (i) => i + 1);
    final letters = alphabet.characters(totalCells - half);
    sequence = <SchulteCell>[];
    for (var i = 0; i < half; i += 1) {
      if (lettersFirst) {
        if (i < letters.length) sequence.add(letters[i]);
        sequence.add(numbers[i]);
      } else {
        sequence.add(numbers[i]);
        if (i < letters.length) sequence.add(letters[i]);
      }
    }
    sequence = sequence.take(totalCells).toList();
    items = List<SchulteCell>.from(sequence);
  }

  if (direction == Direction.backward && contentMode != ContentMode.mixed) {
    sequence = sequence.reversed.toList();
  }
  return SchulteTable(items: items, sequence: sequence);
}

/// Готовая таблица: цели по порядку и перемешанная раскладка.
/// Перемешивание — Фишер—Йетс с конца, как в вебе: порядок бросков тот же,
/// иначе при одних и тех же числах раскладки разъехались бы.
SchulteTable schulteTable({
  required int size,
  required ContentMode contentMode,
  required Direction direction,
  required String alphabet,
  bool lettersFirst = false,
  double Function()? random,
}) {
  final rnd = random ?? Random().nextDouble;
  final built = schulteSequence(
    size: size,
    contentMode: contentMode,
    direction: direction,
    alphabet: alphabet,
    lettersFirst: lettersFirst,
  );
  final items = built.items;
  for (var i = items.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return SchulteTable(items: items, sequence: built.sequence);
}

extension on String {
  /// Первые `count` знаков письменности. Именно знаков: в деванагари и хирагане
  /// код-единица не равна букве, а на экране человек видит знак.
  List<String> characters(int count) {
    final out = <String>[];
    for (final rune in runes) {
      if (out.length >= count) break;
      out.add(String.fromCharCode(rune));
    }
    return out;
  }
}

/// Что вышло из нажатия по клетке в уровневой партии.
enum PressResult { hit, miss, ignored, finished }

/// Партия уровня: таблица, текущая цель, ошибки. Правило то же, что в вебе:
/// верное значение двигает цель, чужое считается ошибкой и поле не меняет.
class SchulteGame {
  SchulteGame({
    required this.level,
    required this.alphabet,
    bool? lettersFirst,
    Random? rnd,
  })  : params = LevelParams.of(level),
        _rnd = rnd ?? Random() {
    // Жребий оси 9: с цифры или с буквы. До объявления правило скрыто от игрока.
    this.lettersFirst =
        lettersFirst ?? (params.surpriseStart && _rnd.nextDouble() < 0.5);
    final table = schulteTable(
      size: size,
      contentMode: params.contentMode,
      direction: params.direction,
      alphabet: alphabet,
      lettersFirst: this.lettersFirst,
      random: _rnd.nextDouble,
    );
    items = table.items;
    sequence = table.sequence;
  }

  final int level;
  final String alphabet;
  final LevelParams params;
  final Random _rnd;

  late final bool lettersFirst;
  late List<SchulteCell> items;
  late List<SchulteCell> sequence;

  int index = 0;
  int errors = 0;

  /// Сторона поля с поправкой на письменность: у бедного алфавита уровень
  /// обрезается, иначе клеток не хватит и партия не закончится никогда.
  int get size {
    final want = params.gridSize;
    final fits = maxGridFor(params.contentMode, _alphabetLength);
    return want < fits ? want : fits;
  }

  int get _alphabetLength => alphabet.runes.length;

  int get total => items.length;
  bool get done => index >= sequence.length;
  SchulteCell get target => sequence[index < sequence.length ? index : sequence.length - 1];

  /// Нажатие по клетке. `ruleRevealed == false` — нажатие не считается ни
  /// верным, ни ошибочным: правило ещё не объявлено.
  PressResult press(int cell, {bool ruleRevealed = true}) {
    if (!ruleRevealed || done) return PressResult.ignored;
    if (cell < 0 || cell >= items.length) return PressResult.ignored;
    if (items[cell] != sequence[index]) {
      errors += 1;
      return PressResult.miss;
    }
    index += 1;
    if (done) return PressResult.finished;
    if (params.moving) reshuffle();
    return PressResult.hit;
  }

  /// Убегающая цель: после верного нажатия клетки меняются местами.
  void reshuffle() {
    for (var i = items.length - 1; i > 0; i -= 1) {
      final j = _rnd.nextInt(i + 1);
      final tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }
}
