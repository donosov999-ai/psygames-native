import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';

/// СВЕРКА РЕЖИМА «ВСЕ СЛОВА» С ЭТАЛОНАМИ ЖИВОГО TS.
///
/// Значения в `test/fixtures/allwords-reference.json` выгружены прогоном самих
/// функций `allWords.ts` (лестница уровней, раскладка букв по зерну, исходы сдачи,
/// подсказка) по десяти языкам. Dart обязан совпасть — включая ПОРЯДОК букв: от
/// него зависит, что увидит человек, и «такой же случайный» тут означал бы другое.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/allwords-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 лестница уровней даёт ту же раскладку — десять языков', () async {
    final packs = ref['пакеты'] as Map<String, dynamic>;
    for (final locale in WordBank.locales) {
      final bank = await WordBank.load(locale);
      final e = packs[locale] as Map<String, dynamic>;
      expect(bank.packCount, e['наборов'], reason: '$locale: наборов');

      for (final raw in e['уровни'] as List) {
        final u = raw as Map<String, dynamic>;
        final p = bank.packForLevel(u['level'] as int);
        final at = '$locale L${u['level']}';
        expect(p, isNotNull, reason: '$at раскладки нет');
        expect(p!.base, u['base'], reason: '$at база');
        expect(p.words.length, u['слов'], reason: '$at число целей');
        expect(p.words, (u['words'] as List).cast<String>(), reason: '$at состав целей');
      }
    }
  });

  test('🔴 буквы раскладываются тем же генератором — порядок в порядок', () async {
    final packs = ref['пакеты'] as Map<String, dynamic>;
    for (final locale in WordBank.locales) {
      final bank = await WordBank.load(locale);
      for (final raw in (packs[locale] as Map<String, dynamic>)['уровни'] as List) {
        final u = raw as Map<String, dynamic>;
        final p = bank.packForLevel(u['level'] as int)!;
        expect(allWordsLetters(p, 1), (u['буквы1'] as List).cast<String>(),
            reason: '$locale L${u['level']} зерно 1');
        expect(allWordsLetters(p, 42), (u['буквы42'] as List).cast<String>(),
            reason: '$locale L${u['level']} зерно 42');
      }
    }
  });

  test('🔴 исходы сдачи те же: цель, повтор, мимо, и база — НЕ очко', () async {
    final packs = ref['пакеты'] as Map<String, dynamic>;
    const asName = {   // имена латиницей: Dart не берёт не-ASCII в идентификаторах

      WordOutcome.target: 'цель',
      WordOutcome.repeat: 'повтор',
      WordOutcome.miss: 'мимо',
      WordOutcome.bonus: 'бонус',
    };
    for (final locale in WordBank.locales) {
      final bank = await WordBank.load(locale);
      final vocab = bank.vocabulary();
      for (final raw in (packs[locale] as Map<String, dynamic>)['уровни'] as List) {
        final u = raw as Map<String, dynamic>;
        final p = bank.packForLevel(u['level'] as int)!;
        final e = u['исходы'] as Map<String, dynamic>;
        final at = '$locale L${u['level']}';
        expect(asName[submitWord(p, p.words.first, const [], vocabulary: vocab)], e['цель'], reason: '$at цель');
        expect(asName[submitWord(p, p.words.first, [p.words.first], vocabulary: vocab)], e['повтор'], reason: '$at повтор');
        expect(asName[submitWord(p, 'zzzz', const [], vocabulary: vocab)], e['мимо'], reason: '$at мимо');
        expect(asName[submitWord(p, p.base, const [], vocabulary: vocab)], e['база'],
            reason: '$at база не должна давать очко');
      }
    }
  });

  test('🔴 подсказка берёт то же слово и открывает ту же букву', () async {
    final packs = ref['пакеты'] as Map<String, dynamic>;
    for (final locale in WordBank.locales) {
      final bank = await WordBank.load(locale);
      for (final raw in (packs[locale] as Map<String, dynamic>)['уровни'] as List) {
        final u = raw as Map<String, dynamic>;
        final p = bank.packForLevel(u['level'] as int)!;
        final e = u['подсказка'] as Map<String, dynamic>?;
        final got = allWordsHint(p, const []);
        if (e == null) {
          expect(got, isNull, reason: '$locale L${u['level']}');
        } else {
          expect(got!.word, e['слово'], reason: '$locale L${u['level']} слово подсказки');
          expect(got.opened, e['открыто'], reason: '$locale L${u['level']} открыто букв');
        }
      }
    }
  });

  test('🔴 подсказка не берёт слово, где открывать уже нечего', () async {
    final bank = await WordBank.load('ru');
    final p = bank.packForLevel(1)!;
    final byLen = [...p.words]..sort((a, b) => a.runes.length.compareTo(b.runes.length));
    final w = byLen.first;
    // Открыли у него всё, что можно (длина − 1) — подсказка обязана уйти к другому.
    final got = allWordsHint(p, const [], {w: w.runes.length - 1});
    expect(got, isNotNull);
    expect(got!.word, isNot(w), reason: 'иначе нажатие списывает подсказку и не делает НИЧЕГО');
  });

  test('🔴 плитки тратятся по одной — «оо» из одной «о» не складывается', () {
    final e = ref['плитки'] as Map<String, dynamic>;
    expect(madeOfTiles('кот', ['к', 'о', 'т', 'ы']), e['да']);
    expect(madeOfTiles('коты', ['к', 'о', 'т']), e['нет']);
    expect(madeOfTiles('оо', ['о']), e['дубль']);
  });

  test('🔴 «всё найдено» только когда закрыты ВСЕ цели', () async {
    final bank = await WordBank.load('ru');
    final p = bank.packForLevel(1)!;
    expect(allFound(p, const []), isFalse);
    expect(allFound(p, p.words.sublist(0, p.words.length - 1)), isFalse);
    expect(allFound(p, p.words), isTrue);
  });
}
