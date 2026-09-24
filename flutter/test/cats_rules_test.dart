import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/rules.dart';

/// 🔴 ПРАВИЛА «КОШЕК» ПРОВЕРЯЮТСЯ НА РУЧНЫХ СЛУЧАЯХ, А НЕ НА ВЫВОДЕ ГЕНЕРАТОРА.
///
/// Генератор строит карты так, что решение есть по построению; проверять правила его
/// же выводом значит проверять код этим же кодом. Здесь карты выписаны руками, и в
/// каждой ровно одно нарушение — видно, какое правило поймано.
void main() {
  /// Поле 5×5, области полосами: строка r целиком — область r.
  CatsBoard stripes(int n) => CatsBoard(
        n: n,
        regions: [for (var r = 0; r < n; r++) List<int>.filled(n, r)],
        solution: [for (var r = 0; r < n; r++) r],
      );

  int cell(int n, int r, int c) => r * n + c;

  test('🔴 кошки не соприкасаются даже углами', () {
    final b = stripes(5);
    // (0,0) и (1,1) — по диагонали. Строки и столбцы разные, области разные:
    // поймать это может ТОЛЬКО правило касания.
    final cats = {cell(5, 0, 0), cell(5, 1, 1)};
    expect(catConflict(b, cats, 1, 1), CatConflict.touch);

    // Через клетку — уже законно.
    expect(catConflict(b, {cell(5, 0, 0), cell(5, 1, 2)}, 1, 2), isNull);
  });

  test('🔴 в столбце только одна кошка', () {
    final b = stripes(5);
    expect(catConflict(b, {cell(5, 0, 2), cell(5, 3, 2)}, 3, 2), CatConflict.column);
  });

  test('🔴 в области только одна кошка', () {
    // Области — столбцами: вся колонка c это область c. Тогда две кошки в одной
    // области стоят в РАЗНЫХ строках и столбцах… нет, в одном столбце. Поэтому
    // область делаем «уголком», чтобы правило области сработало отдельно от столбца.
    final regions = [
      [0, 0, 1, 1, 1],
      [2, 0, 1, 1, 1],
      [2, 2, 2, 3, 3],
      [4, 4, 2, 3, 3],
      [4, 4, 4, 3, 3],
    ];
    final b = CatsBoard(n: 5, regions: regions, solution: const [1, 0, 2, 4, 3]);
    // (0,0) и (1,1) — область 0 у обеих, но они ещё и касаются; берём (0,1) и (1,1)? —
    // это один столбец. Нужны клетки одной области, не в одной строке, не в одном
    // столбце и не касающиеся: область 1 — (0,2) и (1,4)… они не касаются (|Δc| = 2).
    expect(b.regionAt(0, 2), b.regionAt(1, 4), reason: 'обе клетки одной области');
    expect(catConflict(b, {cell(5, 0, 2), cell(5, 1, 4)}, 1, 4), CatConflict.region);
  });

  test('🔴 партия решена только когда кошек столько же, сколько строк', () {
    final p = generateCats(6, 'проба-решено');
    expect(p, isNotNull);
    final b = p!.board;
    final cats = b.solutionCells;

    expect(catsSolved(b, cats), isTrue, reason: 'разгадка — это решение');
    final short = {...cats}..remove(cats.first);
    expect(catsSolved(b, short), isFalse, reason: 'на одну меньше — не решено');
  });

  /// ⚠️ СЧЁТЧИК РЕШЕНИЙ — ГЛАВНЫЙ ИНСТРУМЕНТ ГЕНЕРАТОРА, и он обязан уметь считать
  /// ДО двух. Карта полосами (строка = область) ничего не ограничивает сверх строк
  /// и столбцов, поэтому решений там заведомо много.
  test('🔴 счётчик решений различает «одно» и «много»', () {
    final loose = [for (var r = 0; r < 6; r++) List<int>.filled(6, r)];
    expect(countCatSolutions(loose, 6, limit: 2), 2, reason: 'свободная карта — много решений');

    final p = generateCats(6, 'проба-счёт')!;
    expect(countCatSolutions(p.board.regions, 6, limit: 2), 1,
        reason: 'карта генератора — ровно одно');
  });

  test('решатель находит расстановку там, где она есть, и молчит, где её нет', () {
    final p = generateCats(7, 'проба-решатель')!;
    expect(solveCats(p.board.regions, 7), isNotNull);

    // Поле 3×3: одна кошка на строку и столбец, и при этом не касаться — невозможно,
    // соседние строки всегда окажутся ближе чем через клетку.
    final tiny = [for (var r = 0; r < 3; r++) List<int>.filled(3, r)];
    expect(solveCats(tiny, 3), isNull, reason: 'на 3×3 законной расстановки не бывает');
  });
}
