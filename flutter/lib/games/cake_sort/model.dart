/// ПРАВИЛА «ТОРТОВ» (и «ПИЦЦЫ» — та же игра другой шкуркой) — перенос
/// `src/games/cake-sort/core/{plate,stars,level}.ts`.
///
/// 🔴 ЧЕМ ЭТА ИГРА ОТЛИЧАЕТСЯ ОТ СОСЕДЕЙ ПО РАЗДЕЛУ: круг собирается из ШЕСТИ
/// секторов, а не трёх в ряд, и собранный круг УЕЗЖАЕТ, освобождая тарелку — на
/// его место встаёт следующая из очереди. Очередь конечна и известна заранее:
/// замкнутость набора и держит гарантию решаемости (конкурент на бесконечном
/// потоке собрал 454 жалобы на непроходимые уровни).
///
/// ⚠️ УРОВНИ НЕ ГЕНЕРИРУЮТСЯ И НЕ ВЫГРУЖАЛИСЬ: они уже лежали ДАННЫМИ —
/// `core/levels.json`, 120 доказанных раскладов, скопирован в
/// `assets/levels/cake_sort.json` как есть. Решатель не переносился.
///
/// Сверяется эталонами живого TS (`test/fixtures/cake-sort-reference.json`).
library;

import 'dart:convert';

/// Сколько секторов в полном круге.
const int circle = 6;

/// Стол: тарелки, очередь входящих и их вместимости.
class CakeBoard {
  const CakeBoard({
    required this.plates,
    this.queue = const [],
    this.caps,
    this.queueCaps,
  });

  factory CakeBoard.fromJson(Map<String, dynamic> j) => CakeBoard(
        plates: (j['plates'] as List).map((p) => (p as List).cast<int>()).toList(),
        queue: (j['queue'] as List? ?? const []).map((p) => (p as List).cast<int>()).toList(),
        caps: (j['caps'] as List?)?.cast<int>(),
        queueCaps: (j['queueCaps'] as List?)?.cast<int>(),
      );

  final List<List<int>> plates;
  final List<List<int>> queue;

  /// Свой круг у тарелки. Пусто — все по шесть.
  final List<int>? caps;
  final List<int>? queueCaps;

  int get length => plates.length;

  int capOf(int i) {
    final c = (caps != null && i < caps!.length) ? caps![i] : null;
    return (c != null && c > 0) ? c : circle;
  }

  int queueCapOf(int i) {
    final c = (queueCaps != null && i < queueCaps!.length) ? queueCaps![i] : null;
    return (c != null && c > 0) ? c : circle;
  }

  int roomIn(int i) {
    final left = capOf(i) - (i < plates.length ? plates[i].length : 0);
    return left < 0 ? 0 : left;
  }

  bool isEmpty(int i) => (i < plates.length ? plates[i].length : 0) == 0;

  /// Можно ли положить сектор этого вида: есть место И сверху лежит такой же
  /// (или тарелка пуста).
  bool canPlace(int i, int type) {
    if (roomIn(i) <= 0) return false;
    final plate = i < plates.length ? plates[i] : const <int>[];
    return plate.isEmpty || plate.last == type;
  }

  int? completeAt(int i) => completeIn(i < plates.length ? plates[i] : const [], capOf(i));

  List<int> typesIn(int i) {
    final set = <int>{...(i < plates.length ? plates[i] : const <int>[])};
    final out = set.toList()..sort();
    return out;
  }

  /// Партия сошлась: очередь пуста и на столе ничего не осталось.
  bool get isCleared {
    if (queue.isNotEmpty) return false;
    for (final p in plates) {
      if (p.isNotEmpty) return false;
    }
    return true;
  }

  /// Есть ли хоть один законный ход — иначе это тупик, а не трудность.
  bool get hasAnyMove {
    for (var from = 0; from < plates.length; from += 1) {
      final src = plates[from];
      if (src.isEmpty) continue;
      final type = src.last;
      for (var to = 0; to < plates.length; to += 1) {
        if (to != from && canPlace(to, type)) return true;
      }
    }
    return false;
  }

