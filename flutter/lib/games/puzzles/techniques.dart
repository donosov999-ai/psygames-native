library;

import '../../shell/lesson.dart';

/// 🔴 ИМЯ ПРИЁМА ИЗ ПЕЧАТИ РЕШАТЕЛЯ АВТОРА (задача 23773004) · VER 1 · 01.10.2026.
///
/// Разбор головоломок (`lesson.dart`) знает, ЧТО появилось на доске, но не ПОЧЕМУ. Почему —
/// знает решатель автора и печатает это строками: «Clue at (2,0) full; setting unlit to
/// IMPOSSIBLE», «tree at 3,1 can only link to tent at 3,2». Мост ловит эту печать
/// (`psy_solve_explain`), а здесь она превращается в имя приёма у шага разбора.
///
/// ПРИЁМ ПО СМЫСЛУ, А НЕ ПО ИГРЕ (правило 72220b02). «Подсказка уже выполнена — остальным
/// нельзя» — один ключ у Light Up, Tents, Slant; «единственное место» — один у Tents,
/// Dominosa, Rectangles, Map. Таблица ниже снята с НАСТОЯЩЕЙ печати 8 движков 01.10.2026
/// (`psy_solve_explain` по каждому режиму, первая и последняя ступень), а не придумана.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ И ВРАТЬ ОБ ЭТОМ НЕЛЬЗЯ. Шаг, к которому приём не привязался, остаётся
/// без имени — плеер честно скажет «следующий ход». Шаг, взятый перебором, называется
/// перебором (`teachLogicTrial`), а не объяснением.
/// Роль строки печати.
enum LineRole {
  /// Заголовок: задаёт приём следующим решениям, своих клеток не решает
  /// («filling around clue point at 4,2» — координата здесь узел, а не клетка).
  header,

  /// Решает клетки, названные в самой строке, своим приёмом («row 3 forces tent at 3,3»).
  decides,

  /// Решает клетки вокруг названной: строка называет подсказку, а не клетки
  /// («Clue at (2,0) full» — закрыты соседи по стороне).
  around,

  /// Решает клетки приёмом последнего заголовка («placing \ in 1,3»).
  follows,
}

class TechniqueRule {
  const TechniqueRule(this.pattern, this.key, this.role);

  final RegExp pattern;

  /// Null — сброс заголовка: дальше решения без имени, пока не придёт новый.
  final String? key;
  final LineRole role;
}

/// Все ключи слоя — для сборщика словаря (`embed-l10n` видит ключи-переменные только списком).
const techniqueKeys = <String>[
  'teachLogicClueFull',
  'teachLogicClueNeedsAll',
  'teachLogicOnlyPlace',
  'teachLogicRuleOut',
  'teachLogicAllAgree',
  'teachLogicPair',
  'teachLogicConnect',
  'teachLogicNoShortLoop',
  'teachLogicTrial',
];

