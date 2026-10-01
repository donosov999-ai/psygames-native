/// «СУДОКУ ДЛЯ МАЛЫШЕЙ»: дорожка до 1-го уровня обычной лестницы (задачи 01dc3ff0, fa0d6f9c).
///
/// Происхождение — «Судоку с животными» MindLab, решение Дениса 30.09: тематический режим нашего
/// судоку, а не отдельная игра. План уровней v3 (решение Дениса 01.10, «игрок проходит через ВСЕ
/// судоку»): малыши идут тремя дорожками по три ступени — звери 4×4 → «Мяу — друзья» 4×4 →
/// звери 6×6. Ступени и число подсказок — решение развилки лестницы (LEVELS_PLAN.md).
///
/// 🔴 ДОСКИ — ДАННЫМИ ИЗ ВЫГРУЗКИ (`assets/levels/sudoku-kids-boards.json`, выгрузчик
/// `tools/export_kids_boards.py`, генератор MindLab по зерну). Своего генератора здесь больше
/// нет: доски проверены дважды (выгрузчиком и пробой `sudoku_kids_test.dart`), и на каждой доске
/// «Мяу» правило друзей ОБЯЗАТЕЛЬНО — без него решений больше одного.
///
/// ПРАВИЛО «МЯУ — ДРУЗЬЯ»: у каждого кота (значение 1) мышь (значение 2) в одной из четырёх
/// соседних клеток. Отдельной проверки хода экрану не нужно: решение доски с правилом
/// единственно, а ход сверяется с решением — ход, разводящий кота и мышь, и есть ошибка.
library;

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../../shell/shared_state.dart';
import 'levels.dart';
import 'rules.dart';

/// Имя правила друзей в `SudokuBoard.variant`: по нему экран берёт значки кота и мыши и
/// подпись правила.
const friendsVariant = 'friends';

/// Значения кота и мыши в правиле друзей.
const friendsCat = 1, friendsMouse = 2;

/// Ступень дорожки: поле, блок, правило и её доски (задание и решение строками цифр).
class KidsStep {
  const KidsStep({
    required this.track,
    required this.n,
    required this.br,
    required this.bc,
    required this.friends,
    required this.givens,
    required this.boards,
  });

  final String track;
  final int n;
  final int br;
  final int bc;
  final bool friends;
  final int givens;
  final List<({String puzzle, String solution})> boards;
}

/// Все ступени малышей подряд, в порядке дорожек выгрузки.
class KidsBoards {
  const KidsBoards(this.steps);

  static const asset = 'assets/levels/sudoku-kids-boards.json';

  final List<KidsStep> steps;

  static Future<KidsBoards> load() async =>
      KidsBoards.parse(jsonDecode(await rootBundle.loadString(asset)) as Map<String, Object?>);

  factory KidsBoards.parse(Map<String, Object?> json) => KidsBoards([
        for (final t in (json['tracks'] as List).cast<Map<String, Object?>>())
          for (final s in (t['steps'] as List).cast<Map<String, Object?>>())
            KidsStep(
              track: t['id'] as String,
              n: t['n'] as int,
              br: t['br'] as int,
              bc: t['bc'] as int,
              friends: t['friends'] != null,
              givens: s['givens'] as int,
              boards: [
                for (final b in (s['boards'] as List).cast<Map<String, Object?>>())
                  (puzzle: b['puzzle'] as String, solution: b['solution'] as String),
              ],
            ),
      ]);

  /// Доска ступени [step] (1…`steps.length`); [pick] выбирает доску по кругу.
  SudokuBoard board(int step, int pick) {
    final s = steps[(step - 1).clamp(0, steps.length - 1)];
    final b = s.boards[pick % s.boards.length];
    List<List<int>> grid(String digits) => [
          for (var r = 0; r < s.n; r++)
            [for (var c = 0; c < s.n; c++) int.parse(digits[r * s.n + c])],
        ];
    return SudokuBoard(
      level: step,
      n: s.n,
      br: s.br,
      bc: s.bc,
      variant: s.friends ? friendsVariant : 'none',
      puzzle: grid(b.puzzle),
      solution: grid(b.solution),
      geometry: const BoardGeometry(),
    );
  }
}

/// Правило друзей на решётке: у каждого кота мышь сбоку, сверху или снизу. Пустые клетки
/// не мешают — правило судит только о стоящих котах.
bool friendsHold(List<List<int>> g) {
  final n = g.length;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (g[r][c] != friendsCat) continue;
      final mouse = [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)]
          .any((p) => p.$1 >= 0 && p.$2 >= 0 && p.$1 < n && p.$2 < n && g[p.$1][p.$2] == friendsMouse);
      if (!mouse) return false;
    }
  }
  return true;
}

/// Имя лестницы малышей — в формате общей памяти уровней (`psygames_<игра>_level_<профиль>`):
/// по нему карточка развилки показывает ступень (`hub_screen.dart`, `LevelLadder(gameId:)`),
/// а `embed-hubs.mjs` для нативной карточки с режимом ищет этот литерал в исходниках игры.
const juniorLadderId = 'sudoku_junior';

/// Ступень малышей — свой счётчик: обычная лестница не трогается.
class JuniorProgress {
  JuniorProgress(this.state, this.steps);
  final SharedState state;

  /// Сколько ступеней в дорожке (из выгрузки).
  final int steps;

  String get key => '${SharedState.prefix}${juniorLadderId}_level_${state.activeProfile}';

  int get step => (int.tryParse(state.get(key) ?? '') ?? 1).clamp(1, steps);

  void win() => state.set(key, '${(step + 1).clamp(1, steps)}');
}
