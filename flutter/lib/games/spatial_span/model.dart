/// «ПРОСТРАНСТВЕННЫЙ РЯД» (CANTAB Spatial Span) — перенос правил из `app/games/spatial-span.tsx`.
///
/// Клетки сетки вспыхивают по одной; повторить их надо В ОБРАТНОМ ПОРЯДКЕ. Длина растёт, пока
/// человек справляется; ДВЕ ошибки на одной длине заканчивают партию. Спан — докуда дошёл.
///
/// 🔴 ЛИМИТ ОШИБОК ЗДЕСЬ И ЕСТЬ ИЗМЕРЕНИЕ. Спан — это длина, на которой человек сломался, поэтому
/// «второй жизни» в игре нет и не будет: лишняя попытка врала бы прямо в замер.
///
/// 🔴 ОБЪЯВЛЕННАЯ СЛОЖНОСТЬ ОБЯЗАНА ИСПОЛНЯТЬСЯ. Задержка `holdMs` не просто лежит в параметрах
/// ступени — она стоит между последней вспышкой и открытием ввода. Ровно на расхождении этих двух
/// мест построен дефект «Матрицы памяти»: формула обещала 43 клетки, поле давало 17.
library;

import 'dart:math' as math;

/// Верх объёма и скорости: выше него прежние оси не двигаются, растёт только задержка.
///
/// ⚠️ Замер 11.09.2026: без третьей оси прогон `levelParams` на L1…L60 давал 46 пар одинаковых
/// соседей из 59 — сорок шесть уровней требовали прохождения, ничем не отличаясь от предыдущего.
const int volumeTop = 14;

class LevelParams {
  const LevelParams({
    required this.startSpan,
    required this.gridSize,
    required this.tickMs,
    required this.flashMs,
    required this.holdMs,
  });

  /// С какой длины начинается партия — она же планка ступени.
  final int startSpan;
  final int gridSize;

  /// Шаг показа: одна вспышка за `tickMs`.
  final int tickMs;

  /// Сколько клетка горит.
  final int flashMs;

  /// Задержка между концом показа и открытием ввода — третья ось сложности.
  final int holdMs;

  int get cells => gridSize * gridSize;
}

LevelParams levelParams(int level) {
  final startSpan = level + 1 < 7 ? level + 1 : 7;
  final fast = level - 6 > 0 ? level - 6 : 0;
  return LevelParams(
    startSpan: startSpan,
    gridSize: level >= 11 ? 5 : 4,
    tickMs: 750 - fast * 40 > 450 ? 750 - fast * 40 : 450,
    flashMs: 450 - fast * 25 > 250 ? 450 - fast * 25 : 250,
    holdMs: (level - volumeTop > 0 ? level - volumeTop : 0) * 700,
  );
}

/// Чем кончился тычок по клетке.
enum Tap {
  /// Клетка верная, ряд ещё не кончился.
  ok,

  /// Ошибка: ряд начнётся заново той же длиной либо партия кончится второй ошибкой.
  wrong,

  /// Ряд повторён целиком — длина растёт.
  done,

  /// Тычок не принят: сейчас не ввод.
  ignored,
}

class SpatialSpanGame {
  SpatialSpanGame({required this.level, math.Random? random})
    : params = levelParams(level),
      _random = random ?? math.Random();

  final int level;
  final LevelParams params;
  final math.Random _random;

  /// Показанный ряд, по порядку вспышек.
  List<int> sequence = const [];

  /// Что человек уже натыкал.
  final List<int> entered = [];

  int span = 0;
  int errorsAtLength = 0;
  int totalErrors = 0;
  bool finished = false;

  /// Ждём ввода. Показ и разбор ответа ведёт экран.
  bool recalling = false;

  /// Ответ — В ОБРАТНОМ ПОРЯДКЕ: это и отличает пространственный ряд от «повтори как показали».
  List<int> get expected => sequence.reversed.toList();

  /// Взял ли человек планку ступени.
  bool get passed => span >= params.startSpan;

  /// Новый ряд длиной `len`: случайные разные клетки сетки.
  void deal(int len) {
    final all = [for (var i = 0; i < params.cells; i++) i];
    for (var i = all.length - 1; i > 0; i--) {
      final j = _random.nextInt(i + 1);
      final t = all[i];
      all[i] = all[j];
      all[j] = t;
    }
    sequence = all.sublist(0, len);
    entered.clear();
    recalling = false;
  }

  Tap tap(int cell) {
    if (!recalling || finished) return Tap.ignored;
    entered.add(cell);
    if (entered.last != expected[entered.length - 1]) {
      errorsAtLength += 1;
      totalErrors += 1;
      // Вторая ошибка на ОДНОЙ длине — конец партии: это и есть мерка спана.
      if (errorsAtLength >= 2) finished = true;
      recalling = false;
      return Tap.wrong;
    }
    if (entered.length == expected.length) {
      if (sequence.length > span) span = sequence.length;
      errorsAtLength = 0;
      recalling = false;
      // Сетка кончилась — дальше расти некуда, партия закрыта на достигнутом.
      if (sequence.length >= params.cells) finished = true;
      return Tap.done;
    }
    return Tap.ok;
  }
}
