/// ПРАВИЛА SET — перенос из frontend/app/games/set-game.tsx.
///
/// Колода 81 карта: четыре признака по три значения (форма, заливка, цвет,
/// число). Тройка — «сет», если КАЖДЫЙ признак у трёх карт либо одинаков, либо
/// различен у всех. На столе 12 карт, и расклад обязан содержать хотя бы один
/// сет — иначе игрок ищет то, чего нет.
///
/// Лестница: до десятого уровня растёт выносливость (6→15 раскладов подряд),
/// с одиннадцатого добавляется давление временем — лимит на расклад 26→10 с.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

const List<String> setShapes = ['circle', 'square', 'triangle'];
const List<String> setFills = ['solid', 'striped', 'open'];
const List<String> setColors = ['red', 'green', 'purple'];
const List<int> setCounts = [1, 2, 3];

/// Карт на столе. Отдельной постоянной — по ней сверяется и поднятая партия.
const int setBoardSize = 12;

const int setBossEvery = 3;

/// Уровень берётся при одной ошибке и меньше за серию раскладов.
const int setErrorsAllowed = 1;

class SetCard {
  const SetCard({required this.shape, required this.fill, required this.color, required this.count});
  final String shape, fill, color;
  final int count;

  String get id => '$shape-$fill-$color-$count';
}

/// Колода в том же порядке, что в вебе: форма → заливка → цвет → число.
List<SetCard> allCards() {
  final out = <SetCard>[];
  for (final s in setShapes) {
    for (final f in setFills) {
      for (final c in setColors) {
        for (final n in setCounts) {
          out.add(SetCard(shape: s, fill: f, color: c, count: n));
        }
      }
    }
  }
  return out;
}

bool _allSameOrAllDiff(Object x, Object y, Object z) =>
    (x == y && y == z) || (x != y && y != z && x != z);

bool isSet(SetCard a, SetCard b, SetCard c) =>
    _allSameOrAllDiff(a.shape, b.shape, c.shape) &&
    _allSameOrAllDiff(a.fill, b.fill, c.fill) &&
    _allSameOrAllDiff(a.color, b.color, c.color) &&
    _allSameOrAllDiff(a.count, b.count, c.count);

/// Разбор по признакам — для подсказки, когда тройка сетом не оказалась.
Map<String, bool> explainSet(SetCard a, SetCard b, SetCard c) => {
      'shape': _allSameOrAllDiff(a.shape, b.shape, c.shape),
      'fill': _allSameOrAllDiff(a.fill, b.fill, c.fill),
      'color': _allSameOrAllDiff(a.color, b.color, c.color),
      'count': _allSameOrAllDiff(a.count, b.count, c.count),
    };

/// Первый сет на столе — им же проверяется, что расклад вообще решаем.
List<int>? findAnySet(List<SetCard> cards) {
  for (var i = 0; i < cards.length; i += 1) {
    for (var j = i + 1; j < cards.length; j += 1) {
      for (var k = j + 1; k < cards.length; k += 1) {
        if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
      }
    }
  }
  return null;
}

List<T> _shuffle<T>(List<T> arr, Rng rnd) {
  final a = List<T>.of(arr);
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Стол из двенадцати карт, в котором ЕСТЬ хотя бы один сет: иначе игрок ищет
/// то, чего нет, и честно проигрывает расклад.
List<SetCard> buildBoard(Rng rnd) {
  var board = _shuffle(allCards(), rnd).take(setBoardSize).toList();
  var guard = 0;
  while (findAnySet(board) == null && guard < 100) {
    board = _shuffle(allCards(), rnd).take(setBoardSize).toList();
    guard += 1;
  }
  return board;
}

class SetParams {
  const SetParams({required this.trials, required this.timeLimit});

  /// Раскладов в серии.
  final int trials;

  /// Лимит секунд на расклад; 0 — без лимита.
  final int timeLimit;
}

SetParams levelParams(int level) {
  final trials = math.min(15, 5 + level);            // L1=6 → L10=15
  final over = math.max(0, level - 10);
  final timeLimit = over > 0 ? math.max(8, 30 - over * 4) : 0;   // L11≈26 с → L15=10 с
  return SetParams(trials: trials, timeLimit: timeLimit);
}

// ───────────────── Раскладка стола — карта под высоту каркаса ────────────────
//
// 🔴 В вебе стол рос вниз вместе со страницей. Здесь поле получает высоту ЧИСЛОМ,
// и двенадцать карт обязаны в неё уложиться: иначе нижний ряд уезжает под липкий
// низ — та же семья дефектов, что уже ловила проба раскладки у «Паттернов» и SDMT.
// Колонок три (четыре ряда): на 360 точках четыре колонки дают карту уже пальца.

const double setMinCard = 56;
const int setColumns = 3;

class SetTable {
  const SetTable({required this.card, required this.gap, required this.rows});
  final double card, gap;
  final int rows;
}

SetTable setTable(double width, double height, {int count = setBoardSize}) {
  const gap = 8.0;
  final rows = (count / setColumns).ceil();
  final byWidth = (width - gap * (setColumns - 1)) / setColumns;
  final byHeight = (height - gap * (rows - 1)) / rows;
  // Карта стоймя: высота в полтора раза больше ширины, как в вебе.
  final card = math.max(setMinCard, math.min(byWidth, byHeight / 1.5)).floorToDouble();
  return SetTable(card: card, gap: gap, rows: rows);
}
