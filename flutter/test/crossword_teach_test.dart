import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/crossword.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';

/// РАЗБОР КРОССВОРДА — САМОЕ ПЕРЕКРЁСТНОЕ, ПОТОМ САМОЕ ОТКРЫТОЕ.
///
/// ⚠️ Эталона живого TS нет: у веба разбора кроссворда не было. Проба держит
/// свойства и пересчитывает числа разбора НЕЗАВИСИМО, своим кодом. Сетки — те же,
/// что строит экран: тот же набор, те же слова уровня, то же зерно.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  List<int> cellsOf(Crossword cw, PlacedWord w) => [
        for (var i = 0; i < w.word.length; i++)
          (w.r + (w.d == crossHoriz ? 0 : i)) * cw.cols + (w.c + (w.d == crossHoriz ? i : 0)),
      ];

  for (final loc in ['ru', 'en', 'de']) {
    test('🔴 $loc: каждое слово сетки по разу, числа честные, сетка открывается целиком (уровни 1…60)',
        () async {
      final bank = await WordBank.load(loc);
      var steps0 = 0, withFoothold = 0, nextSteps = 0;
      for (var level = 1; level <= 60; level++) {
        final pack = bank.packForLevel(level)!;
        final cw = buildCrossword(crossWordsOfLevel(pack, level), level);
        final letters = allWordsLetters(pack, level);
        final steps = crosswordLesson(cw, letters);
        if (cw.outside.isNotEmpty) {
          expect(steps, isEmpty, reason: '$loc L$level: сетка неполная — разбора быть не должно');
          continue;
        }
        steps0++;
        expect(steps.first.technique, CrossTechnique.look);
        expect(steps.first.n, cw.words.length);

        final words = [for (final s in steps.skip(1)) s.word];
        expect(words.toSet(), {for (final w in cw.words) w.word}, reason: '$loc L$level: состав слов');
        expect(words.length, cw.words.length, reason: '$loc L$level: слово дважды');

        // Независимый счёт пересечений.
        final uses = <int, int>{};
        for (final w in cw.words) {
          for (final k in cellsOf(cw, w)) {
            uses[k] = (uses[k] ?? 0) + 1;
          }
        }
        int crossings(PlacedWord w) => cellsOf(cw, w).where((k) => uses[k]! > 1).length;
        final maxCross = cw.words.map(crossings).reduce((a, b) => a > b ? a : b);
        final first = steps[1];
        expect(first.technique, CrossTechnique.first);
        expect(first.n, maxCross, reason: '$loc L$level: первым не самое перекрёстное слово');

        // Независимый счёт открытых букв на каждом следующем шаге.
        final open = <int>{...cellsOf(cw, cw.words.firstWhere((w) => w.word == first.word))};
        final done = {first.word};
        for (final s in steps.skip(2)) {
          nextSteps++;
          final w = cw.words.firstWhere((x) => x.word == s.word);
          final opened = cellsOf(cw, w).where(open.contains).length;
          expect(s.n, opened, reason: '$loc L$level: «${s.word}» — неверный счёт открытых букв');
          final bestOpen = cw.words
              .where((x) => !done.contains(x.word))
              .map((x) => cellsOf(cw, x).where(open.contains).length)
              .reduce((a, b) => a > b ? a : b);
          expect(opened, bestOpen, reason: '$loc L$level: выбрано не самое открытое слово');
          if (opened > 0) withFoothold++;
          // Шаблон показывает ровно открытые буквы.
          expect(s.piece.split('').where((ch) => ch != '·').length, opened);
          open.addAll(cellsOf(cw, w));
          done.add(s.word);
        }

        // Плитки шага складывают слово шага.
        for (final s in steps.skip(1)) {
          expect([for (final i in s.place) letters[i].toUpperCase()].join(), s.word,
              reason: '$loc L$level: плитки не складывают «${s.word}»');
        }
        // Конец разбора — вся сетка открыта.
        final all = <int>{for (final w in cw.words) ...cellsOf(cw, w)};
        expect(crosswordRevealed(cw, words), all, reason: '$loc L$level: сетка открыта не целиком');
      }
      // ignore: avoid_print
      print('$loc: сеток с разбором $steps0 из 60; шагов «по открытым» $nextSteps, '
          'из них с опорой хотя бы в одну букву $withFoothold');
      expect(steps0, greaterThan(50));
    });
  }

  test('🔴 ключи объяснений объявлены и доехали в собранный словарь — все 12 языков', () {
    for (final t in CrossTechnique.values) {
      expect(teachCrossKeys, contains(teachCrossKey(t)));
    }
    const needs = {
      'teachCrossLook': ['{total}'],
      'teachCrossFirst': ['{word}', '{n}'],
      'teachCrossNext': ['{n}', '{total}', '{piece}', '{word}'],
    };
    for (final loc in ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
      final dict = jsonDecode(File('assets/l10n/$loc.json').readAsStringSync()) as Map<String, dynamic>;
      needs.forEach((key, marks) {
        final v = '${dict[key] ?? ''}';
        expect(v.trim(), isNotEmpty, reason: '$loc: нет строки $key');
        for (final m in marks) {
          expect(v.contains(m), isTrue, reason: '$loc: в $key потеряна подстановка $m');
        }
      });
    }
  });
}
