import 'dart:math';

/// «ОЧЕРЕДЬ ЗВЕРЕЙ» — порядок по подсказкам.
///
/// Началась переносом движка MindLab `abstract-games-hub/engines/mindlab/sequencing/queueing.py`
/// (clean-room, атлас №48 «Os Animais de Lucas»), решение Дениса 30.09.2026 — «добавляем,
/// потом доработаем». Скрытый порядок N зверей, игрок ставит их по одному.
///
/// 🔴 ДОРАБОТКА 02.10.2026 (задача e95b7e2f): ИГРА ТРЕБУЕТ ДУМАТЬ, А НЕ ЧИТАТЬ.
/// У движка подсказка была одного вида — «A раньше B». Замер 30.09 на 1800 задачах: на каждом
/// шаге законный ход ровно один, и каждая соседняя пара ответа дана прямой подсказкой. Это
/// свойство такого вида подсказок при единственном ответе: если соседняя пара не названа,
/// её можно поменять местами, и ответ перестаёт быть единственным. Выводить было нечего.
/// Поэтому видов стало пять: «раньше» ➜, «сразу за» 🔗, «первый у двери» 🚪, «последний» 🏁
/// и «не рядом» 🚫. Генератор оставляет только нужные подсказки, и соседние пары
/// приходится ВЫВОДИТЬ.
///
/// Мера трудности — [thinkLoad]: сколько зверей на пути к ответу подходит по подсказкам
/// своего места, сверх верного. Ноль — очередь читается с подсказок, больше — надо смотреть
/// вперёд. Это и ось лестницы.
///
/// ⚠️ ХОД ЗАКОННЫЙ, ЕСЛИ ОЧЕРЕДЬ ЕЩЁ МОЖНО ДОСТРОИТЬ. У движка законным был ход, чьи «раньше»
/// уже стоят. С новыми видами такой проверки мало: зверь может подходить месту и вести в
/// тупик тремя шагами дальше. Ответ единственный, поэтому законный ход всегда ровно один —
/// следующий зверь ответа.

/// Звери; партия берёт первых N после перемешивания. Десять встают в один ряд и на узком
/// телефоне: клетка очереди сжимается по ширине поля (экран), а нажимают не по ней.
const List<String> animalFaces = ['🦁', '🦊', '🦉', '🐻', '🐟', '🐦', '🐰', '🐢', '🐸', '🐼'];

/// Вид подсказки. Порядок — порядок показа: сперва про края очереди, потом про пары.
enum ClueKind {
  /// [QueueClue.a] стоит первым, у двери.
  first,

  /// [QueueClue.a] стоит последним.
  last,

  /// [QueueClue.b] стоит сразу за [QueueClue.a].
  next,

  /// [QueueClue.a] стоит где-то раньше [QueueClue.b].
  before,

  /// [QueueClue.a] и [QueueClue.b] не стоят рядом.
  apart,
}

/// Подсказка про зверей партии (номера зверей партии, не пула).
class QueueClue {
  const QueueClue(this.kind, this.a, [this.b = -1]);

  final ClueKind kind;
  final int a;
  final int b;

  /// Можно ли поставить зверя [x] следующим за [prefix], если всего зверей [n].
  ///
  /// ⚠️ ПРОВЕРКА МЕСТНАЯ: смотрит на это место и на соседа слева, вперёд не заглядывает.
  /// Полный перебор из таких проверок точен — каждая подсказка ловится в момент, когда
  /// встаёт второй из её зверей ([countOrders]).
  bool allows(List<int> prefix, int x, int n) {
    final k = prefix.length;
    final left = k == 0 ? -1 : prefix[k - 1];
    switch (kind) {
      case ClueKind.first:
        return k == 0 ? x == a : x != a;
      case ClueKind.last:
        return k == n - 1 ? x == a : x != a;
      case ClueKind.next:
        if (x == b) return left == a;
        // За [a] обязан встать [b], а встаёт другой.
        if (left == a) return false;
        // Последним [a] стоять не может: за ним никто не встанет.
        if (x == a) return k < n - 1;
        return true;
      case ClueKind.before:
        return x != b || prefix.contains(a);
      case ClueKind.apart:
        return !((x == a && left == b) || (x == b && left == a));
    }
  }

  /// Выполнена ли подсказка в готовой очереди [order].
  bool holds(List<int> order) {
    for (var k = 0; k < order.length; k += 1) {
      if (!allows(order.sublist(0, k), order[k], order.length)) return false;
    }
    return true;
  }

