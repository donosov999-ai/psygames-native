/// ПАРТИЯ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/session.ts`.
///
/// Правило зачёта: жест засчитан, когда линия прошла РОВНО по клеткам одного из
/// допустимых слов — в прямом или обратном порядке. Причина отказа — часть договора:
/// проверки идут по порядку (длина → повтор → соседство → занятость → совпадение), и код
/// называет ПЕРВУЮ сработавшую. Состояние не мутируется: действия отдают новую партию.
///
/// ⚠️ ИНДЕКС ВНЕ ПОЛЯ. В JS `owner[cell]` за границей даёт `undefined`, и сравнения просто
/// ложны; в Dart это [RangeError]. Где веб полагается на `undefined`, здесь стоит явная
/// проверка границы с тем же исходом.
library;

import 'generator.dart';
import 'types.dart';
import 'words.dart';

/// Цвета найденных слов по порядку нахождения (`FILLWORDS_TINTS`), ARGB.
const fillwordsTints = <int>[
  0xFFFCD34D, 0xFF6EE7B7, 0xFF93C5FD, 0xFFD8B4FE, //
  0xFFF9A8D4, 0xFFFDBA74, 0xFFD9F99D, 0xFFCBD5E1,
];

/// Цвет буквы на разобранной плитке (`FILLWORDS_INK`), ARGB.
const fillwordsInk = 0xFF1F2937;

/// Цвет плитки по порядку нахождения: девятое слово начинает круг заново.
int tintForFoundOrder(int order) => fillwordsTints[order % fillwordsTints.length];

FillwordsSession createFillwordsSession(FillwordsPuzzle puzzle, [SubmitOrder order = SubmitOrder.free]) =>
    FillwordsSession(
      puzzle: puzzle,
      owner: List<int>.filled(puzzle.rows * puzzle.cols, -1),
      found: const [],
      order: order,
    );

/// Какой порядок отдать партии (`порядокДляПартии`): строгий — только при видимом списке.
SubmitOrder orderForGame(SubmitOrder levelOrder, bool listVisible) => listVisible ? levelOrder : SubmitOrder.free;

/// Какие слова сейчас можно сдавать (`допустимыеСлова`).
List<int> allowedWords(FillwordsSession session) {
  final unfound = unfoundWordIndexes(session);
  if (unfound.isEmpty) return const [];
  return switch (session.order) {
    SubmitOrder.listed => [unfound.first],
    SubmitOrder.reverse => [unfound.last],
    SubmitOrder.free => unfound,
  };
}

/// Сколько букв ещё на поле.
int lettersLeft(FillwordsSession session) => session.owner.where((o) => o == -1).length;

/// Уровень закрыт ⟺ на поле не осталось букв — счёт по БУКВАМ, а не по словам.
bool isCleared(FillwordsSession session) => lettersLeft(session) == 0;

/// Индексы ещё не найденных слов.
List<int> unfoundWordIndexes(FillwordsSession session) => [
      for (var i = 0; i < session.puzzle.words.length; i++)
        if (!session.found.contains(i)) i,
    ];

