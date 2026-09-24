library;

import '../../shell/lesson.dart';
import 'model.dart';

/// 🎓 РАЗБОР «ДВОРЦА ПАМЯТИ»: ОБЪЯСНЯЕТСЯ ПРИЁМ, А НЕ ИНТЕРФЕЙС.
///
/// Приём loci держится на МАРШРУТЕ: человек вспоминает не список, а дорогу, и на
/// каждом месте лежит один предмет, связанный с ним ОДНОЙ странной картинкой.
/// Разбор проговаривает это на настоящем материале раунда — местах и предметах,
/// которые игра сейчас и покажет.
///
/// Тексты и порядок карточек сняты с веб-учителя
/// (`frontend/src/games/memory-palace/teach.ts`): второй набор объяснений
/// означал бы, что веб и приложение учат разному.
///
/// ⚠️ ОБРАТНЫЙ ХОД ПОКАЗЫВАЕТСЯ НАРОЧНО. Игра спрашивает маршрут и с конца, и
/// приём обязан это выдержать: если человек учил список, обратный ход его
/// ломает, если дорогу — нет.

/// Что показывает шаг: какое место подсветить и что уже разложено.
typedef PalaceCard = ({int? place, List<String?> layout});

List<LessonStep> palaceLessonSteps({
  required String Function(String key, Map<String, String> args) say,
  required MemoryPalaceRound round,
  required String locale,
}) {
  final n = round.loci.length < round.targetItems.length
      ? round.loci.length
      : round.targetItems.length;
  if (n == 0) return const [];

  final layout = List<String?>.filled(n, null);
  final steps = <LessonStep>[
    LessonStep(
      text: say('teachPalaceIntro', {'n': '$n'}),
      payload: (place: null, layout: [...layout]) as PalaceCard,
    ),
  ];

  for (var i = 0; i < n; i += 1) {
    layout[i] = round.targetItems[i].id;
    steps.add(LessonStep(
      text: say(i == 0 ? 'teachPalaceLinkFirst' : 'teachPalaceLink', {
        'n': '${i + 1}',
        'place': round.loci[i].title(locale),
        'item': round.targetItems[i].title(locale),
      }),
      payload: (place: i, layout: [...layout]) as PalaceCard,
    ));
  }

  steps.add(LessonStep(
    text: say('teachPalaceWalk', const {}),
    payload: (place: null, layout: [...layout]) as PalaceCard,
  ));
  for (var i = 0; i < n && i < 2; i += 1) {
    steps.add(LessonStep(
      text: say('teachPalaceRecall', {
        'place': round.loci[i].title(locale),
        'item': round.targetItems[i].title(locale),
      }),
      payload: (place: i, layout: [...layout]) as PalaceCard,
    ));
  }
  steps.add(LessonStep(
    text: say('teachPalaceBack', {
      'place': round.loci[n - 1].title(locale),
      'item': round.targetItems[n - 1].title(locale),
    }),
    payload: (place: n - 1, layout: [...layout]) as PalaceCard,
  ));
  steps.add(LessonStep(
    text: say('teachPalaceDone', const {}),
    payload: (place: null, layout: [...layout]) as PalaceCard,
  ));
  return steps;
}
