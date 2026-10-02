import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'practices.dart';

/// Подсказка кадра с границами её шага — для [StepNow].
///
/// Кадр движка границ шага не отдаёт (он сверяется с ядром на TS поштучно,
/// лишнее поле сломало бы сверку), поэтому они берутся из расписания плана.
Json stepWithBounds(Json cue, Json plan, int elapsedMs) {
  final step = objects(plan['timeline']).where((s) =>
      s['setId'] == cue['setId'] &&
      s['stepId'] == cue['stepId'] &&
      elapsedMs >= (s['startMs'] as num) &&
      elapsedMs < (s['endMs'] as num)).firstOrNull;
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
    final start = (cue['startMs'] as num).toInt(), end = (cue['endMs'] as num).toInt();
    final left = ((end - elapsedMs) / 1000).ceil().clamp(0, 99999);
    final span = math.max(1, end - start);
    final done = ((elapsedMs - start) / span).clamp(0.0, 1.0);
    final text = Theme.of(context).textTheme;
    final big = (compact ? text.titleMedium : text.headlineSmall)
        ?.copyWith(fontWeight: FontWeight.w600);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${cue['title']}',
                  key: const Key('step-now-title'),
                  style: big,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '$left $unit',
                key: const Key('step-now-left'),
                style: big?.copyWith(
                  fontFeatures: const [ui.FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(value: done, minHeight: 4),
          const SizedBox(height: 4),
          Text(
            '${cue['cue']}',
            key: const Key('step-now-cue'),
            style: compact ? text.bodySmall : text.bodyMedium,
            maxLines: compact ? 1 : 3,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
