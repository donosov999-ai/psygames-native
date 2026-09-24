library;

import '../../shell/lesson.dart';
import 'model.dart';

/// 🎓 РАЗБОР «ПАР СЛОВ»: ЧЕМУ ТУТ ВООБЩЕ УЧИТЬ.
///
/// У игр на запоминание нет ни решателя, ни правила пробы: решать нечего, ответ
/// человек либо помнит, либо нет. Учить можно ровно одному — ПРИЁМУ, которым
/// пара держится: одна картинка, где оба слова действуют вместе, и проверка
/// задом наперёд.
///
/// Разбор снят с уже работающего веб-учителя
/// (`frontend/src/games/word-pairs/teach.ts`) вместе с его текстами: второй
/// набор объяснений означал бы, что веб и приложение учат разному.
///
/// ⚠️ РАЗБОР БЕРЁТ НЕ БОЛЬШЕ ЧЕТЫРЁХ ПАР. На первых уровнях их и так четыре, но
/// лестница доходит до пятнадцати: полный разбор пятнадцати пар — это сорок
/// карточек и три минуты ролика, который никто не досмотрит. Приём показывается
/// на четырёх, дальше человек применяет его сам.
const showPairs = 4;

/// Что показывает шаг: какую пару подсветить и открыто ли второе слово.
typedef PairsCard = ({int? pair, bool open});

List<LessonStep> wordPairsLessonSteps({
  required String Function(String key, Map<String, String> args) say,
  required List<WordPair> pairs,
}) {
  if (pairs.isEmpty) return const [];
  final taken = pairs.take(showPairs).toList();
  final steps = <LessonStep>[
    LessonStep(
      text: say('teachPairsIntro', {'n': '${pairs.length}'}),
      payload: (pair: null, open: false) as PairsCard,
    ),
  ];

  for (var i = 0; i < taken.length; i += 1) {
    steps.add(LessonStep(
      text: say(i == 0 ? 'teachPairsLinkFirst' : 'teachPairsLink',
          {'a': taken[i].left, 'b': taken[i].right}),
      payload: (pair: i, open: true) as PairsCard,
    ));
  }

  // Проверка задом наперёд — на первой паре: по ВТОРОМУ слову вспоминаем первое.
  // Поэтому второе слово здесь скрыто: открытое не проверяет ничего.
  steps.add(LessonStep(
    text: say('teachPairsCheck', {'a': taken.first.left, 'b': taken.first.right}),
    payload: (pair: 0, open: false) as PairsCard,
  ));
  steps.add(LessonStep(
    text: say('teachPairsMatch', {'n': '${pairs.length}'}),
    payload: (pair: null, open: true) as PairsCard,
  ));
  steps.add(LessonStep(
    text: say('teachPairsDone', const {}),
    payload: (pair: null, open: true) as PairsCard,
  ));
  return steps;
}
