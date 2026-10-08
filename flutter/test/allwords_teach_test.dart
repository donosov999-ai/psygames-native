import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';

/// РАЗБОР «ВСЕ СЛОВА» — СЕМЬИ ПО НАЧАЛУ, А КОГДА ОБЩИХ НАЧАЛ НЕТ — ПО ОКОНЧАНИЮ.
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
        final atEnd = steps.first.technique == AllWordsTechnique.lookEnd;
        expect(steps.first.technique, atEnd ? AllWordsTechnique.lookEnd : AllWordsTechnique.look);
        expect(steps.first.place, isEmpty, reason: 'осмотр не ставит плиток');
        final family = atEnd ? AllWordsTechnique.familyEnd : AllWordsTechnique.family;
        final single = atEnd ? AllWordsTechnique.singleEnd : AllWordsTechnique.single;
        if (atEnd) {
          // По окончанию — ТОЛЬКО когда общих начал нет ни у одной пары целей.
          final starts = [for (final w in d.pack.words) w.runes.take(2).toList().toString()];
          expect(starts.toSet().length, starts.length, reason: '$loc L${d.level}: семьи по началу были, а разбор по концу');
        }
        var sawSingle = false;
        var lastSize = 1 << 30;
        for (final s in steps.skip(1)) {
          expect(s.technique == family || s.technique == single, isTrue,
              reason: '$loc L${d.level}: в одном разборе смешаны начало и конец');
          if (s.technique == single) sawSingle = true;
          if (s.technique == family) {
            expect(sawSingle, isFalse, reason: '$loc L${d.level}: семья после одиночки');
            expect(s.n, lessThanOrEqualTo(lastSize), reason: '$loc L${d.level}: семьи не от большой к малой');
            lastSize = s.n;
            expect(atEnd ? s.word.endsWith(s.prefix) : s.word.startsWith(s.prefix), isTrue);
          }
        }
        // Осмотр называет САМУЮ большую семью.
        final firstFamily = steps.firstWhere((s) => s.technique == family);
        expect(steps.first.prefix, firstFamily.prefix);
      }
    }
  });

  test('🔴 семей нет ни по началу, ни по концу — разбора нет, а не выдуманный приём', () {
    expect(allWordsLesson(const ['кот', 'лес', 'дуб'], 'котлесдуб'.split('')), isEmpty);
    // Есть семья по началу — разбор по началу, даже если общий конец тоже есть.
    expect(allWordsLesson(const ['кот', 'кол', 'ток'], 'коклт'.split('')).first.technique, AllWordsTechnique.look);
    // Начала у всех разные, а «кот» и «рот» кончаются одинаково — разбор по окончанию.
    final end = allWordsLesson(const ['кот', 'рот', 'ток'], 'коротк'.split(''));
    expect([for (final s in end) s.technique], [
      AllWordsTechnique.lookEnd,
      AllWordsTechnique.familyEnd,
      AllWordsTechnique.familyEnd,
      AllWordsTechnique.singleEnd,
    ]);
    expect(end.first.prefix, 'от');
    expect([for (final s in end.skip(1)) s.word], ['кот', 'рот', 'ток']);
  });

  test('🔴 на ступенях 1–3, где разбор предлагается, его нет только у es L3 — все 10 языков', () async {
    // Замер 07.10.2026: по одним началам разбора не было у 6 ступеней из 30 —
    // en L1, de L1, de L2, es L1, es L3, it L1. Английская первая ступень — вход
    // основного языка. Экран показывает кнопку, когда шагов больше одного.
    final gaps = <String>[];
    for (final loc in WordBank.locales) {
      final bank = await WordBank.load(loc);
      for (var level = 1; level <= 3; level++) {
        final p = bank.packForLevel(level)!;
        if (allWordsLesson(p.words, allWordsLetters(p, level)).length <= 1) gaps.add('$loc L$level');
      }
    }
    expect(gaps, ['es L3'],
        reason: 'изменился охват разбора на ступенях 1–3; стало лучше — сократи список, хуже — разберись');
  });

  test('🔴 ключи объяснений объявлены и доехали в собранный словарь — все 12 языков', () {
    for (final t in AllWordsTechnique.values) {
      expect(teachAllWordsKeys, contains(teachAllWordsKey(t)));
    }
    const needs = {
      'teachAllWordsLook': ['{total}', '{n}', '{piece}'],
      'teachAllWordsFamily': ['{piece}', '{word}', '{n}'],
      'teachAllWordsSingle': ['{word}'],
      'teachAllWordsLookEnd': ['{total}', '{n}', '{piece}'],
      'teachAllWordsFamilyEnd': ['{piece}', '{word}', '{n}'],
      'teachAllWordsSingleEnd': ['{word}'],
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
