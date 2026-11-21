import '../languages/json_asset.dart';
import 'model.dart';

/// The original phrases are also used by Dictation. The extra bank belongs
/// only to native Cloze, so its expansion does not change the audio exercise.
Future<Map<String, List<ClozePhrase>>> loadClozeBank() async {
  final base = await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map;
  final extra =
      await loadJsonAsset('assets/vocab/cloze-phrases-expansion.json') as List;
  return {
    for (final entry in base.entries)
      entry.key as String: [
        for (final row in entry.value as List)
          ClozePhrase(
            (row as Map)['text'] as String,
            row['answerEn'] as String,
          ),
        if (entry.key == 'en' || entry.key == 'es')
          for (final row in extra)
            ClozePhrase(
              (row as Map)[entry.key] as String,
              row['answerEn'] as String,
            ),
      ],
  };
}
