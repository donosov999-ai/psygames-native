library;

import 'package:flutter/foundation.dart' show visibleForTesting;

import '../../shell/lesson.dart';
import 'engine.dart';
import 'techniques.dart';

/// 🔴 РАЗБОР ДЛЯ ГОЛОВОЛОМОК ТЭТХЭМА — БЕЗ ЕДИНОЙ СТРОКИ ПРО КОНКРЕТНУЮ ИГРУ.
///
/// Замер 24.09.2026 по всем 42 режимам живой библиотекой (первая ступень, seed
/// 20260924): `psy_solve` доводит до решения 37. Значит решателя писать не надо —
/// он уже внутри движка, и один и тот же код даёт разбор всем тридцати семи.
///
/// КАК УСТРОЕНО: снимаем кадр ДО, просим движок решить, снимаем кадр ПОСЛЕ,
/// возвращаем доску обратно отменой. Разность кадров — это и есть «что появилось
/// на доске», то есть шаги решения. Правил игры мы при этом не знаем и не узнаём.
///
/// ⚠️ ЧЕГО ЭТОТ ГЕНЕРАТОР НЕ ДЕЛАЕТ, И ВРАТЬ ОБ ЭТОМ НЕЛЬЗЯ. Он показывает, ЧТО
/// поставить, но не объясняет ПОЧЕМУ: движок отдаёт решение одним ходом, а не
/// цепочкой рассуждений. Имя приёма приходит отдельным слоем (`techniques.dart`,
/// задача 23773004): решатель автора печатает рассуждения, мост их ловит, и
/// шаг получает ключ приёма по своей клетке. Шаг без строки печати остаётся без имени.
/// Рукописный учитель объясняет лучше, и там, где он есть, берётся он.
class TathamLesson extends LessonSource {
  TathamLesson(this._engine, {required this.canSolve, required this.gameName});

  final TathamEngine _engine;

  /// Флаг САМОГО автора (`game.can_solve`), а не наш список: список устаревает молча.
  final bool canSolve;
  final String gameName;

  /// Рассуждения решателя последнего разбора, строками автора. Для слоя имён приёмов и
  /// для замера «какие строки печатает движок» — человеку не показываются.
  @visibleForTesting
  List<String> lastWorking = const [];

  @override
  // ⚠️ Строка машинная, без русского текста: это пометка для реестра охвата и
  // пробы, а не подпись на экране. Фраза здесь стала бы зашитым текстом на одном
  // языке из двенадцати (гейт `ui_text_debt_does_not_grow`) в месте, где
  // переводить нечего — человек её не увидит никогда.
  @override
  String? get unavailableReason =>
      canSolve ? null : 'no-solver game=$gameName can_solve=false';

  @override
  Future<List<LessonStep>> steps() async {
    if (!canSolve) return const [];
    final before = _engine.draw();
    final at = _engine.statePos;
    // Решаем С ПЕЧАТЬЮ решателя: из неё приходит имя приёма (задача 23773004). Движок
    // без печати или старая библиотека дают пустой список — разбор остаётся, как был.
    final working = _engine.solveExplain();
    if (working == null) return const [];
    lastWorking = working;
    final after = _engine.draw();
    // Доску возвращаем игроку ровно такой, какой взяли: разбор показывает решение,
    // а не решает за человека. Без этого «Разбор» превратился бы в «Сдаться».
    var guard = 0;
    while (_engine.statePos != at && guard++ < 64) {
      if (!_engine.undo()) break;
    }
    final grid = gridOf(after);
    return nameSteps(_stepsFromDiff(before, after), techniqueByCell(working),
        grid == null ? null : (b) => grid.cellAt(b.x, b.y));
  }

  /// Разность двух кадров: примитивы, которых в исходном не было.
  ///
  /// ⚠️ СРАВНИВАЕМ СТРОКИ, А НЕ РАЗОБРАННЫЕ ФИГУРЫ. Кадр приходит потоком строк
  /// (`psy_draw`), и строка — это и есть примитив целиком. Сравнение строк не
  /// зависит от того, какие примитивы автор добавит завтра.
  static List<LessonStep> _stepsFromDiff(List<String> before, List<String> after) {
    final had = <String, int>{};
    for (final line in before) {
      had[line] = (had[line] ?? 0) + 1;
    }
    final fresh = <String>[];
    for (final line in after) {
      final n = had[line] ?? 0;
      if (n > 0) {
        had[line] = n - 1;
      } else {
        fresh.add(line);
      }
    }
    if (fresh.isEmpty) return const [];

    final placed = <_Placed>[];
    for (final line in fresh) {
      final p = positionOf(line);
      if (p != null) placed.add(_Placed(p.$1, p.$2, line));
    }
    if (placed.isEmpty) return const [];

    /*
     * 🔴 КЛЕТКУ СОБИРАЕМ ИЗ НЕСКОЛЬКИХ ПРИМИТИВОВ. Поставленная цифра — это обычно
     * заливка клетки И текст поверх неё: два примитива, один ход. Шаг на каждый
     * примитив показал бы человеку два шага там, где ход один.
     *
     * Сетку берём у ПОЛНОГО кадра (`gridOf`): автор рисует каждую клетку с обрезкой по
     * ней или фоном её размера, и повтор этих примитивов даёт сторону и угол сетки.
     * ⚠️ Было: сторона = наименьший разрыв координат у появившихся примитивов. Замер
     * 01.10 на Light Up: значок лампы стоит в 4 точках от кружка, вышло 4 вместо 32 —
     * клетка дробилась на восемь шагов, и ни один шаг не совпадал с клеткой печати.
     * Сетки нет (граф) — каждый примитив остаётся своим шагом, как раньше.
     */
    final grid = gridOf(after);
    final buckets = <(int, int), List<_Placed>>{};
    for (final p in placed) {
      final key = grid == null ? (p.x, p.y) : grid.cellAt(p.x, p.y);
      (buckets[key] ??= []).add(p);
    }
    final cells = buckets.keys.toList()
      ..sort((a, b) => a.$2 != b.$2 ? a.$2.compareTo(b.$2) : a.$1.compareTo(b.$1));

    return [
      for (final c in cells)
        LessonStep(
          box: grid == null
              ? LessonBox(c.$1, c.$2, 1, 1, LessonBoxKind.place)
              : LessonBox(grid.ox + c.$1 * grid.side, grid.oy + c.$2 * grid.side, grid.side, grid.side,
                  LessonBoxKind.place),
          payload: buckets[c]!.map((p) => p.line).toList(growable: false),
        ),
    ];
  }

