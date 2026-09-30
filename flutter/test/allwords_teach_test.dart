import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';

/// РАЗБОР «ВСЕ СЛОВА» — СЕМЬИ ПО НАЧАЛУ.
///
/// ⚠️ ЭТАЛОНА ЖИВОГО TS ЗДЕСЬ НЕТ, И ЭТО НЕ ПРОПУСК: в вебе у этого режима разбора
/// не было никогда, сверять не с чем. Поэтому проба держит не «совпало с источником»,
/// а СВОЙСТВА, без которых разбор врёт, — и гоняет их по НАСТОЯЩИМ раскладкам
/// лестницы трёх языков, а не по придуманному колесу.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Раскладки, которые человек реально видит первыми: уровни 1…60 лестницы.
  Future<List<({WordPack pack, List<String> letters, int level})>> deals(String loc) async {
    final bank = await WordBank.load(loc);
    return [
      for (var level = 1; level <= 60; level++)
        (pack: bank.packForLevel(level)!, letters: allWordsLetters(bank.packForLevel(level)!, level), level: level),
    ];
  }

  test('🔴 разбор проходит КАЖДУЮ цель ровно один раз и доводит колесо до конца', () async {
    var lessons = 0;
    for (final loc in ['ru', 'en', 'de']) {
      for (final d in await deals(loc)) {
        final steps = allWordsLesson(d.pack.words, d.letters);
        if (steps.isEmpty) continue;
        lessons++;
        final words = [for (final s in steps) if (s.word.isNotEmpty) s.word];
        expect(words.toSet().length, words.length, reason: '$loc L${d.level}: слово дважды');
        expect(words.toSet(), d.pack.words.toSet(),
            reason: '$loc L${d.level}: разбор обязан пройти ВСЕ цели, не больше и не меньше');
      }
    }
    expect(lessons, greaterThan(150), reason: 'разбор есть почти у каждой раскладки: $lessons из 180');
  });

  test('🔴 базы набора в разборе НЕТ — игра её не засчитывает', () async {
    // Ловушка, на которой разбор чуть не построился: база — самое длинное слово из
    // ВСЕХ букв, но `submitWord` её отклоняет. Разбор, показавший базу, учил бы
    // сдавать слово, за которое игра ставит «мимо».
    for (final loc in ['ru', 'en', 'de']) {
      for (final d in await deals(loc)) {
        final steps = allWordsLesson(d.pack.words, d.letters);
        for (final s in steps) {
          expect(s.word == d.pack.base, isFalse, reason: '$loc L${d.level}: в разборе база «${d.pack.base}»');
          if (s.word.isNotEmpty) {
            expect(submitWord(d.pack, s.word, const []), WordOutcome.target,
                reason: '$loc L${d.level}: «${s.word}» игра не засчитала бы');
          }
        }
      }
    }
  });

  test('🔴 плитки шага складывают слово шага — подсветка совпадает с объяснением', () async {
    for (final loc in ['ru', 'en', 'de']) {
      for (final d in await deals(loc)) {
        for (final s in allWordsLesson(d.pack.words, d.letters)) {
          expect([for (final i in s.place) d.letters[i]].join(), s.word,
              reason: '$loc L${d.level}: плитки ${s.place} не складывают «${s.word}»');
          expect(s.place.toSet().length, s.place.length,
              reason: '$loc L${d.level}: одна плитка дважды в одном слове');
        }
      }
    }
  });

  test('🔴 порядок — приём, а не случай: осмотр, семьи от большой к малой, одиночки в конце', () async {
    for (final loc in ['ru', 'en', 'de']) {
      for (final d in await deals(loc)) {
        final steps = allWordsLesson(d.pack.words, d.letters);
        if (steps.isEmpty) continue;
        expect(steps.first.technique, AllWordsTechnique.look);
        expect(steps.first.place, isEmpty, reason: 'осмотр не ставит плиток');
        var sawSingle = false;
        var lastSize = 1 << 30;
        for (final s in steps.skip(1)) {
          if (s.technique == AllWordsTechnique.single) sawSingle = true;
          if (s.technique == AllWordsTechnique.family) {
            expect(sawSingle, isFalse, reason: '$loc L${d.level}: семья после одиночки');
            expect(s.n, lessThanOrEqualTo(lastSize), reason: '$loc L${d.level}: семьи не от большой к малой');
            lastSize = s.n;
            expect(s.word.startsWith(s.prefix), isTrue);
          }
        }
        // Осмотр называет САМУЮ большую семью.
        final firstFamily = steps.firstWhere((s) => s.technique == AllWordsTechnique.family);
        expect(steps.first.prefix, firstFamily.prefix);
      }
    }
  });

  test('🔴 нет ни одной семьи — разбора нет, а не выдуманный приём', () {
    // Три слова с разными началами: семей нет, приёму не к чему приложиться.
    expect(allWordsLesson(const ['кот', 'рот', 'ток'], 'коротк'.split('')), isEmpty);
    // Одна семья — разбор есть.
    expect(allWordsLesson(const ['кот', 'кол', 'ток'], 'коклт'.split('')), isNotEmpty);
  });

  test('🔴 ключи объяснений объявлены и доехали в собранный словарь — все 12 языков', () {
    for (final t in AllWordsTechnique.values) {
      expect(teachAllWordsKeys, contains(teachAllWordsKey(t)));
    }
    const needs = {
      'teachAllWordsLook': ['{total}', '{n}', '{piece}'],
      'teachAllWordsFamily': ['{piece}', '{word}', '{n}'],
      'teachAllWordsSingle': ['{word}'],
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
