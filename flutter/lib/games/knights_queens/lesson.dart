/// РАЗБОР «КОНЯ И ФЕРЗЕЙ» ПО ШАГАМ: каждый ход назван приёмом.
///
/// Материал — задачи того же подхода, что раздаст «Начать». Разбор открывается ДО
/// партии (память lesson_before_the_round_not_after.md).
///
/// 🔴 ШАГ БЕЗ ИМЕНИ ПРИЁМА — ЭТО ПОКАЗ ОТВЕТА. Поэтому порядок ходов разбора
/// строится САМИМ приёмом, а не берётся из записи решения:
///   · ферзи — каждый раз ряд, где меньше всего свободных полей (там меньше всего
///     выбора); одно поле — «единственное»; несколько, но тупик у всех, кроме одного,
///     — «только это не ведёт в тупик»; иначе — честная запасная строка;
///   · конь — путь, который строит правило Варнсдорфа (перебор `TourSearch` сам
///     ходит им первым): прыжок один — «единственный»; соседнее поле с одним
///     оставшимся входом — «иначе оно останется без входа»; туда, где меньше всего
///     выходов, — «правило Варнсдорфа». Отдельного «углы первыми» нет: угол —
///     поле с одним-двумя выходами, его называют два приёма выше (замер 01.10.2026:
///     как отдельный приём угол сработал 14 раз из 16 336 и после «одного выхода» — 0).
/// Доля безымянных шагов меряется пробой `knights_queens_lesson_test.dart`.
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'ladder.dart';
import 'queens.dart';
import 'tour.dart';

/// Ключи шагов — списком: сборщик словаря видит только литералы и такие списки.
const kqLessonKeys = <String>[
  'teachKqQRule',
  'teachKqQOnly',
  'teachKqQOnlySafe',
  'teachKqQSafe',
  'teachKqQDone',
  'teachKqTRule',
  'teachKqTOnly',
  'teachKqTForced',
  'teachKqTWarnsdorff',
  'teachKqTSafe',
  'teachKqTRest',
  'teachKqTDone',
];

/// Запасные (безымянные) ключи — их долю мерит проба.
const kqFallbackKeys = {'teachKqQSafe', 'teachKqTSafe'};

/// Сколько прыжков коня разбор показывает поштучно; дальше — одной строкой
/// «то же правило до конца». Обход 8×8 по шагу на 63 прыжка — это лекция.
const int kqTourLessonMoves = 14;

class KqLessonFrame {
  const KqLessonFrame({
    required this.mode,
    required this.rows,
    required this.cols,
    required this.code,
    this.marks = const [],
    this.focus,
  });
  final KqMode mode;
  final int rows;
  final int cols;

  /// Запись задачи генератора (дыры, заданные, старт, финиш).
  final String code;

  /// Ферзи на доске / путь коня по порядку.
  final List<int> marks;

  /// Клетка шага.
  final int? focus;
}

String kqCellName(int cell, int cols, int rows) =>
    '${'abcdefgh'[cell % cols]}${rows - cell ~/ cols}';