  CakeBoard copy() => CakeBoard(
        plates: plates.map((p) => [...p]).toList(),
        queue: queue.map((p) => [...p]).toList(),
        caps: caps?.toList(),
        queueCaps: queueCaps?.toList(),
      );

  Map<String, dynamic> toJson() => {
        'plates': plates.map((p) => [...p]).toList(),
        'queue': queue.map((p) => [...p]).toList(),
        'caps': caps?.toList(),
        'queueCaps': queueCaps?.toList(),
      };
}

/// Полный ОДНОЦВЕТНЫЙ круг своей высоты — иначе null.
int? completeIn(List<int> plate, [int cap = circle]) {
  if (plate.length != cap) return null;
  final t = plate[0];
  for (final s in plate) {
    if (s != t) return null;
  }
  return t;
}

class CollapseResult {
  const CollapseResult(this.board, this.cleared);
  final CakeBoard board;
  final List<int> cleared;
}

/// Собранный круг уезжает, на его место встаёт тарелка из очереди — И ТАК
/// КАСКАДОМ: пришедшая тарелка может оказаться собранной сама.
///
/// ⚠️ ВМЕСТИМОСТИ ЕДУТ ВМЕСТЕ С ТАРЕЛКАМИ: пришедшая из очереди приносит СВОЙ
/// круг. Забудь — и на её месте окажется чужая высота.
CollapseResult collapse(CakeBoard board) {
  final plates = board.plates.map((p) => [...p]).toList();
  final queue = board.queue.map((p) => [...p]).toList();
  final caps = [for (var i = 0; i < board.plates.length; i += 1) board.capOf(i)];
  final capsQ = [for (var i = 0; i < board.queue.length; i += 1) board.queueCapOf(i)];
  final cleared = <int>[];
  var again = true;
  while (again) {
    again = false;
    for (var i = 0; i < plates.length; i += 1) {
      final t = completeIn(plates[i], caps[i]);
      if (t == null) continue;
      cleared.add(t);
      final next = queue.isNotEmpty ? queue.removeAt(0) : null;
      final capNext = capsQ.isNotEmpty ? capsQ.removeAt(0) : null;
      plates[i] = next != null ? [...next] : <int>[];
      if (next != null) caps[i] = capNext ?? circle;
      again = true;
    }
  }
  final ownCaps = board.caps != null || caps.any((c) => c != circle);
  final ownQ = board.queueCaps != null || capsQ.any((c) => c != circle);
  return CollapseResult(
    CakeBoard(
      plates: plates,
      queue: queue,
      caps: ownCaps ? caps : null,
      queueCaps: ownQ ? capsQ : null,
    ),
    cleared,
  );
}

/// Ход верхним сектором тарелки.
CakeBoard? moveTop(CakeBoard board, int from, int to) {
  if (from == to) return null;
  final src = from < board.plates.length ? board.plates[from] : const <int>[];
  if (src.isEmpty) return null;
  final type = src.last;
  if (!board.canPlace(to, type)) return null;
  final plates = board.plates.map((p) => [...p]).toList();
  plates[from].removeLast();
  plates[to].add(type);
  return collapse(CakeBoard(
    plates: plates,
    queue: board.queue.map((p) => [...p]).toList(),
    caps: board.caps?.toList(),
    queueCaps: board.queueCaps?.toList(),
  )).board;
}

/// Ход ВЫБРАННЫМ видом из тарелки, а не обязательно верхним: игрок тычет в
/// сектор, и уехать обязан именно он.
CakeBoard? moveType(CakeBoard board, int from, int type, int to) {
  if (from == to) return null;
  final src = from < board.plates.length ? board.plates[from] : const <int>[];
  final at = src.indexOf(type);
  if (at < 0) return null;
  if (!board.canPlace(to, type)) return null;
  final plates = board.plates.map((p) => [...p]).toList();
  plates[from].removeAt(at);
  plates[to].add(type);
  return collapse(CakeBoard(
    plates: plates,
    queue: board.queue.map((p) => [...p]).toList(),
    caps: board.caps?.toList(),
    queueCaps: board.queueCaps?.toList(),
  )).board;
}

// ─────────────────────────── ЗВЁЗДЫ ───────────────────────────

/// Ходов на собранный круг — ИЗМЕРЕННОЕ число, а не прикидка.
const double refPerType = 4.65;

