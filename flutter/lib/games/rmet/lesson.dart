library;

import 'dart:math';

import '../../shell/lesson.dart';
import 'model.dart';

/// 🎓 РАЗБОР «ПРОЧТИ ЭМОЦИЮ»: ПРИЗНАКИ ГЛАЗ → СРАВНЕНИЕ → ВЫБОР.
///
/// У этой игры логика — не ход, а чтение: сначала признаки глаз (брови, веки,
/// взгляд), потом сравнение с тем, как выглядели бы соседние слова, и только
/// потом выбор. Разбор снят с веб-учителя (`frontend/src/games/rmet/teach.ts`)
/// вместе с его текстами: второй набор объяснений означал бы, что веб и
/// приложение учат разному.
///
/// 🔴 СРАВНЕНИЕ ТОЛЬКО ПО ДАННЫМ САМОЙ ИГРЫ. Как выглядел бы «раздражённый»,
/// разбор говорит признаками, которые игра сама приписала «раздражённому» в его
/// пункте ([EyeItem.hint]). Для слов без своего пункта признаков в данных нет —
/// такое слово разбор не описывает. Замер 30.09.2026 по `assets/rmet.json`:
/// пунктов, где сравнивать есть с чем, на русском 11 из 18, на английском 6 из 18
/// (формы слов в двух языках расходятся: «испуганный» — и frightened, и fearful).
///
/// ⚠️ РАЗБОР НЕ ГОВОРИТ «ЗДЕСЬ ЭТОГО НЕТ». Признаки соседних слов иногда
/// пересекаются: утверждать отсутствие признака значило бы учить неправде.
/// Карточка сравнения называет признаки соседа и просит сравнить.
///
/// ⚠️ ПРИМЕР НЕ СОВПАДАЕТ С ТЕКУЩИМ ЗАДАНИЕМ: разбор открывается посреди партии,
/// и пример с тем же пунктом просто показал бы ответ.
const rmetExamples = 2;

/// Больше двух сравнений на пример — это уже перебор всех слов, а не приём.
const rmetComparisons = 2;

/// Что рисует доска на шаге: пункт-пример, сосед для сравнения, выбранное слово.
typedef RmetCard = ({int? item, int? neighbor, String? picked});

/// С какими вариантами пункта есть что сравнить: слово — верный ответ другого пункта.
List<int> rmetNeighbors(List<EyeItem> items, int index, String locale) {
  final correct = items[index].correctFor(locale);
  final byWord = <String, int>{
    for (var i = 0; i < items.length; i += 1) items[i].correctFor(locale): i,
  };
  return [
    for (final word in items[index].optionsFor(locale))
      if (word != correct && byWord.containsKey(word)) byWord[word]!,
  ];
}

List<LessonStep> rmetLessonSteps({
  required String Function(String key, Map<String, String> args) say,
  required List<EyeItem> items,
  required String locale,
  int? exclude,
  Random? random,
}) {
  // Перемешиваем годные и берём первые: пример каждый раз свой, как и партия.
  final fit = [
    for (var i = 0; i < items.length; i += 1)
      if (i != exclude && rmetNeighbors(items, i, locale).isNotEmpty) i,
  ]..shuffle(random ?? Random());
  final examples = fit.take(rmetExamples).toList();
  if (examples.isEmpty) return const [];

  const blank = (item: null, neighbor: null, picked: null);
  final steps = <LessonStep>[
    LessonStep(text: say('teachRmetEyes', const {}), payload: blank as RmetCard),
  ];
  for (final i in examples) {
    final item = items[i];
    steps.add(LessonStep(
      text: say('teachRmetCues', {'hint': item.hintFor(locale)}),
      payload: (item: i, neighbor: null, picked: null) as RmetCard,
    ));
    for (final n in rmetNeighbors(items, i, locale).take(rmetComparisons)) {
      steps.add(LessonStep(
        text: say('teachRmetCompare', {'word': items[n].correctFor(locale), 'cues': items[n].hintFor(locale)}),
        payload: (item: i, neighbor: n, picked: null) as RmetCard,
      ));
    }
    // Выбор — ровно то слово, которое засчитывает партия (`RmetSession.answer`).
    steps.add(LessonStep(
      text: say('teachRmetPick', {'word': item.correctFor(locale), 'hint': item.hintFor(locale)}),
      payload: (item: i, neighbor: null, picked: item.correctFor(locale)) as RmetCard,
    ));
  }
  steps.add(LessonStep(text: say('teachRmetDone', const {}), payload: blank as RmetCard));
  return steps;
}
