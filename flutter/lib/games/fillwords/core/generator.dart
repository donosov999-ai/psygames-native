/// ГЕНЕРАТОР ПОЛЯ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/generator.ts`.
///
/// СНАЧАЛА РЕШЕНИЕ, ПОТОМ БУКВЫ: гамильтонов путь по всем клеткам → разрез на куски,
/// сумма длин которых РОВНО равна числу клеток → в каждый кусок слово его длины. Отрезки
/// не пересекаются и покрывают всё поле — по построению, а не проверкой постфактум.
/// Почему так и что сломается иначе — подробно в шапке веб-файла.
///
/// 🔴 ПОТОК СЛУЧАЙНЫХ ЧИСЕЛ — ТОТ ЖЕ, ЧТО В ВЕБЕ, ВЫЗОВ В ВЫЗОВ: набор длин → старт и
/// перемешивания пути (или змейка) → выбор слов. Одно зерно обязано давать одно поле в
/// обеих половинах, это сверяет эталон живого TS (`flutter/test/fixtures/fillwords-reference.json`).
///
/// ⚠️ СОРТИРОВКА — УСТОЙЧИВАЯ ЯВНО. В вебе кандидаты пути перемешиваются и сортируются по
/// числу свободных соседей: `Array.sort` в JS устойчив по стандарту, и равные остаются в
/// перемешанном порядке. `List.sort` Dart устойчивости НЕ обещает. 📍 Замер 07.10.2026:
/// мутация «вернуть `List.sort`» не сдвинула ни одного из ~160 полей эталона — потому что
/// списки до 32 элементов SDK сортирует вставками (`dart-sdk/lib/internal/sort.dart`,
/// `_INSERTION_SORT_THRESHOLD = 32`), а кандидатов не больше восьми. Это деталь реализации,
/// а не договор: [_stableSortByKey] держит совпадение с вебом без опоры на неё.
library;

import 'dart:math' as math;

import 'rng.dart';
import 'types.dart';
import 'words.dart';

/// Соседство (`areAdjacent`): восемь сторон, без диагоналей — четыре.
bool areAdjacent(CellIndex a, CellIndex b, int cols, {bool diagonals = true}) {
  if (a == b) return false;
  final dr = (a ~/ cols - b ~/ cols).abs();
  final dc = (a % cols - b % cols).abs();
  if (dr > 1 || dc > 1) return false;
  return diagonals || dr == 0 || dc == 0;
}

List<List<CellIndex>> _neighbourTable(int rows, int cols, bool diagonals) {
  final table = <List<CellIndex>>[];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      final list = <CellIndex>[];
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr == 0 && dc == 0) continue;
          if (!diagonals && dr != 0 && dc != 0) continue;
          final nr = r + dr;
          final nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          list.add(nr * cols + nc);
        }
      }
      table.add(list);
    }
  }
  return table;
}

/// Змейка — запасной маршрут, который существует на любом поле.
List<CellIndex> _serpentinePath(int rows, int cols, FillwordsRng rng) {
  final byRow = rng.next() < 0.5;
  final flipMajor = rng.next() < 0.5;
  final flipMinor = rng.next() < 0.5;
  final out = <CellIndex>[];
  final major = byRow ? rows : cols;
  final minor = byRow ? cols : rows;
  for (var i = 0; i < major; i++) {
    final m = flipMajor ? major - 1 - i : i;
    for (var j = 0; j < minor; j++) {
      final forward = (i % 2 == 0) != flipMinor;
      final n = forward ? j : minor - 1 - j;
      out.add(byRow ? m * cols + n : n * cols + m);
    }
  }
  return out;
}

/// Устойчивая сортировка вставками по ключу: равные сохраняют порядок, как `Array.sort` JS.
/// Кандидатов не больше восьми — вставки здесь дешевле слияния.
void _stableSortByKey(List<CellIndex> items, int Function(CellIndex) key) {
  final keys = [for (final x in items) key(x)];
  for (var i = 1; i < items.length; i++) {
    final item = items[i];
    final k = keys[i];
    var j = i - 1;
    while (j >= 0 && keys[j] > k) {
      items[j + 1] = items[j];
      keys[j + 1] = keys[j];
      j--;
    }
    items[j + 1] = item;
    keys[j + 1] = k;
  }
}

