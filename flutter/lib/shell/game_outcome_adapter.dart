import 'package:flutter/material.dart';

import 'ui_kit/game_result.dart';

export 'ui_kit/game_result.dart' show GameResultAction, GameResultStat;

enum GameOutcomeLayout { screen, inline }

/// The game supplies the outcome, its specialist details and callbacks.
/// The shell owns composition, theme, navigation and the victory countdown.
sealed class GameOutcomeAdapter {
  const GameOutcomeAdapter({
    this.score,
    this.details,
    this.titleKey,
    this.layout = GameOutcomeLayout.screen,
  });

  final String? score;

  /// Only game-specific content: metrics, replay or a series breakdown.
  final Widget? details;
  final Key? titleKey;
  final GameOutcomeLayout layout;
}

typedef LevelResultUnavailable = ({String message, String? detail});

final class LevelOutcomeAdapter extends GameOutcomeAdapter {
  const LevelOutcomeAdapter({
    required this.passed,
    this.playedLevel,
    this.playNext,
    this.unavailable,
    this.nextLabel,
    this.nextKey,
    this.settings,
    this.settingsKey,
    this.settingsLabel,
    this.auto = true,
    this.waitForWin = false,
    super.score,
    super.details,
    super.titleKey,
    super.layout,
  }) : assert((playNext == null) != (unavailable == null));

  final bool passed;
  final int? playedLevel;
  final VoidCallback? playNext;
  final LevelResultUnavailable? unavailable;
  final String? nextLabel;
  final Key? nextKey;
  final VoidCallback? settings;
  final Key? settingsKey;
  final String? settingsLabel;
  final bool auto;

  /// A provisional victory may render before the ladder confirms its write.
  final bool waitForWin;
}

/// A completed session or report, not a victory on the level ladder.
/// It never auto-advances or opens the map.
final class ReportOutcomeAdapter extends GameOutcomeAdapter {
  const ReportOutcomeAdapter({
    required this.title,
    this.icon = Icons.assessment_outlined,
    this.action,
    this.exit,
    this.moreActions = const [],
    this.awardStars,
    this.starsKey,
    this.stats = const [],
    super.score,
    super.details,
    super.titleKey,
    super.layout,
  });

  final String title;
  final IconData icon;
  final GameResultAction? action;
  final GameResultAction? exit;
  final List<GameResultAction> moreActions;

  /// Acknowledgement for completing a practice, not progress on a ladder.
  final int? awardStars;
  final Key? starsKey;
  final List<GameResultStat> stats;
}
