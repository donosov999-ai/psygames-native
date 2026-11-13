import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/model.dart';
import 'package:psygames_flutter/games/schulte/screen.dart' show SchulteFreeConfig;

/// «СВОБОДНО» В ШУЛЬТЕ: ВСЕ МОДИФИКАЦИИ ВЕБА (задача 5250081b, 13.11.2026).
///
/// Правила таблицы (порядок целей, Горбов, «от центра») сверены с эталоном в `schulte_test.dart`.
/// Здесь — то, что добавил свободный режим: письменности (знаки те же, что в вебе), «разделённое
/// внимание» с группами и убегающая цель в группах. Каждая проба играет партию целиком, как игрок.
void main() {
  /// Идеальная партия по правилам: жмёт именно ту клетку, которую велит `target`.
  /// В группах это клетка с нужным числом И нужной группой.
  int playPerfect(SchulteGame g) {
    var presses = 0;
    while (!g.done && presses < 5000) {
      final want = g.target;
      var cell = -1;
      for (var i = 0; i < g.items.length; i += 1) {
        if (g.items[i] != want) continue;
        if (g.grouped && g.cellGroup[i] != g.activeGroup) continue;
        cell = i;
        break;
      }
      expect(cell, greaterThanOrEqualTo(0), reason: 'цель $want есть на поле');
      g.press(cell);
      presses += 1;
    }
    return presses;
  }

  LevelParams params(
    int size,
    ContentMode mode, {
    Direction dir = Direction.forward,
    bool color = false,
    bool moving = false,
    int groups = 1,
  }) =>
      LevelParams(
        gridSize: size,
        contentMode: mode,
        direction: dir,
        colorMode: color,
        surpriseStart: false,
        moving: moving,
        groupCount: groups,
      );

  group('письменности', () {
    test('🔴 знаки и порядок те же, что в frontend/src/constants/scripts.ts', () {
      final f = File('../frontend/src/constants/scripts.ts');
      if (!f.existsSync()) {
        // Проба запускается из flutter/ внутри монорепо; без веб-половины сверять не с чем.
        markTestSkipped('нет ../frontend/src/constants/scripts.ts');
        return;
      }
      final web = RegExp(r"(\w+):\s*\{ labelKey: '(\w+)',\s*chars: '([^']+)'")
          .allMatches(f.readAsStringSync())
          .map((m) => (m.group(1)!, m.group(2)!, m.group(3)!))
          .toList();
      expect(web.length, 6, reason: 'в вебе шесть письменностей');
      expect([for (final s in schulteScripts) (s.id, s.labelKey, s.chars)], web);
    });

    test('сколько знаков в каждой и что годится для «букв» на 5×5', () {
      final len = {for (final s in schulteScripts) s.id: s.length};
      expect(len, {'latin': 26, 'cyrillic': 28, 'greek': 24, 'devanagari': 44, 'hiragana': 46, 'hanzi': 48});
      // Греческий короче 25 — для «букв» скрыт, как в вебе; «Горбову» хватает любого.
      expect([for (final s in schulteScripts) if (!s.fitsLetters(5)) s.id], ['greek']);
      expect(maxGridFor(ContentMode.mixed, schulteScriptById('greek').length), 6);
      expect(maxGridFor(ContentMode.letters, schulteScriptById('latin').length), 5);
      expect(maxGridFor(ContentMode.numbers, 0), 10);
    });

    test('неизвестный код письменности — латиница, как запасной путь веба', () {
      expect(schulteScriptById('нет такой').id, 'latin');
    });
  });

  group('разделённое внимание: группы одной таблицы', () {
    test('🔴 клеток поровну, остаток — первым группам; в каждой группе числа 1…размер по разу', () {
      const expected = {
        (5, 2): [13, 12],
        (5, 3): [9, 8, 8],
        (5, 4): [7, 6, 6, 6],
        (6, 3): [12, 12, 12],
        (7, 4): [13, 12, 12, 12],
      };
      for (final e in expected.entries) {
        final (size, groups) = e.key;
        final g = SchulteGame(
          level: 1,
          alphabet: 'ABC',
          override: params(size, ContentMode.numbers, groups: groups),
          rnd: Random(7),
        );
        expect(g.grouped, isTrue);
        expect(g.groupSizes, e.value, reason: '$size×$size, групп $groups');
        expect(g.items.length, size * size);
        expect(g.cellGroup.length, size * size);
        for (var gr = 0; gr < groups; gr += 1) {
          final values = [
            for (var i = 0; i < g.items.length; i += 1)
              if (g.cellGroup[i] == gr) g.items[i] as int
          ]..sort();
          expect(values, [for (var n = 1; n <= e.value[gr]; n += 1) n], reason: 'группа $gr');
        }
        expect(g.groupTargets, List.filled(groups, 1));
        expect(g.activeGroup, 0);
      }
    });

    test('🔴 ход идёт по кругу: 0→1→2→0, у каждой группы свой счётчик', () {
      final g = SchulteGame(
        level: 1,
        alphabet: 'ABC',
        override: params(5, ContentMode.numbers, groups: 3),
        rnd: Random(3),
      );
      final order = <int>[];
      for (var step = 0; step < 6; step += 1) {
        order.add(g.activeGroup);
        final cell = [
          for (var i = 0; i < g.items.length; i += 1)
            if (g.cellGroup[i] == g.activeGroup && g.items[i] == g.target) i
        ].single;
        expect(g.press(cell), PressResult.hit);
      }
      expect(order, [0, 1, 2, 0, 1, 2]);
      expect(g.groupTargets, [3, 3, 3], reason: 'каждая группа нашла по два, ищет третье');
    });

    test('🔴 чужая группа и чужое число — ошибка, поле и ход не меняются', () {
      final g = SchulteGame(
        level: 1,
        alphabet: 'ABC',
        override: params(5, ContentMode.numbers, groups: 2),
        rnd: Random(11),
      );
      // Число 1 есть в обеих группах: нажать «1» ЧУЖОЙ группы — ошибка, хотя число то же.
      final foreign = [
        for (var i = 0; i < g.items.length; i += 1)
          if (g.items[i] == 1 && g.cellGroup[i] != g.activeGroup) i
      ].single;
      expect(g.press(foreign), PressResult.miss);
      expect(g.errors, 1);
      // Своя группа, но не то число.
      final wrongValue = [
        for (var i = 0; i < g.items.length; i += 1)
          if (g.cellGroup[i] == g.activeGroup && g.items[i] != g.target) i
      ].first;
      expect(g.press(wrongValue), PressResult.miss);
      expect(g.errors, 2);
      expect(g.groupTargets, [1, 1]);
      expect(g.activeGroup, 0);
      expect(g.index, 0);
    });

    test('🔴 партия целиком: кончается на последней клетке, ошибок нет, остаток групп не мешает кругу', () {
      for (final groups in [2, 3, 4]) {
        for (final size in [5, 6, 7]) {
          final g = SchulteGame(
            level: 1,
            alphabet: 'ABC',
            override: params(size, ContentMode.numbers, groups: groups),
            rnd: Random(groups * 10 + size),
          );
          final presses = playPerfect(g);
          expect(g.done, isTrue, reason: '$size×$size, групп $groups');
          expect(presses, size * size);
          expect(g.errors, 0);
          // Группы разного размера: короткие кончаются раньше, ход к ним уже не приходит.
          expect([for (var i = 0; i < groups; i += 1) g.groupTargets[i] - 1], g.groupSizes);
        }
      }
    });

    test('последнее нажатие возвращает «закончено», а не «верно»', () {
      final g = SchulteGame(
        level: 1,
        alphabet: 'ABC',
        override: params(5, ContentMode.numbers, groups: 2),
        rnd: Random(1),
      );
      var last = PressResult.ignored;
      while (!g.done) {
        final cell = [
          for (var i = 0; i < g.items.length; i += 1)
            if (g.cellGroup[i] == g.activeGroup && g.items[i] == g.target) i
        ].single;
        last = g.press(cell);
      }
      expect(last, PressResult.finished);
      expect(g.press(0), PressResult.ignored, reason: 'после конца нажатия не считаются');
    });

    test('🔴 убегающая цель в группах: клетки меняются местами ВМЕСТЕ со своей группой', () {
      final g = SchulteGame(
        level: 1,
        alphabet: 'ABC',
        override: params(5, ContentMode.numbers, groups: 3, moving: true),
        rnd: Random(5),
      );
      Map<(int, int), int> pairs() {
        final m = <(int, int), int>{};
        for (var i = 0; i < g.items.length; i += 1) {
          m.update((g.items[i] as int, g.cellGroup[i]), (v) => v + 1, ifAbsent: () => 1);
        }
        return m;
      }

      final before = pairs();
      var moved = false;
      for (var step = 0; step < 10; step += 1) {
        final snapshot = List<SchulteCell>.from(g.items);
        final cell = [
          for (var i = 0; i < g.items.length; i += 1)
            if (g.cellGroup[i] == g.activeGroup && g.items[i] == g.target) i
        ].single;
        g.press(cell);
        // Пары «число — группа» те же: число не отстало от своей раскраски.
        expect(pairs(), before, reason: 'шаг $step');
        if (snapshot.toString() != g.items.toString()) moved = true;
      }
      expect(moved, isTrue, reason: 'после верных нажатий поле перемешивалось');
    });

    test('группы только у цифр: у букв и Горбова groupCount не включает режим', () {
      for (final mode in [ContentMode.letters, ContentMode.mixed]) {
        final g = SchulteGame(
          level: 1,
          alphabet: schulteScriptById('latin').chars,
          override: params(5, mode, groups: 3),
          rnd: Random(2),
        );
        expect(g.grouped, isFalse);
        expect(g.cellGroup, isEmpty);
      }
    });
  });

  group('каждая модификация даёт верную таблицу и проходится до конца', () {
    final latin = schulteScriptById('latin').chars;

    test('цифры: вперёд, назад, от центра; размеры 5…10', () {
      for (final dir in Direction.values) {
        for (final size in [5, 6, 8, 10]) {
          final g = SchulteGame(
            level: 1,
            alphabet: latin,
            override: params(size, ContentMode.numbers, dir: dir),
            rnd: Random(size),
          );
          expect(g.size, size);
          expect(g.items.length, size * size);
          final first = switch (dir) {
            Direction.forward => 1,
            Direction.backward => size * size,
            Direction.centerOut => (size * size + 1) ~/ 2,
          };
          expect(g.sequence.first, first, reason: '$dir $size×$size');
          playPerfect(g);
          expect(g.done, isTrue);
          expect(g.errors, 0);
        }
      }
    });

    test('цветная таблица и убегающая цель проходятся (правило то же, меняется только помеха)', () {
      for (final (color, moving) in [(true, false), (false, true), (true, true)]) {
        final g = SchulteGame(
          level: 1,
          alphabet: latin,
          override: params(5, ContentMode.numbers, color: color, moving: moving),
          rnd: Random(9),
        );
        playPerfect(g);
        expect(g.done, isTrue, reason: 'цвет $color, убегающая $moving');
        expect(g.errors, 0);
      }
    });

    test('🔴 буквы: каждая письменность, знаки из её алфавита по порядку, вперёд и назад', () {
      for (final sc in schulteScripts.where((s) => s.fitsLetters(5))) {
        final runes = sc.chars.runes.map(String.fromCharCode).toList();
        for (final dir in [Direction.forward, Direction.backward]) {
          final g = SchulteGame(
            level: 1,
            alphabet: sc.chars,
            override: params(5, ContentMode.letters, dir: dir),
            rnd: Random(4),
          );
          final want = runes.take(25).toList();
          expect(g.sequence, dir == Direction.forward ? want : want.reversed.toList(), reason: sc.id);
          expect(g.items.toSet(), want.toSet(), reason: '${sc.id}: на поле ровно эти 25 знаков');
          playPerfect(g);
          expect(g.done, isTrue, reason: sc.id);
          expect(g.errors, 0);
        }
      }
    });

    test('🔴 Шульте–Горбов: 1, А, 2, Б… на любой письменности, включая греческий на 6×6', () {
      for (final sc in schulteScripts) {
        final size = sc.id == 'greek' ? 6 : 7;
        final g = SchulteGame(
          level: 1,
          alphabet: sc.chars,
          lettersFirst: false,
          override: params(size, ContentMode.mixed),
          rnd: Random(6),
        );
        final runes = sc.chars.runes.map(String.fromCharCode).toList();
        expect(g.sequence.take(4).toList(), [1, runes[0], 2, runes[1]], reason: sc.id);
        expect(g.items.length, size * size);
        playPerfect(g);
        expect(g.done, isTrue, reason: sc.id);
        expect(g.errors, 0);
      }
    });
  });

  group('настройки «Свободно»: что нельзя собрать — не собирается', () {
    SchulteFreeConfig cfg() => SchulteFreeConfig(script: 'latin');

    test('Горбов: порядок всегда вперёд', () {
      final c = cfg()
        ..direction = Direction.backward
        ..content = ContentMode.mixed
        ..normalize(fallbackScript: 'latin');
      expect(c.direction, Direction.forward);
    });

    test('буквы и Горбов не знают групп и «от центра»', () {
      final c = cfg()
        ..groups = 4
        ..direction = Direction.centerOut
        ..content = ContentMode.letters
        ..normalize(fallbackScript: 'latin');
      expect((c.groups, c.direction), (1, Direction.forward));
    });

    test('группы без «от центра» и без цвета: цвет группы — её имя', () {
      final c = cfg()
        ..groups = 2
        ..direction = Direction.centerOut
        ..color = true
        ..normalize(fallbackScript: 'latin');
      expect((c.direction, c.color), (Direction.forward, false));
    });

    test('🔴 греческий для «букв» заменяется: сетка 5×5 из 24 знаков не набирается', () {
      final c = SchulteFreeConfig(script: 'greek')
        ..content = ContentMode.letters
        ..normalize(fallbackScript: 'cyrillic');
      expect(c.script, 'cyrillic');
      // А у Горбова греческий остаётся: ему нужна половина клеток.
      final m = SchulteFreeConfig(script: 'greek')
        ..content = ContentMode.mixed
        ..normalize(fallbackScript: 'cyrillic');
      expect(m.script, 'greek');
    });

    test('🔴 сторона не выше, чем держит алфавит: иначе партия не закончилась бы никогда', () {
      final cases = {
        (ContentMode.numbers, 'latin'): 10,
        (ContentMode.letters, 'latin'): 5,
        (ContentMode.letters, 'hanzi'): 6,
        (ContentMode.mixed, 'greek'): 6,
        (ContentMode.mixed, 'latin'): 7,
        (ContentMode.mixed, 'hanzi'): 9,
      };
      for (final e in cases.entries) {
        final c = SchulteFreeConfig(script: e.key.$2)
          ..content = e.key.$1
          ..size = 10
          ..normalize(fallbackScript: 'latin');
        expect(c.size, e.value, reason: '${e.key}');
        expect(c.maxSize, e.value);
        final g = SchulteGame(level: 1, alphabet: schulteScriptById(c.script).chars, override: c.toParams(), rnd: Random(1));
        playPerfect(g);
        expect(g.done, isTrue, reason: 'партия на пределе ${e.key} собирается');
      }
    });

    test('🔴 метка режима для статистики — те же строки, что пишет веб (schulte.tsx:550)', () {
      expect(cfg().sessionMode, 'numbers_forward_bw');
      expect((cfg()..direction = Direction.backward..color = true).sessionMode, 'numbers_backward_color');
      expect((cfg()..direction = Direction.centerOut..moving = true).sessionMode, 'numbers_center-out_bw_moving');
      expect((cfg()..content = ContentMode.letters).sessionMode, 'letters_forward_bw');
      expect((cfg()..content = ContentMode.mixed).sessionMode, 'mixed_forward_bw');
      expect((cfg()..groups = 3).sessionMode, 'divided_attention_3g');
      // Группы только у цифр: у букв счётчик групп метку не меняет.
      expect((cfg()..content = ContentMode.letters..groups = 3).sessionMode, 'letters_forward_bw');
    });

    test('параметры ступеней лестницы не изменились: ступени всегда с одной группой', () {
      for (var level = 1; level <= 60; level += 1) {
        expect(LevelParams.of(level).groupCount, 1, reason: 'L$level');
      }
      expect(schulteLevelsTop, 18, reason: 'длина лестницы та же');
    });
  });
}