LessonStep _step(
  String key,
  KqLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

/// Ферзи: (порядок клеток, ключи шагов) — ряд с наименьшим выбором первым.
(List<int>, List<String>) queensExplainedOrder(QueensBoard start) {
  final sols = start.solutions;
  if (sols.isEmpty) return (const [], const []);
  final solution = sols.first;
  final n = start.n;
  final order = <int>[];
  final keys = <String>[];
  final placed = <int>{...start.givens};
  final freeRows = {
    for (var r = 0; r < n; r++)
      if (!start.givens.any((g) => g ~/ n == r)) r,
  };
  List<int> safeIn(int row) => [
    for (var c = 0; c < n; c++)
      if (!start.holes.contains(row * n + c) &&
          placed.every((q) => !QueensBoard.attacks(q, row * n + c, n)))
        row * n + c,
  ];
  while (freeRows.isNotEmpty) {
    final row = (freeRows.toList()..sort())
        .reduce((a, b) => safeIn(b).length < safeIn(a).length ? b : a);
    final options = safeIn(row);
    final cell = solution.firstWhere((s) => s ~/ n == row);
    String key;
    if (options.length == 1) {
      key = 'teachKqQOnly';
    } else {
      // Сколько из вариантов ряда ещё ведут к решению вместе с уже стоящими.
      final alive = options
          .where(
            (o) => sols.any((s) => s.contains(o) && placed.every(s.contains)),
          )
          .length;
      // Несколько живых полей — выбор между ними действительно свободный: так
      // честнее, чем выдумывать приём (замер 01.10.2026: «единственное в столбце»
      // на таких шагах не сработало ни разу из 404).
      key = alive == 1 ? 'teachKqQOnlySafe' : 'teachKqQSafe';
    }
    order.add(cell);
    keys.add(key);
    placed.add(cell);
    freeRows.remove(row);
  }
  return (order, keys);
}

List<LessonStep> queensLessonSteps(QueensPuzzle p) {
  final start = p.board;
  final (order, keys) = queensExplainedOrder(start);
  if (order.isEmpty) return const [];
  final n = p.n;
  final out = <LessonStep>[
    _step(
      'teachKqQRule',
      KqLessonFrame(
        mode: KqMode.queens,
        rows: n,
        cols: n,
        code: p.code,
        marks: start.givens.toList(),
      ),
      {'n': '$n'},
    ),
  ];
  final marks = <int>[...start.givens];
  for (var i = 0; i < order.length; i++) {
    final cell = order[i];
    // Сколько полей было в ряду на этом шаге — для текста.
    final row = cell ~/ n;
    final options = [
      for (var c = 0; c < n; c++)
        if (!start.holes.contains(row * n + c) &&
            marks.every((q) => !QueensBoard.attacks(q, row * n + c, n)))
          c,
    ].length;
    marks.add(cell);
    out.add(
      _step(
        keys[i],
        KqLessonFrame(
          mode: KqMode.queens,
          rows: n,
          cols: n,
          code: p.code,
          marks: List.of(marks),
          focus: cell,
        ),
        {
          'row': '${n - row}',
          'cell': kqCellName(cell, n, n),
          'k': '$options',
        },
      ),
    );
  }
  out.add(
    _step(
      'teachKqQDone',
      KqLessonFrame(
        mode: KqMode.queens,
        rows: n,
        cols: n,
        code: p.code,
        marks: List.of(marks),
      ),
    ),
  );
  return out;
}

/// Почему прыжок [to] из конца пути [path] — ключ шага.
String tourMoveKey(TourBoard b, List<int> path, int to) {
  final cand = b.nextMoves(path);
  if (cand.length == 1) return 'teachKqTOnly';
  final seen = path.toSet();
  final seenAfter = {...seen};
  int exitsOf(int y) => b.jumps(y).where((z) => !seenAfter.contains(z) && z != y).length;
  // У поля остался ОДИН выход: пропустишь сейчас — потом войдёшь в него только
  // через этот выход и застрянешь (если оно не последнее в обходе).
  if (exitsOf(to) == 1 && path.length + 2 < b.free) return 'teachKqTForced';
  final least = cand.map(exitsOf).reduce((a, b) => a < b ? a : b);
  final atLeast = cand.where((y) => exitsOf(y) == least).toList();
  if (exitsOf(to) == least && atLeast.length == 1) return 'teachKqTWarnsdorff';
  if (exitsOf(to) == least) return 'teachKqTWarnsdorff';
  return 'teachKqTSafe';
}

/// Конь: путь правила Варнсдорфа (с откатом, если оно упирается) и ключи шагов.
(List<int>, List<String>) tourExplainedPath(TourBoard b) {
  final s = TourSearch(b, budget: 200000);
  if (s.run([b.start]) != TourOutcome.found) return (const [], const []);
  final path = s.tour;
  final keys = <String>[
    for (var i = 1; i < path.length; i++)
      tourMoveKey(b, path.sublist(0, i), path[i]),
  ];
  return (path, keys);
}

List<LessonStep> tourLessonSteps(TourPuzzle p) {
  final b = p.board;
  final (path, keys) = tourExplainedPath(b);
  if (path.isEmpty) return const [];
  KqLessonFrame frame(int upto, {int? focus}) => KqLessonFrame(
    mode: KqMode.tour,
    rows: p.rows,
    cols: p.cols,
    code: p.code,
    marks: path.sublist(0, upto),
    focus: focus,
  );
  final out = <LessonStep>[
    _step('teachKqTRule', frame(1, focus: b.start), {'cells': '${b.free}'}),
  ];
  final shown = (path.length - 1).clamp(0, kqTourLessonMoves);
  for (var i = 1; i <= shown; i++) {
    final cand = b.nextMoves(path.sublist(0, i));
    final seen = path.sublist(0, i + 1).toSet();
    final exits = b.jumps(path[i]).where((z) => !seen.contains(z)).length;
    out.add(
      _step(keys[i - 1], frame(i + 1, focus: path[i]), {
        'n': '$i',
        'cell': kqCellName(path[i], p.cols, p.rows),
        'k': '$exits',
        'm': '${cand.length}',
      }),
    );
  }
  if (path.length - 1 > shown) {
    out.add(_step('teachKqTRest', frame(path.length)));
  } else {
    out.add(_step('teachKqTDone', frame(path.length)));
  }
  return out;
}

/// Разбор ступени: первая задача подхода с тем же зерном, что у «Начать».
List<LessonStep> kqLessonForLevel(
  KqCorpus corpus,
  KqMode mode,
  int level, {
  required int seed,
}) => mode == KqMode.queens
    ? [
        for (final p in queensDeckFor(corpus, level, seed: seed, count: 1))
          ...queensLessonSteps(p),
      ]
    : [
        for (final p in toursDeckFor(corpus, level, seed: seed, count: 1))
          ...tourLessonSteps(p),
      ];
