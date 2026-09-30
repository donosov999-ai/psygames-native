library;

import '../../shell/lesson.dart';

/// 🎓 РАЗБОР «ДИКТАНТА»: ДИКТОВАТЬ СЕБЕ КУСКАМИ.
///
/// Перенос веб-учителя (`frontend/src/games/dictation/teach.ts`, задача d651a95c) вместе с ключами
/// текстов. Фраза целиком в голове не держится: её слушают целиком, режут на куски по два-три слова
/// и набирают кусок за куском, проговаривая про себя. До 30.09.2026 нативный «Диктант» показывал
/// вместо этого одну общую демо-карточку.
///
/// 🔴 КУСКИ СКЛАДЫВАЮТСЯ РОВНО В ТУ ФРАЗУ, КОТОРУЮ ИГРА ПРИМЕТ: склейка (через пробел, у китайского —
/// без него) равна тексту фразы знак в знак. Сверка — эталон
/// `flutter/test/fixtures/dictation-lesson-reference.json` по всем фразам банка на всех языках.
///
/// ⚠️ КИТАЙСКИЙ РЕЖЕТСЯ ТОЛЬКО ПО ЗНАКАМ ПРЕПИНАНИЯ — кусок = клауза: нарезка по четыре знака рвала
/// «喝水», словарь приложения рвал «经常». Клаузы короткие — диктуют целиком.
///
/// ФРАЗА — ИЗ ПУЛА УРОВНЯ, НО НЕ ТЕКУЩАЯ: разбор открывается посреди партии.
const dictationWordsInChunk = 3;

final _punctuation = RegExp(r'[，。！？、；：,.!?]');

List<String> dictationChunks(String text, String lang) {
  if (lang == 'zh') {
    final out = <String>[];
    var cur = '';
    for (final ch in text.runes.map(String.fromCharCode)) {
      cur += ch;
      if (_punctuation.hasMatch(ch)) {
        out.add(cur);
        cur = '';
      }
    }
    if (cur.isNotEmpty) out.add(cur);
    return out;
  }
  final words = text.split(' ').where((w) => w.isNotEmpty).toList();
  return [
    for (var i = 0; i < words.length; i += dictationWordsInChunk)
      words.sublist(i, i + dictationWordsInChunk > words.length ? words.length : i + dictationWordsInChunk).join(' '),
  ];
}

String dictationJoin(List<String> chunks, String lang) => chunks.join(lang == 'zh' ? '' : ' ');

/// Карточка: вид, ключ, подстановки, сколько кусков набрано, какой кусок сейчас, что произнести.
typedef DictCard = ({String kind, String key, Map<String, String> fields, int typed, int? chunk, List<String> speak});

({String phrase, List<String> chunks, List<DictCard> cards})? dictationLessonCards({
  required List<String> pool,
  required String lang,
  String? exclude,
  required double Function() rnd,
}) {
  final fit = [for (final p in pool) if (p != exclude) p];
  if (fit.isEmpty) return null;
  final phrase = fit[(rnd() * fit.length).floor()];
  final chunks = dictationChunks(phrase, lang);
  final cards = <DictCard>[
    (kind: 'intro', key: 'teachDictIntro', fields: const {}, typed: 0, chunk: null, speak: const []),
    (kind: 'listen', key: 'teachDictListen', fields: const {}, typed: 0, chunk: null, speak: [phrase]),
    for (var i = 0; i < chunks.length; i += 1)
      (kind: 'chunk', key: 'teachDictChunk', fields: {'i': '${i + 1}', 'c': chunks[i]}, typed: i, chunk: i, speak: [chunks[i]]),
    (kind: 'stuck', key: 'teachDictStuck', fields: const {}, typed: chunks.length, chunk: null, speak: const []),
    (kind: 'done', key: 'teachDictDone', fields: const {}, typed: chunks.length, chunk: null, speak: const []),
  ];
  return (phrase: phrase, chunks: chunks, cards: cards);
}

List<LessonStep> dictationLessonSteps(
  List<DictCard> cards,
  String Function(String key, Map<String, String> args) say,
) =>
    [for (final c in cards) LessonStep(text: say(c.key, c.fields), payload: c)];
