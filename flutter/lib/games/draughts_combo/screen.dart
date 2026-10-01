import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../draughts_common/rules.dart';
import 'game.dart';
import 'ladder.dart';
import 'lesson.dart';

String comboDifficulty(int level) => level <= 8
    ? 'easy'
    : level <= 16
    ? 'medium'
    : 'hard';

/// ЭКРАН «ШАШЕК» (комбинации «отдай и забери») на общем каркасе.
///
/// Тонкий, как пасьянс: всё, что засчитывается, — в `game.dart` и закрыто пробами
/// без пикселей; правила — в `draughts_common/rules.dart`, сверенном с оракулом.
class DraughtsComboScreen extends StatefulWidget {
  const DraughtsComboScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
  });

  final SharedState state;
  final ComboCorpus? corpus;
  final int Function()? clock;
  final int? seed;

  @override
  State<DraughtsComboScreen> createState() => _DraughtsComboScreenState();
}

enum _Phase { config, playing, done }

class _DraughtsComboScreenState extends State<DraughtsComboScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'draughts_combo',
    store: SharedLevelStore(widget.state),
    maxLevel: comboLevels,
  );
  GameTimer? _ticker;
  ComboCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;
  ComboRun? _run;

  /// Пробе: текущий подход (позиция и число сделанных ходов), чтобы решать касаниями.
  @visibleForTesting
  ComboRun? get debugRun => _run;
  int _runLevel = 1;
  ComboResult? _last;
  int _starts = 0;

  int _now() => widget.clock?.call() ?? gameNow();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await _ladder.load();
      final corpus = widget.corpus ?? await ComboCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('draughtsCombo')}: $e");
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  int _seed(int level) {
    final wallMs =
        DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно подхода
    return widget.seed ?? wallMs % 100000 + _starts;
  }

  void _start() {
    final corpus = _corpus;
    if (corpus == null) return;
    final level = _ladder.level;
    final deck = comboDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    setState(() {
      _run = ComboRun(level: level, deck: deck, now: _now);
      _runLevel = level;
      _phase = _Phase.playing;
    });
    _ticker?.cancel();
    _ticker = gameInterval(const Duration(milliseconds: 100), _tick);
  }

  void _tick() {
    if (!mounted) return;
    final run = _run;
    if (run == null) return;
    run.tick();
    if (run.finished) {
      _ticker?.cancel();
      _complete(run.result!);
      return;
    }
    setState(() {});
  }

  Future<void> _complete(ComboResult r) async {
    final level = _runLevel;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final step = comboStep(level);
    final details = <String, Object?>{
      'level': level,
      'solved': r.solved,
      'clean': r.clean,
      'retries': [for (final a in r.attempts) a.retries],
      'hints': r.attempts.where((a) => a.hinted).length,
      'puzzles': [for (final a in r.attempts) a.puzzleId],
      'group': step.group,
      'band': step.band,
    };
    setState(() {
      _last = r;
      _phase = _Phase.done;
    });
    final difficulty = comboDifficulty(level);
    if (r.passed) {
      await _ladder.win(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: 'levels',
        difficulty: difficulty,
        details: details,
      );
    } else if (r.failed) {
      await _ladder.fail(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: 'levels',
        difficulty: difficulty,
        details: details,
      );
    } else {
      await SessionReport.send(
        gameType: 'draughts_combo',
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: 'levels',
        difficulty: difficulty,
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  Future<void> _openLesson() async {
    final corpus = _corpus ?? await ComboCorpus.load();
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladder.level;
    final steps = comboLessonForLevel(
      corpus,
      level,
      seed: widget.seed ?? level * 131 + _starts,
    );
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('draughtsCombo'),
          steps: steps,
          board: (context, side, shown) {
            final f =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as DrLessonFrame;
            return Center(
              child: DraughtsBoardView(
                position: DraughtsPosition.parse(f.code),
                side: side,
                lastMove: f.move,
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final corpus = _corpus;
    if (corpus == null) {
      return GameShell(
        title: L.t('draughtsCombo'),
        onLesson: _openLesson,
        field: (context, h) => Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : Text(_error!),
        ),
      );
    }
    final run = _run;
    final playing = _phase == _Phase.playing && run != null;
    return GameShell(
      title: L.t('draughtsCombo'),
      onLesson: _openLesson,
      hud: [
        if (!GamePreset.isPreset)
          HudItem(
            label: L.t('label_level_short'),
            value: '${playing ? _runLevel : _ladder.level}',
            icon: Icons.flag_outlined,
          ),
        if (playing)
          HudItem(
            label: L.t('hud_correct'),
            value:
                '${run.attempts.where((a) => a.solved).length}/${run.attempts.length}',
            icon: Icons.check_circle_outline,
          ),
      ],
      field: (context, h) => switch (_phase) {
        _Phase.config => _config(),
        _Phase.playing => run == null ? const SizedBox.shrink() : _play(run, h),
        _Phase.done => _result(),
      },
      pauseActions: [
        if (playing)
          PauseAction(
            label: L.t('restart'),
            icon: Icons.refresh,
            onPressed: _start,
          ),
      ],
    );
  }

  Widget _config() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          L.t('drAbout'),
          key: const Key('dr-about'),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        FilledButton(
          key: const Key('dr-start'),
          onPressed: _start,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: Text(L.t('start')),
        ),
        const SizedBox(height: 16),
        Text(
          L.t('draughtsComboDesc'),
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    ),
  );

  Widget _play(ComboRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    String verdictText() => switch (verdict) {
      null => run.waitingReply ? L.t('drOpponent') : ' ',
      ComboVerdict2.solved => '✓',
      ComboVerdict2.wrong => L.t('drWrong'),
      ComboVerdict2.timeout => L.t('timeIsUp'),
    };
    return LayoutBuilder(
      builder: (context, box) {
        final side = min(box.maxWidth - 16, fieldHeight - 200).clamp(
          120.0,
          440.0,
        );
        return Column(
          children: [
            Text(
              L.f('drRule', {
                'n': '${run.puzzle.whiteMoves}',
                'gain': '${run.puzzle.gain}',
              }),
              key: const Key('dr-rule'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: side,
              child: LinearProgressIndicator(
                key: const Key('dr-time'),
                value: (left / comboSeconds).clamp(0.0, 1.0),
                minHeight: 8,
                color: left < comboSeconds * 0.25
                    ? scheme.error
                    : scheme.primary,
              ),
            ),
            Text(
              '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length} · ${L.f('drGain', {'n': '${run.gainNow}'})}',
              key: const Key('dr-count'),
            ),
            const SizedBox(height: 6),
            DraughtsBoardView(
              position: run.position,
              side: side,
              selected: run.selected,
              targets: run.targets,
              lastMove: run.lastMove,
              hint: run.hintCell,
              onTap: (c) => setState(() => run.tap(c)),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                if (verdict == ComboVerdict2.wrong)
                  FilledButton.icon(
                    key: const Key('dr-restart'),
                    onPressed: () => setState(run.restart),
                    icon: const Icon(Icons.refresh),
                    label: Text(L.t('restart')),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(130, 48),
                    ),
                  ),
                if (verdict == null && left <= comboSeconds / 2)
                  run.hinted
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            L.t('hintUsed'),
                            key: const Key('dr-hint-used'),
                          ),
                        )
                      : OutlinedButton(
                          key: const Key('dr-hint'),
                          onPressed: () => setState(run.takeHint),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(110, 48),
                          ),
                          child: Text(L.t('btn_hint')),
                        ),
              ],
            ),
            Text(
              verdictText(),
              key: const Key('dr-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: verdict == null
                    ? null
                    : verdict == ComboVerdict2.solved
                    ? Colors.green.shade700
                    : scheme.error,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _result() {
    final r = _last;
    if (r == null) return const SizedBox.shrink();
    final up = r.passed && !GamePreset.isPreset;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${L.t('hud_correct')}: ${r.solved}/${r.total}',
            key: const Key('dr-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('dr-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('dr-next'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(
              up
                  ? '${L.t('nextLabel')} · ${L.t('label_level_short')} ${_ladder.level}'
                  : L.t('restart'),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('dr-menu'),
            onPressed: () => setState(() => _phase = _Phase.config),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(L.t('mode')),
          ),
        ],
      ),
    );
  }
}

/// Доска русских шашек 8×8: шашки — кружки, дамка — с короной из значка Material
/// (не знаком Юникода: на телефоне они рисуются пустыми квадратами).
class DraughtsBoardView extends StatelessWidget {
  const DraughtsBoardView({
    super.key,
    required this.position,
    required this.side,
    this.selected,
    this.targets = const {},
    this.lastMove,
    this.hint,
    this.onTap,
  });

  final DraughtsPosition position;
  final double side;
  final int? selected;
  final Set<int> targets;
  final DraughtsMove? lastMove;
  final int? hint;
  final void Function(int cell)? onTap;

  @override
  Widget build(BuildContext context) {
    final size = side / 8;
    final trail = {...?lastMove?.path};
    final taken = {...?lastMove?.captures};
    return SizedBox(
      key: const Key('dr-board'),
      width: side,
      height: side,
      child: Column(
        children: [
          for (var r = 0; r < 8; r++)
            Row(
              children: [
                for (var c = 0; c < 8; c++)
                  _cell(r * 8 + c, size, trail, taken),
              ],
            ),
        ],
      ),
    );
  }

  Widget _cell(int sq, double size, Set<int> trail, Set<int> taken) {
    final dark = (sq ~/ 8 + sq % 8).isOdd;
    final piece = position.cells[sq];
    Color? outline;
    if (sq == hint) {
      outline = const Color(0xFFE0A800);
    } else if (sq == selected) {
      outline = const Color(0xFF2E7D32);
    } else if (trail.contains(sq)) {
      outline = const Color(0x99E0A800);
    }
    return GestureDetector(
      key: Key('dr-$sq'),
      onTap: onTap == null ? null : () => onTap!(sq),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: dark ? const Color(0xFF8B5A2B) : const Color(0xFFF0D9B5),
          border: outline == null
              ? null
              : Border.all(color: outline, width: max(2, size * 0.07)),
        ),
        alignment: Alignment.center,
        child: piece != 0
            ? Container(
                key: Key('dr-piece-$sq'),
                width: size * 0.78,
                height: size * 0.78,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: piece > 0
                      ? const Color(0xFFF7F3E8)
                      : const Color(0xFF222222),
                  border: Border.all(
                    color: piece > 0
                        ? const Color(0xFF8A7F6A)
                        : const Color(0xFF000000),
                    width: max(1.5, size * 0.04),
                  ),
                ),
                child: piece.abs() == 2
                    ? Icon(
                        Icons.workspace_premium,
                        size: size * 0.48,
                        color: piece > 0
                            ? const Color(0xFFB8860B)
                            : const Color(0xFFFFD54F),
                      )
                    : null,
              )
            : taken.contains(sq)
            ? Icon(Icons.close, size: size * 0.4, color: Colors.white54)
            : targets.contains(sq)
            ? Container(
                width: size * 0.26,
                height: size * 0.26,
                decoration: const BoxDecoration(
                  color: Color(0x99FFFFFF),
                  shape: BoxShape.circle,
                ),
              )
            : null,
      ),
    );
  }
}
