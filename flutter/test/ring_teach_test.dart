import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/ring.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';

/// РАЗБОР «СЛОВО-КВАДРАТ» — РЕДКОЕ НАЧАЛО, ПОТОМ УГЛЫ.
///
/// ⚠️ Эталона живого TS нет: в вебе у квадрата разбора не было. Проба держит
/// СВОЙСТВА и пересчитывает каждое число разбора НЕЗАВИСИМО — своим кодом, не
/// функциями `teach.dart`: сверять разбор его же формулой значило бы получить
/// зелёный цвет всегда.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const sides = ['t', 'r', 'b', 'l'];
  String wordOf(Ring r, String s) => {'t': r.top, 'r': r.right, 'b': r.bottom, 'l': r.left}[s]!;

  /// Независимый счёт кандидатов: уникальные пятибуквенные слова словаря из банка.
  List<String> candidatesOf(Ring r, List<String> dictionary) {
    bool fits(String w) {
      final need = <String, int>{};
      for (final ch in r.bank) {
        need[ch] = (need[ch] ?? 0) + 1;
      }
      for (final ch in w.split('')) {
        final left = (need[ch] ?? 0) - 1;
        if (left < 0) return false;
        need[ch] = left;
      }
      return true;
    }

    return {...dictionary}.where((w) => w.length == 5 && fits(w)).toList();
  }

  for (final loc in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ko']) {
    test('🔴 $loc: четыре стороны ровно по разу, числа пересчитываются независимо (уровни 1…60)',
        () async {
      final packs = await RingPacks.load(loc);
      for (var level = 1; level <= 60; level++) {
        final ring = packs.ringForLevel(level);
        final steps = ringLesson(ring, packs.dictionary);
        expect(steps.length, 5, reason: '$loc L$level: осмотр + четыре стороны');
        final cand = candidatesOf(ring, packs.dictionary);

        // Осмотр: всего кандидатов — по УНИКАЛЬНЫМ словам.
        expect(steps.first.technique, RingTechnique.look);
        expect(steps.first.total, cand.length, reason: '$loc L$level: счёт кандидатов');

        // Каждая сторона — ровно один раз, и слово — слово ЭТОЙ стороны.
        final bySide = {for (final s in steps.skip(1)) s.side: s.word};
        expect(bySide.keys.toSet(), sides.toSet(), reason: '$loc L$level: стороны');
        for (final s in sides) {
          expect(bySide[s], wordOf(ring, s), reason: '$loc L$level: сторона $s');
        }

        // Первый шаг — самая редкая начальная буква среди истинных слов.
        final first = steps[1];
        expect(first.technique, RingTechnique.first);
        int starts(String letter) => cand.where((w) => w[0] == letter).length;
        final minStart = sides.map((s) => starts(wordOf(ring, s)[0])).reduce((a, b) => a < b ? a : b);
        expect(first.n, minStart, reason: '$loc L$level: первый шаг не на самую редкую букву');
        expect(first.n, starts(first.word[0]));

        // Угловые шаги: хотя бы один угол известен, и число — честный счёт под шаблон.
        for (final s in steps.skip(2)) {
          expect(s.technique, RingTechnique.corner);
          final a = s.piece[0], b = s.piece[s.piece.length - 1];
          expect(a != '·' || b != '·', isTrue, reason: '$loc L$level: угловой шаг без угла');
          final fit = cand.where((w) => (a == '·' || w[0] == a) && (b == '·' || w[4] == b)).length;
          expect(s.n, fit, reason: '$loc L$level: сторона ${s.side} — неверный счёт под шаблон ${s.piece}');
          expect(s.n, greaterThanOrEqualTo(1));
        }
      }
    });
  }

  test('🔴 ключи объяснений объявлены и доехали в собранный словарь — все 12 языков', () {
    for (final t in RingTechnique.values) {
      expect(teachRingKeys, contains(teachRingKey(t)));
    }
    const needs = {
      'teachRingLook': ['{total}'],
      'teachRingFirst': ['{piece}', '{n}', '{word}'],
      'teachRingCorner': ['{piece}', '{n}', '{word}'],
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
