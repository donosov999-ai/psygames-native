import 'dart:math';

/// «ПОДЛОДКИ» — морская дедукция: найти и потопить скрытый флот за ограниченное число
/// выстрелов.
///
/// Перенос движка MindLab `abstract-games-hub/engines/mindlab/submarinos/sea.py` (clean-room,
/// своя игра; референсы — MIT upstream и bench без лицензии — в продукт НЕ входят). Решение
/// Дениса 30.09.2026: движки MindLab добавляем нативно, дорабатываем потом (задача c8a2783f).
///
/// Правила движка: поле N×N, флот прямых кораблей без пересечений; выстрел — «мимо»,
/// «попал» или «потопил». Бот движка — вероятностная карта: для каждой нестрелянной
/// клетки считается, сколько размещений живых кораблей её накрывают; есть попадания —
/// бот добивает соседей. Карта и выбор бота сверены с живым `sea.py` ТОЧНЫМ равенством
/// (`test/fixtures/submarines-reference.json`, выгрузчик `flutter/tool/record_submarines_reference.py`).
///
/// БЮДЖЕТ ВЫСТРЕЛОВ — от бота на ТОМ ЖЕ флоте: бот топит флот за B выстрелов (зерно бота
/// выводится из зерна доски), человеку дано ⌈B × множитель⌉. Замер 01.10.2026: бот движка
/// на стандартном поле 10×10 — в среднем 65,5 выстрела (100 зёрен), не 55 из заметок движка
/// (55 — одно зерно).
///
/// ⚠️ ИЗВЕСТНОЕ «ДОРАБОТАЕМ»: попадания в УЖЕ потопленные корабли движок тоже держит за
/// «добивать» и стреляет вокруг них. Перенесено как есть — иначе расходимся с эталоном;
/// починка сделает бота сильнее, а бюджет строже, и станет следующей осью лестницы.

typedef Cell = (int, int);

class ShipSpec {
  const ShipSpec(this.name, this.length);
  final String name;
  final int length;
}

/// Флот движка для поля 10×10 (5/4/3/3/2) — имена как в `sea.py`: по ним сверяется эталон.
const List<ShipSpec> standardFleet = [
  ShipSpec('Carrier', 5),
  ShipSpec('Battleship', 4),
  ShipSpec('Frigate', 3),
  ShipSpec('Submarine', 3),
  ShipSpec('Destroyer', 2),
];

enum ShotResult { miss, hit, sunk }

/// Ступень: поле, флот и множитель бюджета к результату бота.
class SubLevel {
  const SubLevel({required this.size, required this.fleet, required this.factor});
  final int size;
  final List<ShipSpec> fleet;
  final double factor;

  int get cells => fleet.fold(0, (a, s) => a + s.length);

  String get signature => '$size|${fleet.map((s) => s.length).join(',')}|${factor.toStringAsFixed(2)}';
}

/// ЛЕСТНИЦА: L1–L9 поле 6×6 → 10×10 и флот 3+2 → стандартный 5/4/3/3/2; множитель
/// бюджета с L1: 2,0 и минус 0,05 за ступень. ⚠️ ГРАНИЦА: 1,1 × бот (L19) — строже без
/// починки бота (см. «доработаем») бюджет станет лотереей; следующая ось — гонка с ботом.
SubLevel subLevelFor(int level) {
  final l = max(1, level);
  const shapes = <(int, List<int>)>[
    (6, [3, 2]),
    (6, [3, 2, 2]),
    (7, [3, 3, 2]),
    (7, [4, 3, 2]),
    (8, [4, 3, 2]),
    (8, [4, 3, 3, 2]),
    (9, [4, 3, 3, 2]),
    (9, [5, 4, 3, 2]),
  ];
  final factor = max(1.1, 2.0 - 0.05 * (l - 1));
  if (l > shapes.length) return SubLevel(size: 10, fleet: standardFleet, factor: factor);
  final (size, lens) = shapes[l - 1];
  return SubLevel(
    size: size,
    fleet: [for (var i = 0; i < lens.length; i++) ShipSpec('ship$i', lens[i])],
    factor: factor,
  );
}

class Sea {
  Sea({required this.size, required this.fleet, required this.ships});

  final int size;
  final List<ShipSpec> fleet;

  /// Имя корабля → его клетки.
  final Map<String, List<Cell>> ships;

  /// Выстрелы по порядку: клетка → попал ли. Порядок важен боту (как словарь в Python).
  final Map<Cell, bool> shots = {};
  final Set<String> sunk = {};

  /// Случайный флот — перенос `_random_fleet`: корабль за кораблём, случайная ориентация
  /// и клетка, пока не встанет в поле без пересечений.
  factory Sea.random(int size, List<ShipSpec> fleet, Random rng) {
    final ships = <String, List<Cell>>{};
    final taken = <Cell>{};
    for (final s in fleet) {
      while (true) {
        final horiz = rng.nextDouble() < 0.5;
        final r = rng.nextInt(size), c = rng.nextInt(size);
        final cells = [for (var k = 0; k < s.length; k++) (r + (horiz ? 0 : k), c + (horiz ? k : 0))];
        if (cells.every((x) => x.$1 >= 0 && x.$1 < size && x.$2 >= 0 && x.$2 < size) &&
            !cells.any(taken.contains)) {
          ships[s.name] = cells;
          taken.addAll(cells);
          break;
        }
      }
    }
    return Sea(size: size, fleet: fleet, ships: ships);
  }

