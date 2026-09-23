import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mahjong/model.dart';

/// СВЕРКА ПРАВИЛ МАДЖОНГА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/mahjong-reference.json` выгружен прогоном веб-кода: лестница
/// 30 уровней, раскладка у 13 уровней, ужатие, свобода плиток на ручной доске,
/// три раздачи вместе с брошенными числами и выходы из тупика.
///
/// ⚠️ Раздача тянет случайность по ходу разбора. Проверяется не «похоже», а
/// побайтно: тот же список бросков обязан дать те же плитки и тот же порядок снятия.
void main() {
  late Map<String, dynamic> ref;
  late MahjongLayouts layouts;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/mahjong-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    layouts = MahjongLayouts.fromJson(File('assets/levels/mahjong_layouts.json').readAsStringSync());
  });

  test('🔴 библиотека раскладок доехала целиком: 84 штуки по 144 плитки', () {
    expect(layouts.all.length, ref['catalogueSize']);
    expect(layouts.all.map((l) => l.places.length).toList(), ref['catalogueTiles']);
  });

  test('🔴 лестница кончается там же и прячет лица на тех же уровнях', () {
    expect(mahjongLevels, ref['levelsTop']);
    expect(mahjongHiddenFrom, ref['hiddenFrom']);
    expect(maxLayoutHalfX, ref['maxHalfX']);
    for (final raw in ref['levels'] as List) {
      final e = raw as Map<String, dynamic>;
      final cfg = mahjongLevel(e['level'] as int);
      final at = 'L${e['level']}';
      expect(cfg.layers, e['layers'], reason: '$at слоёв');
      expect(cfg.pairs, e['pairs'], reason: '$at пар');
      expect(cfg.cols, e['cols'], reason: '$at колонок');
      expect(cfg.shuffles, e['shuffles'], reason: '$at перетасовок');
      expect(mahjongHidden(e['level'] as int), e['hidden'], reason: '$at скрытые лица');
    }
  });

  test('🔴 уровень берёт ту же раскладку и то же число плиток', () {
    for (final raw in ref['levelLayouts'] as List) {
      final e = raw as Map<String, dynamic>;
      final got = layouts.forLevel(e['level'] as int);
      final at = 'L${e['level']}';
      expect(got?.layout.id, e['layoutId'], reason: '$at раскладка');
      expect(got?.places.length ?? 0, e['tiles'], reason: '$at плиток');
      if (got == null) continue;
      final head = got.places.take(6).map((p) => [p.layer, p.x, p.y]).toList();
      final tail = got.places.skip(got.places.length - 6).map((p) => [p.layer, p.x, p.y]).toList();
      expect(head, e['head'], reason: '$at первые места');
      expect(tail, e['tail'], reason: '$at последние места');
      var w = 0;
      var h = 0;
      for (final p in got.places) {
        if (p.x + 2 > w) w = p.x + 2;
        if (p.y + 2 > h) h = p.y + 2;
      }
      expect(w, e['width'], reason: '$at ширина');
      expect(h, e['height'], reason: '$at высота');
    }
  });

  test('🔴 ужатие раскладки снимает те же плитки', () {
    for (final raw in ref['reductions'] as List) {
      final e = raw as Map<String, dynamic>;
      final layout = layouts.all.firstWhere((l) => l.id == e['layoutId']);
      final kept = reduceLayout(layout.places, e['layers'] as int, e['need'] as int);
      final at = '${e['layoutId']} слоёв ${e['layers']} до ${e['need']}';
      expect(kept?.length ?? 0, e['got'], reason: '$at осталось плиток');
      if (kept == null) continue;
      expect(normalize(kept).take(8).map((p) => [p.layer, p.x, p.y]).toList(), e['places'],
          reason: '$at первые места');
    }
  });

  test('🔴 свобода плитки и счёт ходов совпадают на ручной доске', () {
    final b = ref['board'] as Map<String, dynamic>;
    final tiles = (b['tiles'] as List)
        .map((t) => (t as List).cast<int>())
        .map((t) => Tile(id: t[0], x: t[1], y: t[2], layer: t[3], symbol: t[4]))
        .toList();
    final alive = List<bool>.filled(tiles.length, true);

    for (final raw in b['overlaps'] as List) {
      final e = (raw as List);
      final a = tiles[e[0] as int];
      final c = tiles[e[1] as int];
      expect(overlaps(a.x, a.y, c.x, c.y), e[2], reason: 'перекрытие ${e[0]}–${e[1]}');
    }
    expect(freeFlags(tiles, alive), b['free']);
    expect([for (var i = 0; i < tiles.length; i += 1) isFree(tiles, alive, i)], b['isFree']);
    expect([for (var i = 0; i < tiles.length; i += 1) coveredFromAbove(tiles, alive, i)], b['covered']);
    expect([for (var i = 0; i < tiles.length; i += 1) blockersOf(tiles, alive, i)], b['blockersOf']);
    expect(availablePairs(tiles, alive), b['pairs']);

    final after = b['afterPeel'] as Map<String, dynamic>;
    final alive2 = List<bool>.filled(tiles.length, true);
    alive2[3] = false;
    expect(freeFlags(tiles, alive2), after['free'], reason: 'сняли накрывающую — низ ожил');
    expect(availablePairs(tiles, alive2), after['pairs']);
  });

  test('🔴 раздача на тех же бросках даёт те же плитки и тот же порядок снятия', () {
    for (final raw in ref['deals'] as List) {
      final e = raw as Map<String, dynamic>;
      final picked = layouts.forLevel(e['level'] as int)!;
      final draws = (e['draws'] as List).cast<num>().map((n) => n.toDouble()).toList();
      var i = 0;
      final deal = dealSolvable(picked.places, 36, rnd: () => draws[i++]);
      final at = 'L${e['level']}';
      expect(i, e['drawsUsed'], reason: '$at столько же бросков');
      expect(
        deal.tiles.map((t) => [t.id, t.x, t.y, t.layer, t.symbol]).toList(),
        e['tiles'],
        reason: '$at плитки',
      );
      expect(deal.peelOrder, e['peelOrder'], reason: '$at порядок снятия');
    }
  });

  test('🔴 раздача решаема по построению — порядок снятия проигрывается вперёд', () {
    // Независимая проверка: берём peelOrder и разбираем доску, каждый раз требуя,
    // чтобы обе плитки были СВОБОДНЫ и одинаковы. Это вопрос доске, а не генератору.
    final picked = layouts.forLevel(6)!;
    final deal = dealSolvable(picked.places, 36);
    expect(deal.isEmpty, isFalse);
    final alive = List<bool>.filled(deal.tiles.length, true);
    for (final pair in deal.peelOrder) {
      final flags = freeFlags(deal.tiles, alive);
      expect(flags[pair[0]], isTrue, reason: 'плитка ${pair[0]} обязана быть свободной');
      expect(flags[pair[1]], isTrue, reason: 'плитка ${pair[1]} обязана быть свободной');
      expect(deal.tiles[pair[0]].symbol, deal.tiles[pair[1]].symbol, reason: 'снимается пара одинаковых');
      alive[pair[0]] = false;
      alive[pair[1]] = false;
    }
    expect(alive.any((a) => a), isFalse, reason: 'доска разобрана до конца');
  });

  test('🔴 выходы из вставшей доски те же', () {
    for (final raw in ref['stuck'] as List) {
      final e = raw as Map<String, dynamic>;
      final s = StuckInput(
        openPairs: e['openPairs'] as int,
        shufflesLeft: e['shufflesLeft'] as int,
        shuffleDeals: e['shuffleDeals'] as bool,
        canUndo: e['canUndo'] as bool,
      );
      final got = mahjongExits(s).map((x) => x.name).toList();
      expect(got, e['exits'], reason: 'ходов ${e['openPairs']}, перетасовок ${e['shufflesLeft']}');
      expect(mahjongStuckKey(s), e['key']);
    }
  });

  test('🔴 правила показа слоёв совпадают с выверенными в вебе', () {
    for (final raw in ref['view'] as List) {
      final e = raw as Map<String, dynamic>;
      final layer = e['layer'] as int;
      final maxLayer = e['maxLayer'] as int;
      final at = 'слой $layer из $maxLayer';
      expect(layerOffsetFor(maxLayer), e['offset'], reason: '$at подъём');
      expect(tileScaleFor(layer, maxLayer), closeTo(e['scale'] as num, 1e-9), reason: '$at размер');
      expect(layerShadeFor(layer, maxLayer), closeTo(e['shade'] as num, 1e-9), reason: '$at тень');
      expect(tileShadeFor(layer, maxLayer, true), closeTo(e['shadeFree'] as num, 1e-9), reason: '$at тень свободной');
      expect(tileShadeFor(layer, maxLayer, false), closeTo(e['shadeBusy'] as num, 1e-9), reason: '$at тень занятой');
      expect(layerTintFor(layer, maxLayer), e['tint'], reason: '$at оттенок');
      final place = tilePlacement(4, 6, layer, maxLayer, 18, layerOffsetFor(maxLayer));
      final want = e['place'] as Map<String, dynamic>;
      expect(place.left, want['left'], reason: '$at слева');
      expect(place.top, want['top'], reason: '$at сверху');
    }
  });

  test('перетасовки и нечётные места считаются как в вебе', () {
    for (final raw in ref['shuffleBudget'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(shufflesLeft(e['budget'] as int, e['used'] as int), e['left']);
      expect(canShuffle(e['budget'] as int, e['used'] as int), e['can']);
    }
    for (final raw in ref['pairedPlaces'] as List) {
      final e = raw as Map<String, dynamic>;
      final given = [
        for (var i = 0; i < (e['given'] as int); i += 1) Place(x: i, y: 0, layer: 0),
      ];
      expect(pairedPlaces(given).length, e['got']);
    }
  });
}