  /// Первые две координаты примитива. Null — у примитива их нет (`N`, `U`, `D`).
  static (int, int)? positionOf(String line) {
    final parts = line.split(' ');
    if (parts.length < 3) return null;
    switch (parts[0]) {
      case 'R':
      case 'L':
      case 'C':
      case 'T':
      case 'K':
        final x = int.tryParse(parts[1]);
        final y = int.tryParse(parts[2]);
        return (x == null || y == null) ? null : (x, y);
      case 'W':
        final x = int.tryParse(parts[2]);
        final y = int.tryParse(parts[3]);
        return (x == null || y == null) ? null : (x, y);
      case 'P':
        // Многоугольник: заливка, контур, число точек, дальше пары координат.
        if (parts.length < 6) return null;
        final x = int.tryParse(parts[4]);
        final y = int.tryParse(parts[5]);
        return (x == null || y == null) ? null : (x, y);
      default:
        return null;
    }
  }
}

class _Placed {
  const _Placed(this.x, this.y, this.line);
  final int x, y;
  final String line;
}

/// Сетка кадра: сторона клетки и угол клетки (0,0) в точках экрана.
class FrameGrid {
  const FrameGrid(this.side, this.ox, this.oy);
  final int side, ox, oy;

  /// Клетка, в которую попадает точка экрана.
  (int, int) cellAt(int x, int y) => ((x - ox) ~/ side, (y - oy) ~/ side);
}

int _gcd(int a, int b) => b == 0 ? a.abs() : _gcd(b, a % b);

/// 🔴 СЕТКА ПО ТОМУ, КАК АВТОР РИСУЕТ КЛЕТКУ, А НЕ ПО ТАБЛИЦЕ ИГР.
///
/// Каждую клетку движок рисует одинаково: обрезка `K x y s s` или фон `R x y s s c` размером
/// с клетку. Берём такие примитивы с одной подписью (тип + размер + цвет), повторённые ≥4 раз,
/// НОД сдвигов между ними — сторона клетки, наименьшая позиция по модулю стороны — угол.
/// Размер примитива должен быть со сторону (±1: у Rectangles фон 25 при шаге 24), иначе это
/// не клетка, а значок внутри неё. Побеждает подпись с наибольшим числом повторов.
/// Замер 01.10 по полному кадру: Light Up 32/16, Tents 32, Dominosa 32/24, Slant 32/0,
/// Rectangles 24/18, Map 20/20, Pearl 31/15, Net 32/15.
FrameGrid? gridOf(List<String> frame) {
  final groups = <String, List<(int, int)>>{};
  for (final line in frame) {
    final parts = line.split(' ');
    if ((parts[0] != 'K' && parts[0] != 'R') || parts.length < 5) continue;
    final x = int.tryParse(parts[1]), y = int.tryParse(parts[2]);
    final w = int.tryParse(parts[3]), h = int.tryParse(parts[4]);
    if (x == null || y == null || w == null || h == null || w < 8 || (w - h).abs() > 1) continue;
    (groups['${parts[0]} ${parts.skip(3).join(' ')}'] ??= []).add((x, y));
  }
  FrameGrid? best;
  var bestCount = 0;
  for (final e in groups.entries) {
    final pts = e.value;
    if (pts.length < 4) continue;
    final w = int.parse(e.key.split(' ')[1]);
    final x0 = pts.map((p) => p.$1).reduce((a, b) => a < b ? a : b);
    final y0 = pts.map((p) => p.$2).reduce((a, b) => a < b ? a : b);
    var g = 0;
    for (final p in pts) {
      g = _gcd(g, p.$1 - x0);
      g = _gcd(g, p.$2 - y0);
    }
    if (g < 8 || (w - g).abs() > 1) continue;
    if (pts.length > bestCount) {
      bestCount = pts.length;
      best = FrameGrid(g, x0 % g, y0 % g);
    }
  }
  return best;
}
