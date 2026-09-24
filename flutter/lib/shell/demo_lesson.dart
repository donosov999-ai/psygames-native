library;

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'lesson.dart';
import 'lesson_player.dart';

/// 🔴 ВТОРОЙ ГЕНЕРАТОР РАЗБОРА — ДЛЯ ИГР НА РЕАКЦИЮ.
///
/// Первый генератор (`board_solver.dart`) ищет путь к решению и годится там, где
/// решение вообще есть: башни, колбы, головоломки. У игр на реакцию решать нечего
/// — там проба длится секунду, и «правильно» задано ПРАВИЛОМ, а не ходом.
///
/// Замер переписи 24.09.2026 (`test/lesson_census_test.dart`): из 51 нашего
/// нативного адреса разбор был у 9, а среди оставшихся 42 большинство — именно
/// семейство реакций. Писать им учителя по одному значило бы писать тридцать
/// учителей. Поэтому здесь общий показ: КАРТОЧКА СТИМУЛА + ИМЯ ПРАВИЛА + ЧТО
/// ЗДЕСЬ ВЕРНО.
///
/// 🔴 ЧТО ОСТАЁТСЯ ИГРЕ — ТОЛЬКО СПИСОК ПРИМЕРОВ (десяток строк). Ни плеер, ни
/// карточка, ни правило засчитывания партии в игру не переезжают.
///
/// ⚠️ ПРИМЕРЫ БЕРУТСЯ ИЗ ДАННЫХ ИГРЫ, А НЕ ПРИДУМЫВАЮТСЯ. Слово и цвет у Струпа —
/// из его же палитры (включая палитру для дальтонизма), стрелки у фланкера — его
/// же стрелки. Разбор, нарисованный «похоже», научил бы не той игре.
class DemoTrial {
  const DemoTrial({
    required this.text,
    this.answer,
    this.color,
    this.sub,
    this.ruleKey,
    this.rule,
    this.art,
  });

  /// Сам стимул — то, что человек видит в партии.
  final String text;

  /// Цвет стимула, если цвет — часть задачи (Струп). Иначе цвет темы.
  final Color? color;

  /// Подпись под стимулом: что именно тут показано (например «слева ← справа»).
  final String? sub;

  /// Верный ответ словами — ровно так, как подписана кнопка в игре.
  ///
  /// 🔴 ПУСТО — ЗАКОННЫЙ СЛУЧАЙ, А НЕ ПРОПУСК. У игр на решение под
  /// неопределённостью (шарик, колоды, смена правила) верного ответа на ОТДЕЛЬНОЙ
  /// пробе не существует: там выигрывает стратегия, а не ход. Подписать такой
  /// карточке «Верно: качать» значило бы соврать — человек сделает так и
  /// проиграет на следующем шаре. Поэтому там карточка несёт только правило.
  final String? answer;

  /// 🔴 СТИМУЛ ВИДЖЕТОМ — КОГДА ЕГО НЕЛЬЗЯ НАПИСАТЬ СЛОВОМ. У Струпа стимул это
  /// слово и цвет, и текста хватает. У фланкера — ряд стрелок с выверенным
  /// зазором между ними, и «нарисовать похоже» значило бы учить не той игре:
  /// зазор у фланкера и есть ось трудности. Поэтому игра отдаёт СВОЙ виджет
  /// стимула, тот же, что рисует в партии.
  final Widget? art;

  /// Готовое правило строкой — когда оно собирается из словаря с подстановкой
  /// (у CPT правило зависит от уровня: «жми на {letter} только после A»).
  final String? rule;

  /// Ключ словаря с ИМЕНЕМ ПРАВИЛА этой пробы. У Струпа правило меняется внутри
  /// партии, поэтому ключ живёт на пробе, а не на игре.
  final String? ruleKey;
}

/// Карточка одного примера — общая на все игры семейства.
class DemoCard extends StatelessWidget {
  const DemoCard({super.key, required this.trial, required this.side});

  final DemoTrial trial;
  final double side;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (trial.art != null)
              // ⚠️ Карточка разбора УЖЕ ПОЛЯ ПАРТИИ (плеер отдаёт квадрат под
              // текст и кнопки), и ряд фланкера вылезал за край на 57 px —
              // померено пробой. Уменьшение целиком сохраняет пропорции: зазор
              // между стрелками и есть задача, и менять его нельзя.
              KeyedSubtree(
                key: const Key('demo-stimulus'),
                child: FittedBox(fit: BoxFit.scaleDown, child: trial.art!),
              )
            else
              Text(
                trial.text,
                key: const Key('demo-stimulus'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: (side / 7).clamp(22.0, 44.0),
                  fontWeight: FontWeight.w800,
                  color: trial.color ?? scheme.onSurface,
                ),
              ),
            if (trial.sub != null) ...[
              const SizedBox(height: 8),
              Text(trial.sub!, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
            ],
            if (trial.answer != null) ...[
              const SizedBox(height: 16),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Text(
                    L.t('teachDemoAnswer').replaceFirst('{a}', trial.answer!),
                    key: const Key('demo-answer'),
                    style: TextStyle(
                      color: scheme.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Открыть разбор-показ. Игра отдаёт примеры — всё остальное общее.
///
/// ⚠️ Отметку «партия с разбором не засчитывается» ставит эта же точка входа, а
/// не экран: забыть её в одном экране из тринадцати — значит поставить лестницу
/// по показанному ответу.
Future<void> openDemoLesson(
  BuildContext context, {
  required String title,
  required List<DemoTrial> trials,
}) {
  LessonUsed.mark();
  return Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (_) => LessonPlayerScreen(
      title: title,
      steps: [
        for (final t in trials)
          LessonStep(techniqueKey: t.ruleKey, text: t.rule, payload: t),
      ],
      board: (context, side, shown) => Padding(
        padding: const EdgeInsets.all(8),
        child: DemoCard(
          trial: trials[shown.clamp(0, trials.length - 1)],
          side: side,
        ),
      ),
    ),
  ));
}
