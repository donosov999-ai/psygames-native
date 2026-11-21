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
      expect(bank.extension, hasLength(423));
      for (final row in bank.extension) {
        expect(row.keys, unorderedEquals(wordBankLanguages));
        for (final lang in wordBankLanguages) {
          expect(row[lang]?.trim(), isNotEmpty, reason: '${row['en']}: $lang');
        }
      }
      final all = bank.forLanguages(wordBankLanguages);
      expect(all, hasLength(706));
      expect(
        all.map((row) => row['en']?.toLowerCase()).toSet(),
        hasLength(706),
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
      expect(stats.totalWords, 706);
      expect(stats.learned, 1);
      expect(await deck.read(base.deckKey), oldState);
      final fresh = (await extended.buildQueue(5)).fresh;
      expect(fresh.first.id, 'v:ability');
      expect(fresh.map((card) => card.id), contains('v:abandon'));
      expect(fresh.every((card) => card.id != 'v:house'), isTrue);
    },
  );
}
