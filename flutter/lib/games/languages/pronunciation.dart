import 'json_asset.dart';

const wordPronunciationLanguages = {'en', 'es'};

typedef WordPronunciations = Map<String, Map<String, String>>;

/// Optional IPA for the shared translation vocabulary. It is never generated
/// from the spelling: if an entry is absent, callers leave IPA hidden.
Future<WordPronunciations> loadWordPronunciations() async {
  final result = {
    for (final lang in wordPronunciationLanguages) lang: <String, String>{},
  };
  Future<void> readTier(String path) async {
    try {
      final json = await loadJsonAsset(path) as Map;
      for (final lang in wordPronunciationLanguages) {
        result[lang]!.addAll((json[lang] as Map).cast<String, String>());
      }
    } catch (_) {
      // Pronunciation is optional; one asset must not hide a separate tier.
    }
  }

  await readTier('assets/vocab/srs-ipa-open-sources.json');
  await readTier('assets/vocab/srs-ipa-expansion-en-es.json');
  await readTier('assets/vocab/srs-ipa-en-es.json');
  return result;
}

String? wordIpaFor(
  WordPronunciations pronunciations,
  String lang,
  String word,
) => pronunciations[lang]?[word.trim().toLowerCase()];
