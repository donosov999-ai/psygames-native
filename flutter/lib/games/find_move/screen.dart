import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

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
import '../scholars_mate/screen.dart'
    show scholarsPieces, scholarsSquareIndex, scholarsSquareName;
import 'corpus.dart';
import 'game.dart';
import 'ladder.dart';
import 'lesson.dart';

/// Ключи экрана — списком, чтобы сборщик словаря их видел.
const findMoveScreenKeys = <String>[
  'findMove',
  'findMoveDesc',
  'findMoveSeek',
  'findMoveNewThemes',
  'findMoveThemesOpen',
  'findMoveClean',
];

/// Трудность в отчёте словом — как у остальных игр раздела.
String findMoveDifficulty(int level) => level <= 8
    ? 'easy'
    : level <= 16
    ? 'medium'
    : 'hard';

/// ЭКРАН «НАЙДИ ХОД» на общем каркасе.
///
/// Тонкий, как «Детский мат»: всё, что засчитывается, — в `game.dart` и закрыто
/// пробами без пикселей; здесь настройка, показ, касания и итог.
///
/// 🔴 ЧАСЫ СТОЯТ, ПОКА ИГРА НЕ НА ЭКРАНЕ. Пауза, правила и разбор открываются
/// поверх партии; тик останавливает часы, как только маршрут партии перестал
/// быть верхним, — иначе минута в паузе засчиталась бы промахом по времени.
class FindMoveScreen extends StatefulWidget {
  const FindMoveScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
  });

  final SharedState state;

  /// Пробы подают корпус сами (ассет 430 КБ).
  final FindMoveCorpus? corpus;

  /// Пробы: поддельные игровые часы, мс.
  final int Function()? clock;

  /// Пробы: повторимый подход.
  final int? seed;

  @override
  State<FindMoveScreen> createState() => _FindMoveScreenState();
}

enum _Phase { config, playing, done }

