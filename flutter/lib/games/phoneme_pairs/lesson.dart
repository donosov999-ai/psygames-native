library;

import 'dart:math';

import '../../shell/lesson.dart';

/// 🎓 РАЗБОР «ФОНЕМНЫХ ПАР»: УЗНАТЬ, ГДЕ ПАРА РАСХОДИТСЯ, И СЛУШАТЬ ТОЛЬКО ЭТО МЕСТО.
///
/// Перенос веб-учителя (`frontend/src/games/phoneme-pairs/teach.ts`, задача d651a95c) вместе с ключами
/// текстов. Слова минимальной пары совпадают во всём, кроме одного звука, — слушать надо его. До
/// 30.09.2026 нативные «Фонемы» показывали вместо этого одну общую демо-карточку.
///
/// 🔴 МЕСТО РАСХОЖДЕНИЯ — ПО ДАННЫМ, НО НЕ ВЕЗДЕ ПО НАПИСАНИЮ (замер 30.09.2026 по всем 75 парам):
/// русский, испанский, португальский — по буквам (дом/том, pero/perro); китайский — по пиньиню
/// (山 shān / 三 sān → sh|s); английский и немецкий — написание обманывает (snack/snake расходятся в
/// «ck|ke», а различаются гласной), поэтому разбор говорит «гласный в середине» и букв не подсвечивает.
/// Сверка — эталон `flutter/test/fixtures/phoneme-pairs-lesson-reference.json` (прибор
/// `frontend/src/games/phoneme-pairs/tools/record-flutter-lesson.gen.ts`).
///
/// ⚠️ ПАРА ТЕКУЩЕГО ЗАДАНИЯ В РАЗБОР НЕ ПОПАДАЕТ: разбор открывается и посреди партии.

/// Отрезок [начало, конец) в знаках слова (кодовых точках, как `Array.from` веба).
typedef PhSpan = (int, int);
typedef PhDiff = ({PhSpan a, PhSpan b});

/// Карточка: вид, ключ словаря, подстановки, пара-пример, какое слово звучит, что произнести, где расхождение.
typedef PhCard = ({
  String kind,
  String key,
  Map<String, String> fields,
  (String, String)? pair,
  int? sounding,
  List<String> speak,
  PhDiff? diff,
});

/// Англичанам и немцам написание не помогает: все их пары различаются только гласным.
String phDiffKind(String lang) => lang == 'en' || lang == 'de' ? 'vowel' : (lang == 'zh' ? 'pinyin' : 'letters');

/// Где две строки расходятся: общее начало и общий конец отбрасываются. Если у одной стороны отличие
/// пустое (pero/perro, банка/банька), обе стороны расширяются на знак влево — иначе человеку показали
/// бы «ничего против r».
PhDiff phWhereDiffer(String a, String b) {
  final x = a.runes.toList();
  final y = b.runes.toList();
  var start = 0;
  while (start < x.length && start < y.length && x[start] == y[start]) {
    start += 1;
  }
  var tail = 0;
  while (tail < x.length - start && tail < y.length - start && x[x.length - 1 - tail] == y[y.length - 1 - tail]) {
    tail += 1;
  }
  var endA = x.length - tail;
  var endB = y.length - tail;
  if ((endA == start || endB == start) && start > 0) start -= 1;
  if (endA == start) endA += 1;
  if (endB == start) endB += 1;
  return (a: (start, endA), b: (start, endB));
}

/// Кусок слова по отрезку — с обрезкой по длине, как `slice` веба.
String phPiece(String word, PhSpan s) {
  final r = word.runes.toList();
  return String.fromCharCodes(r.sublist(min(s.$1, r.length), min(s.$2, r.length)));
}

({List<PhCard> cards, List<(String, String)> examples}) phLessonCards({
  required List<(String, String)> pool,
  required String lang,
  (String, String)? exclude,
  required Map<String, String> pinyin,
  required double Function() rnd,
}) {
  final kind = phDiffKind(lang);
  bool same((String, String) p) =>
      exclude != null && ((p.$1 == exclude.$1 && p.$2 == exclude.$2) || (p.$1 == exclude.$2 && p.$2 == exclude.$1));
  final fit = [for (final p in pool) if (!same(p)) p];
  for (var i = fit.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = fit[i];
    fit[i] = fit[j];
    fit[j] = t;
  }
  final examples = fit.take(2).toList();
  String py(String w) => pinyin[w] ?? w;
  String show(String w) => kind == 'pinyin' ? '$w ${py(w)}' : w;

  final cards = <PhCard>[
    (kind: 'intro', key: 'teachPhIntro', fields: const {}, pair: null, sounding: null, speak: const [], diff: null),
  ];
  for (final pair in examples) {
    final (a, b) = pair;
    final spot = kind == 'vowel' ? null : (kind == 'pinyin' ? phWhereDiffer(py(a), py(b)) : phWhereDiffer(a, b));
    final da = spot == null ? '' : phPiece(kind == 'pinyin' ? py(a) : a, spot.a);
    final db = spot == null ? '' : phPiece(kind == 'pinyin' ? py(b) : b, spot.b);
    final sounding = rnd() < 0.5 ? 0 : 1;
    final word = sounding == 0 ? a : b;
    cards
      ..add((
        kind: 'pair',
        key: spot != null ? 'teachPhSpot' : 'teachPhVowel',
        fields: spot != null ? {'a': show(a), 'b': show(b), 'da': da, 'db': db} : {'a': show(a), 'b': show(b)},
        pair: pair,
        sounding: null,
        speak: [a, b],
        diff: spot,
      ))
      ..add((kind: 'probe', key: 'teachPhProbe', fields: const {}, pair: pair, sounding: sounding, speak: [word], diff: spot))
      ..add((
        kind: 'answer',
        key: spot != null ? 'teachPhAnswerSpot' : 'teachPhAnswerVowel',
        fields: spot != null ? {'w': show(word), 'dx': sounding == 0 ? da : db} : {'w': show(word)},
        pair: pair,
        sounding: sounding,
        speak: [word],
        diff: spot,
      ));
  }
  cards.add((kind: 'done', key: 'teachPhDone', fields: const {}, pair: null, sounding: null, speak: const [], diff: null));
  return (cards: cards, examples: examples);
}

List<LessonStep> phLessonSteps(
  List<PhCard> cards,
  String Function(String key, Map<String, String> args) say,
) =>
    [for (final c in cards) LessonStep(text: say(c.key, c.fields), payload: c)];
