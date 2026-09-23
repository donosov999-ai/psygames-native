import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/crossword.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';

/// СВЕРКА КРОССВОРДА С ЭТАЛОНАМИ ЖИВОГО TS — СЕТКА КЛЕТКА В КЛЕТКУ.
///
/// 🔴 ЗДЕСЬ МАЛО СОВПАДЕНИЯ ПО ЧИСЛАМ. Сетка — это то, что человек видит, и от
/// укладчика зависит КАЖДАЯ клетка. Если Dart разложит слова иначе, игра
/// формально заработает, а партия, начатая в вебе, не продолжится нативно —
/// тот же уровень покажет другое поле. Поэтому сверяются координаты слов,
/// направления и буквы по клеткам: сорок раскладок, десять языков.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/crossword-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 лестница: слов и подсказок на уровне — те же числа на 60 ступенях', () {
    expect(crossWordsMin, ref['словМин']);
    expect(crossWordsMax, ref['словМакс']);
    expect(crossHintsMax, ref['подсказокМакс']);
    for (final raw in ref['уровни'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'L${e['level']}';
      expect(crossWordsAtLevel(e['level'] as int), e['слов'], reason: '$at слов в сетке');
      expect(crossHintsAtLevel(e['level'] as int), e['подсказок'], reason: '$at подсказок');
    }
  });

  test('🔴 слова уровня отбираются так же: длиннее вперёд, при равной длине по алфавиту', () async {
    for (final raw in ref['сетки'] as List) {
      final g = raw as Map<String, dynamic>;
      final bank = await WordBank.load(g['locale'] as String);
      final pack = bank.packForLevel(g['level'] as int)!;
      expect(crossWordsOfLevel(pack, g['level'] as int), (g['слова'] as List).cast<String>(),
          reason: '${g['locale']} L${g['level']}');
    }
  });

  test('🔴 сетка собирается ТА ЖЕ: размер, места слов, направления, буквы по клеткам', () async {
    for (final raw in ref['сетки'] as List) {
      final g = raw as Map<String, dynamic>;
      final at = '${g['locale']} L${g['level']}';
      final words = (g['слова'] as List).cast<String>();
      final cw = buildCrossword(words, g['level'] as int);

      expect(cw.rows, g['rows'], reason: '$at строк');
      expect(cw.cols, g['cols'], reason: '$at столбцов');
      expect(cw.outside, (g['вне'] as List).cast<String>(), reason: '$at не поместились');

      final placed = [
        for (final w in cw.words) {'w': w.word, 'r': w.r, 'c': w.c, 'd': w.d},
      ];
      expect(placed, (g['размещены'] as List).cast<Map<String, dynamic>>(),
          reason: '$at места слов');

      final cells = (cw.letters.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))
          .map((e) => [e.key, e.value])
          .toList();
      expect(cells, (g['буквы'] as List).map((e) => (e as List).toList()).toList(),
          reason: '$at буквы по клеткам');
    }
  });

  test('🔴 «есть в кроссворде» отвечает по размещённым словам, без учёта регистра', () async {
    final g = (ref['сетки'] as List).first as Map<String, dynamic>;
    final cw = buildCrossword((g['слова'] as List).cast<String>(), g['level'] as int);
    expect(crosswordHas(cw, cw.words.first.word), g['есть']);
    expect(crosswordHas(cw, cw.words.first.word.toLowerCase()), isTrue);
    expect(crosswordHas(cw, 'ЪЪЪЪ'), g['нет']);
  });

  test('🔴 подсказка берёт те же слова и в том же порядке — пять шагов подряд', () async {
    for (final raw in ref['подсказки'] as List) {
      final e = raw as Map<String, dynamic>;
      final bank = await WordBank.load(e['locale'] as String);
      final pack = bank.packForLevel(e['level'] as int)!;
      final cw = buildCrossword(crossWordsOfLevel(pack, e['level'] as int), e['level'] as int);
      final at = '${e['locale']} L${e['level']}';

      final opened = <String, int>{};
      final steps = e['шаги'] as List;
      for (var i = 0; i < steps.length; i++) {
        final want = steps[i] as Map<String, dynamic>?;
        final got = crosswordHint(cw, const [], opened);
        if (want == null) {
          expect(got, isNull, reason: '$at шаг ${i + 1}: подсказок больше нет');
          break;
        }
        expect(got, isNotNull, reason: '$at шаг ${i + 1}');
        expect(got!.word, want['слово'], reason: '$at шаг ${i + 1} слово');
        expect(got.opened, want['открыто'], reason: '$at шаг ${i + 1} открыто букв');
        opened[got.word] = got.opened;
      }

      expect(crosswordSolved(cw, const []), e['собранПусто'], reason: '$at собран пусто');
      expect(crosswordSolved(cw, [for (final w in cw.words) w.word]), e['собранВсе'],
          reason: '$at собран все');
    }
  });

  test('🔴 открытые клетки: найденное слово открыто целиком, подсказанное — по букве', () async {
    final bank = await WordBank.load('ru');
    final pack = bank.packForLevel(1)!;
    final cw = buildCrossword(crossWordsOfLevel(pack, 1), 1);
    expect(crosswordRevealed(cw, const []), isEmpty);

    final first = cw.words.first;
    final whole = crosswordRevealed(cw, [first.word]);
    expect(whole.length, first.word.length, reason: 'найденное слово открыто целиком');

    final partial = crosswordRevealed(cw, const [], {first.word: 2});
    expect(partial.length, 2, reason: 'подсказка открывает ровно столько букв, сколько взято');
  });

  test('🔴 у каждого слова, кроме первого, есть пересечение — иначе это не кроссворд', () async {
    for (final raw in (ref['сетки'] as List).take(8)) {
      final g = raw as Map<String, dynamic>;
      final cw = buildCrossword((g['слова'] as List).cast<String>(), g['level'] as int);
      final at = '${g['locale']} L${g['level']}';
      for (final w in cw.words.skip(1)) {
        var crossings = 0;
        for (var i = 0; i < w.word.length; i++) {
          final r = w.r + (w.d == crossVert ? i : 0);
          final c = w.c + (w.d == crossHoriz ? i : 0);
          // Клетка принадлежит и другому слову — значит пересечение.
          final shared = cw.words.any((o) =>
              o != w &&
              o.d != w.d &&
              (o.d == crossHoriz
                  ? o.r == r && c >= o.c && c < o.c + o.word.length
                  : o.c == c && r >= o.r && r < o.r + o.word.length));
          if (shared) crossings++;
        }
        expect(crossings, greaterThan(0), reason: '$at слово «${w.word}» висит отдельно');
      }
    }
  });
}
