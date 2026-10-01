/// РАЗБОР «НАЙДИ ХОД» ПО ШАГАМ: приём именем, ход за ходом.
///
/// Материал — задачи того же подхода, что раздаст «Начать» (`findMoveDeckFor`),
/// две задачи разных приёмов. Разбор открывается ДО партии.
///
/// 🔴 КАЖДЫЙ ШАГ НАЗВАН ПРИЁМОМ. Замер «Детского мата»: разбор, где шаг лишь
/// показывает верный ход, выглядит зелёным, а учит только ответу. Здесь:
///   · первый шаг — что искать при этом приёме (ключ приёма);
///   · ход человека — «Ход 1: Nf5+ — вилка»;
///   · ответ соперника — ход из записи задачи;
///   · итог — мат, выигрыш материала числом или решающее преимущество.
/// Ходы берутся из записи задачи: показать ход, которого в ней нет, разбор не может.
library;

import 'package:bishop/bishop.dart';

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../scholars_mate/check.dart' show sanOf;
import 'corpus.dart';

/// Имя приёма на экране — ключ словаря по номеру приёма.
const findMoveThemeKeys = <String>[
  'fmHangingPiece',
  'fmMateIn1',
  // Готовый ключ «Детского мата»: то же имя приёма, второй ключ был бы дублем словаря.
  'scholarsMotif_backRankMate',
  'fmFork',
  'fmPin',
  'fmSkewer',
  'fmDiscoveredAttack',
  'fmDoubleCheck',
  'fmTrappedPiece',
  'fmDeflection',
  'fmAttraction',
  'fmMateIn2',
];

/// Что искать при приёме — первый шаг разбора, по номеру приёма.
const findMoveTeachKeys = <String>[
  'teachFmHangingPiece',
  'teachFmMateIn1',
  'teachFmBackRankMate',
  'teachFmFork',
  'teachFmPin',
  'teachFmSkewer',
  'teachFmDiscoveredAttack',
  'teachFmDoubleCheck',
  'teachFmTrappedPiece',
  'teachFmDeflection',
  'teachFmAttraction',
  'teachFmMateIn2',
];

/// Ключи шагов хода и итога — списком: шаг получает ключ переменной, а сборщик
/// словаря видит только литералы и такие списки.
const findMoveLessonKeys = <String>[
  'teachFmMove',
  'teachFmReply',
  'teachFmMate',
  'teachFmGain',
  'teachFmEdge',
];

/// Сколько задач показывает разбор.
const int findMoveLessonExamples = 2;

class FindMoveLessonFrame {
  const FindMoveLessonFrame({
    required this.fen,
    this.from,
    this.to,
    required this.whiteBottom,
  });
  final String fen;
  final String? from;
  final String? to;
  final bool whiteBottom;
}

const _value = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0};

/// Материал белых минус материал чёрных по записи позиции.
int findMoveMaterial(String fen) {
  var sum = 0;
  for (final ch in fen.split(' ').first.split('')) {
    final v = _value[ch.toLowerCase()];
    if (v == null) continue;
    sum += ch == ch.toUpperCase() ? v : -v;
  }
  return sum;
}

LessonStep _step(
  String key,
  FindMoveLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

/// Шаги разбора одной задачи.
List<LessonStep> findMoveLessonSteps(FindMovePuzzle p) {
  final g = findMovePosition(p, 0);
  final white = g.fen.split(' ')[1] == 'w';
  final theme = L.t(findMoveThemeKeys[p.theme]);
  final out = <LessonStep>[
    _step(
      findMoveTeachKeys[p.theme],
      FindMoveLessonFrame(
        fen: g.fen,
        from: p.opponent.substring(0, 2),
        to: p.opponent.substring(2, 4),
        whiteBottom: white,
      ),
    ),
  ];
  final before = findMoveMaterial(g.fen);
  for (var i = 0; i < p.line.length; i++) {
    final uci = p.line[i];
    final san = sanOf(g.fen, uci) ?? uci;
    findMovePlay(g, uci);
    final frame = FindMoveLessonFrame(
      fen: g.fen,
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      whiteBottom: white,
    );
    out.add(
      i.isEven
          ? _step('teachFmMove', frame, {
              'n': '${i ~/ 2 + 1}',
              'move': san,
              'theme': theme,
            })
          : _step('teachFmReply', frame, {'move': san}),
    );
  }
  final last = FindMoveLessonFrame(fen: g.fen, whiteBottom: white);
  final gain = (findMoveMaterial(g.fen) - before) * (white ? 1 : -1);
  if (g.checkmate) {
    out.add(_step('teachFmMate', last));
  } else if (gain > 0) {
    out.add(_step('teachFmGain', last, {'n': '$gain'}));
  } else {
    out.add(_step('teachFmEdge', last));
  }
  return out;
}

/// Разбор подхода: первые задачи РАЗНЫХ приёмов, не больше [findMoveLessonExamples].
List<LessonStep> findMoveLessonFromDeck(List<FindMovePuzzle> deck) {
  final out = <LessonStep>[];
  final seen = <int>{};
  for (final p in deck) {
    if (!seen.add(p.theme)) continue;
    out.addAll(findMoveLessonSteps(p));
    if (seen.length >= findMoveLessonExamples) break;
  }
  return out;
}
