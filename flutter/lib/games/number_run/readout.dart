/// Read-only presentation of the existing runner state. No scoring or physics.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/js_compat.dart' show jsNum;
import '../../shell/l10n.dart';
import '../runner/road.dart';
import 'campaign.dart';
import 'nr_material.dart';
import 'task_cards.dart';

RoadRow? numberRunTaskRow(RoadCourse course, RoadState state) {
  for (final row in course.rows.skip(state.nextRow).take(3)) {
    if (row.z - state.z > 70) return null;
    if (row.show != null ||
        row.recall ||
        row.kind == 'answer' ||
        row.kind == 'scale' ||
        row.exact != null ||
        row.station == 'reserve') {
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
    this.state,
    this.level,
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
      state: state,
      level: course.format == 'level' ? '${L.t('level')} ${course.levelId}' : '${L.t('round')} ${state.stage}/$campaignStageCount',
    );
  }

  final double distance;
  final int remaining;
  final double? guard;
  final RoadRow? task;
  final double? collected;

  /// Состояние ядра — для карточек заданий (курсор шкалы, заполненные места памяти, «твоё число»).
  final RoadState? state;

  /// Капсула: «Уровень 9» у уровня, «Этап 3» у свободного забега.
  final String? level;
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
    if (row.station == 'reserve') return L.t('numberRunReserveTake');
    return row.prompt;
  }
}

/// HUD ЗАБЕГА ПРЯМО НА ДОРОГЕ — UI-референс Кодекса v1.0, лист 01 и план экрана (стр. 05): строка
/// 48 — капсула уровня и полоса пути с флажком, под ней таймер 112×32, ниже одна карточка
/// активного задания (64–96) или цель стража. Ни подложки, ни рамки: игра — весь экран (Денис
/// 11.11.2026: «инфо-экраны больше самой игры» — нельзя). Пауза — общая, плавающая внизу.
/// Касания HUD не рулят числом: дорога под ним своя, слушателя руля здесь нет.
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
    final task = showTask ? value.task : null;
    final st = value.state;
    final warn = value.remaining <= 10;
    return Column(
      key: const Key('nr-readout-panel'),
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 40),
          child: Row(children: [
            if (value.level != null)
              Flexible(child: NrCandy(text: value.level!.toUpperCase(), size: 14, height: 30, padding: 12)),
            const SizedBox(width: 8),
            Expanded(flex: 2, child: _Progress(value: value.distance)),
          ]),
        ),
        Semantics(
          label: L.t('timeLeftLabel'),
          value: value.time,
          child: KeyedSubtree(
            key: const Key('nr-clock'),
            child: NrCandy(
              text: value.time,
              icon: Icons.timer_outlined,
              rim: warn ? Nr.amber : Nr.gold,
              size: 16,
              height: 30,
            ),
          ),
        ),
        if (task != null && st != null) ...[
          const SizedBox(height: 10),
          NumberRunTaskCard(row: task, state: st, collected: value.collected),
        ] else if (value.guard != null && st != null) ...[
          const SizedBox(height: 10),
          NumberRunGuardGoal(guard: value.guard!, value: st.sum),
        ],
      ],
    );
  }
}

/// Полоса пути (UI02, h16): navy-дорожка с золотым кантом, мятная заливка, клетчатый флажок справа.
class _Progress extends StatelessWidget {
  const _Progress({required this.value});
  final double value;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'distance',
        value: '${(value * 100).round()}%',
        child: SizedBox(
          key: const Key('nr-distance'),
          height: 22,
          child: Stack(alignment: Alignment.centerLeft, children: [
            Container(decoration: nrGloss(Nr.navy, radius: 11)),
            Padding(
              padding: const EdgeInsets.fromLTRB(3, 3, 26, 3),
              child: FractionallySizedBox(
                widthFactor: value.clamp(0.0, 1.0),
                child: Container(decoration: nrGloss(Nr.mint, rim: null, radius: 8, shadow: false)),
              ),
            ),
            const Positioned(right: 4, child: Icon(Icons.sports_score, size: 18, color: Colors.white)),
          ]),
        ),
      );
}