/// Таблица снята с ПЕРЕПИСИ ФОРМ СТРОК настоящей печати 8 движков 01.10.2026 (цифры → #,
/// счёт повторов). Порядок важен:
/// берётся первое совпадение, частные правила стоят выше общих.
final techniqueRules = <TechniqueRule>[
  // ── Перебор. «depth = 0» печатается в начале КАЖДОГО решения — это ещё не перебор.
  TechniqueRule(RegExp(r'solve_sub: depth = 0'), null, LineRole.header),
  TechniqueRule(RegExp(r'solve_sub: depth = [1-9]|recursing|forcing chain'), 'teachLogicTrial', LineRole.header),
  // ── Подсказка уже выполнена — остальным рядом нельзя.
  TechniqueRule(RegExp(r'Clue at \(\d+,\d+\) full'), 'teachLogicClueFull', LineRole.around),
  TechniqueRule(RegExp(r'emptying around clue point'), 'teachLogicClueFull', LineRole.header),
  TechniqueRule(RegExp(r'(row|column) \d+ forces non-tent at'), 'teachLogicClueFull', LineRole.decides),
  // ── Подсказке нужны все свободные.
  TechniqueRule(RegExp(r'Clue at \(\d+,\d+\) trivial'), 'teachLogicClueNeedsAll', LineRole.around),
  TechniqueRule(RegExp(r'filling around clue point'), 'teachLogicClueNeedsAll', LineRole.header),
  TechniqueRule(RegExp(r'(row|column) \d+ forces tent at'), 'teachLogicClueNeedsAll', LineRole.decides),
  // ── Единственное место.
  TechniqueRule(RegExp(r'can only link to (tent|tree) at'), 'teachLogicOnlyPlace', LineRole.decides),
  TechniqueRule(RegExp(r'has unique placement'), 'teachLogicOnlyPlace', LineRole.decides),
  TechniqueRule(RegExp(r'can only be in rectangle'), 'teachLogicOnlyPlace', LineRole.decides),
  TechniqueRule(RegExp(r'sole remaining'), 'teachLogicOnlyPlace', LineRole.decides),
  // ── Во всех оставшихся вариантах здесь одно и то же.
  TechniqueRule(RegExp(r'intersection of all placements'), 'teachLogicAllAgree', LineRole.decides),
  TechniqueRule(RegExp(r'possible states of square .* force edge'), 'teachLogicAllAgree', LineRole.decides),
  TechniqueRule(RegExp(r'possible tent locations .* rule out tent at'), 'teachLogicAllAgree', LineRole.decides),
  // ── Замкнулась бы лишняя петля.
  TechniqueRule(RegExp(r'loop avoidance|shortcut loop'), 'teachLogicNoShortLoop', LineRole.header),
  // ── Одно задаёт другое.
  TechniqueRule(RegExp(r'equivalence to an already filled|must be equivalent|implies .*=='), 'teachLogicPair',
      LineRole.header),
  // ── Связность: тупик отрезал бы часть поля.
  TechniqueRule(RegExp(r'dead end'), 'teachLogicConnect', LineRole.header),
  // ── Отбрасываем: здесь нарушилось бы правило.
  TechniqueRule(RegExp(r'cannot be a tent'), 'teachLogicRuleOut', LineRole.decides),
  TechniqueRule(RegExp(r'ruling out|rules out|known-other'), 'teachLogicRuleOut', LineRole.header),
  // ── Решение по последнему заголовку: Slant ставит штрих, Net закрывает/открывает край.
  TechniqueRule(RegExp(r'^\s*placing [\\/] in \d+,\d+|marking edge \d+,\d+'), null, LineRole.follows),
];

/// Координаты клеток в строке: «3,1», «(4,0)», диапазоны Dominosa «(1-2,3)» и «(1,0-1)».
List<(int, int)> cellsOf(String line) {
  final out = <(int, int)>[];
  for (final m in RegExp(r'(\d+)(?:-(\d+))?,(\d+)(?:-(\d+))?').allMatches(line)) {
    final x1 = int.parse(m.group(1)!), y1 = int.parse(m.group(3)!);
    final x2 = m.group(2) == null ? x1 : int.parse(m.group(2)!);
    final y2 = m.group(4) == null ? y1 : int.parse(m.group(4)!);
    for (var x = x1; x <= x2; x++) {
      for (var y = y1; y <= y2; y++) {
        out.add((x, y));
      }
    }
  }
  return out;
}

/// Клетка сетки → ключ приёма, в порядке рассуждений: первое решение по клетке выигрывает.
///
/// ⚠️ ТОЧНОЕ РЕШЕНИЕ ПЕРЕБИВАЕТ «ВОКРУГ». Строка «Clue at (2,0) full» не называет клеток, и
/// соседи подсказки — догадка о том, что она решила. Если ту же клетку другая строка назвала
/// прямо, верна прямая строка, даже если она позже.
Map<(int, int), String> techniqueByCell(List<String> working) {
  // Клетка → (номер строки, ключ): порядок выдачи — порядок строк печати.
  final exact = <(int, int), (int, String)>{};
  final near = <(int, int), (int, String)>{};
  String? context;
  for (var n = 0; n < working.length; n++) {
    final line = working[n].trimRight();
    TechniqueRule? hit;
    for (final r in techniqueRules) {
      if (r.pattern.hasMatch(line)) {
        hit = r;
        break;
      }
    }
    if (hit == null) continue;
    switch (hit.role) {
      case LineRole.header:
        context = hit.key;
      case LineRole.decides:
        for (final c in cellsOf(line)) {
          exact.putIfAbsent(c, () => (n, hit!.key!));
        }
      case LineRole.around:
        for (final c in cellsOf(line)) {
          for (final (dx, dy) in const [(0, -1), (-1, 0), (1, 0), (0, 1)]) {
            near.putIfAbsent((c.$1 + dx, c.$2 + dy), () => (n, hit!.key!));
          }
        }
      case LineRole.follows:
        final key = context;
        if (key == null) continue;
        for (final c in cellsOf(line)) {
          exact.putIfAbsent(c, () => (n, key));
        }
    }
  }
  final all = [
    ...exact.entries,
    for (final e in near.entries)
      if (!exact.containsKey(e.key)) e,
  ]..sort((a, b) => a.value.$1.compareTo(b.value.$1));
  return {for (final e in all) e.key: e.value.$2};
}

