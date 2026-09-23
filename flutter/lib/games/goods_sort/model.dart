/// ПРАВИЛА «СОРТИРОВКИ ТОВАРОВ» — перенос ядра `src/games/goods-sort/core/board.ts`.
///
/// 🔴 СОДЕРЖИМОЕ И ВМЕСТИМОСТЬ ЛЕЖАТ ВМЕСТЕ, как в оригинале. Причина записана там
/// же и стоила четырёх дефектов за один день 22.08.2026: ниши разной вместимости
/// появились позже, а половина кода считала «в каждой нише три места». Здесь взять
/// клетки без ёмкостей нельзя — доска это пара.
///
/// ⚠️ ЧТО НЕ ПЕРЕНОСИЛОСЬ: решатель и генератор уровней. Они тяжёлые и на телефоне
/// не нужны — уровни розданы нынешним TS-генератором и лежат готовыми в
/// `assets/levels/goods_sort.json`. Перенос правил сверяется с эталонами из живого
/// TS (`test/fixtures/goods-sort-reference.json`), а не с собственной формулой.
library;

import 'dart:convert';

/// Сколько одинаковых товаров складываются в тройку и исчезают. Это правило игры.
const int kTriple = 3;

/// Полка из очереди: что на ней лежит и сколько влезает.
class Shelf {
  const Shelf({required this.cell, required this.cap, this.joker = false});

  factory Shelf.fromJson(Map<String, dynamic> j) => Shelf(
        cell: (j['cell'] as List).cast<int>(),
        cap: j['cap'] as int,
        joker: j['joker'] == true,
      );

  final List<int> cell;
  final int cap;
  final bool joker;

  Shelf copy() => Shelf(cell: [...cell], cap: cap, joker: joker);
}

/// Что случилось за один разбор доски — нужно ЭКРАНУ: очки, вспышки, «пришла полка».
///
/// ⚠️ Ниши называются НОМЕРАМИ (`ids`), а не местами: место меняется под ногами —
/// столбец оседает, полка приходит сверху. Отдай экрану место, и вспышка зажжётся
/// не там, где собралась тройка.
class CollapseReport {
  final List<int> clearedTypes = [];
  final List<int> clearedIds = [];
  final List<int> closedIds = [];
  final List<int> revealedIds = [];
  int arrived = 0;

  bool get isEmpty =>
      clearedTypes.isEmpty && closedIds.isEmpty && revealedIds.isEmpty && arrived == 0;
}

/// Ниша: что в ней лежит, сколько влезает, снято ли правило укладки, где стоит.
class GoodsBoard {
  GoodsBoard({
    required this.cells,
    required this.caps,
    this.jokers,
    this.col,
    this.ids,
    List<Shelf>? queue,
    this.back,
  }) : queue = queue ?? const [] {
    if (cells.length != caps.length) {
      throw StateError('доска собрана неверно: ниш ${cells.length}, ёмкостей ${caps.length}');
    }
    for (final e in {'джокеров': jokers, 'столбцов': col, 'номеров': ids, 'задних рядов': back}.entries) {
      final row = e.value;
      if (row != null && row.length != cells.length) {
        throw StateError('доска собрана неверно: ниш ${cells.length}, ${e.key} ${row.length}');
      }
    }
  }

  final List<List<int>> cells;
  final List<int> caps;
  final List<bool>? jokers;

  /// Столбец каждой ниши — геометрия МЕСТА. Нужен ровно для одного: знать, кто
  /// сверху. Без него ниша после тройки просто остаётся пустой (так живут уровни
  /// до 56-го); с ним полка закрывается, столбец оседает, сверху приходит новая.
  final List<int>? col;

  /// Устойчивый номер ниши: переезжает вместе с содержимым. Цель «освободи нишу»,
  /// ключи скрытости и примёрзший ряд помнят нишу ИМЕННО по номеру, а не по месту.
  final List<int>? ids;

  /// Очередь входящих полок — конечная и известная заранее.
  final List<Shelf> queue;