  @override
  bool operator ==(Object other) => other is QueueClue && other.kind == kind && other.a == a && other.b == b;

  @override
  int get hashCode => Object.hash(kind, a, b);

  @override
  String toString() => '${kind.name}($a${b >= 0 ? ',$b' : ''})';
}

/// Сколько очередей разрешают подсказки — до [cap]. Генератору нужно знать только «один»
/// или «не один», ходу — «хоть одна». [prefix] — уже выстроенное начало.
int countOrders(int n, List<QueueClue> clues, {int cap = 2, List<int> prefix = const []}) {
  var total = 0;
  final placed = [...prefix];
  final used = List<bool>.filled(n, false);
  for (final p in prefix) {
    used[p] = true;
  }
  void rec() {
    if (placed.length == n) {
      total += 1;
      return;
    }
    for (var x = 0; x < n && total < cap; x += 1) {
      if (used[x] || !clues.every((c) => c.allows(placed, x, n))) continue;
      used[x] = true;
      placed.add(x);
      rec();
      placed.removeLast();
      used[x] = false;
    }
  }

  rec();
  return total;
}

/// Звери, которых подсказки СВОЕГО места пускают встать следующими за [prefix].
List<int> placeCandidates(int n, List<QueueClue> clues, List<int> prefix) => [
      for (var x = 0; x < n; x += 1)
        if (!prefix.contains(x) && clues.every((c) => c.allows(prefix, x, n))) x,
    ];

/// Нагрузка на вывод: по шагам ответа — сколько зверей подходит своему месту сверх верного.
int thinkLoad(List<int> order, List<QueueClue> clues) {
  var load = 0;
  for (var k = 0; k < order.length; k += 1) {
    load += placeCandidates(order.length, clues, order.sublist(0, k)).length - 1;
  }
  return load;
}

/// Положение партии: звери, подсказки и уже выстроенная часть очереди.
class AnimalQueue {
  AnimalQueue(this.animals, this.clues, [List<int>? queue]) : queue = queue ?? const [];

  /// Лица зверей этой партии, по номерам.
  final List<String> animals;
  final List<QueueClue> clues;

  /// Выстроенные — номера зверей по порядку, от двери.
  final List<int> queue;

  /// Кого подсказки этого места пускают встать следующим — без взгляда вперёд.
  List<int> candidates() => placeCandidates(animals.length, clues, queue);

  /// Законные ходы: после них очередь ещё можно достроить по всем подсказкам.
  List<int> legal() => [
        for (final x in candidates())
          if (countOrders(animals.length, clues, cap: 1, prefix: [...queue, x]) > 0) x,
      ];

  /// Поставить зверя [idx]; незаконный ход — `null`.
  AnimalQueue? play(int idx) {
    if (!legal().contains(idx)) return null;
    return AnimalQueue(animals, clues, [...queue, idx]);
  }

  bool get done => queue.length == animals.length;

  String get key => queue.join(',');
}

/// Причины шага разбора. Имя кончается на `Keys` — по нему сборщик словаря
/// (`embed-l10n.mjs`) находит ключи, которые зовутся не литералом `L.t('…')`.
const queueLessonKeys = ['teachQueueFirst', 'teachQueueNext', 'teachQueueDoor', 'teachQueueGlued', 'teachQueueThink'];

/// Почему следующим встаёт [x], если очередь стоит как [at], — ключ словаря. Без имени
/// приёма разбор был бы показом ответа.
///
/// ⚠️ «ПОДУМАЙ» — КОГДА МЕСТУ ПОДХОДЯТ НЕСКОЛЬКО. Тогда верного не прочесть с подсказок этого
/// места: остальные упираются в подсказку дальше по очереди, и разбор так и говорит.
String queueLessonKey(AnimalQueue at, int x) {
  final k = at.queue.length;
  if (at.candidates().length > 1) return queueLessonKeys[4];
  if (k == 0 && at.clues.any((c) => c.kind == ClueKind.first && c.a == x)) return queueLessonKeys[2];
  if (k > 0 && at.clues.any((c) => c.kind == ClueKind.next && c.a == at.queue.last && c.b == x)) {
    return queueLessonKeys[3];
  }
  return k == 0 ? queueLessonKeys[0] : queueLessonKeys[1];
}

/// Ступень лестницы: сколько зверей. Три на входе, по одному на две ступени, до десяти.
/// Дальше растёт [thinkTargetFor].
int queueSizeFor(int level) => min(animalFaces.length, 3 + max(1, level) ~/ 2);

