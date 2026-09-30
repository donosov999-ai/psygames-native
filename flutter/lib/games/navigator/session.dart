/// СЕССИЯ «НАВИГАТОРА» — ПЕРЕНОС `core/session.ts` ОДИН В ОДИН.
///
/// Фазы: правила → изучение → пауза-отвлечение (если есть) → ответ → итог. Пауза снимает
/// время с часов партии, а не из неё выбрасывает: `durationMs = сейчас − старт − пауза`.
///
/// Сессия неизменяемая, как в вебе: каждый шаг возвращает новую. Время — число миллисекунд
/// от любых часов (`now`), чтобы проба гоняла партию без настоящего ожидания.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'generator.dart';
import 'geometry.dart';
import 'input.dart';
import 'scoring.dart';
import 'types.dart';

enum NavigatorPhase {
  rules('rules'),
  study('study'),
  delay('delay'),
  recall('recall'),
  paused('paused'),
  result('result'),
  disposed('disposed');

  const NavigatorPhase(this.wire);
  final String wire;

  bool get isActive => this == study || this == delay || this == recall;
}

class NavigatorSessionConfig {
  const NavigatorSessionConfig({required this.seed, required this.level, this.mode});
  final String seed;
  final num level;
  final NavigatorMode? mode;
}

const Object _keep = Object();

class NavigatorSession {
  const NavigatorSession({
    required this.config,
    required this.round,
    required this.phase,
    required this.pausedFrom,
    required this.delayIndex,
    required this.routeIndex,
    required this.currentCell,
    required this.routeHits,
    required this.extraSteps,
    required this.turnIndex,
    required this.turnHits,
    required this.selectedHomeSector,
    required this.startedAt,
    required this.pauseStartedAt,
    required this.pausedMs,
    required this.result,
  });

  /// Уже выправленная: уровень в 1…33, режим проставлен. Перезапуск с правил строит по ней.
  final NavigatorSessionConfig config;
  final NavigatorRound round;
  final NavigatorPhase phase;
  final NavigatorPhase? pausedFrom;
  final int delayIndex;
  final int routeIndex;
  final GridCell currentCell;
  final int routeHits;
  final int extraSteps;
  final int turnIndex;
  final int turnHits;
  final HomeSector? selectedHomeSector;
  final num? startedAt;
  final num? pauseStartedAt;
  final num pausedMs;
  final NavigatorMetrics? result;

  NavigatorSession _with({
    NavigatorPhase? phase,
    Object? pausedFrom = _keep,
    int? delayIndex,
    int? routeIndex,
    GridCell? currentCell,
    int? routeHits,
    int? extraSteps,
    int? turnIndex,
    int? turnHits,
    Object? selectedHomeSector = _keep,
    Object? startedAt = _keep,
    Object? pauseStartedAt = _keep,
    num? pausedMs,
    Object? result = _keep,
  }) =>
      NavigatorSession(
        config: config,
        round: round,
        phase: phase ?? this.phase,
        pausedFrom: identical(pausedFrom, _keep) ? this.pausedFrom : pausedFrom as NavigatorPhase?,
        delayIndex: delayIndex ?? this.delayIndex,
        routeIndex: routeIndex ?? this.routeIndex,
        currentCell: currentCell ?? this.currentCell,
        routeHits: routeHits ?? this.routeHits,
        extraSteps: extraSteps ?? this.extraSteps,
        turnIndex: turnIndex ?? this.turnIndex,
        turnHits: turnHits ?? this.turnHits,
        selectedHomeSector:
            identical(selectedHomeSector, _keep) ? this.selectedHomeSector : selectedHomeSector as HomeSector?,
        startedAt: identical(startedAt, _keep) ? this.startedAt : startedAt as num?,
        pauseStartedAt: identical(pauseStartedAt, _keep) ? this.pauseStartedAt : pauseStartedAt as num?,
        pausedMs: pausedMs ?? this.pausedMs,
        result: identical(result, _keep) ? this.result : result as NavigatorMetrics?,
      );
}

