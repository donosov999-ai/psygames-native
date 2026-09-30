/// «CLOZE: ФРАЗЫ» — ПРАВИЛА ПАРТИИ, перенос `frontend/app/games/cloze.tsx`.
///
/// Фраза с пропуском → выбери слово, которое встаёт в пропуск. Ответ — слово
/// словаря в словарной форме, отвлекающие — слова той же категории на том же языке.
///
/// Сверка с живым TS: `flutter/test/fixtures/cloze-reference.json`, снятый
/// ИСПОЛНЕНИЕМ веб-функций `levelParams`, `clozeOrderPhrases`, `buildClozeRounds`.
library;

import '../languages/bilingual.dart';
import '../languages/fresh_pool.dart';

const double clozePassAccuracy = 0.8;

/// Ключ запаса невиданного — свой у каждого языка, как в вебе.
String clozeSeenPool(String lang) => 'cloze_phrases_$lang';

/// Лестница: раундов больше (6 → 16), лимит на фразу короче (14 с → 4,5 с).
({int rounds, int timeLimitMs}) clozeLevelParams(int level) => (
      rounds: level + 5 < 16 ? level + 5 : 16,
      timeLimitMs: 14000 - (level - 1) * 700 > 4500 ? 14000 - (level - 1) * 700 : 4500,
    );

class ClozePhrase {
  const ClozePhrase(this.text, this.answerEn);
  final String text;
  final String answerEn;
}

class ClozeRound {
  const ClozeRound({required this.text, required this.answer, required this.options, required this.lang});
  final String text;
  final String answer;
  final List<String> options;
  final String lang;
}

/// Порядок фраз ОДНОГО языка: невиданные, потом хвост вперемешку (фраза с
/// неизвестным ответом при сборке пропускается — без хвоста раундов не хватило бы).
({List<ClozePhrase> ordered, List<String> seen}) clozeOrderPhrases(
  List<ClozePhrase> all,
  List<String> seen,
  int rounds,
  double Function() rng,
) {
  final fresh = pickFreshWeb(all, rounds, seen, (f) => f.text, rng);
  final rest = [for (final f in all) if (!fresh.picked.contains(f)) f];
  for (var i = rest.length - 1; i > 0; i -= 1) {
    final j = (rng() * (i + 1)).floor();
    final t = rest[i];
    rest[i] = rest[j];
    rest[j] = t;
  }
  return (ordered: [...fresh.picked, ...rest], seen: fresh.seen);
}

/// Раунды — перенос `buildClozeRounds` ДО ЗНАКА, включая порядок обращений к
/// случайности: сперва добор отвлекающих, потом перетасовка четвёрки.
List<ClozeRound> buildClozeRounds({
  required Map<String, List<ClozePhrase>> byLang,
  required int rounds,
  required bool bilingual,
  required List<String> pair,
  required List<Map<String, String>> vocab,
  required double Function() rng,
}) {
  final tgt = pair[0];
  final phrases = <({ClozePhrase p, String lang})>[];
  if (bilingual) {
    final spread = spreadByRow(byLang, rounds * 2, pair);
    for (final x in spread.items) {
      phrases.add((p: x.item, lang: x.lang));
    }
  } else {
    for (final f in byLang[tgt] ?? const <ClozePhrase>[]) {
      phrases.add((p: f, lang: tgt));
    }
  }
  final out = <ClozeRound>[];
  for (final ph in phrases) {
    if (out.length >= rounds) break;
    final lang = ph.lang;
    Map<String, String>? entry;
    for (final w in vocab) {
      if (w['en'] == ph.p.answerEn) {
        entry = w;
        break;
      }
    }
    final answer = entry?[lang] ?? '';
    if (entry == null || answer.isEmpty) continue;
    final sameCat = [
      for (final w in vocab)
        if (w['cat'] == entry['cat'] && (w[lang] ?? '').isNotEmpty && w[lang] != answer) w[lang]!,
    ];
    final anyOther = [for (final w in vocab) if ((w[lang] ?? '').isNotEmpty && w[lang] != answer) w[lang]!];
    final distractors = <String>{};
    void pickFrom(List<String> arr) {
      var guard = 0;
      while (distractors.length < 3 && guard < 60 && arr.isNotEmpty) {
        guard += 1;
        distractors.add(arr[(rng() * arr.length).floor()]);
      }
    }

    pickFrom(sameCat);
    if (distractors.length < 3) pickFrom(anyOther);
    final options = [answer, ...distractors];
    for (var i = options.length - 1; i > 0; i -= 1) {
      final j = (rng() * (i + 1)).floor();
      final t = options[i];
      options[i] = options[j];
      options[j] = t;
    }
    out.add(ClozeRound(text: ph.p.text, answer: answer, options: options, lang: lang));
  }
  return out;
}
