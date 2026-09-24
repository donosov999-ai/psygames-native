library;

import '../../shell/lesson.dart';

/// 🔴 УЧИТЕЛЬ СУДОКУ: НЕ «ВОТ ОТВЕТ», А ПОЧЕМУ ИМЕННО ЭТА ЦИФРА.
///
/// Решение у доски уже есть — оно лежит рядом с загадкой (`SudokuBoard.solution`),
/// и показать его построчно было бы делом пяти строк. Только это не обучение:
/// человек посмотрел бы, как цифры появляются сами, и ничему не научился.
///
/// Поэтому каждый шаг обязан назвать ПРИЁМ, которым цифра берётся:
///   · одиночка в клетке — в клетке возможна ровно одна цифра;
///   · одиночка в линии — цифре в строке/столбце/квадрате осталось одно место.
/// Этих двух приёмов хватает на лёгкие доски целиком, а на трудных они ведут до
/// первой развилки. Там, где ни один не сработал, шаг честно говорит «здесь
/// стоит {d}» — без выдуманного объяснения.
///
/// ⚠️ ПОРЯДОК ХОДОВ ВЫБИРАЕТ ПРИЁМ, А НЕ ОБХОД СЛЕВА НАПРАВО. Разбор, идущий по
/// клеткам подряд, показывал бы приём там, где его не видно, и молчал бы там,
/// где он очевиден: на каждом шаге ищется клетка, которую ОБЪЯСНИТЬ можно.

/// Что показывает один шаг: куда встаёт цифра и какая доска получилась.
typedef SudokuMove = ({int r, int c, int digit, List<List<int>> grid});

/// Сколько кандидатов у клетки и какие.
List<int> _candidates(List<List<int>> g, int r, int c, int n, int br, int bc) {
  final used = <int>{};
  for (var i = 0; i < n; i += 1) {
    used.add(g[r][i]);
    used.add(g[i][c]);
  }
  final r0 = (r ~/ br) * br, c0 = (c ~/ bc) * bc;
  for (var i = r0; i < r0 + br; i += 1) {
    for (var j = c0; j < c0 + bc; j += 1) {
      used.add(g[i][j]);
    }
  }
  return [for (var d = 1; d <= n; d += 1) if (!used.contains(d)) d];
}

/// Шаги разбора от НЫНЕШНЕЙ доски.
///
/// [limit] — потолок длины: полный разбор судоку это полсотни шагов, ролик на
/// три минуты, который закроют на середине. Приём показывается на нескольких
/// ходах, дальше человек применяет его сам.
///
/// [say] переводит ключ приёма с подстановками. ⚠️ Словарь сюда не втаскивается
/// намеренно: у приёмов есть подстановки («цифре {d} в строке {n} осталось одно
/// место»), а ключ с подстановкой плеер показал бы как есть — с фигурными
/// скобками. Текст собирает экран теми же ключами, которыми говорит сам.
List<LessonStep> sudokuLessonSteps({
  required String Function(String key, Map<String, String> args) say,
  required List<List<int>> grid,
  required List<List<int>> solution,
  required int n,
  required int br,
  required int bc,
  int limit = 8,
}) {
  final g = [for (final row in grid) [...row]];
  final steps = <LessonStep>[];

  while (steps.length < limit) {
    ({int r, int c, String? key, Map<String, String> args})? pick;

    // 1. ОДИНОЧКА В КЛЕТКЕ — самый наглядный приём: смотреть надо на одну клетку.
    outer:
    for (var r = 0; r < n && pick == null; r += 1) {
      for (var c = 0; c < n; c += 1) {
        if (g[r][c] != 0) continue;
        if (_candidates(g, r, c, n, br, bc).length == 1) {
          pick = (r: r, c: c, key: 'teachSudokuNaked', args: {'d': '${solution[r][c]}'});
          break outer;
        }
      }
    }

    // 2. ОДИНОЧКА В ЛИНИИ — цифре осталось одно место в строке, столбце или квадрате.
    if (pick == null) {
      for (var d = 1; d <= n && pick == null; d += 1) {
        for (var r = 0; r < n && pick == null; r += 1) {
          final spots = [
            for (var c = 0; c < n; c += 1)
              if (g[r][c] == 0 && _candidates(g, r, c, n, br, bc).contains(d)) c,
          ];
          if (spots.length == 1) {
            pick = (r: r, c: spots.first, key: 'teachSudokuHiddenRow', args: {'d': '$d', 'n': '${r + 1}'});
          }
        }
        for (var c = 0; c < n && pick == null; c += 1) {
          final spots = [
            for (var r = 0; r < n; r += 1)
              if (g[r][c] == 0 && _candidates(g, r, c, n, br, bc).contains(d)) r,
          ];
          if (spots.length == 1) {
            pick = (r: spots.first, c: c, key: 'teachSudokuHiddenCol', args: {'d': '$d', 'n': '${c + 1}'});
          }
        }
      }
    }

    // 3. ПРИЁМА НЕТ — говорим только ход. Это честнее выдуманного объяснения.
    if (pick == null) {
      for (var r = 0; r < n && pick == null; r += 1) {
        for (var c = 0; c < n; c += 1) {
          if (g[r][c] == 0) {
            pick = (r: r, c: c, key: null, args: {'d': '${solution[r][c]}'});
            break;
          }
        }
      }
    }

    if (pick == null) break; // доска решена
    final d = solution[pick.r][pick.c];
    g[pick.r][pick.c] = d;
    steps.add(LessonStep(
      box: LessonBox(pick.c, pick.r, 1, 1, LessonBoxKind.place),
      text: say(pick.key ?? 'teachSudokuPlain', pick.args),
      payload: (
        r: pick.r,
        c: pick.c,
        digit: d,
        grid: [for (final row in g) [...row]],
      ),
    ));
  }
  return steps;
}
