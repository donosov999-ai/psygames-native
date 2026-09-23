/// «ПАРЫ СЛОВ»: ЛЕСТНИЦА И ОТБОР МАТЕРИАЛА — СВЕРКА С ЖИВЫМ TS.
///
/// 🔴 ЧТО ЗДЕСЬ ВАЖНЕЕ ФОРМУЛ. Запас невиданного — единственное, что отделяет
/// игру на ЗАПОМИНАНИЕ пары от игры на узнавание старой: повтор материала
/// выглядит ростом результата, а не поломкой. Поэтому проверяется и порядок
/// выдачи, и сброс круга, когда запас кончился.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/word_pairs/model.dart';

void main() {
  late Map<String, dynamic> ref;
  late WordPairsContent content;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/word-pairs-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    content = WordPairsContent.fromJsonStrings(
      File('assets/word-pairs.json').readAsStringSync(),
      File('assets/vocab/translation-vocab.json').readAsStringSync(),
    );
  });

  test('🔴 лестница совпадает с вебом на всех пятнадцати уровнях', () {
    for (final row in ref['levels'] as List) {
      final m = row as Map<String, dynamic>;
      final p = wordPairsLevelParams(m['level'] as int);
      expect(p.pairCount, m['pairCount'], reason: 'пар, уровень ${m['level']}');
      expect(p.perPairMs, m['perPairMs'], reason: 'время на пару, уровень ${m['level']}');
      expect(wordPairsMaxErrors(p.pairCount), m['maxErrors'], reason: 'допуск ошибок, уровень ${m['level']}');
    }
  });

  test('🔴 сначала невиданное, а круг сбрасывается только когда запас кончился', () {
    final items = ['a', 'b', 'c', 'd', 'e'];
    final first = pickFreshFrom(items, 2, <String>[], (x) => x, Random(1));
    expect(first.wrapped, isFalse);
    expect(first.picked, hasLength(2));
    expect(first.seen, hasLength(2));

    final second = pickFreshFrom(items, 2, ['a', 'b'], (x) => x, Random(2));
    expect(second.picked.where((x) => ['a', 'b'].contains(x)), isEmpty,
        reason: 'виденное не выдаётся, пока есть невиданное');

    final third = pickFreshFrom(items, 3, ['a', 'b', 'c', 'd'], (x) => x, Random(3));
    expect(third.wrapped, isTrue, reason: 'запаса не хватило — круг сброшен');
    expect(third.picked, hasLength(3));
    expect(third.picked.toSet(), hasLength(3), reason: 'в одной раздаче повторов нет НИКОГДА');
    expect(third.seen, hasLength(3), reason: 'после сброса запас начинается заново');
  });

  test('материал берётся по языку, а пары не пересекаются словами', () {
    final built = WordPairsSession.build(
      content: content,
      locale: 'ru',
      targetLocale: 'en',
      mode: 'random',
      level: 3,
      seen: const [],
      random: Random(5),
    );
    final s = built.session;
    expect(s.pairs, hasLength(wordPairsLevelParams(3).pairCount));
    final all = [for (final p in s.pairs) p.left, for (final p in s.pairs) p.right];
    expect(all.toSet(), hasLength(all.length), reason: 'одно слово не может быть в двух парах');
    expect(built.seen.length, greaterThanOrEqualTo(all.length));
  });

  test('🔴 режим перевода берёт ГОТОВЫЙ словарь сборки, а не свою копию', () {
    final built = WordPairsSession.build(
      content: content,
      locale: 'ru',
      targetLocale: 'de',
      mode: 'translation',
      level: 2,
      seen: const [],
      random: Random(9),
    );
    expect(content.vocab.length, greaterThanOrEqualTo(283), reason: 'словарь уже в сборке ради «Словаря SRS»');
    for (final p in built.session.pairs) {
      expect(p.left, isNotEmpty);
      expect(p.right, isNotEmpty);
      expect(p.left, isNot(p.right), reason: 'перевод обязан отличаться от слова');
    }
  });

  test('партия: верная пара закрывается, промах считается, уровень берётся по допуску', () {
    final s = WordPairsSession.build(
      content: content,
      locale: 'en',
      targetLocale: 'ru',
      mode: 'random',
      level: 1,
      seen: const [],
      random: Random(11),
    ).session;
    s.startMatching();
    // Промах: левое из одной пары, правое из другой.
    s.tapLeft(0);
    s.tapRight(s.pairs[1].right);
    expect(s.errors, 1);
    expect(s.matched, isEmpty);
    for (final p in s.pairs) {
      s.tapLeft(p.id);
      s.tapRight(p.right);
    }
    expect(s.matched, hasLength(s.pairs.length));
    expect(s.phase, WordPairsPhase.result);
    expect(s.passed, wordPairsMaxErrors(s.pairs.length) >= 1);
    expect(s.score, s.pairs.length - 1);
  });

  test('закрытую пару повторно не трогаем', () {
    final s = WordPairsSession.build(
      content: content,
      locale: 'en',
      targetLocale: 'ru',
      mode: 'random',
      level: 1,
      seen: const [],
      random: Random(13),
    ).session;
    s.startMatching();
    s.tapLeft(0);
    s.tapRight(s.pairs[0].right);
    expect(s.matched, contains(0));
    s.tapLeft(0);
    expect(s.selectedLeft, isNull, reason: 'закрытая пара не выбирается заново');
  });
}
