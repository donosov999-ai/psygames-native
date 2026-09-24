library;

import '../../shell/lesson.dart';
import 'engine.dart';

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
/// цепочкой рассуждений. Имя приёма приходит отдельным слоем (звено 3 цепочки
/// 240b0113) — у Solo/Towers/Unequal/Keen его печатает сам движок
/// (`solver_show_working`), остальным его выводит общий классификатор.
/// Рукописный учитель объясняет лучше, и там, где он есть, берётся он.
class TathamLesson extends LessonSource {
  TathamLesson(this._engine, {required this.canSolve, required this.gameName});

  final TathamEngine _engine;

  /// Флаг САМОГО автора (`game.can_solve`), а не наш список: список устаревает молча.
  final bool canSolve;
  final String gameName;

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
    if (!_engine.solve()) return const [];
    final after = _engine.draw();
    // Доску возвращаем игроку ровно такой, какой взяли: разбор показывает решение,
    // а не решает за человека. Без этого «Разбор» превратился бы в «Сдаться».
    var guard = 0;
    while (_engine.statePos != at && guard++ < 64) {
      if (!_engine.undo()) break;
    }
    return _stepsFromDiff(before, after);
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
      final p = _positionOf(line);
      if (p != null) placed.add(_Placed(p.$1, p.$2, line));
    }
    if (placed.isEmpty) return const [];

    /*
     * 🔴 КЛЕТКУ СОБИРАЕМ ИЗ НЕСКОЛЬКИХ ПРИМИТИВОВ. Поставленная цифра — это обычно
     * заливка клетки И текст поверх неё: два примитива, один ход. Шаг на каждый
     * примитив показал бы человеку два шага там, где ход один.
     *
     * Размер клетки НЕ зашиваем и не угадываем: берём наименьший положительный
     * разрыв между соседними координатами появившихся примитивов. У сетки это и
     * есть сторона клетки, а если разрывов нет — группировать нечего, и каждый
     * примитив остаётся своим шагом. Так правило работает и на сетке, и на графе.
     */
    final grid = _guessGrid(placed);
    final buckets = <String, List<_Placed>>{};
    for (final p in placed) {
      final key = grid == 0 ? '${p.x}:${p.y}' : '${p.x ~/ grid}:${p.y ~/ grid}';
      (buckets[key] ??= []).add(p);
    }
    final groups = buckets.values.toList()
      ..sort((a, b) {
        final ay = a.first.y, by = b.first.y;
        return ay != by ? ay.compareTo(by) : a.first.x.compareTo(b.first.x);
      });

    final side = grid == 0 ? 1 : grid;
    return [
      for (final g in groups)
        LessonStep(
          box: LessonBox(
            g.map((p) => p.x).reduce((a, b) => a < b ? a : b),
            g.map((p) => p.y).reduce((a, b) => a < b ? a : b),
            side,
            side,
            LessonBoxKind.place,
          ),
          payload: g.map((p) => p.line).toList(growable: false),
        ),
    ];
  }

  /// Первые две координаты примитива. Null — у примитива их нет (`N`, `U`, `D`).
  static (int, int)? _positionOf(String line) {
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

  /// Сторона клетки по наименьшему положительному разрыву координат; 0 — сетки нет.
  static int _guessGrid(List<_Placed> placed) {
    final xs = placed.map((p) => p.x).toSet().toList()..sort();
    final ys = placed.map((p) => p.y).toSet().toList()..sort();
    var best = 0;
    for (final axis in [xs, ys]) {
      for (var i = 1; i < axis.length; i++) {
        final d = axis[i] - axis[i - 1];
        if (d > 0 && (best == 0 || d < best)) best = d;
      }
    }
    // ⚠️ Слишком мелкий разрыв — это не клетка, а толщина рамки: такой шаг
    // разнёс бы одну клетку по нескольким вёдрам. Ниже четырёх не считаем сеткой.
    return best < 4 ? 0 : best;
  }
}

class _Placed {
  const _Placed(this.x, this.y, this.line);
  final int x, y;
  final String line;
}