int moveReference(int circles) => (circles * refPerType).round();

int starsForMoves(int moves, int reference) {
  if (reference <= 0) return 1;
  if (moves <= reference * 1.15) return 3;
  if (moves <= reference * 1.6) return 2;
  return 1;
}

/// Эталон ходов: точный минимум, если он посчитан; иначе длина известного пути;
/// иначе измеренная формула. ⚠️ Порядок важен: длина найденного ПУТИ длиннее
/// минимума, и подставь её вместо минимума — высшая оценка обесценится.
int referenceFor(int circles, int? exactMin, [int? knownPath]) {
  if (exactMin != null && exactMin > 0) return exactMin;
  if (knownPath != null && knownPath > 0) return knownPath;
  return moveReference(circles);
}

int starsFor(int moves, int circles, int? exactMin, [int? knownPath]) =>
    starsForMoves(moves, referenceFor(circles, exactMin, knownPath));

// ─────────────────────────── УРОВНИ ───────────────────────────

const int platesMax = 20;
const int sparesMin = 2;

/// С какого уровня появляется очередь входящих тарелок.
const int queueFrom = 7;

class CakeLevelCfg {
  const CakeLevelCfg(this.types, this.plates, this.queue);
  final int types;
  final int plates;
  final int queue;
}

CakeLevelCfg levelCfg(int level) {
  final n = level < 1 ? 1 : level;
  final types = 11 < 2 + ((n + 1) ~/ 2) ? 11 : 2 + ((n + 1) ~/ 2);
  final spares = sparesMin > 2 + n ~/ 6 ? sparesMin : 2 + n ~/ 6;
  final plates = platesMax < types + spares ? platesMax : types + spares;
  final queue = n < queueFrom ? 0 : 1 + (n - queueFrom) ~/ 8;
  return CakeLevelCfg(types, plates, queue < 0 ? 0 : queue);
}

/// Вшитый уровень: расклад, доказанный решателем при сборке файла.
class CakeLevel {
  const CakeLevel({
    required this.level,
    required this.types,
    required this.plates,
    required this.queue,
    required this.min,
    required this.path,
    required this.proven,
  });

  factory CakeLevel.fromJson(Map<String, dynamic> j) => CakeLevel(
        level: j['level'] as int,
        types: j['types'] as int,
        plates: (j['plates'] as List).map((p) => (p as List).cast<int>()).toList(),
        queue: (j['queue'] as List? ?? const []).map((p) => (p as List).cast<int>()).toList(),
        min: (j['min'] as num?)?.toInt(),
        path: (j['path'] as num?)?.toInt(),
        proven: j['proven'] == true,
      );

  final int level;
  final int types;
  final List<List<int>> plates;
  final List<List<int>> queue;

  /// Точный минимум ходов, если он посчитан при сборке уровня.
  final int? min;

  /// Длина найденного решателем пути — грубая мера, но честная верхняя граница.
  final int? path;
  final bool proven;

  CakeBoard freshBoard() => CakeBoard(
        plates: plates.map((p) => [...p]).toList(),
        queue: queue.map((p) => [...p]).toList(),
      );

  /// Сколько кругов предстоит собрать: столько же, сколько видов на столе.
  int get circles => types;
}

class CakeLevelSet {
  CakeLevelSet(this.levels, this.circleSize);

  factory CakeLevelSet.fromJsonString(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return CakeLevelSet(
      (j['levels'] as List).map((e) => CakeLevel.fromJson(e as Map<String, dynamic>)).toList(),
      (j['circle'] as num?)?.toInt() ?? circle,
    );
  }

  final List<CakeLevel> levels;
  final int circleSize;

  /// Уровень по номеру. За последним вшитым идём по кругу с конца лестницы:
  /// генератор на телефоне не крутим, а обрывать игру нечестно.
  CakeLevel byLevel(int level) {
    if (levels.isEmpty) throw StateError('уровней нет');
    if (level <= levels.length) return levels[level - 1];
    final tail = levels.length >= 10 ? 10 : levels.length;
    final i = levels.length - tail + ((level - levels.length - 1) % tail);
    return levels[i];
  }
}