  /// Задний ряд: товары, которых на доске ещё нет. Выходят вперёд, когда передний
  /// разобран. Это НЕ «накрытый товар»: там скрыт тип, здесь — само наличие.
  final List<List<int>>? back;

  bool isJoker(int i) => jokers != null && i < jokers!.length && jokers![i];

  int capOf(int i) {
    if (i < 0 || i >= caps.length) throw StateError('ниши $i на доске нет');
    return caps[i];
  }

  int roomIn(int i) {
    final room = capOf(i) - (i < cells.length ? cells[i].length : 0);
    return room < 0 ? 0 : room;
  }

  bool isEmptyAt(int i) => (i < cells.length ? cells[i].length : 0) == 0;

  bool isFullAt(int i) => roomIn(i) == 0;

  /// Можно ли положить товар в нишу.
  ///
  /// 🔴 МЕСТО ПРОВЕРЯЕТСЯ ПЕРВЫМ И ДЛЯ ДЖОКЕРА ТОЖЕ: джокер снимает ПРАВИЛО
  /// УКЛАДКИ, а не ёмкость. Инвариант «сумма ёмкостей = ниш × 3» держится только
  /// пока это так.
  bool canPlace(int i, int type, bool strict) {
    if (roomIn(i) <= 0) return false;
    if (!strict || isJoker(i)) return true;
    final cell = i < cells.length ? cells[i] : const <int>[];
    return cell.isEmpty || cell.last == type;
  }

  /// Доска разобрана: во всех нишах пусто.
  ///
  /// ⚠️ ОЧЕРЕДЬ ТОЖЕ СЧИТАЕТСЯ. Пустая доска при непустой очереди — не победа, а
  /// середина партии: полки ещё придут.
  bool get isCleared =>
      cells.every((c) => c.isEmpty) &&
      queue.isEmpty &&
      (back ?? const <List<int>>[]).every((b) => b.isEmpty);

  /// Свободные ниши: пустые и не занятые препятствием.
  int freeNiches([List<bool> blocked = const []]) {
    var n = 0;
    for (var i = 0; i < cells.length; i += 1) {
      if (cells[i].isEmpty && !(i < blocked.length && blocked[i])) n += 1;
    }
    return n;
  }

  GoodsBoard copyWith({
    List<List<int>>? cells,
    List<Shelf>? queue,
    List<List<int>>? back,
    List<int>? caps,
    List<bool>? jokers,
    List<int>? ids,
  }) =>
      GoodsBoard(
        cells: cells ?? this.cells.map((c) => [...c]).toList(),
        caps: caps ?? [...this.caps],
        jokers: jokers ?? this.jokers?.toList(),
        col: col?.toList(),
        ids: ids ?? this.ids?.toList(),
        queue: queue ?? this.queue.map((s) => s.copy()).toList(),
        back: back ?? this.back?.map((b) => [...b]).toList(),
      );
}

/// Тройка в нише, если она есть. Ищется ПО СОДЕРЖИМОМУ, а не по заполненности: в
/// нише на четыре тройка лежит рядом с четвёртым товаром.
int? tripleIn(List<int> cell) {
  final count = <int, int>{};
  for (final t in cell) {
    final n = (count[t] ?? 0) + 1;
    if (n == kTriple) return t;
    count[t] = n;
  }
  return null;
}

/// Убрать из ниши тройку одного типа, оставив остальное.
List<int> removeTriple(List<int> cell, int type) {
  final out = <int>[];
  var left = kTriple;
  for (final t in cell) {
    if (t == type && left > 0) {
      left -= 1;
      continue;
    }
    out.add(t);
  }
  return out;
}

class _Niche {
  _Niche({required this.cell, required this.cap, required this.joker, required this.id, required this.back});
  List<int> cell;
  int cap;
  bool joker;
  int id;
  List<int> back;
}

