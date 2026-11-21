import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/word_bank.dart';
import 'package:psygames_flutter/games/vocab_srs/model.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'every new row covers all twelve languages and comes from the shared bank',
    () async {
      final bank = await loadWordBank();
      expect(bank.core, hasLength(283));
      expect(bank.extension, hasLength(644));
      for (final row in bank.extension) {
        expect(row.keys, unorderedEquals(wordBankLanguages));
        for (final lang in wordBankLanguages) {
          expect(row[lang]?.trim(), isNotEmpty, reason: '${row['en']}: $lang');
        }
      }
      final all = bank.forLanguages(wordBankLanguages);
      expect(all, hasLength(927));
      expect(
        all.map((row) => row['en']?.toLowerCase()).toSet(),
        hasLength(927),
      );
    },
  );

  test(
    'Luna batch corrections and exclusions are reflected in the live bank',
    () async {
      final bank = await loadWordBank();
      final all = {
        for (final row in bank.extension) row['en']!.toLowerCase(): row,
      };
      expect(all['cameos']?['ru'], 'камеи');
      expect(all['abdominal']?['de'], 'abdominal');
      expect(all['clothe']?['zh'], '给人穿衣');
      for (final word in [
        'brilliant',
        'bronzed',
        'appropriation',
        'assuring',
      ]) {
        expect(all.containsKey(word), isFalse, reason: word);
      }
      expect(bank.extension.take(2).map((row) => row['en']), [
        'ability',
        'abandon',
      ]);
    },
  );

  test(
    'no duplicate or partial imported rows are exposed, and no locale fallback',
    () {
      final full = {for (final lang in wordBankLanguages) lang: 'new-$lang'};
      final dup = {
        for (final lang in wordBankLanguages) lang: 'dup-$lang',
        'en': ' Eat ',
      };
      final bank = WordBank(
        core: [
          {'en': 'to eat', 'ru': 'есть', 'es': 'comer'},
          {'en': 'ship', 'ru': 'судно'},
        ],
        extension: [
          dup,
          {'en': 'bad', 'ru': 'плохой'},
          full,
          full,
        ],
      );
      expect(bank.extension, [full]);
      expect(bank.forLanguages({'en', 'ru', 'es'}).map((row) => row['en']), [
        'to eat',
        'new-en',
      ]);
      expect(bank.forLanguages({'en', 'ru'}).map((row) => row['en']), [
        'to eat',
        'ship',
        'new-en',
      ]);
    },
  );

  test(
    'SRS keeps existing progress and presents new words in early sessions',
    () async {
      final bank = await loadWordBank();
      final deck = MemoryDeckStore();
      VocabSrs engine(List<WordBankEntry> vocab) => VocabSrs(
        vocab: vocab,
        baseLang: 'ru',
        targetLang: 'en',
        store: deck,
        nowMs: () => 100000,
      );
      final base = engine(bank.core);
      await base.gradeCard('v:house', Grade.good);
      final oldState = await deck.read(base.deckKey);
      final extended = engine(
        bank.forLanguages({'ru', 'en'}, interleave: true),
      );
      final stats = await extended.getStats();
      expect(stats.totalWords, 927);
      expect(stats.learned, 1);
      expect(await deck.read(base.deckKey), oldState);
      final fresh = (await extended.buildQueue(5)).fresh;
      final originalIds = {for (final row in bank.core) 'v:${row['en']}'};
      expect(fresh.where((card) => !originalIds.contains(card.id)), hasLength(3));
      expect(fresh.every((card) => card.id != 'v:house'), isTrue);
    },
  );

  test('SRS mixes new initials while preserving original and bilingual order', () async {
    final bank = await loadWordBank();
    final mixed = bank.forLanguages({'ru', 'en', 'es'}, interleave: true);
    final original = bank.core.toSet();
    final fresh = mixed.where((row) => !original.contains(row)).take(20)
        .map((row) => row['en']!).toList();
    expect(fresh.map((word) => word[0].toLowerCase()).toSet().length, greaterThan(5));
    expect(fresh, isNot(equals([...fresh]..sort())));
    expect(mixed.where(original.contains), orderedEquals(bank.core));
    expect(
      bank.forLanguages({'ru', 'en'}, interleave: true),
      orderedEquals(mixed),
    );
  });

  test('the shared bank contains ordinary words and modern terms', () async {
    final bank = await loadWordBank();
    final rows = {for (final row in bank.extension) row['en']: row};
    expect(rows['toothbrush']?['es'], 'cepillo de dientes');
    expect(rows['chatbot']?['ru'], 'чат-бот');
    expect(rows['two-factor authentication']?['hi'], 'दो-कारक प्रमाणीकरण');
  });
}
