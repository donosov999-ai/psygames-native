library;

import '../../shell/lesson.dart';

/// 🎓 РАЗБОР «ЭХА ПСЕВДОСЛОВ»: СЛУШАТЬ ПО ЗВУКАМ И ОТБРАСЫВАТЬ ВАРИАНТ, ГДЕ МЕСТО НЕ СОВПАЛО.
///
/// Перенос веб-учителя (`frontend/src/games/pseudoword-echo/teach.ts`, задача d651a95c) вместе с
/// ключами текстов. Псевдослово не угадать по смыслу — его можно только удержать по звукам. Ловушки
/// игры отличаются от него ОДНИМ местом, и разбор называет, каким. До 30.09.2026 нативное «Эхо»
/// показывало вместо этого одну общую демо-карточку.
///
/// 🔴 ВИД ЛОВУШКИ ВОССТАНАВЛИВАЕТСЯ ИЗ ДАННЫХ, А НЕ ВЫДУМЫВАЕТСЯ. Генератор (`_mutateOnce` в
/// `model.dart`) меняет гласную на гласную, согласную на согласную или переставляет соседние буквы;
/// страховка (`_makeOptions`) удваивает букву. Какой случай перед нами — видно из сравнения варианта
/// со словом. Сверка — эталон `flutter/test/fixtures/pseudoword-echo-lesson-reference.json` (прибор
/// `frontend/src/games/pseudoword-echo/tools/record-flutter-lesson.gen.ts`): 120 раундов живого
/// генератора, все 360 ловушек распознаны.
///
/// ПРИМЕР — СВЕЖИЙ РАУНД ТЕМИ ЖЕ ПРАВИЛАМИ УРОВНЯ, а не раунд текущей партии: тот назвал бы ответ.

typedef EchoTrap = ({String variant, String kind, (int, int) at, String was, String now});

/// Карточка: вид, ключ словаря, подстановки, разбираемый вариант, отсеянные к ней, что произнести,
/// где подчеркнуть отличие.
typedef EchoCard = ({
  String kind,
  String key,
  Map<String, String> fields,
  String? variant,
  List<String> dropped,
  List<String> speak,
  (int, int)? at,
});

const _trapKey = {
  'vowel': 'teachEchoVowel',
  'consonant': 'teachEchoConsonant',
  'swap': 'teachEchoSwap',
  'double': 'teachEchoDouble',
};

/// Чем вариант отличается от слова. `null` — если ни один из четырёх видов генератора не подходит.
EchoTrap? echoTrap(String word, String variant, String vowels) {
  final w = [for (final r in word.runes) String.fromCharCode(r)];
  final v = [for (final r in variant.runes) String.fromCharCode(r)];
  if (w.length == v.length) {
    final diff = [for (var i = 0; i < w.length; i += 1) if (w[i] != v[i]) i];
    if (diff.length == 1) {
      final i = diff.first;
      final wasVowel = vowels.contains(w[i].toLowerCase());
      final nowVowel = vowels.contains(v[i].toLowerCase());
      if (wasVowel != nowVowel) return null; // генератор меняет только внутри класса
      return (variant: variant, kind: wasVowel ? 'vowel' : 'consonant', at: (i, i + 1), was: w[i], now: v[i]);
    }
    if (diff.length == 2 && diff[1] == diff[0] + 1) {
      final i = diff[0];
      if (v[i] == w[i + 1] && v[i + 1] == w[i]) {
        return (variant: variant, kind: 'swap', at: (i, i + 2), was: w[i] + w[i + 1], now: v[i] + v[i + 1]);
      }
    }
    return null;
  }
  if (v.length == w.length + 1) {
    for (var j = 1; j < v.length; j += 1) {
      if (v[j] == v[j - 1] && [...v.sublist(0, j), ...v.sublist(j + 1)].join() == word) {
        return (variant: variant, kind: 'double', at: (j - 1, j + 1), was: v[j - 1], now: v[j - 1] + v[j]);
      }
    }
  }
  return null;
}

({List<EchoCard> cards, List<EchoTrap> traps}) echoLessonCards({
  required String word,
  required List<String> options,
  required String vowels,
}) {
  final traps = [
    for (final o in options)
      if (o != word) echoTrap(word, o, vowels),
  ].whereType<EchoTrap>().toList();
  final cards = <EchoCard>[
    (kind: 'intro', key: 'teachEchoIntro', fields: const {}, variant: null, dropped: const [], speak: const [], at: null),
    (kind: 'listen', key: 'teachEchoListen', fields: const {}, variant: null, dropped: const [], speak: [word], at: null),
  ];
  final dropped = <String>[];
  for (final t in traps) {
    dropped.add(t.variant);
    cards.add((
      kind: 'drop',
      key: _trapKey[t.kind]!,
      fields: {'v': t.variant, 'a': t.was, 'b': t.now},
      variant: t.variant,
      dropped: [...dropped],
      speak: const [],
      at: t.at,
    ));
  }
  cards
    ..add((kind: 'answer', key: 'teachEchoPick', fields: {'w': word}, variant: word, dropped: [...dropped], speak: [word], at: null))
    ..add((kind: 'done', key: 'teachEchoDone', fields: const {}, variant: null, dropped: [...dropped], speak: const [], at: null));
  return (cards: cards, traps: traps);
}

/// Пример для разбора: свежий раунд, но не со словом текущей партии — тот назвал бы ответ. Как в вебе:
/// до шести попыток; не вышло — разбора нет (`null`), а не разбор с ответом.
({String word, List<String> options})? echoLessonExample(
  ({String word, List<String> options})? Function() make,
  String? current,
) {
  for (var i = 0; i < 6; i += 1) {
    final r = make();
    if (r != null && r.word != current) return r;
  }
  return null;
}

List<LessonStep> echoLessonSteps(
  List<EchoCard> cards,
  String Function(String key, Map<String, String> args) say,
) =>
    [for (final c in cards) LessonStep(text: say(c.key, c.fields), payload: c)];
