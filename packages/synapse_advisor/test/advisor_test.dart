import 'package:synapse_advisor/synapse_advisor.dart';
import 'package:test/test.dart';

final schulte = GameInfo(id: 'schulte_table', name: 'Таблицы Шульте', category: 'attention');
final proof = GameInfo(id: 'proofreading', name: 'Корректура', category: 'attention');
final catalog = [schulte, proof];
DateTime at(int min) => DateTime(2026, 10, 7, 10).add(Duration(minutes: min));
SessionFact g(int min, {int? score, int? errors, int? level, int? levelBefore, Outcome o = Outcome.won, int? hints, String? diff}) =>
    SessionFact(gameId: 'schulte_table', outcome: o, at: at(min), score: score, errors: errors,
        level: level, levelBefore: levelBefore, hintsUsed: hints, difficulty: diff);

void main() {
  final ru = Advisor(locale: 'ru');

  test('lesson and unknown outcomes stay silent', () {
    final m = AdvisorMemory();
    expect(ru.react(g(0, o: Outcome.lesson), [], game: schulte, memory: m), isEmpty);
    expect(ru.react(g(0, o: Outcome.unknown), [], game: schulte, memory: m), isEmpty);
  });

  test('first game says first, not record', () {
    final lines = ru.react(g(0, score: 50), [], game: schulte, memory: AdvisorMemory());
    expect(lines.first.semanticId, startsWith('first:'));
    expect(lines.any((l) => l.semanticId.startsWith('record')), isFalse);
  });

  test('record only against comparable games and with real numbers', () {
    final hist = [g(0, score: 40), g(5, score: 45), g(6, score: 90, diff: 'hard')];
    final lines = ru.react(g(10, score: 47), hist, game: schulte, memory: AdvisorMemory());
    final rec = lines.firstWhere((l) => l.semanticId.startsWith('record'));
    expect(rec.text, contains('47'));
    expect(rec.text, contains('45')); // previous best among SAME difficulty, not 90
  });

  test('lower-is-better scores (time) beat by being smaller', () {
    SessionFact t(int m, int s) => SessionFact(gameId: 'schulte_table', outcome: Outcome.won, at: at(m), score: s, higherIsBetter: false);
    final lines = ru.react(t(10, 30), [t(0, 40), t(5, 35)], game: schulte, memory: AdvisorMemory());
    expect(lines.first.text, contains('30'));
    expect(lines.first.text, contains('35'));
  });

  test('no record claimed with fewer than two earlier games — only "better than last"', () {
    final lines = ru.react(g(10, score: 99), [g(0, score: 10)], game: schulte, memory: AdvisorMemory());
    expect(lines.any((l) => l.semanticId.startsWith('record')), isFalse);
    expect(lines.first.semanticId, startsWith('better'));
  });

  test('units go with numbers', () {
    SessionFact t(int m, int s) => SessionFact(gameId: 'schulte_table', outcome: Outcome.won, at: at(m), score: s, higherIsBetter: false, unit: 'с');
    final lines = ru.react(t(10, 30), [t(0, 40), t(5, 35)], game: schulte, memory: AdvisorMemory());
    expect(lines.first.text, contains('30 с'));
    expect(lines.first.text, contains('35 с'));
  });

  test('level up keeps the next step even when there is much to praise', () {
    final hist = [g(0, score: 1, errors: 1), g(1, score: 2, errors: 1)];
    final lines = ru.react(g(10, score: 9, errors: 0, level: 3, levelBefore: 2), hist, game: schulte, memory: AdvisorMemory());
    expect(lines.any((l) => l.kind == LineKind.nextStep), isTrue);
  });

  test('level up gives praise and next step', () {
    final lines = ru.react(g(10, level: 4, levelBefore: 3), [g(0)], game: schulte, memory: AdvisorMemory());
    expect(lines.map((l) => l.kind), containsAll([LineKind.praise, LineKind.nextStep]));
    expect(lines.firstWhere((l) => l.kind == LineKind.nextStep).text, contains('5'));
  });

  test('rough game: support with own best, no diagnosis words', () {
    final hist = [g(0, errors: 1), g(1, errors: 2), g(2, errors: 1), g(3, errors: 0)];
    final lines = ru.react(g(10, errors: 6), hist, game: schulte, memory: AdvisorMemory());
    final s = lines.firstWhere((l) => l.kind == LineKind.support);
    expect(s.text, contains('0'));
    for (final bad in ['устал', 'мозг', 'diagnos', 'tired']) {
      expect(s.text.toLowerCase(), isNot(contains(bad)));
    }
  });

  test('switch suggestion after a long run, to a game of the same skill', () {
    final hist = [for (var i = 0; i < 5; i++) g(i)];
    final lines = ru.react(g(10), hist, game: schulte, catalog: catalog, memory: AdvisorMemory());
    final sw = lines.firstWhere((l) => l.semanticId.startsWith('switch'));
    expect(sw.text, contains('Корректура'));
  });

  test('no repeats: the same news is not said twice, wording rotates', () {
    final m = AdvisorMemory();
    final hist = [g(0, errors: 2), g(1, errors: 1)];
    final a = ru.react(g(10, errors: 0), hist, game: schulte, memory: m);
    final b = ru.react(g(20, errors: 0), [...hist, g(10, errors: 0)], game: schulte, memory: m);
    expect(a.any((l) => l.semanticId.startsWith('clean')), isTrue);
    expect(b.any((l) => l.semanticId.startsWith('clean')), isFalse); // same day, same news
    final tipsA = a.where((l) => l.kind == LineKind.technique).map((l) => l.text);
    final tipsB = b.where((l) => l.kind == LineKind.technique).map((l) => l.text);
    expect(tipsB.toSet().intersection(tipsA.toSet()), isEmpty);
  });

  test('at most three lines and none with an unfilled slot', () {
    final hist = [for (var i = 0; i < 6; i++) g(i, score: i, errors: 1, hints: 1)];
    final lines = ru.react(g(10, score: 99, errors: 0, hints: 0, level: 3, levelBefore: 2), hist,
        game: schulte, catalog: catalog, memory: AdvisorMemory());
    expect(lines.length, lessThanOrEqualTo(3));
    expect(lines.every((l) => !l.text.contains('{')), isTrue);
  });

  test('every meaning has RU and EN, and uses only slots the code fills', () {
    final slot = RegExp(r'\{(\w+)\}');
    const filled = {
      'first': {'game'}, 'record': {'game', 'score', 'prev'}, 'better': {'game', 'score', 'prev'}, 'level': {'game', 'level'},
      'clean': {'game'}, 'nohints': {'game'}, 'rough': {'game', 'best'}, 'next_level': {'level'},
      'switch': {'game', 'other', 'count'},
    };
    defaultPhrases.forEach((meaning, byLocale) {
      expect(byLocale.keys.toSet(), containsAll(['ru', 'en']), reason: meaning);
      final allowed = filled[meaning] ?? <String>{};
      for (final v in [...byLocale['ru']!, ...byLocale['en']!]) {
        expect(allowed.containsAll(slot.allMatches(v).map((m) => m[1]!)), isTrue, reason: '$meaning: $v');
      }
    });
  });

  test('memory survives a round trip and a broken store', () {
    final m = AdvisorMemory();
    ru.react(g(0, score: 1), [], game: schulte, memory: m);
    final again = AdvisorMemory.fromJson(m.toJson());
    expect(ru.react(g(1, score: 1), [], game: schulte, memory: again, now: at(1)).any((l) => l.semanticId.startsWith('first')), isFalse);
    expect(AdvisorMemory.fromJson('{broken').toJson(), '[]');
  });

  test('RU: a game name always follows the word «игра/игре/игру», never declined itself', () {
    // brainkit 07.10: «попробуй «Корректура»» — название в кавычках не склоняется, падеж ломался
    for (final v in [for (final m in defaultPhrases.values) ...?m['ru']]) {
      for (final slot in ['{game}', '{other}']) {
        final i = v.indexOf('«$slot»');
        if (i < 0) continue;
        expect(v.substring(0, i).trimRight(), matches(RegExp(r'игр[аеуы]$')), reason: v);
      }
    }
  });

  test('all 12 PsyGames languages are present for every meaning', () {
    const langs = ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh'];
    defaultPhrases.forEach((meaning, byLocale) {
      expect(byLocale.keys.toSet(), containsAll(langs), reason: meaning);
    });
  });
}