NavigatorSession _freshRound(NavigatorSession session, num now) => session._with(
      phase: NavigatorPhase.study,
      pausedFrom: null,
      delayIndex: 0,
      routeIndex: 0,
      currentCell: session.round.route[0],
      routeHits: 0,
      extraSteps: 0,
      turnIndex: 0,
      turnHits: 0,
      selectedHomeSector: null,
      startedAt: now,
      pauseStartedAt: null,
      pausedMs: 0,
      result: null,
    );

NavigatorSession createNavigatorSession(NavigatorSessionConfig config) {
  final level = math.min(navigatorLevels, math.max(1, config.level.floor()));
  final mode = config.mode ?? navigatorModeForLevel(level);
  final safeConfig = NavigatorSessionConfig(seed: config.seed, level: level, mode: mode);
  final round = generateNavigatorRound(safeConfig.seed, level, mode);
  return NavigatorSession(
    config: safeConfig,
    round: round,
    phase: NavigatorPhase.rules,
    pausedFrom: null,
    delayIndex: 0,
    routeIndex: 0,
    currentCell: round.route[0],
    routeHits: 0,
    extraSteps: 0,
    turnIndex: 0,
    turnHits: 0,
    selectedHomeSector: null,
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  );
}

NavigatorSession startNavigatorRound(NavigatorSession session, num now) =>
    session.phase == NavigatorPhase.rules ? _freshRound(session, now) : session;

NavigatorSession completeNavigatorStudy(NavigatorSession session) {
  if (session.phase != NavigatorPhase.study) return session;
  return session._with(
    phase: session.round.delaySteps > 0 ? NavigatorPhase.delay : NavigatorPhase.recall,
    delayIndex: 0,
  );
}

NavigatorSession advanceNavigatorDelay(NavigatorSession session) {
  if (session.phase != NavigatorPhase.delay) return session;
  final nextIndex = session.delayIndex + 1;
  return session._with(
    delayIndex: nextIndex,
    phase: nextIndex >= session.round.delaySteps ? NavigatorPhase.recall : NavigatorPhase.delay,
  );
}

NavigatorSession _finishNavigator(NavigatorSession session, num now) {
  final startedAt = session.startedAt ?? now;
  return session._with(
    phase: NavigatorPhase.result,
    result: scoreNavigatorCompletion(
      session.round,
      durationMs: math.max(0, now - startedAt - session.pausedMs).toDouble(),
      routeHits: session.routeHits,
      extraSteps: session.extraSteps,
      turnHits: session.turnHits,
      selectedHomeSector: session.selectedHomeSector,
    ),
  );
}

/// [screenDirection] — сторона НА ЭКРАНЕ: карта может быть повёрнута, логическая сторона
/// получается обратным поворотом. Промах не сдвигает игрока, а копит лишний шаг.
NavigatorSession inputNavigatorRouteDirection(NavigatorSession session, Cardinal screenDirection, num now) {
  if (session.phase != NavigatorPhase.recall || session.round.mode != NavigatorMode.routeRecall) return session;
  final logicalDirection = unrotateCardinal(screenDirection, session.round.mapRotation);
  final directions = session.round.routeDirections;
  final expected = session.routeIndex < directions.length ? directions[session.routeIndex] : null;
  if (logicalDirection != expected) return session._with(extraSteps: session.extraSteps + 1);
  final nextIndex = session.routeIndex + 1;
  final updated = session._with(
    routeIndex: nextIndex,
    routeHits: session.routeHits + 1,
    currentCell: session.round.route[nextIndex],
  );
  return nextIndex >= session.round.routeSteps ? _finishNavigator(updated, now) : updated;
}