/// Убрать все тройки, какие сложились, — повторяя, пока складываются.
///
/// 🔴 ДВА ПОВЕДЕНИЯ В ОДНОЙ ФУНКЦИИ, И ЭТО НАМЕРЕННО (как в TS). Без `col` ниша
/// остаётся пустой. С `col` полка ЗАКРЫВАЕТСЯ: уходит с доски, столбец оседает,
/// сверху приходит следующая из очереди.
GoodsBoard collapseTriples(GoodsBoard board, [CollapseReport? report]) {
  final cells = board.cells.map((c) => [...c]).toList();
  int nom(int i) => board.ids != null ? board.ids![i] : i;
  final back = board.back?.map((b) => [...b]).toList();

  /// Задний ряд выходит вперёд ЗДЕСЬ ЖЕ и ВНУТРИ цикла: ниша, опустевшая именно
  /// тройкой, обязана открыть свой задний ряд тем же ходом.
  bool reveal() {
    if (back == null) return false;
    var was = false;
    for (var i = 0; i < cells.length; i += 1) {
      if (cells[i].isEmpty && back[i].isNotEmpty) {
        cells[i] = back[i];
        back[i] = [];
        was = true;
        report?.revealedIds.add(nom(i));
      }
    }
    return was;
  }

  reveal();

  if (board.col == null) {
    var again = true;
    while (again) {
      again = false;
      for (var i = 0; i < cells.length; i += 1) {
        final t = tripleIn(cells[i]);
        if (t != null) {
          cells[i] = removeTriple(cells[i], t);
          again = true;
          report?.clearedTypes.add(t);
          report?.clearedIds.add(nom(i));
        }
      }
      if (reveal()) again = true;
    }
    return board.copyWith(cells: cells, back: back);
  }

  // Столбцовая модель: ниши по столбцам В ПОРЯДКЕ МАССИВА (он идёт по рядам
  // сверху вниз, значит внутри столбца это порядок сверху вниз).
  final caps = [...board.caps];
  final jokers = board.jokers == null ? null : [...board.jokers!];
  final ids = board.ids == null ? null : [...board.ids!];
  final col = [...board.col!];
  final queue = board.queue.map((s) => s.copy()).toList();

  final columns = <int, List<_Niche>>{};
  final order = <int>[];
  for (var i = 0; i < cells.length; i += 1) {
    final c = col[i];
    if (!columns.containsKey(c)) {
      columns[c] = [];
      order.add(c);
    }
    columns[c]!.add(_Niche(
      cell: cells[i],
      cap: caps[i],
      joker: jokers != null && jokers[i],
      id: ids != null ? ids[i] : i,
      back: back != null ? back[i] : <int>[],
    ));
  }

  var again = true;
  while (again) {
    again = false;
    // ⚠️ В столбцовой ветке раскрываем ПРЯМО НА НИШАХ: плоский список идёт по
    // рядам, а ниши здесь сгруппированы по столбцам — синхронизация по номеру
    // перепутала бы содержимое.
    for (final c in order) {
      for (final n in columns[c]!) {
        if (n.cell.isEmpty && n.back.isNotEmpty) {
          n.cell = n.back;
          n.back = [];
          again = true;
          report?.revealedIds.add(n.id);
        }
      }
    }
    for (final c in order) {
      final niches = columns[c]!;
      for (var k = 0; k < niches.length; k += 1) {
        final t = tripleIn(niches[k].cell);
        if (t == null) continue;
        // ⚠️ ЗАКРЫВАЕТСЯ ТОЛЬКО ПОЛНАЯ ТРОЙКА В НИШЕ НА ТРИ: в нише на четыре
        // тройка лежит рядом с четвёртым товаром, и закрыть её значило бы
        // выбросить его с доски — мультимножество перестало бы быть замкнутым.
        final full = niches[k].cell.length == kTriple && niches[k].back.isEmpty;
        report?.clearedTypes.add(t);
        report?.clearedIds.add(niches[k].id);
        if (!full) {
          niches[k].cell = removeTriple(niches[k].cell, t);
          again = true;
          continue;
        }
        // 🔴 ДЛИНА СТОЛБЦА ПОСТОЯННА: закрытая полка уходит, а СВЕРХУ встаёт
        // новая — из очереди, а если очередь пуста, то пустое место. Иначе поле,
        // которое рисуется по месту `row * cols + col`, перетасовалось бы целиком.
        final closed = niches[k];
        report?.closedIds.add(closed.id);
        niches.removeAt(k);
        final arrived = queue.isNotEmpty ? queue.removeAt(0) : null;
        if (arrived != null) report?.arrived += 1;
        niches.insert(
          0,
          arrived != null
              ? _Niche(cell: [...arrived.cell], cap: arrived.cap, joker: arrived.joker, id: -1, back: [])
              : _Niche(cell: [], cap: closed.cap, joker: closed.joker, id: -1, back: []),
        );
        again = true;
        break;
      }
    }
  }

  // Новым полкам номера выдаём ПОСЛЕ всех переездов — от наибольшего занятого.
  var next = 0;
  for (final list in columns.values) {
    for (final n in list) {
      if (n.id > next) next = n.id;
    }
  }
  next += 1;
  for (final c in order) {
    for (final n in columns[c]!) {
      if (n.id == -1) n.id = next++;
    }
  }

  // 🔴 ОБРАТНО РАСКЛАДЫВАЕМ ПО РЯДАМ — В ТОТ ЖЕ ПОРЯДОК МЕСТ, ЧТО ПРИШЁЛ:
  // k-я сверху ниша столбца c ложится в k-е сверху место столбца c. `col` — это
  // геометрия места, она не меняется никогда.
  final seen = <int, int>{};
  final flat = <_Niche>[];
  for (var s = 0; s < col.length; s += 1) {
    final c = col[s];
    final k = seen[c] ?? 0;
    seen[c] = k + 1;
    final list = columns[c]!;
    if (k >= list.length) {
      throw StateError('столбец $c укоротился: мест ${col.where((x) => x == c).length}, ниш ${list.length}');
    }
    flat.add(list[k]);
  }

  return GoodsBoard(
    cells: flat.map((n) => n.cell).toList(),
    caps: flat.map((n) => n.cap).toList(),
    jokers: jokers != null ? flat.map((n) => n.joker).toList() : null,
    col: col,
    ids: flat.map((n) => n.id).toList(),
    queue: queue,
    back: back != null ? flat.map((n) => n.back).toList() : null,
  );
}