/// Какие виды подсказок есть на ступени. Новый вид объявляет карточка правила уровня
/// (`assets/level_rules.json`, ключи `glued`, `last`, `apart`). Уровни здесь и там сверяет
/// `test/animal_queue_test.dart`.
Set<ClueKind> clueKindsFor(int level) => {
      ClueKind.first,
      ClueKind.next,
      ClueKind.before,
      if (level >= 3) ClueKind.last,
      if (level >= 5) ClueKind.apart,
    };

/// Нагрузка на вывод, которую ищет генератор. Ноль на первой ступени, дальше по одному на
/// две ступени. Потолка нет: если нужной нагрузки не нашлось, берётся самая близкая.
int thinkTargetFor(int level) => max(1, level) ~/ 2;

/// С какой ступени лишние подсказки убираются. На первой их оставляют: там очередь учатся
/// читать.
const int pruneFrom = 2;

/// Все подсказки нужных [kinds], верные для ответа [order].
List<QueueClue> trueClues(List<int> order, Set<ClueKind> kinds) {
  final n = order.length;
  return [
    if (kinds.contains(ClueKind.first)) QueueClue(ClueKind.first, order.first),
    if (kinds.contains(ClueKind.last)) QueueClue(ClueKind.last, order.last),
    if (kinds.contains(ClueKind.next))
      for (var i = 0; i + 1 < n; i += 1) QueueClue(ClueKind.next, order[i], order[i + 1]),
    if (kinds.contains(ClueKind.before))
      for (var i = 0; i < n; i += 1)
        for (var j = i + 1; j < n; j += 1) QueueClue(ClueKind.before, order[i], order[j]),
    if (kinds.contains(ClueKind.apart))
      for (var i = 0; i < n; i += 1)
        for (var j = i + 2; j < n; j += 1)
          i.isEven ? QueueClue(ClueKind.apart, order[i], order[j]) : QueueClue(ClueKind.apart, order[j], order[i]),
  ];
}

/// Раздача ступени [level]: звери, подсказки и ответ.
///
/// Случайный ответ, подсказки по одной из верных, пока ответ не станет единственным; потом
/// с [pruneFrom] каждая подсказка, без которой ответ всё ещё единственный, убирается. Из
/// [attempts] попыток берётся та, чья [thinkLoad] ближе к [thinkTargetFor].
///
/// ⚠️ ПОПЫТОК МЕНЬШЕ ПРИ ДЕВЯТИ-ДЕСЯТИ ЗВЕРЯХ. Раздача идёт на ходу, перед партией, а проверка
/// единственности у десяти зверей перебирает тысячи очередей. Замер 02.10.2026 (мак под
/// нагрузкой): 30 попыток — до 264 мс на раздачу на L34, 12 — втрое меньше. Цели там
/// всё равно выше достижимого, и лишние попытки ищут то, чего нет.
({AnimalQueue game, List<int> order}) generateQueue(int level, Random rnd, {int? attempts}) {
  final n = queueSizeFor(level);
  final tries = attempts ?? (n >= 9 ? 12 : 30);
  final kinds = clueKindsFor(level);
  final target = thinkTargetFor(level);
  final animals = ([...animalFaces]..shuffle(rnd)).take(n).toList();
  List<QueueClue>? bestClues;
  List<int>? bestOrder;
  var bestGap = 1 << 30;
  for (var attempt = 0; attempt < tries && bestGap > 0; attempt += 1) {
    final order = List.generate(n, (i) => i)..shuffle(rnd);
    final pool = trueClues(order, kinds)..shuffle(rnd);
    final clues = <QueueClue>[];
    for (final c in pool) {
      clues.add(c);
      if (countOrders(n, clues) == 1) break;
    }
    if (level >= pruneFrom) {
      for (final c in [...clues]..shuffle(rnd)) {
        final rest = [...clues]..remove(c);
        if (countOrders(n, rest) == 1) clues.remove(c);
      }
    } else {
      // На первой ступени лишнее не убирается, но «➜» рядом с «🔗» той же пары — уже не
      // подсказка, а повтор: сцепка и так говорит, кто раньше (замечено глазами, L1).
      clues.removeWhere((c) =>
          c.kind == ClueKind.before && clues.any((d) => d.kind == ClueKind.next && d.a == c.a && d.b == c.b));
    }
    final gap = (thinkLoad(order, clues) - target).abs();
    if (gap < bestGap) {
      bestGap = gap;
      bestClues = clues;
      bestOrder = order;
    }
  }
  bestClues!.sort((x, y) => x.kind.index - y.kind.index);
  return (game: AnimalQueue(animals, bestClues), order: bestOrder!);
}