/// Повороты не ждут верного ответа: каждый ответ сдвигает счёт, верный добавляет попадание.
NavigatorSession inputNavigatorTurn(NavigatorSession session, Turn turn, num now) {
  if (session.phase != NavigatorPhase.recall || session.round.mode != NavigatorMode.turnSequence) return session;
  final turns = session.round.turns;
  final expected = session.turnIndex < turns.length ? turns[session.turnIndex] : null;
  final nextIndex = session.turnIndex + 1;
  final updated = session._with(
    turnIndex: nextIndex,
    turnHits: session.turnHits + (turn == expected ? 1 : 0),
  );
  return nextIndex >= session.round.routeSteps ? _finishNavigator(updated, now) : updated;
}

NavigatorSession inputNavigatorHomeSector(NavigatorSession session, HomeSector screenSector, num now) {
  if (session.phase != NavigatorPhase.recall || session.round.mode != NavigatorMode.homeDirection) return session;
  final logicalSector = unrotateHomeSector(screenSector, session.round.mapRotation);
  return _finishNavigator(session._with(selectedHomeSector: logicalSector), now);
}

NavigatorSession handleNavigatorKey(NavigatorSession session, String key, num now) {
  if (session.phase != NavigatorPhase.recall) return session;
  switch (session.round.mode) {
    case NavigatorMode.routeRecall:
      final direction = cardinalFromKey(key);
      return direction != null ? inputNavigatorRouteDirection(session, direction, now) : session;
    case NavigatorMode.turnSequence:
      final turn = turnFromKey(key);
      return turn != null ? inputNavigatorTurn(session, turn, now) : session;
    case NavigatorMode.homeDirection:
      final sector = homeSectorFromKey(key);
      return sector != null ? inputNavigatorHomeSector(session, sector, now) : session;
  }
}

NavigatorSession handleNavigatorSwipe(NavigatorSession session, double deltaX, double deltaY, num now) {
  if (session.phase != NavigatorPhase.recall) return session;
  switch (session.round.mode) {
    case NavigatorMode.routeRecall:
      final direction = cardinalFromSwipe(deltaX, deltaY);
      return direction != null ? inputNavigatorRouteDirection(session, direction, now) : session;
    case NavigatorMode.turnSequence:
      final turn = turnFromSwipe(deltaX, deltaY);
      return turn != null ? inputNavigatorTurn(session, turn, now) : session;
    case NavigatorMode.homeDirection:
      final sector = homeSectorFromSwipe(deltaX, deltaY);
      return sector != null ? inputNavigatorHomeSector(session, sector, now) : session;
  }
}

NavigatorSession pauseNavigatorSession(NavigatorSession session, num now) {
  if (!session.phase.isActive) return session;
  return session._with(phase: NavigatorPhase.paused, pausedFrom: session.phase, pauseStartedAt: now);
}

NavigatorSession resumeNavigatorSession(NavigatorSession session, num now) {
  final from = session.pausedFrom;
  if (session.phase != NavigatorPhase.paused || from == null) return session;
  final pauseStartedAt = session.pauseStartedAt;
  final pauseDuration = pauseStartedAt == null ? 0 : math.max(0, now - pauseStartedAt);
  return session._with(
    phase: from,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pauseDuration,
  );
}

NavigatorSession restartNavigatorSession(NavigatorSession session, num now) =>
    session.phase == NavigatorPhase.rules ? createNavigatorSession(session.config) : _freshRound(session, now);

NavigatorSession disposeNavigatorSession(NavigatorSession session) => session._with(
      phase: NavigatorPhase.disposed,
      pausedFrom: null,
      selectedHomeSector: null,
      startedAt: null,
      pauseStartedAt: null,
      result: null,
    );

/// Снимок сессии строкой — тот же JSON, что у веба, поле в поле и в том же порядке.
String navigatorSessionFingerprint(NavigatorSession session) => jsonEncode({
      'roundId': session.round.id,
      'phase': session.phase.wire,
      'delayIndex': session.delayIndex,
      'routeIndex': session.routeIndex,
      'currentCell': {'x': session.currentCell.x, 'y': session.currentCell.y},
      'routeHits': session.routeHits,
      'extraSteps': session.extraSteps,
      'turnIndex': session.turnIndex,
      'turnHits': session.turnHits,
      'selectedHomeSector': session.selectedHomeSector?.wire,
    });