bool _samePath(List<CellIndex> a, List<CellIndex> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// Разбор жеста без побочных действий (`resolveTrace`).
FillwordsTrace resolveTrace(FillwordsSession session, List<CellIndex> path) {
  final puzzle = session.puzzle;
  final total = puzzle.rows * puzzle.cols;
  if (path.length < 2) return const FillwordsTrace.rejected(FillwordsRejectReason.tooShort);
  final seen = <CellIndex>{};
  for (var i = 0; i < path.length; i++) {
    final cell = path[i];
    if (cell < 0 || cell >= total) return const FillwordsTrace.rejected(FillwordsRejectReason.noMatch);
    if (!seen.add(cell)) return const FillwordsTrace.rejected(FillwordsRejectReason.repeat);
    if (i > 0 && !areAdjacent(path[i - 1], cell, puzzle.cols, diagonals: puzzle.diagonals)) {
      return const FillwordsTrace.rejected(FillwordsRejectReason.notAdjacent);
    }
  }
  for (final cell in path) {
    if (session.owner[cell] != -1) return const FillwordsTrace.rejected(FillwordsRejectReason.taken);
  }
  final reversed = path.reversed.toList();
  for (final index in allowedWords(session)) {
    final planted = puzzle.words[index].path;
    if (_samePath(path, planted) || _samePath(reversed, planted)) return FillwordsTrace.hit(index);
  }
  return const FillwordsTrace.rejected(FillwordsRejectReason.noMatch);
}

FillwordsSession _copy(FillwordsSession s, {List<int>? owner, List<int>? found, int? hints, int? mistakes}) =>
    FillwordsSession(
      puzzle: s.puzzle,
      owner: owner ?? s.owner,
      found: found ?? s.found,
      hints: hints ?? s.hints,
      mistakes: mistakes ?? s.mistakes,
      order: s.order,
    );

/// Применить жест (`applyTrace`): попадание занимает клетки слова; осмысленная линия мимо
/// слова (`no-match`) — промах; дрожь руки (прыжок, повтор, тап) промахом не считается.
({FillwordsSession session, FillwordsTrace trace}) applyTrace(FillwordsSession session, List<CellIndex> path) {
  final trace = resolveTrace(session, path);
  if (!trace.ok) {
    if (trace.reason != FillwordsRejectReason.noMatch) return (session: session, trace: trace);
    return (session: _copy(session, mistakes: session.mistakes + 1), trace: trace);
  }
  final owner = [...session.owner];
  for (final cell in session.puzzle.words[trace.wordIndex].path) {
    owner[cell] = trace.wordIndex;
  }
  return (session: _copy(session, owner: owner, found: [...session.found, trace.wordIndex]), trace: trace);
}

/// Подсказка (`takeHint`): САМОЕ КОРОТКОЕ из ненайденных, и слово целиком — отчёт Дениса
/// 05.09.2026 «подсказка ни фига не работает» (две клетки оставляли медиану 7 продолжений).
({FillwordsSession session, FillwordsHint? hint}) takeHint(FillwordsSession session) {
  final candidates = unfoundWordIndexes(session);
  if (candidates.isEmpty) return (session: session, hint: null);
  var best = candidates.first;
  for (final index in candidates) {
    if (session.puzzle.words[index].path.length < session.puzzle.words[best].path.length) best = index;
  }
  final path = session.puzzle.words[best].path;
  return (
    session: _copy(session, hints: session.hints + 1),
    hint: FillwordsHint(wordIndex: best, cells: [...path]),
  );
}

bool _freeCell(FillwordsSession session, CellIndex cell) =>
    cell >= 0 && cell < session.owner.length && session.owner[cell] == -1;

/// Шаг ведения линии (`stepTrace`) — одно правило на протягивание и добор тапами:
/// та же клетка или незаконный шаг → линия как была; предпоследняя → стереть хвост;
/// законный сосед → удлинить.
List<CellIndex> stepTrace(FillwordsSession session, List<CellIndex> path, CellIndex cell) {
  if (path.isEmpty) return _freeCell(session, cell) ? [cell] : path;
  if (path.last == cell) return path;
  if (path.length >= 2 && path[path.length - 2] == cell) return path.sublist(0, path.length - 1);
  final next = [...path, cell];
  return traceIsWalkable(session, next) ? next : path;
}

/// Годится ли линия в продолжение (`traceIsWalkable`) — для подсветки, пока палец ведёт.
bool traceIsWalkable(FillwordsSession session, List<CellIndex> path) {
  if (path.isEmpty) return false;
  if (path.length > fillwordsMinWord * 8) return false;
  final seen = <CellIndex>{};
  for (var i = 0; i < path.length; i++) {
    final cell = path[i];
    if (!_freeCell(session, cell) || !seen.add(cell)) return false;
    if (i > 0 &&
        !areAdjacent(path[i - 1], cell, session.puzzle.cols, diagonals: session.puzzle.diagonals)) {
      return false;
    }
  }
  return true;
}