class _FindMoveScreenState extends State<FindMoveScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'find_move',
    store: SharedLevelStore(widget.state),
    maxLevel: findMoveLevels,
  );
  final Stopwatch _watch = Stopwatch();
  Timer? _ticker;
  FindMoveCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;
  FindMoveRun? _run;
  int _runLevel = 1;
  FindMoveResult? _last;
  int _starts = 0;

  int _raw() => widget.clock?.call() ?? _watch.elapsedMilliseconds;
  int _pausedTotal = 0;
  int? _pausedSince;
  int _now() {
    final since = _pausedSince;
    return _raw() - _pausedTotal - (since == null ? 0 : _raw() - since);
  }

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await _ladder.load();
      final corpus = widget.corpus ?? await FindMoveCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('findMove')}: $e");
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  int _seed(int level) =>
      widget.seed ?? DateTime.now().millisecondsSinceEpoch % 100000 + _starts;

  void _start() {
    final corpus = _corpus;
    if (corpus == null) return;
    final level = _ladder.level;
    final deck = findMoveDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    _watch
      ..reset()
      ..start();
    _pausedTotal = 0;
    _pausedSince = null;
    setState(() {
      _run = FindMoveRun(level: level, deck: deck, now: _now);
      _runLevel = level;
      _phase = _Phase.playing;
    });
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) => _tick());
  }

  void _tick() {
    if (!mounted) return;
    final onTop = ModalRoute.of(context)?.isCurrent ?? true;
    if (!onTop) {
      _pausedSince ??= _raw();
      return;
    }
    final since = _pausedSince;
    if (since != null) {
      _pausedTotal += _raw() - since;
      _pausedSince = null;
    }
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

  Future<void> _complete(FindMoveResult r) async {
    final level = _runLevel;
    if (!r.touched) {
      // Подход без единого касания не считается: назад в настройку.
      setState(() => _phase = _Phase.config);
      return;
    }
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final details = <String, Object?>{
      'level': level,
      'solved': r.solved,
      'clean': r.clean,
      'hints': r.hints,
      'median_ms': r.medianMs,
      'themes': [for (final a in r.attempts) a.puzzle.themeName],
      'puzzles': [for (final a in r.attempts) a.puzzle.id],
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
      difficulty: findMoveDifficulty(level),
    );
    if (r.clean >= findMovePassClean) {
      await _ladder.win(
        score: args.score,
        timeSeconds: args.timeSeconds,
        errors: args.errors,
        mode: args.mode,
        difficulty: args.difficulty,
        details: details,
      );
    } else if (r.solved <= findMoveFailAtMost) {
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
        gameType: 'find_move',
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

  /// 🔴 РАЗБОР — ДО ПАРТИИ И ДАЖЕ ДО КОРПУСА: кнопка стоит сразу, а разбор сам
  /// дожидается данных. Задачи — те же, что раздаст «Начать» на этой ступени.
  Future<void> _openLesson() async {
    final corpus = _corpus ?? await FindMoveCorpus.load();
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladder.level;
    final steps = findMoveLessonFromDeck(
      findMoveDeckFor(
        corpus,
        level,
        seed: widget.seed ?? level * 131 + _starts,
      ),
    );
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('findMove'),
          steps: steps,
          board: (context, side, shown) {
            final frame =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as FindMoveLessonFrame;
            return Center(
              child: FindMoveLessonBoard(frame: frame, side: side),
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
        title: L.t('findMove'),
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
      title: L.t('findMove'),
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
                '${run.attempts.where((a) => a.correct).length}/${run.attempts.length}',
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
    final level = _ladder.level;
    final step = findMoveStep(level);
    final names = [for (final t in step.themes) L.t(findMoveThemeKeys[t])];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            L.t('findMoveDesc'),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Text(
            step.themeShown
                ? L.t('findMoveNewThemes')
                : L.t('findMoveThemesOpen'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          Text(names.join(' · '), key: const Key('fm-themes')),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('fm-start'),
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

  Widget _play(FindMoveRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final p = run.puzzle;
    final white = run.whiteBottom;
    final theme = L.t(findMoveThemeKeys[p.theme]);
    final left = run.secondsLeft;
    final verdict = run.verdict;
    int? at(String? sq) =>
        sq == null ? null : scholarsSquareIndex(sq, whiteBottom: white);
    final last = run.lastMove;
    String verdictText() {
      if (verdict == null) return ' ';
      if (verdict.ok) return '✓ $theme';
      return '✕ ${verdict.best ?? ''} · $theme';
    }

    return LayoutBuilder(
      builder: (context, box) {
        // Сторона доски — от высоты поля за вычетом строк вопроса, времени,
        // превращения/подсказки и вердикта; и не шире поля.
        final side = min(
          box.maxWidth - 16,
          fieldHeight - 200,
        ).clamp(120.0, 520.0);
        return Column(
          children: [
            Text(
              run.themeShown ? theme : L.t('findMoveSeek'),
              key: const Key('fm-question'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: side,
              child: LinearProgressIndicator(
                key: const Key('fm-time'),
                value: (left / findMoveSeconds).clamp(0.0, 1.0),
                minHeight: 8,
                color: left < findMoveSeconds * 0.25
                    ? scheme.error
                    : scheme.primary,
              ),
            ),
            Text(
              '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length}',
              key: const Key('fm-count'),
            ),
            const SizedBox(height: 6),
            ChessBoardView(
              pieces: scholarsPieces(run.fen, whiteBottom: white),
              side: side,
              keyPrefix: 'fm',
              onTapSquare: (i) => setState(
                () => run.tap(scholarsSquareName(i, whiteBottom: white)),
              ),
              selected: at(run.selected),
              targets: {for (final t in run.targets) ?at(t)},
              hinted: at(run.hintSquare),
              outlines: {
                if (last != null) ...{
                  at(last.substring(0, 2))!: const Color(0xFFE0A800),
                  at(last.substring(2, 4))!: const Color(0xFFE0A800),
                },
              },
            ),
            const SizedBox(height: 8),
            if (run.promotion.isNotEmpty)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (final uci in run.promotion)
                    IconButton(
                      key: Key('fm-promote-${uci.substring(4)}'),
                      iconSize: 40,
                      onPressed: () => setState(() => run.play(uci)),
                      icon: ChessPieceImage(
                        type: uci.substring(4).toUpperCase(),
                        white: white,
                        size: 40,
                      ),
                    ),
                ],
              )
            else if (verdict == null && left <= findMoveSeconds / 2)
              run.hintSquare != null
                  ? Text(L.t('hintUsed'), key: const Key('fm-hint-used'))
                  : OutlinedButton(
                      key: const Key('fm-hint'),
                      onPressed: () => setState(run.takeHint),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(110, 48),
                      ),
                      child: Text(L.t('btn_hint')),
                    ),
            Text(
              verdictText(),
              key: const Key('fm-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: verdict == null
                    ? null
                    : verdict.ok
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
    final up = r.clean >= findMovePassClean && !GamePreset.isPreset;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${L.t('hud_correct')}: ${r.solved}/${r.total}',
            key: const Key('fm-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('findMoveClean', {'n': '${r.clean}'}),
            key: const Key('fm-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('fm-next'),
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
            key: const Key('fm-menu'),
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

/// Доска шага разбора — та же доска партии, с ходом шага.
class FindMoveLessonBoard extends StatelessWidget {
  const FindMoveLessonBoard({
    super.key,
    required this.frame,
    required this.side,
  });

  final FindMoveLessonFrame frame;
  final double side;

  @override
  Widget build(BuildContext context) {
    final white = frame.whiteBottom;
    int? at(String? sq) =>
        sq == null ? null : scholarsSquareIndex(sq, whiteBottom: white);
    return ChessBoardView(
      pieces: scholarsPieces(frame.fen, whiteBottom: white),
      side: side,
      keyPrefix: 'fml',
      selected: at(frame.from),
      targets: {?at(frame.to)},
    );
  }
}
