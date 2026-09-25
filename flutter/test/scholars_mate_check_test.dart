import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart';

/// ПРАВИЛА «ДЕТСКОГО МАТА» СВЕРЯЮТСЯ С ЖИВЫМ ВЕБОМ, А НЕ С МОИМ ПРЕДСТАВЛЕНИЕМ.
///
/// Эталон снят прогоном самого TS
/// (`frontend/src/__tests__/scholars-mate-export-reference.test.ts`,
/// ключ SCHOLARS_EXPORT=1) — 200 позиций, по сорок на каждый вид задания.
/// Сверяется не «похоже», а число в число: показанная позиция после пре-хода,
/// сторона хода, наличие мата в один, матующий ход, ответ на «грозит ли мат»,
/// лучшая защита и оба вердикта — на верный ход и на заведомо неверный.
void main() {
  final file = File('test/fixtures/scholars-mate-check-reference.json');
  final reference =
      jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

  ScholarsPuzzle puzzleOf(Map<String, dynamic> row) => ScholarsPuzzle(
    kind: ScholarsKind.values.firstWhere((k) => k.name == row['kind']),
    fen: row['fen'] as String,
    pre: row['pre'] as String?,
    solutions: (row['solutions'] as List).cast<String>(),
    san: (row['san'] as List).cast<String>(),
    line: (row['line'] as List).cast<String>(),
    mateIn: (row['mateIn'] as num).toInt(),
    rating: (row['rating'] as num).toInt(),
    threat: row['threatFlag'] as bool?,
  );

  for (final kind in reference.keys) {
    test('$kind: позиция, сторона хода и мат в один совпадают с вебом', () {
      final rows = (reference[kind] as List).cast<Map<String, dynamic>>();
      expect(rows.length, 40, reason: 'эталон вида $kind');
      final mismatch = <String>[];
      for (var i = 0; i < rows.length; i++) {
        final row = rows[i];
        final p = puzzleOf(row);
        void same(String what, Object? mine, Object? web) {
          if (mine != web) {
            mismatch.add('$kind[$i] $what: у нас $mine, в вебе $web');
          }
        }

        same('shownFen', shownFen(p), row['shownFen']);
        same('sideToMove', sideToMove(p), row['sideToMove']);
        same('mateInOne', hasMateInOne(shownFen(p)), row['mateInOne']);
        same('matingMove', matingMove(shownFen(p)), row['matingMove']);
        same('threatAnswer', threatAnswer(p), row['threatAnswer']);
      }
      expect(mismatch, isEmpty, reason: mismatch.take(6).join('\n'));
    });

    test('$kind: вердикты совпадают с вебом', () {
      final rows = (reference[kind] as List).cast<Map<String, dynamic>>();
      final mismatch = <String>[];
      for (var i = 0; i < rows.length; i++) {
        final row = rows[i];
        final p = puzzleOf(row);
        for (final which in ['verdictRight', 'verdictWrong']) {
          final web = row[which] as Map<String, dynamic>?;
          if (web == null) continue;
          final mine = check(p, web['uci'] as String);
          void same(String what, Object? a, Object? b) {
            if (a != b) {
              mismatch.add('$kind[$i] $which.$what: у нас $a, в вебе $b');
            }
          }

          same('correct', mine.correct, web['correct']);
          same('mated', mine.mated, web['mated']);
          same('fenAfter', mine.fenAfter, web['fenAfter']);
          same('reply', mine.reply, web['reply']);
          same('refutation', mine.refutation, web['refutation']);
          if (p.kind == ScholarsKind.defend) {
            // ⚠️ У защиты «лучший ход» неоднозначен: спасающих до двенадцати,
            // и при равной цене побеждает первый по порядку перебора, а
            // порядок у двух движков разный. Сверяется свойство: наш ход
            // спасает и по материалу не хуже веб-варианта.
            final ourGain = mine.best == null
                ? null
                : defenceGain(p, mine.best!);
            final webBest = web['best'] as String?;
            final webGain = webBest == null ? null : defenceGain(p, webBest);
            if (ourGain == null && webGain != null) {
              // Веб нашёл спасающий ход, а мы нет — это расхождение.
              // Если спасающих нет НИ У КОГО, оба показывают подсказку
              // источника: у 6 позиций из 40 список генератора врёт, и
              // требовать от нас спасения там значит требовать невозможного.
              mismatch.add(
                '$kind[$i] $which.best: «${mine.best}» не спасает, '
                'а веб-ход $webBest спасает',
              );
            } else if (ourGain != null && webGain != null && ourGain < webGain) {
              mismatch.add(
                '$kind[$i] $which.best: наш ${mine.best} даёт $ourGain, '
                'веб-ход $webBest даёт $webGain',
              );
            }
          } else {
            same('best', mine.best, web['best']);
          }
        }
      }
      expect(mismatch, isEmpty, reason: mismatch.take(8).join('\n'));
    });
  }
}
