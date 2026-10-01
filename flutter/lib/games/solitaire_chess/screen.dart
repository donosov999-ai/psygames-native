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
import '../chess_common/board.dart';
import 'game.dart';
import 'ladder.dart';
import 'lesson.dart';
import 'puzzle.dart';

/// Ключи экрана — списком, чтобы сборщик словаря их видел.
const solitaireScreenKeys = <String>[
  'solitaireChess',
  'solitaireChessDesc',
  'solRule',
  'solPieces',
  'solStuck',
  'solClean',
];

/// Трудность в отчёте словом — как у остальных игр раздела.
String solitaireDifficulty(int level) => level <= 8
    ? 'easy'
    : level <= 16
    ? 'medium'
    : 'hard';

/// ЭКРАН «ШАХМАТНОГО ПАСЬЯНСА» на общем каркасе.
///
/// Тонкий, как «Найди ход»: всё, что засчитывается, — в `game.dart` и закрыто пробами
/// без пикселей; здесь настройка, показ, касания и итог. Часы — игровые
/// (`lib/shell/game_clock.dart`): стоят под паузой, разбором и в фоне.
class SolitaireChessScreen extends StatefulWidget {
  const SolitaireChessScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
  });

  final SharedState state;

  /// Пробы подают корпус сами.
  final SolitaireCorpus? corpus;

  /// Пробы: поддельные часы, мс.
  final int Function()? clock;

  /// Пробы: повторимый подход.
  final int? seed;

  @override
  State<SolitaireChessScreen> createState() => _SolitaireChessScreenState();
}

enum _Phase { config, playing, done }