/// Гамильтонов путь поиском в глубину: Варнсдорф + связность остатка, бюджет 60 000 шагов;
/// кончился бюджет — змейка.
List<CellIndex> _hamiltonianPath(int rows, int cols, FillwordsRng rng, bool diagonals) {
  final total = rows * cols;
  final table = _neighbourTable(rows, cols, diagonals);
  final visited = List<bool>.filled(total, false);
  final seen = List<int>.filled(total, 0);
  final path = <CellIndex>[];
  var generation = 0;
  var budget = 60000;

  int freeDegree(CellIndex cell) {
    var d = 0;
    for (final n in table[cell]) {
      if (!visited[n]) d++;
    }
    return d;
  }

  bool restStaysWhole(CellIndex from, int remaining) {
    generation++;
    var count = 0;
    final stack = <CellIndex>[from];
    seen[from] = generation;
    while (stack.isNotEmpty) {
      final cell = stack.removeLast();
      count++;
      for (final n in table[cell]) {
        if (visited[n] || seen[n] == generation) continue;
        seen[n] = generation;
        stack.add(n);
      }
    }
    return count == remaining;
  }

  bool step(CellIndex cell) {
    visited[cell] = true;
    path.add(cell);
    if (path.length == total) return true;
    if (budget-- > 0) {
      final candidates = [for (final n in table[cell]) if (!visited[n]) n];
      rng.shuffle(candidates);
      _stableSortByKey(candidates, freeDegree);
      final remaining = total - path.length;
      for (final n in candidates) {
        if (!restStaysWhole(n, remaining)) continue;
        if (step(n)) return true;
        if (budget <= 0) break;
      }
    }
    visited[cell] = false;
    path.removeLast();
    return false;
  }

  if (step(rng.nextInt(total))) return path;
  return _serpentinePath(rows, cols, rng);
}

/// Вес длины: середина словаря чаще, крайности реже.
const _lengthWeight = <int, int>{3: 2, 4: 4, 5: 4, 6: 3, 7: 2, 8: 1};

/// Набор длин, сумма которых РОВНО равна числу клеток (`pickLengths`).
List<int>? _pickLengths(int total, int minLen, int maxLen, int Function(int) capacity, FillwordsRng rng) {
  final lengths = <int>[
    for (var len = minLen; len <= maxLen; len++)
      if (capacity(len) > 0) len,
  ];
  if (lengths.isEmpty) return null;

  bool fitsRest(int len, int rest, Map<int, int> used) =>
      len <= rest && (rest - len == 0 || rest - len >= minLen) && (used[len] ?? 0) < capacity(len);

  List<int>? attempt() {
    final used = <int, int>{};
    final out = <int>[];
    var rest = total;
    while (rest > 0) {
      final fits = [for (final len in lengths) if (fitsRest(len, rest, used)) len];
      if (fits.isEmpty) return null;
      final totalWeight = fits.fold<int>(0, (sum, len) => sum + (_lengthWeight[len] ?? 1));
      var ticket = rng.next() * totalWeight;
      var chosen = fits.last;
      for (final len in fits) {
        ticket -= _lengthWeight[len] ?? 1;
        if (ticket <= 0) {
          chosen = len;
          break;
        }
      }
      used[chosen] = (used[chosen] ?? 0) + 1;
      out.add(chosen);
      rest -= chosen;
    }
    return out;
  }

  for (var i = 0; i < 200; i++) {
    final got = attempt();
    if (got != null) return got;
  }

  // Запасной ход — жадно от коротких, тем же правилом остатка.
  final used = <int, int>{};
  final out = <int>[];
  var rest = total;
  while (rest > 0) {
    int? len;
    for (final candidate in lengths) {
      if (fitsRest(candidate, rest, used)) {
        len = candidate;
        break;
      }
    }
    if (len == null) return null;
    used[len] = (used[len] ?? 0) + 1;
    out.add(len);
    rest -= len;
  }
  return out;
}

/// Потолок высоты поля: 16 строк — замер вёрстки на 320×568 (см. веб).
const _maxRows = 16;

/// Уровень, на котором форма поля упирается в потолок.
const _shapeTopped = 34;

/// Потолок пола длины слова.
const _floorMax = 7;

/// С этого уровня включается ось скорости.
const _speedFrom = 95;
const _secFloor = 1.0;
const _secStep = 0.05;
const _secSteps = 16;

/// С этого уровня убавляются подсказки: 95 + 16 ступеней по три уровня.
const _hintsFrom = _speedFrom + _secSteps * 3;

/// С этого уровня включается строгий порядок.
const _orderFrom = _hintsFrom + 60;

/// Сколько уровней держится прямой порядок, прежде чем включится обратный.
const _orderStep = 40;

