import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart';
import 'package:psygames_flutter/games/scholars_mate/deck.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';
import 'package:psygames_flutter/games/scholars_mate/run.dart';

/// РЕЖИМЫ «ДЕТСКОГО МАТА» СВЕРЯЮТСЯ С ЖИВЫМ ВЕБОМ (шаг 3 переезда, 30.09.2026).
///
/// Эталон — раздел `modes` файла scholars-mate-check-reference.json, снятый
/// прогоном самого TS (`SCHOLARS_EXPORT=1 npx jest --runTestsByPath
/// src/__tests__/scholars-mate-export-reference.test.ts`): порядок списка узоров,
/// колоды узора, микса, потока и жертвы — показанная позиция в показанную, виды
/// заданий режима, скрытие вида, движение ступени по медиане и звёзды подхода.
void main() {
  final modes =
      (jsonDecode(
            File('test/fixtures/scholars-mate-check-reference.json')
                .readAsStringSync(),
          ) as Map<String, dynamic>)['modes']
          as Map<String, dynamic>;
  final corpus = ScholarsCorpus.fromJson(
    jsonDecode(File('assets/scholars_mate/puzzles.json').readAsStringSync())
        as Map<String, dynamic>,
  );
  List<String> keys(List<ScholarsPuzzle> deck) => [
    for (final x in deck) '${x.fen}|${x.pre ?? ''}',
  ];
  List<String> webKeys(Object? v) => (v as List).cast<String>();

  test('список узоров: тот же порядок, те же размеры пулов', () {
    expect(corpus.namedMotifs, (modes['namedMotifs'] as List).cast<String>());
    final counts = modes['namedCounts'] as Map<String, dynamic>;
    for (final m in corpus.namedMotifs) {
      expect(corpus.namedCount(m), counts[m], reason: m);
    }
    expect(corpus.mixedCount, modes['mixedCount']);
  });

  test('колоды узора совпадают с вебом позиция в позицию', () {
    final named = modes['named'] as Map<String, dynamic>;
    expect(named, isNotEmpty);
    for (final MapEntry(key: key, value: web) in named.entries) {
      final parts = key.split('|');
      final deck = buildNamedDeck(
        corpus,
        parts[0],
        int.parse(parts[1].substring(1)),
        seed: int.parse(parts[2].substring(1)),
        count: parts.length > 3 ? int.parse(parts[3]) : null,
      );
      expect(keys(deck), webKeys(web), reason: key);
    }
  });

  test('колоды микса совпадают с вебом', () {
    final mixed = modes['mixed'] as Map<String, dynamic>;
    for (final MapEntry(key: key, value: web) in mixed.entries) {
      final parts = key.split('|');
      final deck = buildMixedMotifDeck(
        corpus,
        int.parse(parts[0].substring(1)),
        seed: int.parse(parts[1].substring(1)),
        count: parts.length > 2 ? int.parse(parts[2]) : null,
      );
      expect(keys(deck), webKeys(web), reason: key);
    }
  });

  test('колоды потока и жертвы совпадают с вебом', () {
    final flow = modes['flow'] as Map<String, dynamic>;
    expect(keys(buildFlowDeck(corpus, 5, 1, 600000)), webKeys(flow['L5|s1']));
    expect(
      keys(buildFlowDeck(corpus, 30, 2, 600000, only: ScholarsKind.sacrifice)),
      webKeys(flow['L30|s2|sacrifice']),
    );
    expect(
      keys(buildDeck(corpus, 12, seed: 4, only: ScholarsKind.sacrifice)),
      webKeys((modes['sacrifice'] as Map)['L12|s4']),
    );
  });

  test('виды заданий режима, скрытие вида, ступень и звёзды — как в вебе', () {
    ScholarsKind? kindOf(Object? name) => name == null
        ? null
        : ScholarsKind.values.firstWhere((k) => k.name == name);
    for (final row in (modes['kindsOfMode'] as List).cast<Map>()) {
      final got = kindsOfMode(
        row['level'] as int,
        only: kindOf(row['only']),
        motif: row['motif'] as String?,
        mix: row['mix'] as bool,
      ).map((k) => k.name).toList();
      expect(got, (row['kinds'] as List).cast<String>(), reason: '$row');
    }
    for (final row in (modes['hide'] as List).cast<Map>()) {
      expect(
        hideKind(row['level'] as int, kindOf(row['kind'])!),
        row['hide'],
        reason: '$row',
      );
    }
    const steps = {
      'вверх': StepMove.up,
      'вниз': StepMove.down,
      'стоит': StepMove.stay,
    };
    for (final row in (modes['step'] as List).cast<Map>()) {
      expect(
        stepByMedian(row['medianMs'] as int, row['level'] as int),
        steps[row['step']],
        reason: '$row',
      );
    }
    for (final row in (modes['stars'] as List).cast<Map>()) {
      expect(
        runStars(
          row['medianMs'] as int,
          row['level'] as int,
          row['hints'] as int,
        ),
        row['stars'],
        reason: '$row',
      );
    }
  });
}