class _SolitaireChessScreenState extends State<SolitaireChessScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'solitaire_chess',
    store: SharedLevelStore(widget.state),
    maxLevel: solitaireLevels,
  );
  GameTimer? _ticker;
  SolitaireCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;
  SolitaireRun? _run;
  int _runLevel = 1;
  SolitaireResult? _last;
  int _starts = 0;

  // Игровые часы: стоят под паузой, разбором и в фоне.
  int _now() => widget.clock?.call() ?? gameNow();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await _ladder.load();
      final corpus = widget.corpus ?? await SolitaireCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('solitaireChess')}: $e");
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
    final deck = solitaireDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    setState(() {
      _run = SolitaireRun(level: level, deck: deck, now: _now);
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

  Future<void> _complete(SolitaireResult r) async {
    final level = _runLevel;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final details = <String, Object?>{
      'level': level,
      'solved': r.solved,
      'clean': r.clean,
      'restarts': [for (final a in r.attempts) a.restarts],
      'hints': r.attempts.where((a) => a.hinted).length,
      'puzzles': [for (final a in r.attempts) a.puzzle.id],
      'pieces': solitaireStep(level).pieces,
      'band': solitaireStep(level).band,
    };
    setState(() {
      _last = r;
      _phase = _Phase.done;
    });
    final args = (
      score: r.solved,
      timeSeconds: seconds,
      errors: r.total - r.solved,
      mode: 'levels',
      difficulty: solitaireDifficulty(level),
    );
    if (r.passed) {
      await _ladder.win(
        score: args.score,
        timeSeconds: args.timeSeconds,
        errors: args.errors,
        mode: args.mode,
        difficulty: args.difficulty,
        details: details,
      );
    } else if (r.failed) {
      await _ladder.fail(
        score: args.score,
        timeSeconds: args.timeSeconds,
        errors: args.errors,
        mode: args.mode,
        difficulty: args.difficulty,
        details: details,
      );
    } else {
      await SessionReport.send(
        gameType: 'solitaire_chess',
        score: args.score,
        timeSeconds: args.timeSeconds,
        errors: args.errors,
        mode: args.mode,
        difficulty: args.difficulty,
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  /// 🔴 РАЗБОР — ДО ПАРТИИ: кнопка стоит сразу, доски — те же, что раздаст «Начать».
  Future<void> _openLesson() async {
    final corpus = _corpus ?? await SolitaireCorpus.load();
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladder.level;
    final steps = solitaireLessonForLevel(
      corpus,
      level,
      seed: widget.seed ?? level * 131 + _starts,
    );
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('solitaireChess'),
          steps: steps,
          board: (context, side, shown) {
            final frame =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as SolitaireLessonFrame;
            return Center(
              child: SolitaireLessonBoard(frame: frame, side: side),
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
        title: L.t('solitaireChess'),
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
      title: L.t('solitaireChess'),
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

  Widget _config() {
    final step = solitaireStep(_ladder.level);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            L.t('solitaireChessDesc'),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Text(
            L.f('solPieces', {'n': '${step.pieces}'}),
            key: const Key('sol-pieces'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('sol-start'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(L.t('start')),
          ),
        ],
      ),
    );
  }

  Widget _play(SolitaireRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    final last = run.lastCapture;
    String verdictText() => switch (verdict) {
      null => ' ',
      SolitaireVerdict.solved => '✓',
      SolitaireVerdict.stuck => L.t('solStuck'),
      SolitaireVerdict.timeout => L.t('timeIsUp'),
    };

    return LayoutBuilder(
      builder: (context, box) {
        // Сторона доски — от высоты поля за вычетом строк правила, времени,
        // кнопок и вердикта; и не шире поля.
        final side = min(
          box.maxWidth - 16,
          fieldHeight - 210,
        ).clamp(120.0, 440.0);
        return Column(
          children: [
            Text(
              L.t('solRule'),
              key: const Key('sol-rule'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: side,
              child: LinearProgressIndicator(
                key: const Key('sol-time'),
                value: (left / solitaireSeconds).clamp(0.0, 1.0),
                minHeight: 8,
                color: left < solitaireSeconds * 0.25
                    ? scheme.error
                    : scheme.primary,
              ),
            ),
            Text(
              '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length} · ${L.f('solPieces', {'n': '${run.board.count}'})}',
              key: const Key('sol-count'),
            ),
            const SizedBox(height: 6),
            SolitaireBoardView(
              board: run.board,
              side: side,
              keyPrefix: 'sol',
              onTapSquare: (i) => setState(() => run.tap(i)),
              selected: run.selected,
              targets: run.targets.toSet(),
              hinted: run.hintSquare,
              outlines: {
                if (last != null) ...{
                  last.$1: const Color(0xFFE0A800),
                  last.$2: const Color(0xFFE0A800),
                },
              },
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                if (verdict == SolitaireVerdict.stuck)
                  FilledButton.icon(
                    key: const Key('sol-restart'),
                    onPressed: () => setState(run.restart),
                    icon: const Icon(Icons.refresh),
                    label: Text(L.t('restart')),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(130, 48),
                    ),
                  ),
                if (verdict == null && left <= solitaireSeconds / 2)
                  run.hinted
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            L.t('hintUsed'),
                            key: const Key('sol-hint-used'),
                          ),
                        )
                      : OutlinedButton(
                          key: const Key('sol-hint'),
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
              key: const Key('sol-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: verdict == null
                    ? null
                    : verdict == SolitaireVerdict.solved
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
            key: const Key('sol-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('sol-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('sol-next'),
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
            key: const Key('sol-menu'),
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

/// Доска пасьянса — общая доска раздела, 4×4, фигуры одного цвета (цвета в игре нет).
class SolitaireBoardView extends StatelessWidget {
  const SolitaireBoardView({
    super.key,
    required this.board,
    required this.side,
    required this.keyPrefix,
    this.onTapSquare,
    this.selected,
    this.targets = const <int>{},
    this.hinted,
    this.outlines = const <int, Color>{},
  });

  final SolitaireBoard board;
  final double side;
  final String keyPrefix;
  final void Function(int square)? onTapSquare;
  final int? selected;
  final Set<int> targets;
  final int? hinted;
  final Map<int, Color> outlines;

  @override
  Widget build(BuildContext context) => ChessBoardView(
    pieces: {
      for (final e in board.cells.entries)
        e.key: BoardPiece(e.value, white: true),
    },
    side: side,
    dim: board.dim,
    keyPrefix: keyPrefix,
    cornerCoords: true,
    onTapSquare: onTapSquare,
    selected: selected,
    targets: targets,
    hinted: hinted,
    outlines: outlines,
  );
}

/// Доска шага разбора — та же доска партии, со взятием шага.
class SolitaireLessonBoard extends StatelessWidget {
  const SolitaireLessonBoard({
    super.key,
    required this.frame,
    required this.side,
  });

  final SolitaireLessonFrame frame;
  final double side;

  @override
  Widget build(BuildContext context) => SolitaireBoardView(
    board: SolitaireBoard.parse(frame.code),
    side: side,
    keyPrefix: 'soll',
    selected: frame.from,
    targets: {?frame.to},
  );
}
