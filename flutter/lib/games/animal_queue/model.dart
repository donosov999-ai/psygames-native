import 'dart:math';

/// «ОЧЕРЕДЬ ЗВЕРЕЙ» — порядок по подсказкам.
///
/// Перенос движка MindLab `abstract-games-hub/engines/mindlab/sequencing/queueing.py`
/// (clean-room, атлас №48 «Os Animais de Lucas») один в один: те же правила хода,
/// тот же генератор, тот же счётчик порядков. Решение Дениса 30.09.2026 —
/// «добавляем, потом доработаем».
///
/// Скрытый порядок N зверей. Подсказка — пара «A раньше B». Игрок ставит зверей
/// по одному; ход законен, если все, кто по подсказкам раньше, уже стоят.
///
/// ⚠️ ЧТО ИЗВЕСТНО ДО ДОРАБОТКИ (замер 30.09.2026 на исходном движке, 1800 задач):
/// законный ход на каждом шаге ровно один, а каждая соседняя пара ответа дана
/// прямой подсказкой. Это свойство подсказок вида «A раньше B» при единственном
/// ответе, а не ошибка переноса: сделать задачу, где порядок надо ВЫВОДИТЬ, можно
/// только подсказками других видов («не первый», «между», «не рядом»). Это и есть
/// «потом доработаем».

/// Звери в том же порядке, что у движка: lion, fox, owl, bear, fish, bird.
const List<String> animalFaces = ['🦁', '🦊', '🦉', '🐻', '🐟', '🐦'];

/// Подсказка: зверь [before] стоит в очереди раньше зверя [after] (номера зверей
/// партии, не пула).
typedef QueueClue = ({int before, int after});

/// Сколько порядков разрешают подсказки — до [cap]. Больше не считаем: генератору
/// нужно знать только «один» или «не один».
int countOrders(int n, List<QueueClue> clues, {int cap = 2}) {
  final before = List.generate(n, (_) => <int>{});
  for (final c in clues) {
    before[c.after].add(c.before);
  }
  var total = 0;
  final placed = <int>{};
  void rec() {
    if (total >= cap) return;
    if (placed.length == n) {
      total += 1;
      return;
    }
    for (var i = 0; i < n; i += 1) {
      if (!placed.contains(i) && placed.containsAll(before[i])) {
        placed.add(i);
        rec();
        placed.remove(i);
      }
    }
  }

  rec();
  return total;
}

/// Положение партии: звери, подсказки и уже выстроенная часть очереди.
class AnimalQueue {
  AnimalQueue(this.animals, this.clues, [List<int>? queue]) : queue = queue ?? const [];

  /// Лица зверей этой партии, по номерам.
  final List<String> animals;
  final List<QueueClue> clues;

  /// Выстроенные — номера зверей по порядку.
  final List<int> queue;

  /// Кого можно поставить следующим: все, кто по подсказкам раньше, уже стоят.
  List<int> legal() {
    final placed = queue.toSet();
    return [
      for (var i = 0; i < animals.length; i += 1)
        if (!placed.contains(i) &&
            clues.where((c) => c.after == i).every((c) => placed.contains(c.before)))
          i,
    ];
  }

  /// Поставить зверя [idx]; незаконный ход — `null` (движок бросал исключение,
  /// экрану удобнее ответ).
  AnimalQueue? play(int idx) {
    if (!legal().contains(idx)) return null;
    return AnimalQueue(animals, clues, [...queue, idx]);
  }

  bool get done => queue.length == animals.length;

  String get key => queue.join(',');
}

/// Случайный порядок + подсказки, пока ответ не станет единственным. Как у движка:
/// все пары «раньше» перемешиваются и добавляются по одной, пока порядок не один и
/// подсказок не меньше `n − 1 + extra`.
///
/// Возвращает партию и ответ (номера зверей по порядку) либо `null`, если
/// единственности не вышло (у движка — `None, None`).
({AnimalQueue game, List<int> order})? generateQueue(int n, Random rnd, {int extra = 2}) {
  final pool = [...animalFaces]..shuffle(rnd);
  final animals = pool.take(n).toList();
  final order = List.generate(n, (i) => i)..shuffle(rnd);
  final pos = {for (var i = 0; i < n; i += 1) order[i]: i};
  final pairs = <QueueClue>[
    for (var a = 0; a < n; a += 1)
      for (var b = 0; b < n; b += 1)
        if (pos[a]! < pos[b]!) (before: a, after: b),
  ]..shuffle(rnd);
  final clues = <QueueClue>[];
  for (final p in pairs) {
    clues.add(p);
    if (countOrders(n, clues) == 1 && clues.length >= n - 1 + extra) break;
  }
  if (countOrders(n, clues) != 1) return null;
  return (game: AnimalQueue(animals, clues), order: order);
}

/// Ступень лестницы: сколько зверей. Пул движка — шесть, дальше расти нечем, пока
/// не добавлены звери и подсказки других видов («потом доработаем»).
int queueSizeFor(int level) => min(animalFaces.length, 2 + max(1, level));
