import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/deck.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';

/// КОЛОДА ПОДХОДА СВЕРЯЕТСЯ С ЖИВЫМ ВЕБОМ — ПОЗИЦИЯ В ПОЗИЦИЮ.
///
/// Эталон снят прогоном самого TS (SCHOLARS_EXPORT=1): пять ступеней, те же
/// семена. Совпадать обязаны и ручки ступени, и сам список позиций в порядке
/// выдачи — иначе «тот же уровень» в приложении и в вебе даёт разные задачи.
///
/// 🔴 ГЛАВНОЕ, ЧТО ЭТА ПРОБА ДОКАЗЫВАЕТ, — СОВПАДЕНИЕ ГЕНЕРАТОРА СЛУЧАЙНОСТИ.
/// В JS произведение в LCG выходит за 2⁵³ и double теряет младшие биты; точная
/// арифметика Dart дала бы другие числа и другую колоду при том же семени.
void main() {
  final reference =
      jsonDecode(
            File('test/fixtures/scholars-mate-check-reference.json')
                .readAsStringSync(),
          )
          as Map<String, dynamic>;
  final corpus = ScholarsCorpus.fromJson(
    jsonDecode(File('assets/scholars_mate/puzzles.json').readAsStringSync())
        as Map<String, dynamic>,
  );

  test('корпус прочитан целиком', () {
    expect(corpus.count(ScholarsKind.mate), greaterThan(700));
    expect(corpus.count(ScholarsKind.defend), greaterThan(300));
    expect(corpus.count(ScholarsKind.fromGames), greaterThan(20000));
  });

  final decks = reference['decks'] as Map<String, dynamic>;
  for (final entry in decks.entries) {
    final level = int.parse(entry.key.substring(1));
    final web = entry.value as Map<String, dynamic>;

    test('ступень $level: ручки совпадают с вебом', () {
      final p = levelParams(level);
      expect(p.count, web['count']);
      expect(p.seconds, web['seconds']);
      expect(p.minRating, web['minRating']);
      expect(p.maxRating, web['maxRating']);
      expect(p.motifs, (web['motifs'] as List).cast<String>());
      expect(
        p.kinds.map((k) => k.name).toList(),
        (web['kinds'] as List).cast<String>(),
      );
    });

    test('ступень $level: колода совпадает с вебом позиция в позицию', () {
      final ours = buildDeck(corpus, level)
          .map((x) => '${x.fen}|${x.pre ?? ''}')
          .toList();
      expect(ours, (web['deck'] as List).cast<String>());
    });
  }
}