/// Переложить верхний товар из одной ниши в другую. `null` — ход невозможен.
///
/// ⚠️ ПОЛЯ ДОСКИ ПЕРЕНОСЯТСЯ ЦЕЛИКОМ. В TS здесь однажды терялись `col`, `ids` и
/// очередь: после первого же хода доска теряла столбцы, а товары из очереди
/// исчезали из партии.
GoodsBoard? moveTop(GoodsBoard board, int from, int to, bool strict, [CollapseReport? report]) {
  if (from == to) return null;
  if (from < 0 || from >= board.cells.length || to < 0 || to >= board.cells.length) return null;
  final src = board.cells[from];
  if (src.isEmpty) return null;
  final type = src.last;
  if (!board.canPlace(to, type, strict)) return null;
  final cells = board.cells.map((c) => [...c]).toList();
  cells[from].removeLast();
  cells[to].add(type);
  return collapseTriples(board.copyWith(cells: cells), report);
}

/// Цель уровня: убрать всё, убрать названные виды, освободить ниши или уложиться в ходы.
class Goal {
  const Goal._(this.kind, {this.types = const [], this.niches = const [], this.limit = 0});

  factory Goal.fromJson(Map<String, dynamic> j) {
    switch (j['kind'] as String) {
      case 'pick':
        return Goal._('pick', types: (j['types'] as List).cast<int>());
      case 'free':
        return Goal._('free', niches: (j['niches'] as List).cast<int>());
      case 'moves':
        return Goal._('moves', limit: j['limit'] as int);
      default:
        return const Goal._('all');
    }
  }

  final String kind;
  final List<int> types;
  final List<int> niches;
  final int limit;
}

