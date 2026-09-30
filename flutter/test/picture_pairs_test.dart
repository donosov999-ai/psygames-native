import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS, а не с собственной формулой.
///
/// Значения выгружены прогоном самих TS-функций `levelCfg`, `обменовПослеОшибки` и
/// `сеткаПар` (временная jest-проба, удалена после выгрузки) в
/// `test/fixtures/picture-pairs-reference.json`. Dart обязан совпасть с ними.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/picture-pairs-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 постоянные совпадают с живым кодом', () {
    expect(pairsVolumeTop, ref['volumeTop']);
    expect(pairsSpriteCount, ref['spriteCount']);
    expect(swapLitMs, ref['swapLitMs']);
    expect(swapGapMs, ref['swapGapMs']);
  });

  test('🔴 уровень задаёт то же самое на всех 60 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final c = LevelCfg.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(c.pairs, e['pairs'], reason: '$at групп');
      expect(c.groupSize, e['groupSize'], reason: '$at карт в группе');
      expect(c.photo, e['photo'], reason: '$at фото-показ');
      expect(c.previewMs, e['previewMs'], reason: '$at показ');
      expect(c.swapsPerMiss, (e['swapsPerMiss'] as num).toDouble(), reason: '$at обменов на ошибку');
    }
  });

  test('🔴 число обменов после ошибки совпадает на 56 бросках', () {
    for (final raw in ref['swaps'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = (e['r'] as num).toDouble();
      expect(swapsAfterMiss((e['rate'] as num).toDouble(), () => r), e['n'],
          reason: 'ставка ${e['rate']}, бросок $r');
    }
  });

  test('🔴 раскладка сетки совпадает на 108 сочетаниях окна, уровня и запаса', () {
    for (final raw in ref['grids'] as List) {
      final e = raw as Map<String, dynamic>;
      final g = pairsGrid(
        groups: e['groups'] as int,
        cards: e['cards'] as int,
        containerWidth: min((e['w'] as int) - 32.0, 480),
        fieldHeight: (e['h'] as int).toDouble(),
        bottomReserve: (e['reserve'] as int).toDouble(),
        hint: 44,
      );
      final at = '${e['w']}×${e['h']} L${e['L']} запас ${e['reserve']}';
      expect(g.cols, e['столбцов'], reason: '$at столбцов');
      expect(g.card, (e['карта'] as num).toDouble(), reason: '$at сторона карты');
      expect(g.width, (e['ширина'] as num).toDouble(), reason: '$at ширина сетки');
      expect(g.height, (e['высота'] as num).toDouble(), reason: '$at высота сетки');
      expect(g.fits, e['безПрокрутки'], reason: '$at помещается без прокрутки');
    }
  });

  test('🔴 ни одного уровня-клона на L1…L60', () {
    String fingerprint(int l) {
      final c = LevelCfg.of(l);
      return '${c.pairs}|${c.groupSize}|${c.previewMs}|${c.swapsPerMiss}';
    }

    final clones = <String>[];
    for (var l = 2; l <= 60; l++) {
      if (fingerprint(l) == fingerprint(l - 1)) clones.add('L$l=L${l - 1}');
    }
    expect('клонов: ${clones.length}', 'клонов: 0');
  });

  test('🔴 правило уровня — те же пороги, что у веба: тройки 10–12, четвёрки 13+, обмены 22+', () {
    expect(LevelCfg.ruleAt(9), isNull);
    expect(LevelCfg.ruleAt(10), 'triple');
    expect(LevelCfg.ruleAt(12), 'triple');
    expect(LevelCfg.ruleAt(13), 'quad');
    expect(LevelCfg.ruleAt(pairsVolumeTop), 'quad');
    expect(LevelCfg.ruleAt(pairsVolumeTop + 1), 'swap');
    // И правило совпадает с механикой, а не только с порогом.
    for (var l = 1; l <= 60; l++) {
      final c = LevelCfg.of(l);
      final r = LevelCfg.ruleAt(l);
      if (r == 'triple') expect(c.groupSize, 3, reason: 'L$l');
      if (r == 'quad') expect(c.groupSize, 4, reason: 'L$l');
      if (r == 'swap') expect(c.swapsPerMiss, greaterThan(0), reason: 'L$l');
    }
  });

  test('🔴 наборы картинок во Flutter те же, что в вебе: профили, рубашки, 12 файлов', () {
    final themes = jsonDecode(File('assets/pairs/themes.json').readAsStringSync()) as Map<String, dynamic>;
    // Таблица «профиль → набор» в TS не экспортирована, поэтому эталон читается из
    // ЖИВОГО исходника, а не из выгрузки. Поменяют набор в вебе, не пересобрав
    // assets/pairs (`node flutter/tools/embed-pairs.mjs`), — проба покраснеет.
    final ts = File('../frontend/src/constants/pairThemes.ts').readAsStringSync();
    final block = RegExp(r'const PROFILE_PAIR_THEME[^=]*=\s*\{([\s\S]*?)\};').firstMatch(ts)!.group(1)!;
    final webProfiles = {
      for (final m in RegExp(r"(\w+):\s*'(\w+)'").allMatches(block)) m.group(1)!: m.group(2)!,
    };
    expect(webProfiles.length, greaterThan(5), reason: 'разбор таблицы профилей не пустой');
    expect(themes['profiles'], webProfiles, reason: 'профиль → набор');
    expect(themes['backs'], ref['backs'], reason: 'рубашки: цвет и значок');
    for (final entry in (themes['sprites'] as Map<String, dynamic>).entries) {
      final list = (entry.value as List).cast<String>();
      expect(list.length, pairsSpriteCount, reason: 'набор ${entry.key}');
      for (final p in list) {
        expect(File(p).existsSync(), isTrue, reason: 'нет файла $p');
      }
    }
  });

  test('🔴 группа снимается целиком, промах — ошибка и ход', () {
    // L10: тройки. Колода задана: символы 0,0,0,1,1,1,…
    final g = PairsGame(level: 10, deck: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], rnd: Random(1));
    expect(g.tap(0), TapResult.opened);
    expect(g.tap(1), TapResult.opened);
    expect(g.tap(2), TapResult.groupMatched, reason: 'три одинаковые — группа');
    expect(g.moves, 1);
    g.settleMatch();
    expect(g.matchedGroups, 1);
    expect(g.tap(3), TapResult.opened);
    expect(g.tap(4), TapResult.opened);
    expect(g.tap(6), TapResult.groupMissed, reason: 'две одинаковые и чужая — промах');
    expect(g.errors, 1);
    expect(g.moves, 2);
    expect(g.tap(7), TapResult.ignored, reason: 'пока промах не закрыт, новых карт не открыть');
    g.settleMiss();
    expect(g.cards.where((c) => c.flipped).length, 3, reason: 'закрылся только промах');
  });

  test('🔴 обмен двигает ровно две закрытые карты', () {
    final g = PairsGame(level: 30, deck: [0, 1, 2, 3, 0, 1, 2, 3], rnd: Random(3));
    g.swap(0, 3);
    expect(g.cards.map((c) => c.symbol).toList(), [3, 1, 2, 0, 0, 1, 2, 3]);
    g.cards[1].flipped = true;
    expect(g.closed, isNot(contains(1)), reason: 'открытая карта не меняется местами');
  });

  test('🔴 колода собрана из РАЗНЫХ картинок по размеру группы', () {
    for (final level in [1, 9, 10, 13, 21, 40]) {
      final g = PairsGame(level: level, rnd: Random(level));
      final counts = <int, int>{};
      for (final c in g.cards) {
        counts[c.symbol] = (counts[c.symbol] ?? 0) + 1;
      }
      expect(counts.length, g.cfg.pairs, reason: 'L$level групп');
      expect(counts.values.toSet(), {g.cfg.groupSize}, reason: 'L$level в каждой группе ровно ${g.cfg.groupSize}');
    }
  });

  test('счёт уровня — как в вебе: лишние ходы и время снимают, но не ниже 50', () {
    final g = PairsGame(level: 1, deck: [0, 0, 1, 1, 2, 2, 3, 3], rnd: Random(1));
    g.moves = 4;
    expect(g.score(10), 400 - 0 - 20);
    g.moves = 10;
    expect(g.score(10), 400 - 6 * 15 - 20);
    expect(g.score(500), 50);
  });
}
