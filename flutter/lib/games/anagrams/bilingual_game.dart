import 'dart:math';

import '../languages/json_asset.dart';

typedef BilingualStep = ({String lang, String word});

class BilingualGame {
  BilingualGame._(this.steps);

  final List<BilingualStep> steps;

  static Future<BilingualGame> create({
    required String nativeLang,
    required String firstLang,
    required String secondLang,
    required int triples,
    required Random rnd,
  }) async {
    final raw = await loadJsonAsset('assets/vocab/translation-vocab.json') as List;
    final records = [for (final e in raw) (e as Map).cast<String, Object?>()];
    records.shuffle(rnd);
    final languages = [nativeLang, firstLang, secondLang];
    final steps = <BilingualStep>[];
    for (final record in records) {
      if (steps.length >= triples * 3) break;
      if (languages.toSet().length != 3) break;
      final words = [for (final lang in languages) '${record[lang] ?? ''}'];
      final valid = words.every((word) {
        final length = word.runes.length;
        return length >= 3 && length <= 12;
      });
      if (!valid) continue;
      for (var i = 0; i < 3; i++) {
        steps.add((lang: languages[i], word: words[i]));
      }
    }
    return BilingualGame._(steps);
  }
}
