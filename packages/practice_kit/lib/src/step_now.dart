import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'practices.dart';

/// Подсказка кадра с границами её шага — для [StepNow].
///
/// Кадр движка границ шага не отдаёт (он сверяется с ядром на TS поштучно,
/// лишнее поле сломало бы сверку), поэтому они берутся из расписания плана.
Json stepWithBounds(Json cue, Json plan, int elapsedMs) {
  final step = objects(plan['timeline'])
      .where(
        (s) =>
            s['setId'] == cue['setId'] &&
            s['stepId'] == cue['stepId'] &&
            elapsedMs >= (s['startMs'] as num) &&
            elapsedMs < (s['endMs'] as num),
      )
      .firstOrNull;
  return {
    ...cue,
    'startMs': step?['startMs'] ?? elapsedMs,
    'endMs': step?['endMs'] ?? elapsedMs,
  };
}

/// ЧТО ДЕЛАТЬ СЕЙЧАС И СКОЛЬКО ЕЩЁ — крупно, по каждой дорожке.
///
/// 🔴 Денис, 01.10.2026: «по животу вообще непонятно, когда держать, когда
/// отпускать, и что делать — текстов нет; по другим тоже без комментариев; по
/// сути только Кегель понятен и дыхание». Тексты в данных есть у ВСЕХ шагов
/// (practices.json, поле cue), но экран показывал их мелкой строкой «название ·
/// текст» без отсчёта шага. Теперь: действие крупно, обратный отсчёт шага в
/// секундах, полоска шага и сама подсказка обычным размером.
class StepNow extends StatelessWidget {
  const StepNow({
    super.key,
    required this.cue,
    required this.elapsedMs,
    required this.unit,
    this.compact = false,
  });

  final Json cue;
  final int elapsedMs;
  final String unit;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final start = (cue['startMs'] as num).toInt(),
        end = (cue['endMs'] as num).toInt();
    final left = ((end - elapsedMs) / 1000).ceil().clamp(0, 99999);
    final span = math.max(1, end - start);
    final done = ((elapsedMs - start) / span).clamp(0.0, 1.0);
    final text = Theme.of(context).textTheme;
    final big = (compact ? text.titleMedium : text.headlineSmall)?.copyWith(
      fontWeight: FontWeight.w600,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox.square(
                dimension: compact ? 44 : 52,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned.fill(
                      child: CircularProgressIndicator(
                        value: done,
                        strokeWidth: 3,
                        backgroundColor: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: .2),
                      ),
                    ),
                    if (cue['setId'] == 'breathing')
                      const Icon(Icons.air)
                    else
                      Padding(
                        padding: const EdgeInsets.all(5),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            '$left $unit',
                            key: const Key('step-now-left'),
                            style: big,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${cue['title']}',
                key: const Key('step-now-title'),
                style: big,
                textAlign: TextAlign.center,
                // 🔴 Две строки, а не одна: это и есть «что делать». Замер 02.10.2026
                // на эмуляторе 320 pt: «Уровень 2 · удержан…» — действие обрезано;
                // самый длинный шаг каталога — 30 знаков («Линия челюсти · правая
                // сторона»). Панель постоянной высоты прокручивается внутри.
                maxLines: null,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${cue['cue']}',
            key: const Key('step-now-cue'),
            style: compact ? text.bodySmall : text.bodyMedium,
            // 🔴 Подсказка — ЦЕЛИКОМ: это инструкция, а не подпись. Замер 02.10.2026
            // на гуаше: «…Верните скреб…» — три строки с многоточием резали конец
            // действия. Подсказки каталога — до 187 знаков (у 10 % длиннее 149);
            // не влезло — панель прокручивается внутри ([StepNowPanel]).
            maxLines: null,
          ),
        ],
      ),
    );
  }
}

/// Панель «что делать сейчас» по всем дорожкам кадра — ОДНА на оба приложения.
///
/// ⚠️ Высота ПОСТОЯННАЯ: панель, растущая с длиной подсказки, двигала сцену под
/// собой (замечание Дениса 23.09.2026, «квадрат тянет верх и низ»). Длинное
/// прокручивается внутри и наружу не растёт. 184 — под два ряда заголовка и
/// подсказку в пять строк на ширине 320 pt (замер на эмуляторе 02.10.2026).
class StepNowPanel extends StatelessWidget {
  const StepNowPanel({
    super.key,
    required this.cues,
    required this.plan,
    required this.elapsedMs,
    required this.unit,
    this.height = 184,
    this.padding = const EdgeInsets.fromLTRB(16, 6, 16, 0),
  });

  final List<Json> cues;
  final Json plan;
  final int elapsedMs;
  final String unit;
  final double height;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final insets = padding.resolve(Directionality.of(context));
      final compact = cues.length > 1;
      final style =
          (compact
                  ? Theme.of(context).textTheme.titleMedium
                  : Theme.of(context).textTheme.headlineSmall)
              ?.copyWith(fontWeight: FontWeight.w600);
      final cellWidth = math.max(
        1.0,
        (box.maxWidth - insets.horizontal) / math.max(1, cues.length) - 8,
      );
      final sets = cues.map((c) => c['setId']).toSet();
      final titles = [
        ...cues,
        ...objects(plan['timeline']).where((c) => sets.contains(c['setId'])),
      ];
      var titleHeight = 0.0;
      for (final c in titles) {
        final painter = TextPainter(
          text: TextSpan(text: '${c['title']}', style: style),
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: cellWidth);
        titleHeight = math.max(titleHeight, painter.height);
        painter.dispose();
      }
      // Reserve all titles of the selected programs, not just the current phase:
      // long labels stay readable and phase transitions do not move the scene.
      final minimum =
          insets.vertical + (compact ? 44 : 52) + 6 + titleHeight + 10;
      return SizedBox(
        key: const Key('step-now-panel'),
        height: math.max(height, minimum),
        child: SingleChildScrollView(
          padding: padding,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final c in cues)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: StepNow(
                      cue: stepWithBounds(c, plan, elapsedMs),
                      elapsedMs: elapsedMs,
                      compact: cues.length > 1,
                      unit: unit,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}
