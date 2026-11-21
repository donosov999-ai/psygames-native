import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/json_asset.dart';
import 'package:psygames_flutter/games/languages/pronunciation.dart';
import 'package:psygames_flutter/games/languages/word_bank.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every expanded SRS word has English and Spanish IPA offline', () async {
    final bank = await loadWordBank();
    final ipa = await loadWordPronunciations();
    expect(bank.extension, hasLength(423));
    for (final row in bank.forLanguages({'en', 'es'})) {
      for (final lang in ['en', 'es']) {
        final word = row[lang]!;
        final value = wordIpaFor(ipa, lang, word);
        expect(value, isNotNull, reason: '$lang: $word');
        expect(
          value!.split(' · '),
          everyElement(matches(RegExp(r'^/[^/]+/$'))),
          reason: '$lang: $word',
        );
      }
    }
    expect(wordIpaFor(ipa, 'en', 'to read'), '/tə ˈɹid/');
    expect(wordIpaFor(ipa, 'es', 'Perro'), '/pero/');
  });

  test(
    'offline pronunciations cover both columns of the actual SRS vocabulary',
    () async {
      final vocab =
          await loadJsonAsset('assets/vocab/translation-vocab.json') as List;
      final ipa = jsonDecode(
        await rootBundle.loadString('assets/vocab/srs-ipa-en-es.json'),
      ) as Map;
      for (final lang in ['en', 'es']) {
        final words = {
          for (final row in vocab) (row[lang] as String).toLowerCase(),
        };
        final pronunciations = (ipa[lang] as Map).cast<String, String>();
        expect(words, hasLength(283));
        expect(pronunciations.keys, unorderedEquals(words));
        for (final text in pronunciations.values) {
          expect(
            text.split(' · '),
            everyElement(matches(RegExp(r'^/[^/]+/$'))),
          );
        }
      }
      expect(ipa['en']['to read'], '/tə ˈɹid/');
      expect(ipa['en']['to live'], '/tə ˈɫɪv/');
      expect(ipa['en']['to close'], '/tə ˈkɫoʊz/');
      expect(ipa['es']['perro'], '/pero/');
      expect(ipa['es']['por favor'], '/poɾ faˈβoɾ/');
    },
  );
}
