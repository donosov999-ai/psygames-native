import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';

/// СВЕРКА ПЕРЕНОСА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Значения в `test/fixtures/anagrams-reference.json` выгружены прогоном самих
/// TS-функций (`classicLevel` на L1…L60, `словаПоДлине` и `банкКлассики` по
/// десяти языкам и шести длинам), а не переписаны сюда руками. Проверять перенос
/// той формулой, которой переносил, нельзя — такая проба зелёная всегда.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/anagrams-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 лестница уровней совпадает с живым кодом на всех 60 ступенях', () {
    final levels = ref['levels'] as List? ?? ref['uroven'] as List? ?? ref['уровни'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final l = AnagramLevel.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(l.length, e['length'], reason: '$at длина слова');
      expect(l.trials, e['trials'], reason: '$at слов за партию');
      expect(l.wordSec, e['wordSec'], reason: '$at секунд на слово');
    }
  });

  test('🔴 пол времени и таблица длин — те же числа', () {
    expect(anagramFloorSec, ref['полСек']);
    expect(anagramLevelLengths, (ref['длиныУровней'] as List).cast<int>());
  });

  test('🔴 банк каждого языка совпадает по составу, а не только по размеру', () async {
    final banks = ref['банки'] as Map<String, dynamic>;
    expect(WordBank.locales.toSet(), (ref['локали'] as List).cast<String>().toSet());

    for (final locale in WordBank.locales) {
      final bank = await WordBank.load(locale);
      final expected = banks[locale] as Map<String, dynamic>;
      expect(bank.packCount, expected['пакетов'], reason: '$locale: число наборов');

      final byLen = expected['поДлине'] as Map<String, dynamic>;
      for (var n = 4; n <= 9; n++) {
        final e = byLen['$n'] as Map<String, dynamic>;
        final at = '$locale len=$n';
        expect(bank.wordsOfLength(n).length, e['словПоДлине'], reason: '$at слов по длине');

        final got = bank.classicBank(n);
        expect(got.length, e['банк'], reason: '$at размер банка (со спуском)');
        // Состав, а не только счёт: первые пять по алфавиту.
        final first = (got.toList()..sort()).take(5).toList();
        expect(first, (e['первые'] as List).cast<String>(), reason: '$at состав банка');
      }
    }
  });

  test('🔴 спуск по длине работает там, где данных нет: len=9 отдаёт восьмибуквенные', () async {
    final ru = await WordBank.load('ru');
    expect(ru.wordsOfLength(9), isEmpty, reason: 'девятибуквенных в наборах нет ни у кого');
    expect(ru.classicBank(9), isNotEmpty, reason: 'банк обязан спуститься, а не прийти пустым');
    expect(ru.classicBank(9).length, ru.wordsOfLength(8).length);
  });

  test('🔴 язык без своего набора получает английский, а не пустоту', () async {
    expect(WordBank.resolve('zh'), 'en');
    final zh = await WordBank.load('zh');
    expect(zh.locale, 'en');
    expect(zh.classicBank(5), isNotEmpty);
  });

  test('🔴 зачёт идёт по всему банку длины, а не по одному загаданному слову', () async {
    final bank = await WordBank.load('ru');
    final game = ClassicGame(bank: bank, level: AnagramLevel.of(1), rnd: Random(1));
    expect(game.acceptedCount, greaterThan(1),
        reason: 'из тех же букв складывается не только загаданное слово');
    final round = game.next();
    expect(game.accepts(round.target), isTrue);
    expect(game.accepts(round.target.toLowerCase()), isTrue, reason: 'регистр не должен решать');
    expect(game.accepts('ЯЯЯЯ'), isFalse);
  });

  test('🔴 буквы перемешаны и это те же буквы, что у цели', () async {
    final bank = await WordBank.load('ru');
    final game = ClassicGame(bank: bank, level: AnagramLevel.of(3), rnd: Random(7));
    for (var i = 0; i < 40; i++) {
      final r = game.next();
      expect(r.letters.length, r.target.runes.length, reason: 'букв столько же');
      expect(r.letters.join().split('')..sort(), r.target.split('')..sort(),
          reason: 'буквы те же, только порядок другой');
      if (r.target.runes.toSet().length > 1) {
        expect(r.letters.join(), isNot(r.target),
            reason: 'готовый ответ не лежит на поле: ${r.target}');
      }
    }
  });

  test('🔴 банк не выдаёт одно и то же слово, пока не исчерпан', () async {
    final bank = await WordBank.load('ru');
    final game = ClassicGame(bank: bank, level: AnagramLevel.of(1), rnd: Random(3));
    final seen = <String>{};
    for (var i = 0; i < 50; i++) {
      seen.add(game.next().target);
    }
    expect(seen.length, 50, reason: 'повтор до исчерпания банка — это дефект');
  });
}
