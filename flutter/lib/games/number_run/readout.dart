/// Read-only presentation of the existing runner state. No scoring or physics.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/game_colors.dart';
import '../../shell/js_compat.dart' show jsNum;
import '../../shell/l10n.dart';
import '../runner/road.dart';

RoadRow? numberRunTaskRow(RoadCourse course, RoadState state) {
  for (final row in course.rows.skip(state.nextRow).take(3)) {
    if (row.z - state.z > 70) return null;
    if (row.show != null ||
        row.recall ||
        row.kind == 'answer' ||
        row.kind == 'scale' ||
        row.exact != null) {
      return row;
    }
  }
  return null;
}

@immutable
class NumberRunReadout {
  const NumberRunReadout({
    required this.distance,
    required this.remaining,
    this.guard,
    this.task,
    this.collected,
  });

  factory NumberRunReadout.from(RoadCourse course, RoadState state) {
    final row = numberRunTaskRow(course, state);
    double? collected;
    if (row?.exact != null) {
      collected = 0;
      if (row!.id == state.nextRow) {
        for (final index in state.collected) {
          if (index >= 0 && index < row.items.length && row.items[index].part) {
            collected = collected! + row.items[index].value;
          }
        }
      }
    }
    return NumberRunReadout(
      distance: course.length > 0 ? (state.z / course.length).clamp(0, 1) : 0,
      remaining: math.max(
        0,
        ((course.format == 'level' ? 90 : 12 * 42) - state.elapsed).ceil(),
      ),
      guard: course.finale?.boss,
      task: row,
      collected: collected,
    );
  }

  final double distance;
  final int remaining;
  final double? guard;
  final RoadRow? task;
  final double? collected;
  String get time =>
      '${remaining ~/ 60}:${(remaining % 60).toString().padLeft(2, '0')}';
  String? get prompt {
    final row = task;
    if (row == null) return null;
    if (row.show != null) return L.t('numberRunMemorize');
    if (row.recall) return L.t('numberRunRecall');
    if (row.exact != null) {
      return L
          .t('numberRunExact')
          .replaceAll('{n}', '${jsNum(row.exact!.target)}');
    }
    return row.prompt;
  }
}

/// No commands or steering listener: all gestures on the panel are isolated
/// from the actual road below it. The shared GameShell owns pause/navigation.
class NumberRunReadoutPanel extends StatelessWidget {
  const NumberRunReadoutPanel({
    super.key,
    required this.value,
    required this.showTask,
  });
  final NumberRunReadout value;
  final bool showTask;

  @override
  Widget build(BuildContext context) {
    final colors = GameColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final prompt = showTask ? value.prompt : null;
    final exact = showTask ? value.task?.exact : null;
    final collected = value.collected ?? 0;
    return Container(
      key: const Key('nr-readout-panel'),
      margin: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.boardLine),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Semantics(
                label: L.t('timeLeftLabel'),
                value: value.time,
                child: Container(
                  key: const Key('nr-clock'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: value.remaining <= 10
                          ? colors.warning
                          : colors.boardLine,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.timer_outlined, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        value.time,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    key: const Key('nr-distance'),
                    value: value.distance,
                    minHeight: 10,
                    color: colors.inkPlaced,
                    backgroundColor: scheme.surfaceContainerHighest,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.flag_outlined, color: scheme.onSurface, size: 22),
            ],
          ),
          if (value.guard != null) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.shield_outlined, color: colors.hint, size: 20),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    '${L.t('numberRunGuard')} · ${jsNum(value.guard!)}',
                    key: const Key('nr-guard-target'),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(
            prompt ?? L.t('numberRunTask'),
            key: const Key('nr-sign-text'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (exact != null) ...[
            const SizedBox(height: 8),
            Container(
              key: const Key('nr-exact-counter'),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: colors.warning, width: 2),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (collected >= exact.target) ...[
                    Icon(
                      collected == exact.target
                          ? Icons.check_circle_outline
                          : Icons.error_outline,
                      color: collected == exact.target
                          ? colors.correct
                          : colors.wrong,
                      size: 20,
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    '${jsNum(collected)} / ${jsNum(exact.target)}',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
