/// ПРАВИЛА «ЗРИТЕЛЬНОГО ПОИСКА» СВЕРЯЮТСЯ С ЭТАЛОНОМ ЖИВОГО ВЕБ-ЭКРАНА.
///
/// Эталон — flutter/test/fixtures/visual-search-reference.json, выгружен
/// прогоном frontend/app/games/visual-search.tsx: 180 сочетаний «уровень ×
/// раунд», 14 досок целиком вместе с бросками и размеры доски.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/visual_search/model.dart';

VsShape _shape(String name) => switch (name) {
      'T' => VsShape.t,
      'L' => VsShape.l,
      'I' => VsShape.i,
      'plus' => VsShape.plus,
      _ => throw ArgumentError(name),
    };

void main() {
  final ref = jsonDecode(
    File('test/fixtures/visual-search-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  test('объём, цели, конъюнкция и приманки совпадают с вебом на 180 сочетаниях', () {
    final rows = (ref['levels'] as List).cast<Map<String, dynamic>>();
    expect(rows.length, 180);
    for (final row in rows) {
      final p = vsLevelParams(row['level'] as int, row['round'] as int);
      final where = 'L${row['level']} р${row['round']}';
      expect(p.count, row['count'], reason: 'предметов $where');
      expect(p.targetCount, row['targetCount'], reason: 'целей $where');
      expect(p.conjunction, row['conjunction'], reason: 'конъюнкция $where');
      expect(p.decoys, row['decoys'], reason: 'приманок $where');
    }
  });

  test('пороги и потолок лестницы стоят там же, где в вебе', () {
    expect(vsMaxLevel, ref['maxLevel']);
    expect(vsConjFromLevel, ref['conjFromLevel']);
    expect(vsItemSize, (ref['itemSize'] as num).toDouble());
    expect(vsColors, (ref['colors'] as List).cast<String>());
    expect(vsColorsCb, (ref['colorsCb'] as List).cast<String>());
    expect(vsNeutral, ref['neutral']);
    final rules = (ref['rules'] as List).cast<Map<String, dynamic>>();
    expect(rules.firstWhere((r) => r['key'] == 'conj')['fromLevel'], vsConjFromLevel);
  });

  test('доски по зерну совпадают с вебом до предмета', () {
    final boards = (ref['boards'] as List).cast<Map<String, dynamic>>();
    expect(boards.length, 14);
    Rng? rng;
    String? current;
    for (final board in boards) {
      final seed = board['seed'] as String;
      if (seed != current) {
        rng = createRng(seed);
        current = seed;
      }
      final p = vsLevelParams(board['level'] as int, board['round'] as int);
      final target = vsPickTarget(p.conjunction, vsColors, rng!);
      final want = board['target'] as Map<String, dynamic>;
      final where = 'L${board['level']} р${board['round']}';
      expect(target.shape, _shape(want['shape'] as String), reason: 'форма цели $where');
      expect(target.color, want['color'], reason: 'цвет цели $where');

      final items = vsMakeBoard(
        count: p.count,
        targetShape: target.shape,
        targetColor: target.color,
        targetCount: p.targetCount,
        conjunction: p.conjunction,
        w: (board['w'] as num).toDouble(),
        h: (board['h'] as num).toDouble(),
        palette: vsColors,
        decoyCount: p.decoys,
        rnd: rng,
      );
      final wantItems = (board['items'] as List).cast<Map<String, dynamic>>();
      expect(items.length, wantItems.length, reason: 'предметов $where');
      for (var i = 0; i < items.length; i += 1) {
        final a = items[i];
        final b = wantItems[i];
        expect(a.x, closeTo((b['x'] as num).toDouble(), 1e-9), reason: 'x #$i $where');
        expect(a.y, closeTo((b['y'] as num).toDouble(), 1e-9), reason: 'y #$i $where');
        expect(a.rot, b['rot'], reason: 'поворот #$i $where');
        expect(a.isTarget, b['isTarget'], reason: 'цель #$i $where');
        expect(a.decoy, b['decoy'], reason: 'приманка #$i $where');
        expect(a.shape, _shape(b['shape'] as String), reason: 'форма #$i $where');
        expect(a.color, b['color'], reason: 'цвет #$i $where');
      }
    }
  });

  test('размер доски совпадает с вебом и не растёт без предела', () {
    for (final box in (ref['sizes'] as List).cast<Map<String, dynamic>>()) {
      final size = vsBoardSize((box['width'] as num).toDouble());
      expect(size.w, closeTo((box['w'] as num).toDouble(), 1e-9), reason: 'ширина ${box['width']}');
      expect(size.h, closeTo((box['h'] as num).toDouble(), 1e-9), reason: 'высота ${box['width']}');
    }
  });

  test('🔴 приманка выглядит РОВНО как цель и никогда не занимает место цели', () {
    for (final l in [16, 19, 22, 25, 30]) {
      final p = vsLevelParams(l, 1);
      expect(p.decoys, greaterThan(0), reason: 'на L$l приманки обязаны быть');
      final rng = createRng('приманки-$l');
      for (var n = 0; n < 12; n += 1) {
        final target = vsPickTarget(p.conjunction, vsColors, rng);
        final items = vsMakeBoard(
          count: p.count,
          targetShape: target.shape,
          targetColor: target.color,
          targetCount: p.targetCount,
          conjunction: p.conjunction,
          w: 358,
          h: 358,
          rnd: rng,
          decoyCount: p.decoys,
        );
        final decoys = items.where((i) => i.decoy).toList();
        expect(decoys.length, p.decoys, reason: 'приманок на L$l');
        for (final d in decoys) {
          expect(d.isTarget, isFalse, reason: 'приманка заняла место цели — уровень непроходим');
          expect(d.shape, target.shape, reason: 'приманка отличается формой — ось не работает');
          expect(d.color, target.color, reason: 'приманка отличается цветом — ось не работает');
        }
        expect(items.where((i) => i.isTarget).length, p.targetCount, reason: 'целей на L$l');
      }
    }
  });

  test('🔴 на конъюнкции отвлекающий делит с целью РОВНО один признак', () {
    for (final l in [8, 12, 20]) {
      final p = vsLevelParams(l, 2);
      expect(p.conjunction, isTrue);
      final rng = createRng('конъюнкция-$l');
      for (var n = 0; n < 10; n += 1) {
        final target = vsPickTarget(p.conjunction, vsColors, rng);
        final items = vsMakeBoard(
          count: p.count,
          targetShape: target.shape,
          targetColor: target.color,
          targetCount: p.targetCount,
          conjunction: p.conjunction,
          w: 358,
          h: 358,
          rnd: rng,
          decoyCount: p.decoys,
        );
        for (final it in items) {
          if (it.isTarget || it.decoy) continue;
          final sameShape = it.shape == target.shape;
          final sameColor = it.color == target.color;
          // Оба признака сразу — это цель на вид, и она «выскочила» бы сама.
          expect(sameShape && sameColor, isFalse, reason: 'отвлекающий совпал с целью по обоим признакам, L$l');
          expect(sameShape || sameColor, isTrue, reason: 'отвлекающий не делит с целью ни одного признака, L$l');
        }
      }
    }
  });

  test('без конъюнкции цвет ничего не значит: все предметы нейтральные', () {
    final p = vsLevelParams(5, 1);
    final rng = createRng('форма');
    final target = vsPickTarget(p.conjunction, vsColors, rng);
    final items = vsMakeBoard(
      count: p.count,
      targetShape: target.shape,
      targetColor: target.color,
      targetCount: p.targetCount,
      conjunction: p.conjunction,
      w: 358,
      h: 358,
      rnd: rng,
    );
    expect(items.every((i) => i.color == vsNeutral), isTrue);
    expect(items.where((i) => i.shape == target.shape).length, p.targetCount,
        reason: 'фигура цели встречается только у самих целей');
  });
}
