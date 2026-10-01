/// РАЗБОР «ГО: ЗАХВАТ» ПО ШАГАМ: каждый ход линии решателя назван приёмом.
///
/// Линия: ключ задачи, лучший ответ белых, следующий доказанный ход чёрных — до
/// взятия. Приёмы чёрных:
///   · «атари» — у цели остаётся одно дамэ;
///   · «лестница» — атари второй раз подряд: цель бежит, а дамэ всё одно;
///   · «сеть» — ход не касается цели и её дамэ, но закрывает выход;
///   · «бросок» — свой камень под взятие ради формы;
///   · «сокращение дамэ» — ход в дамэ цели без атари;
///   · «взятие» — цель снята.
/// Ответы белых: «убегает» (наращивает цель), «контратака» (берёт чёрные или ставит
/// им атари), «пас» (рядом с целью ходить некуда), иначе «ответ». Запасная строка —
/// «ход» (доля меряется пробой).
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'ladder.dart';
import 'life.dart';
import 'rules.dart';

const gcLessonKeys = <String>[
  'teachGcRule',
  'teachGcAtari',
  'teachGcLadder',
  'teachGcNet',
  'teachGcThrowIn',
  'teachGcSqueeze',
  'teachGcCapture',
  'teachGcRun',
  'teachGcCounter',
  'teachGcReply',
  'teachGcPass',
  'teachGcMove',
  'teachGcDone',
];

const gcFallbackKeys = {'teachGcMove'};

/// Разбор «Жизни». Чёрные: «два глаза» (после хода группа безусловно жива), «взятие»
/// (снят камень белых), «глаз» (пустых областей, замкнутых группой, стало больше),
/// «атари» (белым осталось одно дамэ), запасная — «ход». Белые: «лезут внутрь»
/// (камень в пространстве группы), «атари» (чёрным одно дамэ), «пас», иначе «ответ».
const glLessonKeys = <String>[
  'teachGlRule',
  'teachGlTwoEyes',
  'teachGlCapture',
  'teachGlEye',
  'teachGlAtari',
  'teachGlInvade',
  'teachGlWhiteAtari',
  'teachGcPass',
  'teachGcReply',
  'teachGcMove',
  'teachGlDone',
];

const glFallbackKeys = {'teachGcMove'};

class GcLessonFrame {
  const GcLessonFrame({required this.position, this.move});
  final GoPosition position;
  final int? move;
}

/// Имя пункта: столбец буквой (без I, как принято в го), ряд числом снизу.
String goPointName(int size, int p) {
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return '${letters[p % size]}${size - p ~/ size}';
}

/// Линия решателя: ходы чёрных и белых поочерёдно, до взятия.
List<int> goCaptureLine(GoCapturePuzzle p) {
  final out = <int>[];
  var pos = p.position;
  var left = p.moves;
  var black = p.key;
  for (var guard = 0; guard < 2 * p.moves + 2; guard++) {
    final next = pos.play(black);
    if (next == null) break;
    out.add(black);
    pos = next;
    left--;
    if (pos.at(p.target) == goEmpty || left <= 0) break;
    final reply = CaptureSolver().defenderReply(pos, p.target, left);
    final after = pos.play(reply);
    if (after == null) break;
    out.add(reply);
    pos = after;
    final win = CaptureSolver().winningMoves(pos, p.target, left);
    if (win.isEmpty) break;
    black = win.first;
  }
  return out;
}

/// Ключи приёмов для каждого хода линии.
List<String> goCaptureLineKeys(GoCapturePuzzle p) {
  final line = goCaptureLine(p);
  final keys = <String>[];
  var pos = p.position;
  var lastBlackAtari = false;
  for (final m in line) {
    final black = pos.toMove == goBlack;
    final before = pos.at(p.target) == goWhite ? pos.group(p.target) : null;
    final next = pos.play(m)!;
    if (black) {
      final after = next.at(p.target) == goWhite ? next.group(p.target) : null;
      String key;
      if (after == null) {
        key = 'teachGcCapture';
      } else if (after.liberties.length == 1) {
        key = lastBlackAtari ? 'teachGcLadder' : 'teachGcAtari';
      } else if (next.group(m).liberties.length == 1) {
        key = 'teachGcThrowIn';
      } else if (before != null && before.liberties.contains(m)) {
        key = 'teachGcSqueeze';
      } else if (before != null &&
          !before.stones.any((s) => pos.neighbours(s).contains(m))) {
        key = 'teachGcNet';
      } else {
        key = 'teachGcMove';
      }
      lastBlackAtari = after != null && after.liberties.length == 1;
      keys.add(key);
    } else {
      final blacksBefore = pos.points.where((v) => v == goBlack).length;
      final blacksAfter = next.points.where((v) => v == goBlack).length;
      final ataris = m >= 0 &&
          next.neighbours(m).any(
            (n) => next.at(n) == goBlack && next.group(n).liberties.length == 1,
          );
      if (m < 0) {
        keys.add('teachGcPass');
      } else if (blacksAfter < blacksBefore || ataris) {
        keys.add('teachGcCounter');
      } else if (m >= 0 && before != null &&
          before.stones.any((s) => pos.neighbours(s).contains(m))) {
        keys.add('teachGcRun');
      } else {
        keys.add('teachGcReply');
      }
    }
    pos = next;
  }
  return keys;
}