bool goalMet(List<List<int>> cells, Goal goal) {
  if (goal.kind == 'pick') {
    return !cells.any((c) => c.any((t) => goal.types.contains(t)));
  }
  if (goal.kind == 'free') {
    return goal.niches.every((i) => (i < cells.length ? cells[i].length : 0) == 0);
  }
  return cells.every((c) => c.isEmpty);
}

/// 🔴 УРОВЕНЬ ВЗЯТ — ЭТО ЦЕЛЬ ПЛЮС ПУСТАЯ ОЧЕРЕДЬ И ПУСТЫЕ ЗАДНИЕ РЯДЫ.
/// Жалоба «перешёл на следующий уровень, не закончив» была ровно про это: экран
/// смотрел на доску одну.
bool levelWon(List<List<int>> cells, Goal goal, {int queueLength = 0, List<List<int>>? back}) {
  if (!goalMet(cells, goal)) return false;
  if (queueLength > 0) return false;
  return (back ?? const <List<int>>[]).every((b) => b.isEmpty);
}

/// Ходы кончились и цель не взята — партия проиграна. `moves >= limit`, а не `>`:
/// лимит 23 значит «двадцать три хода можно». Цель проверяется прежде провала.
bool movesExhausted(int moves, int moveLimit, List<List<int>> cells, Goal goal) {
  if (moveLimit <= 0 || moves < moveLimit) return false;
  return !goalMet(cells, goal);
}

/// Сколько из цели сделано — для бейджа в шапке. Для 'all'/'moves' бейджа нет.
({int done, int total})? goalProgress(List<List<int>> cells, Goal goal) {
  if (goal.kind == 'pick') {
    final left = <int>{for (final c in cells) ...c};
    return (done: goal.types.where((t) => !left.contains(t)).length, total: goal.types.length);
  }
  if (goal.kind == 'free') {
    return (
      done: goal.niches.where((i) => (i < cells.length ? cells[i].length : 0) == 0).length,
      total: goal.niches.length
    );
  }
  return null;
}

const int kClearScore = 50;

int scoreForClears(int n) => n <= 0 ? 0 : kClearScore * (n * (n + 1)) ~/ 2;

/// Звёзды по ходам: до +15 % сверх эталона — три, до +60 % — две, дальше одна.
int starsForMoves(int moves, int reference) {
  if (moves <= (reference * 1.15).ceil()) return 3;
  if (moves <= (reference * 1.6).ceil()) return 2;
  return 1;
}

/// Препятствие на нише: заперта или под замком на N ходов.
class Obstacle {
  const Obstacle(this.kind, {this.movesLeft = 0});
  final String kind;
  final int movesLeft;

  static Obstacle? fromJson(Object? j) {
    if (j is! Map) return null;
    final kind = j['kind'] as String?;
    if (kind == 'blocked') return const Obstacle('blocked');
    if (kind == 'locked') return Obstacle('locked', movesLeft: (j['movesLeft'] as num?)?.toInt() ?? 0);
    return null;
  }
}

/// Уровень, розданный нынешним TS-генератором и выгруженный в JSON.
/// ПЕРЕНОС КЛЮЧЕЙ СКРЫТОСТИ ЧЕРЕЗ ИЗЪЯТИЕ ТОВАРА.
///
/// 🔴 КЛЮЧИ ПОЗИЦИОННЫЕ, А ПОЗИЦИИ СЪЕЗЖАЮТ. Изъятие из середины ряда сдвигает
/// всё правее на единицу: в [скрытый, скрытый, видимый] изъятие среднего дарило
/// бы его ключ ВИДИМОМУ товару, вставшему на ту позицию, и тот темнел бы на
/// глазах. Ключ самого изъятого умирает: товар ложится в цель последним, то есть
/// спереди, а спереди скрытых не бывает.
List<String> shiftCoveredAfterTake(Iterable<String> covered, int fromCell, int fromIdx) {
  final out = <String>[];
  for (final k in covered) {
    final parts = k.split(':');
    final i = int.parse(parts[0]);
    final j = int.parse(parts[1]);
    if (i != fromCell) {
      out.add(k);
      continue;
    }
    if (j == fromIdx) continue;
    out.add(j > fromIdx ? '$i:${j - 1}' : k);
  }
  return out;
}

