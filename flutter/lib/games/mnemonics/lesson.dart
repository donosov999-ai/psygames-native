library;

import '../../shell/lesson.dart';
import 'model.dart';

/// 🎓 РАЗБОР «МНЕМОНИКИ»: ДВА ПРИЁМА НА ДВА РЕЖИМА.
///
/// Перенос веб-учителя (`frontend/src/games/mnemonics/teach.ts`) вместе с ключами текстов:
/// второй набор объяснений означал бы, что веб и приложение учат разному. Сверка — эталоном
/// (`flutter/test/fixtures/mnemonics-reference.json`, раздел `lessons`).
///
/// · СЛОВА — цепочка: каждое следующее слово ДЕЙСТВУЕТ с предыдущим в одной сцене.
/// · ЧИСЛА — буквенно-цифровой код: число превращается в СЛОВО по согласным (82 → вино), и
///   дальше цепочка строится из этих слов. Опора берётся из той же таблицы, что показывает
///   экран запоминания, — разойдись разбор с ней, человек выучил бы приём, который игра не
///   подтверждает.
///
/// ⚠️ ПОКАЗЫВАЕМ НЕ БОЛЬШЕ ЧЕТЫРЁХ ЭЛЕМЕНТОВ: приём виден на четырёх, дальше человек применяет
/// его сам. Вступление чисел обещает ровно столько, сколько разбор покажет (правка PR #11).
const mnemoShown = 4;

/// Карточка разбора: вид (intro / peg / chain / order / done — латиницей: кириллица только в
/// видимом тексте), ключ текста, подстановки и какой элемент ряда подсветить.
typedef MnemoCard = ({String kind, String key, Map<String, String> fields, int? item});

List<MnemoCard> mnemonicsLessonCards({
  required List<String> items,
  required String mode,
  required String locale,
  required MnemonicsContent content,
}) {
  final taken = items.take(mnemoShown).toList();
  final table = mode == 'numbers' ? content.pegsFor(locale) : null;
  final pegs = table != null;
  String pegWord(String item) {
    final n = int.tryParse(item);
    return table != null && n != null && n >= 0 && n <= 99 ? table.words[n] : item;
  }

  final cards = <MnemoCard>[
    (
      kind: 'intro',
      key: mode == 'numbers'
          ? (pegs ? 'teachMnemoIntroNumbers' : 'teachMnemoIntroNumbersNoPegs')
          : 'teachMnemoIntroWords',
      fields: {'n': '${pegs ? taken.length : items.length}'},
      item: null,
    ),
  ];
  for (var i = 0; i < taken.length; i += 1) {
    final item = taken[i];
    if (pegs) {
      final n = int.tryParse(item);
      final why = n != null && n >= 0 && n <= 99 ? table.why(n) : '';
      final word = pegWord(item);
      cards.add((
        kind: 'peg',
        key: i == 0 ? 'teachMnemoPegFirst' : 'teachMnemoPeg',
        fields: {'n': item, 'word': word, 'why': why},
        item: i,
      ));
      if (i > 0) {
        cards.add((kind: 'chain', key: 'teachMnemoChain', fields: {'a': pegWord(taken[i - 1]), 'b': word}, item: i));
      }
      continue;
    }
    cards.add((
      kind: i == 0 ? 'peg' : 'chain',
      key: i == 0 ? 'teachMnemoWordFirst' : 'teachMnemoChainWords',
      fields: {'a': i == 0 ? item : taken[i - 1], 'b': item},
      item: i,
    ));
  }
  cards.add((kind: 'order', key: 'teachMnemoOrder', fields: {'n': '${items.length}'}, item: null));
  cards.add((kind: 'done', key: 'teachMnemoDone', fields: const {}, item: null));
  return cards;
}

List<LessonStep> mnemonicsLessonSteps({
  required String Function(String key, Map<String, String> args) say,
  required List<String> items,
  required String mode,
  required String locale,
  required MnemonicsContent content,
}) {
  if (items.isEmpty) return const [];
  return [
    for (final card in mnemonicsLessonCards(items: items, mode: mode, locale: locale, content: content))
      LessonStep(text: say(card.key, card.fields), payload: card),
  ];
}