/// Лестница уровней (`fillwordsLevel`): форма → пол длины → скорость → подсказки → порядок.
FillwordsLevelCfg fillwordsLevel(int level) {
  final n = math.max(1, level);
  final cols = math.min(9, 5 + (n - 1) ~/ 5);
  final rows = math.min(_maxRows, 5 + (n - 1) ~/ 3);
  final maxWordLen = math.min(fillwordsMaxWord, 5 + (n - 1) ~/ 3);
  final afterShape = math.max(0, n - _shapeTopped);
  final minWordLen = math.min(_floorMax, fillwordsMinWord + afterShape ~/ 15);
  final baseSec = math.max(1.8, 3 - (n - 1) * 0.06);
  final afterFloor = math.max(0, n - _speedFrom + 1);
  final taken = math.min(_secSteps, afterFloor ~/ 3) * _secStep;
  // `Number(x.toFixed(2))` веба.
  final perCellSec = math.max(_secFloor, double.parse((baseSec - taken).toStringAsFixed(2)));
  final afterSpeed = math.max(0, n - _hintsFrom + 1);
  final hints = math.max(0, 3 - afterSpeed ~/ 20);
  final afterHints = math.max(0, n - _orderFrom + 1);
  final order = afterHints <= 0
      ? SubmitOrder.free
      : afterHints <= _orderStep
          ? SubmitOrder.listed
          : SubmitOrder.reverse;
  return FillwordsLevelCfg(
    rows: rows,
    cols: cols,
    maxWordLen: maxWordLen,
    minWordLen: minWordLen,
    timeLimitSec: (rows * cols * perCellSec).round(),
    hints: hints,
    order: order,
  );
}

/// Сколько ширины остаётся полю (`ширинаПодПоле`): список слов сбоку забирает до 120 точек.
double widthForField(double screenWidth, bool listAside) {
  final list = listAside ? math.min(120, (screenWidth * 0.3).round()) : 0;
  return math.min(screenWidth - 24, 760.0) - list;
}

/// Трипвайр инварианта: раскладка, нарушившая разбиение, до экрана не доезжает.
void assertFullCoverage(FillwordsPuzzle puzzle) {
  final total = puzzle.rows * puzzle.cols;
  final owner = List<int>.filled(total, -1);
  for (var index = 0; index < puzzle.words.length; index++) {
    for (final cell in puzzle.words[index].path) {
      if (cell < 0 || cell >= total) throw StateError('fillwords: cell $cell is outside the field');
      if (owner[cell] != -1) throw StateError('fillwords: cell $cell is taken twice');
      owner[cell] = index;
    }
  }
  final free = owner.indexOf(-1);
  if (free != -1) throw StateError('fillwords: cell $free belongs to no word');
}

/// Собрать поле (`generateFillwords`). [pool] — словарь языка запроса ([loadWordPool]).
FillwordsPuzzle generateFillwords(FillwordsRequest request, FillwordsPool pool) {
  final rows = request.rows;
  final cols = request.cols;
  final locale = request.locale;
  final seed = normalizeSeed(request.seed);
  if (rows < 2 || cols < 2) throw ArgumentError('fillwords: field smaller than 2x2');
  if (!isFillwordsLocale(locale)) throw StateError('fillwords: no dictionary for $locale');
  if (pool.locale != locale) throw ArgumentError('fillwords: pool ${pool.locale} for request $locale');

  final rng = createRng(seed);
  final total = rows * cols;
  final maxWordLen = math.min(math.min(request.maxWordLen ?? fillwordsMaxWord, fillwordsMaxWord), total);
  final wanted = math.min(math.max(fillwordsMinWord, request.minWordLen ?? fillwordsMinWord), maxWordLen);

  // Пол длины ОТСТУПАЕТ, а не роняет уровень: см. веб.
  List<int>? lengths;
  for (var floorLen = wanted; floorLen >= fillwordsMinWord && lengths == null; floorLen--) {
    lengths = _pickLengths(total, floorLen, maxWordLen, (len) => wordsOfLength(pool, len).length, rng);
  }
  if (lengths == null) throw StateError('fillwords: $locale cannot fill $total cells with words');

  final diagonals = request.diagonals;
  final path = _hamiltonianPath(rows, cols, rng, diagonals);
  final letters = List<String>.filled(total, '');
  final words = <PlantedWord>[];
  final used = <String>{};
  var at = 0;
  for (final len in lengths) {
    final bank = [for (final w in wordsOfLength(pool, len)) if (!used.contains(w)) w];
    final word = rng.pick(bank);
    if (word == null) throw StateError('fillwords: $locale ran out of words of length $len');
    used.add(word);
    final cells = path.sublist(at, at + len);
    at += len;
    final chars = word.runes.map(String.fromCharCode).toList();
    for (var i = 0; i < chars.length; i++) {
      letters[cells[i]] = chars[i];
    }
    words.add(PlantedWord(word: word, path: cells));
  }

  final puzzle = FillwordsPuzzle(
    rows: rows,
    cols: cols,
    locale: locale,
    seed: seed,
    letters: letters,
    words: words,
    diagonals: diagonals,
  );
  assertFullCoverage(puzzle);
  return puzzle;
}
