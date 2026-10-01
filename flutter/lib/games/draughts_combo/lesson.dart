/// РАЗБОР «ШАШЕК» ПО ШАГАМ: каждый ход главной линии назван приёмом.
///
/// Линия — та, что строит решатель (`comboLine`): ключевой ход белых, лучший ответ
/// чёрных, … до тишины. Приёмы комбинационной игры в шашках:
///   · «жертва» — тихий ход белых, после которого соперник обязан бить;
///   · «обязан бить» — ответ чёрных взятием, когда у них нет ничего, кроме взятий;
///   · «удар» — взятие белых;
///   · «прорыв в дамки» — простая белых становится дамкой;
///   · «дамочный удар» — бьёт белая дамка;
///   · «ответ соперника» — ход чёрных, когда выбор у них был (лучший для них).
/// Запасная строка — тихий ход белых без жертвы (доля меряется пробой).
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../draughts_common/rules.dart';
import 'ladder.dart';
import 'solver.dart';

const drLessonKeys = <String>[
  'teachDrRule',
  'teachDrSacrifice',
  'teachDrForced',
  'teachDrStrike',
  'teachDrCrown',
  'teachDrKingStrike',
  'teachDrReply',
  'teachDrQuiet',
  'teachDrDone',
];

const drFallbackKeys = {'teachDrQuiet'};

class DrLessonFrame {
  const DrLessonFrame({required this.code, this.move});
  final String code;
  final DraughtsMove? move;
}

/// Почему ход [m] из позиции [p] — ключ шага.
String drMoveKey(DraughtsPosition p, DraughtsMove m) {
  final piece = p.cells[m.from];
  final white = piece > 0;
  if (!white) {
    final all = draughtsLegalMoves(p);
    return all.length == 1 || (all.every((x) => x.isCapture) && m.isCapture)
        ? 'teachDrForced'
        : 'teachDrReply';
  }
  if (piece == 1 && m.finalPiece == 2) return 'teachDrCrown';
  if (m.isCapture) return piece == 2 ? 'teachDrKingStrike' : 'teachDrStrike';
  final after = draughtsApply(p, m);
  final replies = draughtsLegalMoves(after);
  if (replies.isNotEmpty && replies.every((r) => r.isCapture)) {
    return 'teachDrSacrifice';
  }
  return 'teachDrQuiet';
}

LessonStep _step(
  String key,
  DrLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

List<LessonStep> comboLessonSteps(ComboPuzzle p) {
  final start = p.position;
  final line = comboLine(start, p.whiteMoves);
  if (line.isEmpty) return const [];
  final out = <LessonStep>[
    _step('teachDrRule', DrLessonFrame(code: start.code), {
      'n': '${p.whiteMoves}',
    }),
  ];
  var x = start;
  final base = comboScore(start);
  for (final m in line) {
    final key = drMoveKey(x, m);
    x = draughtsApply(x, m);
    out.add(
      _step(key, DrLessonFrame(code: x.code, move: m), {
        'move': m.notation,
        'n': '${m.captures.length}',
      }),
    );
  }
  out.add(
    _step('teachDrDone', DrLessonFrame(code: x.code), {
      'gain': '${comboScore(x) - base}',
    }),
  );
  return out;
}

List<LessonStep> comboLessonForLevel(
  ComboCorpus corpus,
  int level, {
  required int seed,
}) => [
  for (final p in comboDeckFor(corpus, level, seed: seed, count: 1))
    ...comboLessonSteps(p),
];