  bool get done => sunk.length == fleet.length;

  /// Выстрел — перенос `fire`: вне поля и повтор — ошибка правил.
  (ShotResult, String?) fire(int r, int c) {
    if (r < 0 || r >= size || c < 0 || c >= size) throw ArgumentError('off board');
    if (shots.containsKey((r, c))) throw StateError('already shot');
    for (final e in ships.entries) {
      if (e.value.contains((r, c))) {
        shots[(r, c)] = true;
        if (e.value.every(shots.containsKey)) {
          sunk.add(e.key);
          return (ShotResult.sunk, e.key);
        }
        return (ShotResult.hit, e.key);
      }
    }
    shots[(r, c)] = false;
    return (ShotResult.miss, null);
  }
}

/// Вероятностная карта — перенос `prob_map`: сколько размещений живых кораблей накрывают
/// нестрелянную клетку. Есть попадания — берутся только размещения через известные попадания.
Map<Cell, int> probMap(int size, List<ShipSpec> fleet, Map<Cell, bool> shots, Set<String> sunk) {
  final alive = fleet.where((s) => !sunk.contains(s.name));
  final hits = {for (final e in shots.entries) if (e.value) e.key};
  final miss = {for (final e in shots.entries) if (!e.value) e.key};
  final scores = <Cell, int>{};
  for (final s in alive) {
    for (final horiz in const [true, false]) {
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          final cells = [for (var k = 0; k < s.length; k++) (r + (horiz ? 0 : k), c + (horiz ? k : 0))];
          if (!cells.every((x) => x.$1 >= 0 && x.$1 < size && x.$2 >= 0 && x.$2 < size)) continue;
          if (cells.any(miss.contains)) continue;
          if (hits.isNotEmpty && !cells.any(hits.contains)) continue;
          for (final x in cells) {
            if (!shots.containsKey(x)) scores[x] = (scores[x] ?? 0) + 1;
          }
        }
      }
    }
  }
  return scores;
}

enum AiKind { hunt, best, free }

/// Из чего бот выбирает ход — перенос `ai_shot` до броска: соседи попаданий (с повторами,
/// как список в Python), иначе максимумы карты, иначе любая нестрелянная клетка.
(AiKind, List<Cell>) aiCandidates(int size, List<ShipSpec> fleet, Map<Cell, bool> shots, Set<String> sunk) {
  final cand = <Cell>[];
  for (final e in shots.entries) {
    if (!e.value) continue;
    final (r, c) = e.key;
    for (final (dr, dc) in const [(-1, 0), (1, 0), (0, -1), (0, 1)]) {
      final nb = (r + dr, c + dc);
      if (nb.$1 >= 0 && nb.$1 < size && nb.$2 >= 0 && nb.$2 < size && !shots.containsKey(nb)) cand.add(nb);
    }
  }
  if (cand.isNotEmpty) return (AiKind.hunt, cand);
  final scores = probMap(size, fleet, shots, sunk);
  if (scores.isEmpty) {
    return (
      AiKind.free,
      [for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (!shots.containsKey((r, c))) (r, c)],
    );
  }
  final best = scores.values.reduce(max);
  final top = [for (final e in scores.entries) if (e.value == best) e.key]
    ..sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  return (AiKind.best, top);
}

Cell aiShot(int size, List<ShipSpec> fleet, Map<Cell, bool> shots, Set<String> sunk, Random rng) {
  final (_, cand) = aiCandidates(size, fleet, shots, sunk);
  return cand[rng.nextInt(cand.length)];
}

/// Сколько выстрелов нужно боту, чтобы потопить ЭТОТ флот (копия, чужие выстрелы не трогает).
int botShots(Sea sea, Random rng) {
  final copy = Sea(size: sea.size, fleet: sea.fleet, ships: sea.ships);
  var n = 0;
  while (!copy.done && n < sea.size * sea.size) {
    final (r, c) = aiShot(copy.size, copy.fleet, copy.shots, copy.sunk, rng);
    copy.fire(r, c);
    n++;
  }
  return n;
}

/// Доска ступени: флот, бюджет от бота на этом же флоте.
class SubBoard {
  SubBoard({required this.level, required this.sea, required this.bot, required this.budget});
  final SubLevel level;
  final Sea sea;
  final int bot;
  final int budget;

  factory SubBoard.deal(int levelNo, Random rnd) {
    final lv = subLevelFor(levelNo);
    final sea = Sea.random(lv.size, lv.fleet, rnd);
    final bot = botShots(sea, Random(rnd.nextInt(1 << 30)));
    // Бюджет не меньше клеток флота + двух — иначе ступень требует попасть без единого промаха.
    final budget = max(lv.cells + 2, (bot * lv.factor).ceil());
    return SubBoard(level: lv, sea: sea, bot: bot, budget: min(budget, lv.size * lv.size));
  }
}
