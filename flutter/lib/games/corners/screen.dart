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
import 'game.dart';
import 'ladder.dart';
import 'lesson.dart';

String cornersDifficulty(int level) => level <= 8
    ? 'easy'
    : level <= 16
    ? 'medium'
    : 'hard';

/// ЭКРАН «УГОЛКОВ» на общем каркасе — тонкий, как у «Шашек»: всё, что засчитывается,
/// — в `game.dart` и закрыто пробами без пикселей; правила — в `rules.dart`.
class CornersScreen extends StatefulWidget {
  const CornersScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
  });

  final SharedState state;
  final CornersCorpus? corpus;
  final int Function()? clock;
  final int? seed;

  @override
  State<CornersScreen> createState() => _CornersScreenState();
}

enum _Phase { config, playing, done }

class _CornersScreenState extends State<CornersScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'corners',
    store: SharedLevelStore(widget.state),
    maxLevel: cornersLevels,
  );
  GameTimer? _ticker;
  CornersCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;
  CornersRun? _run;

  /// Пробе: текущий подход, чтобы решать касаниями.
  @visibleForTesting
  CornersRun? get debugRun => _run;
  int _runLevel = 1;
  CornersResult? _last;
  int _starts = 0;

  /// Ответ «Где ошибка?» для текущей задачи (null — не спрашивали).
  String? _mistake;

  int _now() => widget.clock?.call() ?? gameNow();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await _ladder.load();
      final corpus = widget.corpus ?? await CornersCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('corners')}: $e");
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
    final deck = cornersDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    setState(() {
      _run = CornersRun(level: level, deck: deck, now: _now);
      _runLevel = level;
      _phase = _Phase.playing;
      _mistake = null;
    });
    _ticker?.cancel();
    _ticker = gameInterval(const Duration(milliseconds: 100), _tick);
  }

  void _tick() {
    if (!mounted) return;
    final run = _run;
    if (run == null) return;
    final step = run.step;
    run.tick();
    if (run.step != step) _mistake = null;
    if (run.finished) {
      _ticker?.cancel();
      _complete(run.result!);
      return;
    }
    setState(() {});
  }

  Future<void> _complete(CornersResult r) async {
    final level = _runLevel;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final step = cornersStep(level);
    final details = <String, Object?>{
      'level': level,
      'solved': r.solved,
      'clean': r.clean,
      'moves': [for (final a in r.attempts) a.moves],
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
    final difficulty = cornersDifficulty(level);
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
        gameType: 'corners',
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
    final corpus = _corpus ?? await CornersCorpus.load();
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladder.level;
    final seed = widget.seed ?? level * 131 + _starts;
    final deck = cornersDeckFor(corpus, level, seed: seed, count: 1);
    final steps = cornersLessonForLevel(corpus, level, seed: seed);
    if (steps.isEmpty || deck.isEmpty) return;
    final puzzle = deck.first;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('corners'),
          steps: steps,
          board: (context, side, shown) {
            final f =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as CnLessonFrame;
            return Center(
              child: CornersBoardView(
                puzzle: puzzle,
                pieces: f.pieces,
                side: side,
                lastMove: f.move,
              ),
            );
          },
        ),
      ),
    );
  }

  void _whereMistake(CornersRun run) {
    final at = run.firstMistake();
    setState(() {
      _mistake = at == null
          ? L.t('kqNoMistake')
          : at < 0
          ? L.t('kqMistakeUnknown')
          : at == 0
          ? L.t('cnTooFew')
          : L.f('cnMistake', {'n': '$at'});
    });
  }

  @override
  Widget build(BuildContext context) {
    final corpus = _corpus;
    if (corpus == null) {
      return GameShell(
        title: L.t('corners'),
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
      title: L.t('corners'),
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
          L.t('cnAbout'),
          key: const Key('cn-about'),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        FilledButton(
          key: const Key('cn-start'),
          onPressed: _start,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: Text(L.t('start')),
        ),
        const SizedBox(height: 16),
        Text(L.t('cornersDesc'), style: Theme.of(context).textTheme.bodyMedium),
      ],
    ),
  );

  Widget _play(CornersRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    final out = verdict == CornersVerdict2.outOfMoves;
    String verdictText() => switch (verdict) {
      null => run.hintFailed ? L.t('cnHintNone') : ' ',
      CornersVerdict2.solved => '✓',
      CornersVerdict2.outOfMoves => L.t('cnOut'),
      CornersVerdict2.timeout => L.t('timeIsUp'),
    };
    return LayoutBuilder(
      builder: (context, box) {
        // Ходы кончились — снизу второй ряд кнопок («Где ошибка?», «Дальше»): доска
        // уступает ему место, касаться её в этом состоянии не нужно (замер 320×568).
        final side = min(
          box.maxWidth - 16,
          fieldHeight - (out ? 330 : 232),
        ).clamp(120.0, 440.0);
        // Прокрутка — страховка для самых маленьких экранов: кнопки «Где ошибка?» и
        // «Дальше» не должны оказаться за краем поля.
        return SingleChildScrollView(
          child: Column(
            children: [
              Text(
                L.f('cnRule', {'n': '${run.limit}'}),
                key: const Key('cn-rule'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: side,
                child: LinearProgressIndicator(
                  key: const Key('cn-time'),
                  value: (left / cornersSeconds).clamp(0.0, 1.0),
                  minHeight: 8,
                  color: left < cornersSeconds * 0.25
                      ? scheme.error
                      : scheme.primary,
                ),
              ),
              Text(
                '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length} · ${L.f('cnMoves', {'n': '${run.history.length}', 'max': '${run.limit}'})}',
                key: const Key('cn-count'),
              ),
              const SizedBox(height: 6),
              CornersBoardView(
                puzzle: run.puzzle,
                pieces: run.pieces,
                side: side,
                selected: run.selected,
                targets: run.targets,
                lastMove: run.history.isEmpty ? null : run.history.last,
                hint: run.hint,
                onTap: (c) => setState(() => run.tap(c)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  if (verdict == null || out)
                    OutlinedButton(
                      key: const Key('cn-undo'),
                      onPressed: run.history.isEmpty
                          ? null
                          : () => setState(() {
                              run.undo();
                              _mistake = null;
                            }),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(100, 48),
                      ),
                      child: Text(L.t('btn_undo')),
                    ),
                  if (verdict == null || out)
                    OutlinedButton(
                      key: const Key('cn-restart'),
                      onPressed: () => setState(() {
                        run.restart();
                        _mistake = null;
                      }),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(100, 48),
                      ),
                      child: Text(L.t('restart')),
                    ),
                  if (out)
                    FilledButton(
                      key: const Key('cn-where'),
                      onPressed: () => _whereMistake(run),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(120, 48),
                      ),
                      child: Text(L.t('puzzleWhereError')),
                    ),
                  if (out)
                    TextButton(
                      key: const Key('cn-next'),
                      onPressed: () => setState(run.giveUp),
                      child: Text(L.t('eyeStereoNext')),
                    ),
                  if (verdict == null && left <= cornersSeconds / 2)
                    run.hinted
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              L.t('hintUsed'),
                              key: const Key('cn-hint-used'),
                            ),
                          )
                        : OutlinedButton(
                            key: const Key('cn-hint'),
                            onPressed: () => setState(run.takeHint),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(110, 48),
                            ),
                            child: Text(L.t('btn_hint')),
                          ),
                ],
              ),
              Text(
                _mistake ?? verdictText(),
                key: const Key('cn-verdict'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: verdict == null && _mistake == null
                      ? null
                      : verdict == CornersVerdict2.solved
                      ? Colors.green.shade700
                      : scheme.error,
                ),
              ),
            ],
          ),
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
            key: const Key('cn-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('cn-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('cn-again'),
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
            key: const Key('cn-menu'),
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

/// Доска «Уголков»: свои фишки — светлые кружки, камни соперника — тёмные, клетки
/// цели — подсвечены, ход — след от «откуда» к «куда», подсказка — золотая рамка.
class CornersBoardView extends StatelessWidget {
  const CornersBoardView({
    super.key,
    required this.puzzle,
    required this.pieces,
    required this.side,
    this.selected,
    this.targets = const {},
    this.lastMove,
    this.hint,
    this.onTap,
  });

  final CornersPuzzle puzzle;
  final int pieces;
  final double side;
  final int? selected;
  final Set<int> targets;
  final (int, int)? lastMove;
  final (int, int)? hint;
  final void Function(int cell)? onTap;

  @override
  Widget build(BuildContext context) {
    final n = puzzle.size;
    final size = side / n;
    return SizedBox(
      key: const Key('cn-board'),
      width: side,
      height: side,
      child: Column(
        children: [
          for (var r = 0; r < n; r++)
            Row(children: [for (var c = 0; c < n; c++) _cell(r * n + c, size)]),
        ],
      ),
    );
  }

  Widget _cell(int sq, double size) {
    final n = puzzle.size;
    final dark = (sq ~/ n + sq % n).isOdd;
    final mine = pieces >> sq & 1 == 1;
    final stone = puzzle.stones.contains(sq);
    final goal = puzzle.targetCells.contains(sq);
    Color? outline;
    if (hint != null && (sq == hint!.$1 || sq == hint!.$2)) {
      outline = const Color(0xFFE0A800);
    } else if (sq == selected) {
      outline = const Color(0xFF2E7D32);
    } else if (lastMove != null && (sq == lastMove!.$1 || sq == lastMove!.$2)) {
      outline = const Color(0x99E0A800);
    }
    final base = dark ? const Color(0xFFB58863) : const Color(0xFFF0D9B5);
    return GestureDetector(
      key: Key('cn-$sq'),
      onTap: onTap == null ? null : () => onTap!(sq),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: goal ? Color.alphaBlend(const Color(0x5543A047), base) : base,
          border: outline == null
              ? null
              : Border.all(color: outline, width: max(2, size * 0.07)),
        ),
        alignment: Alignment.center,
        child: mine || stone
            ? Container(
                key: Key(mine ? 'cn-piece-$sq' : 'cn-stone-$sq'),
                width: size * 0.74,
                height: size * 0.74,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: mine
                      ? const Color(0xFFF7F3E8)
                      : const Color(0xFF2B2B2B),
                  border: Border.all(
                    color: mine ? const Color(0xFF8A7F6A) : Colors.black,
                    width: max(1.5, size * 0.04),
                  ),
                ),
              )
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