/// ВСКРЫТИЕ: перед кем никого не осталось — тот виден. Правило одно и на «?»
/// режима скрытой информации, и на силуэты накрытого товара: справка накрытого
/// так и обещает («сними тот, что перед ним, и узнаешь, что это»).
/// Пустую нишу чистить отдельно не надо: у неё len−1 = −1, и любой ключ ≥ 0
/// снимается этим же условием.
List<String> revealUncovered(Iterable<String> covered, List<List<int>> cells) {
  final out = <String>[];
  for (final k in covered) {
    final parts = k.split(':');
    final i = int.parse(parts[0]);
    final j = int.parse(parts[1]);
    final len = i < cells.length ? cells[i].length : 0;
    if (j < len - 1) out.add(k);
  }
  return out;
}

class GoodsLevel {
  GoodsLevel({
    required this.level,
    required this.cols,
    required this.rows,
    required this.mask,
    required this.slots,
    required this.types,
    required this.moveLimit,
    required this.strict,
    required this.hidden,
    required this.cells,
    required this.caps,
    required this.jokers,
    required this.col,
    required this.ids,
    required this.queue,
    required this.back,
    required this.obstacles,
    required this.covered,
    required this.frozenRow,
    required this.frozenType,
    required this.goal,
    required this.reference,
    required this.floorItem,
  });

  factory GoodsLevel.fromJson(Map<String, dynamic> j) {
    final frozen = j['frozen'] as Map<String, dynamic>?;
    return GoodsLevel(
      level: j['level'] as int,
      cols: j['cols'] as int,
      rows: j['rows'] as int,
      mask: (j['mask'] as List).cast<bool>(),
      slots: j['slots'] as int,
      types: j['types'] as int,
      moveLimit: j['moveLimit'] as int,
      strict: j['strict'] == true,
      hidden: j['hidden'] == true,
      cells: (j['cells'] as List).map((c) => (c as List).cast<int>()).toList(),
      caps: (j['caps'] as List).cast<int>(),
      jokers: (j['jokers'] as List?)?.cast<bool>(),
      col: (j['col'] as List?)?.cast<int>(),
      ids: (j['ids'] as List?)?.cast<int>(),
      queue: (j['queue'] as List? ?? const []).map((s) => Shelf.fromJson(s as Map<String, dynamic>)).toList(),
      back: (j['back'] as List? ?? const []).map((c) => (c as List).cast<int>()).toList(),
      obstacles: (j['obstacles'] as List).map(Obstacle.fromJson).toList(),
      covered: (j['covered'] as List).cast<String>().toSet(),
      frozenRow: frozen == null ? null : frozen['row'] as int,
      frozenType: frozen == null ? null : frozen['type'] as int,
      goal: Goal.fromJson(j['goal'] as Map<String, dynamic>),
      reference: (j['reference'] as num).toInt(),
      floorItem: (j['floorItem'] as num?)?.toInt() ?? 0,
    );
  }

  final int level;
  final int cols;
  final int rows;

  /// Маска формы: какие места сетки существуют. Доска бывает с дырами.
  final List<bool> mask;
  final int slots;
  final int types;
  final int moveLimit;

  /// Строгая укладка: класть можно только к своему типу или в пустую.
  final bool strict;

  /// Режим скрытой информации: накрыта вся глубина, а не выборка.
  final bool hidden;

  final List<List<int>> cells;
  final List<int> caps;
  final List<bool>? jokers;
  final List<int>? col;
  final List<int>? ids;
  final List<Shelf> queue;
  final List<List<int>> back;
  final List<Obstacle?> obstacles;

  /// Накрытые товары ключами «ниша:место» — тип скрыт, товар виден.
  final Set<String> covered;
  final int? frozenRow;
  final int? frozenType;
  final Goal goal;

  /// Эталон ходов для звёзд.
  final int reference;

