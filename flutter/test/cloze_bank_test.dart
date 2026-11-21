import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cloze/bank.dart';
import 'package:psygames_flutter/games/cloze/model.dart';
import 'package:psygames_flutter/games/languages/json_asset.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'native Cloze triples EN and ES without editing the shared bank',
    () async {
      final base =
          await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map;
      final bank = await loadClozeBank();
      expect(
        bank.keys,
        unorderedEquals(['en', 'ru', 'es', 'pt', 'de', 'zh', 'hi']),
      );
      for (final lang in bank.keys) {
        final shared = base[lang] as List;
        final rows = bank[lang]!;
        expect(shared, hasLength(60), reason: 'shared Dictation tier, $lang');
        expect(rows, hasLength(lang == 'en' || lang == 'es' ? 180 : 60));
        expect(
          rows.take(60).map((row) => (row.text, row.answerEn)),
          shared.map((row) => (row['text'], row['answerEn'])),
          reason: 'old phrases and seen keys must be unchanged, $lang',
        );
        expect(
          rows.map((row) => row.text.toLowerCase().trim()).toSet(),
          hasLength(rows.length),
        );
        expect(rows.map((row) => row.answerEn).toSet(), hasLength(rows.length));
      }
    },
  );

  for (final lang in ['en', 'es']) {
    test('$lang: all 180 prompts resolve to real answers with IPA', () async {
      final rows = (await loadClozeBank())[lang]!;
      final vocab = [
        for (final row in await loadJsonAsset(
          'assets/vocab/translation-vocab.json',
        ) as List)
          Map<String, String>.from(row as Map),
      ];
      final ipa =
          (await loadJsonAsset('assets/vocab/srs-ipa-en-es.json') as Map)[lang]
              as Map;
      final rng = Random(674);
      final rounds = buildClozeRounds(
        byLang: {lang: rows},
        rounds: rows.length,
        bilingual: false,
        pair: [lang],
        vocab: vocab,
        rng: rng.nextDouble,
      );
      expect(rounds, hasLength(180));
      for (final round in rounds) {
        expect('___'.allMatches(round.text), hasLength(1), reason: round.text);
        expect(
          ipa[round.answer.toLowerCase().trim()],
          isNotEmpty,
          reason: round.answer,
        );
        expect(round.options.toSet(), hasLength(4), reason: round.text);
        expect(round.options, contains(round.answer));
      }
    });
  }
}