LessonStep _step(
  String key,
  GcLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

List<LessonStep> goCaptureLessonSteps(GoCapturePuzzle p) {
  final line = goCaptureLine(p);
  if (line.isEmpty) return const [];
  final keys = goCaptureLineKeys(p);
  var pos = p.position;
  final out = <LessonStep>[
    _step('teachGcRule', GcLessonFrame(position: pos), {'n': '${p.moves}'}),
  ];
  for (var i = 0; i < line.length; i++) {
    final m = line[i];
    pos = pos.play(m)!;
    out.add(
      _step(keys[i], GcLessonFrame(position: pos, move: m), {
        'move': m < 0 ? '—' : goPointName(p.size, m),
      }),
    );
  }
  out.add(_step('teachGcDone', GcLessonFrame(position: pos), {'n': '${p.moves}'}));
  return out;
}

List<LessonStep> goCaptureLessonForLevel(
  GoCaptureCorpus corpus,
  int level, {
  required int seed,
}) => [
  for (final p in goCaptureDeckFor(corpus, level, seed: seed, count: 1))
    ...goCaptureLessonSteps(p),
];

/// Линия решателя «Жизни»: ход чёрных, лучшая атака белых — пока группа не жива.
List<int> goLifeLine(GoCapturePuzzle p) {
  final out = <int>[];
  var pos = p.position;
  var left = p.moves;
  var black = p.key;
  for (var guard = 0; guard < 2 * p.moves + 2; guard++) {
    final next = pos.play(black);
    if (next == null) break;
    out.add(black);
    pos = next;
    left--;
    if (LifeSolver.alive(pos, p.target) || left <= 0) break;
    final reply = LifeSolver().attackerReply(pos, p.target, left);
    final after = pos.play(reply);
    if (after == null) break;
    out.add(reply);
    pos = after;
    final win = LifeSolver().winningMoves(pos, p.target, left);
    if (win.isEmpty) break;
    black = win.first;
  }
  return out;
}

/// Число пустых областей, замкнутых чёрными (соседи — только чёрные камни и край).
int _blackEnclosedRegions(GoPosition pos) {
  final seen = <int>{};
  var count = 0;
  for (var p = 0; p < pos.points.length; p++) {
    if (pos.at(p) != goEmpty || seen.contains(p)) continue;
    var enclosed = true;
    final stack = [p];
    seen.add(p);
    while (stack.isNotEmpty) {
      final q = stack.removeLast();
      for (final m in pos.neighbours(q)) {
        final v = pos.at(m);
        if (v == goWhite) enclosed = false;
        if (v == goEmpty && seen.add(m)) stack.add(m);
      }
    }
    if (enclosed) count++;
  }
  return count;
}

List<String> goLifeLineKeys(GoCapturePuzzle p) {
  final keys = <String>[];
  var pos = p.position;
  for (final m in goLifeLine(p)) {
    final black = pos.toMove == goBlack;
    final next = pos.play(m)!;
    if (black) {
      final whitesBefore = pos.points.where((v) => v == goWhite).length;
      final whitesAfter = next.points.where((v) => v == goWhite).length;
      if (LifeSolver.alive(next, p.target)) {
        keys.add('teachGlTwoEyes');
      } else if (whitesAfter < whitesBefore) {
        keys.add('teachGlCapture');
      } else if (_blackEnclosedRegions(next) > _blackEnclosedRegions(pos)) {
        keys.add('teachGlEye');
      } else if (next.neighbours(m).any(
        (n) => next.at(n) == goWhite && next.group(n).liberties.length == 1,
      )) {
        keys.add('teachGlAtari');
      } else {
        keys.add('teachGcMove');
      }
    } else if (m < 0) {
      keys.add('teachGcPass');
    } else {
      final space = LifeSolver().candidates(pos, p.target).toSet();
      if (next.at(p.target) == goBlack &&
          next.group(p.target).liberties.length == 1) {
        keys.add('teachGlWhiteAtari');
      } else if (space.contains(m) &&
          !pos.neighbours(m).any((n) => pos.at(n) == goWhite)) {
        keys.add('teachGlInvade');
      } else {
        keys.add('teachGcReply');
      }
    }
    pos = next;
  }
  return keys;
}

List<LessonStep> goLifeLessonSteps(GoCapturePuzzle p) {
  final line = goLifeLine(p);
  if (line.isEmpty) return const [];
  final keys = goLifeLineKeys(p);
  var pos = p.position;
  final out = <LessonStep>[
    _step('teachGlRule', GcLessonFrame(position: pos), {'n': '${p.moves}'}),
  ];
  for (var i = 0; i < line.length; i++) {
    final m = line[i];
    pos = pos.play(m)!;
    out.add(
      _step(keys[i], GcLessonFrame(position: pos, move: m), {
        'move': m < 0 ? '—' : goPointName(p.size, m),
      }),
    );
  }
  out.add(_step('teachGlDone', GcLessonFrame(position: pos), {'n': '${p.moves}'}));
  return out;
}

List<LessonStep> goLessonForLevel(
  GoCaptureCorpus corpus,
  int level,
  GcMode mode, {
  required int seed,
}) => mode == GcMode.capture
    ? goCaptureLessonForLevel(corpus, level, seed: seed)
    : [
        for (final p in goCaptureDeckFor(corpus, level, seed: seed, count: 1))
          ...goLifeLessonSteps(p),
      ];