  /// Пол читаемости товара: с витрины (L46) доска задумана едущей, и товар не
  /// имеет права ужиматься ниже этого числа. Ниже порога — ноль, прежнее
  /// поведение сорока пяти сыгранных уровней. Число приходит ДАННЫМ уровня.
  final int floorItem;

  GoodsBoard freshBoard() => GoodsBoard(
        cells: cells.map((c) => [...c]).toList(),
        caps: [...caps],
        jokers: jokers?.toList(),
        col: col?.toList(),
        ids: ids?.toList(),
        queue: queue.map((s) => s.copy()).toList(),
        back: back.isEmpty ? null : back.map((b) => [...b]).toList(),
      );

  /// Ряд ниши по её номеру среди существующих: генератор не знает про дыры формы.
  int rowOfNiche(int index) {
    var seen = -1;
    for (var place = 0; place < mask.length; place += 1) {
      if (!mask[place]) continue;
      seen += 1;
      if (seen == index) return place ~/ cols;
    }
    return -1;
  }
}

class GoodsLevelSet {
  GoodsLevelSet(this.levels, this.pool);

  factory GoodsLevelSet.fromJsonString(String raw, {double width = 0}) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final narrowWidth = (j['narrowWidth'] as num?)?.toDouble() ?? 560;
    final wide = j['wide'] as List?;
    final picked = width > 0 && width >= narrowWidth && wide != null ? wide : j['levels'] as List;
    return GoodsLevelSet(
      picked.map((e) => GoodsLevel.fromJson(e as Map<String, dynamic>)).toList(),
      (j['pool'] as List).cast<int>(),
    );
  }

  final List<GoodsLevel> levels;

  /// Виды товаров набора: номер вида — номер картинки `assets/goods/good<N>.webp`.
  final List<int> pool;

  /// Уровень по номеру. За последним вшитым идём по кругу с конца лестницы:
  /// генератор на телефоне не крутим, а обрывать игру нечестно.
  GoodsLevel byLevel(int level) {
    if (levels.isEmpty) throw StateError('уровней нет');
    if (level <= levels.length) return levels[level - 1];
    final tail = levels.length >= 10 ? 10 : levels.length;
    final i = levels.length - tail + ((level - levels.length - 1) % tail);
    return levels[i];
  }
}

/// СТИЛЬ ШКАФА ПО ПРОФИЛЮ — перенос таблицы `SHELF_BY_PROFILE` из веба
/// (`src/games/goods-sort/core/level.ts`).
///
/// 🔴 ЗАЧЕМ ПЕРЕНОСИТЬ, А НЕ ЗАШИВАТЬ БЕРЁЗУ. Первая редакция переноса рисовала
/// `niche-birch.webp` всегда. Профиль по умолчанию — `nzt48`, и ему в вебе
/// назначен ОРЕХ: две половины приложения показывали бы РАЗНЫЙ шкаф на одном и
/// том же профиле, и заметить это можно было только глазами на двух экранах
/// рядом. Ни одна проба такого не ловит — они обе зелёные.
///
/// ⚠️ У каждого ключа обязан лежать файл `assets/goods/niche-<ключ>.webp`;
/// это сторожит проба `goods_shelf_test.dart`.
const Map<String, String> shelfByProfile = {
  'kids': 'mint',
  'vasilyeva': 'pink',
  'women': 'pink',
  'nzt48': 'walnut',
  'execs': 'grey',
  'students': 'pine',
  'chess': 'white',
  'polyglot': 'bamboo',
  'seniors': 'oak',
  'drivers': 'grey',
  'odv999': 'walnut',
  'whatsnew': 'birch',
  'free': 'birch',
};

/// Все стили — список источник правды и для картинок, и для пробы.
const List<String> shelfStyles = [
  'birch', 'pine', 'white', 'oak', 'mint', 'pink', 'grey', 'walnut', 'bamboo',
];

/// Стиль шкафа для профиля. Одна дверь: экран и проба спрашивают ЕЁ.
/// Незнакомый профиль получает берёзу — ровно как `shelfForProfile` в вебе.
String shelfForProfile(String? id) => shelfByProfile[id ?? 'free'] ?? 'birch';
