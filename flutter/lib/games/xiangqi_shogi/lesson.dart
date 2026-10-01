/// РАЗБОР «СЯНЦИ И СЁГИ» ПО ШАГАМ: каждый ход линии решателя назван приёмом и фигурой.
///
/// Линия: ключ задачи, лучшая защита, следующий доказанный ход — до мата. Атакующий:
/// «мат», «превращение», «сброс» (из руки), «жертва» (фигуру тут же берут), «шах», «тихий
/// ход» (без шаха, но защиты уже нет). Защита: «взятие», «уход» (ходит король),
/// «перекрытие» (встаёт между). Запасная строка — «ход» (доля меряется пробой).
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'ladder.dart';
import 'mate.dart';
import 'view.dart';

const xsLessonKeys = <String>[
  'teachXsRule',
  'teachXsRuleShogi',
  'teachXsMate',
  'teachXsPromote',
  'teachXsDrop',
  'teachXsSacrifice',
  'teachXsCheck',
  'teachXsQuiet',
  'teachXsTake',
  'teachXsEscape',
  'teachXsBlock',
  'teachXsMove',
  'teachXsDone',
];

const xsFallbackKeys = {'teachXsMove'};

/// Ключ названия фигуры в словаре: сянци — xqK…, сёги — sgK…, превращённые — sgPR….
String xsPieceKey(XsMode mode, String kind) => mode == XsMode.xiangqi
    ? 'xq$kind'
    : kind.startsWith('+')
    ? 'sgP${kind.substring(1)}'
    : 'sg$kind';

class XsLessonFrame {
  const XsLessonFrame({required this.view, this.move});
  final XsView view;
  final XsMove? move;
}

/// Линия решателя: ходы атакующего и защиты поочерёдно, до мата.
List<String> xsLine(XsPuzzle p) {
  final board = xsBoard(p.mode, p.fen);
  final out = <String>[];
  var left = p.moves;
  var attack = p.key;
  for (var guard = 0; guard < 2 * p.moves + 2; guard++) {
    board.push(attack);
    out.add(attack);
    left--;
    if (board.inCheck && board.moves().isEmpty) break;
    if (left <= 0) break;
    final reply = MateSolver(board).bestDefence(left);
    if (reply == null) break;
    board.push(reply);
    out.add(reply);
    final win = MateSolver(board).winningMoves(left);
    if (win.isEmpty) break;
    attack = win.first;
  }
  return out;
}

/// Ключи приёмов для каждого хода линии.
List<String> xsLineKeys(XsPuzzle p) {
  final line = xsLine(p);
  final board = xsBoard(p.mode, p.fen);
  final keys = <String>[];
  for (var i = 0; i < line.length; i++) {
    final m = line[i];
    final mv = XsMove.parse(p.mode, m);
    final before = xsViewOf(p.mode, board);
    final attacker = i.isEven;
    board.push(m);
    if (attacker) {
      final mated = board.inCheck && board.moves().isEmpty;
      final taken =
          i + 1 < line.length && XsMove.parse(p.mode, line[i + 1]).to == mv.to;
      if (mated) {
        keys.add('teachXsMate');
      } else if (mv.promote) {
        keys.add('teachXsPromote');
      } else if (mv.drop != null) {
        keys.add('teachXsDrop');
      } else if (taken) {
        keys.add('teachXsSacrifice');
      } else if (board.inCheck) {
        keys.add('teachXsCheck');
      } else {
        keys.add('teachXsQuiet');
      }
    } else {
      final moving = mv.from == null ? null : before.cells[mv.from!];
      if (before.cells[mv.to] != null) {
        keys.add('teachXsTake');
      } else if (moving?.kind == 'K') {
        keys.add('teachXsEscape');
      } else if (mv.drop != null || moving != null) {
        keys.add('teachXsBlock');
      } else {
        keys.add('teachXsMove');
      }
    }
  }
  return keys;
}

String _moveText(XsMode mode, XsMove mv) => mv.drop != null
    ? '*${xsSquare(mode, mv.to)}'
    : '${xsSquare(mode, mv.from!)}–${xsSquare(mode, mv.to)}${mv.promote ? '+' : ''}';

LessonStep _step(String key, XsLessonFrame f, [Map<String, String> args = const {}]) =>
    LessonStep(
      techniqueKey: key,
      text: args.isEmpty ? L.t(key) : L.f(key, args),
      payload: f,
    );

List<LessonStep> xsLessonSteps(XsPuzzle p) {
  final line = xsLine(p);
  if (line.isEmpty) return const [];
  final keys = xsLineKeys(p);
  final board = xsBoard(p.mode, p.fen);
  final out = <LessonStep>[
    _step(
      p.mode == XsMode.shogi ? 'teachXsRuleShogi' : 'teachXsRule',
      XsLessonFrame(view: xsViewOf(p.mode, board)),
      {'n': '${p.moves}'},
    ),
  ];
  for (var i = 0; i < line.length; i++) {
    final mv = XsMove.parse(p.mode, line[i]);
    final before = xsViewOf(p.mode, board);
    final kind = mv.drop ?? before.cells[mv.from!]!.kind;
    board.push(line[i]);
    out.add(
      _step(keys[i], XsLessonFrame(view: xsViewOf(p.mode, board), move: mv), {
        'piece': L.t(xsPieceKey(p.mode, kind)),
        'move': _moveText(p.mode, mv),
      }),
    );
  }
  out.add(
    _step('teachXsDone', XsLessonFrame(view: xsViewOf(p.mode, board)), {
      'n': '${p.moves}',
    }),
  );
  return out;
}

List<LessonStep> xsLessonForLevel(XsCorpus corpus, int level, {required int seed}) => [
  for (final p in xsDeckFor(corpus, level, seed: seed, count: 1)) ...xsLessonSteps(p),
];