/// Приписать шагам разбора приёмы по клеткам и выстроить шаги В ПОРЯДКЕ РАССУЖДЕНИЙ.
///
/// `cellOf` — клетка шага по его рамке (её знает сетка кадра, `gridOf` в lesson.dart).
/// ⚠️ СЧЁТ КЛЕТОК У ПЕЧАТИ И У РИСУНКА МОЖЕТ РАСХОДИТЬСЯ НА ОДНУ. Slant рисует кольцо
/// клеток-рамки вокруг поля, и его клетка (0,0) — это рисованная (1,1). Зашивать сдвиг по
/// игре — сорок мест разойтись, поэтому сдвиг в пределах ±1 подбирается по данным:
/// берётся тот, при котором больше шагов попадает на клетки из печати (при равенстве — 0).
///
/// Порядок: шаг, чью клетку решатель решил раньше, идёт раньше — так разбор повторяет ход
/// мысли, а не чтение слева направо. Шаги без имени — в конце, в прежнем порядке.
List<LessonStep> nameSteps(
  List<LessonStep> steps,
  Map<(int, int), String> byCell,
  (int, int) Function(LessonBox box)? cellOf,
) {
  if (steps.isEmpty || byCell.isEmpty || cellOf == null) return steps;
  final cells = [for (final s in steps) s.box == null ? null : cellOf(s.box!)];
  int hitsAt(int dx, int dy) {
    var hits = 0;
    for (final c in cells) {
      if (c != null && byCell.containsKey((c.$1 + dx, c.$2 + dy))) hits++;
    }
    return hits;
  }

  // ⚠️ ПО УМОЛЧАНИЮ СДВИГА НЕТ. Замер 01.10 по 36 доскам 8 движков: у плотной печати (Pearl,
  // Rectangles решают КАЖДУЮ клетку) сдвиг на одну меняет попадания на 1–2 клетки края —
  // выбор «по максимуму» там держится на ничьей. Сдвиг берётся, только если он лучше нуля
  // на 15 % и больше: так проходит одно кольцо рамки Slant (25 против 16, 120 против ≤100).
  final zero = hitsAt(0, 0);
  var best = zero, bx = 0, by = 0;
  for (final (dx, dy) in const [(-1, -1), (-1, 0), (0, -1), (1, 1), (1, 0), (0, 1), (-1, 1), (1, -1)]) {
    final h = hitsAt(dx, dy);
    if (h > best && h * 100 >= zero * 115) {
      best = h;
      bx = dx;
      by = dy;
    }
  }
  if (best == 0) return steps;
  final order = <(int, int), int>{};
  for (final c in byCell.keys) {
    order[c] = order.length;
  }
  final named = <(int, LessonStep)>[];
  final rest = <LessonStep>[];
  for (var i = 0; i < steps.length; i++) {
    final s = steps[i], c = cells[i];
    final cell = c == null ? null : (c.$1 + bx, c.$2 + by);
    final key = cell == null ? null : byCell[cell];
    if (key == null || s.techniqueKey != null || s.text != null) {
      rest.add(s);
      continue;
    }
    named.add((order[cell]!, LessonStep(box: s.box, techniqueKey: key, payload: s.payload)));
  }
  named.sort((a, b) => a.$1.compareTo(b.$1));
  return [for (final n in named) n.$2, ...rest];
}
