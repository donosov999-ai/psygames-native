import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson_player.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../chess_common/board.dart';
import 'game.dart';
import 'ladder.dart';
import 'lesson.dart';
import 'queens.dart';
import 'tour.dart';

/// Сложность для отчёта: треть лестницы.
String kqDifficulty(int level) => level <= 8
    ? 'easy'
    : level <= 16
    ? 'medium'
    : 'hard';

/// ЭКРАН «КОНЯ И ФЕРЗЕЙ» на общем каркасе: два режима, у каждого своя лестница.
///
/// Тонкий, как «Шахматный пасьянс»: всё, что засчитывается, — в `game.dart` и
/// закрыто пробами без пикселей. Партия идёт одним типом `knights_queens` с режимом
/// рядом (`queens` / `tour`), уровень хранится у режима свой — как у «Головоломок».
class KnightsQueensScreen extends StatefulWidget {
  const KnightsQueensScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
    this.initialMode = KqMode.queens,
  });

  final SharedState state;
  final KqCorpus? corpus;
  final int Function()? clock;
  final int? seed;
  final KqMode initialMode;

  @override
  State<KnightsQueensScreen> createState() => _KnightsQueensScreenState();
}

enum _Phase { config, playing, done }

class _KnightsQueensScreenState extends State<KnightsQueensScreen> {
  late KqMode _mode = widget.initialMode;
  late final Map<KqMode, LevelLadder> _ladders = {
    for (final m in KqMode.values)
      m: LevelLadder(
        gameId: 'knights_queens_${m.name}',
        store: SharedLevelStore(widget.state),
        maxLevel: kqLevels,
        sessionType: 'knights_queens',
        sessionMode: m.name,
      ),
  };
  GameTimer? _ticker;
  KqCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;
  KqRun? _run;
  int _runLevel = 1;
  KqResult? _last;
  int _starts = 0;

  LevelLadder get _ladder => _ladders[_mode]!;

  // Игровые часы: стоят под паузой, разбором и в фоне.
  int _now() => widget.clock?.call() ?? gameNow();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      for (final l in _ladders.values) {
        await l.load();
      }
      final corpus = widget.corpus ?? await KqCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('knightsQueens')}: $e");
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
    final seed = _seed(level);
    _starts++;
    final KqRun run;
    if (_mode == KqMode.queens) {
      final deck = queensDeckFor(corpus, level, seed: seed);
      if (deck.isEmpty) return;
      run = QueensRun(level: level, deck: deck, now: _now);
    } else {
      final deck = toursDeckFor(corpus, level, seed: seed);
      if (deck.isEmpty) return;
      run = TourRun(level: level, deck: deck, now: _now);
    }
    setState(() {
      _run = run;
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

  Future<void> _complete(KqResult r) async {
    final level = _runLevel;
    final ladder = _ladder;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final step = kqStep(level);
    final details = <String, Object?>{
      'level': level,
      'mode': _mode.name,
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
    final difficulty = kqDifficulty(level);
    if (r.passed) {
      await ladder.win(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: _mode.name,
        difficulty: difficulty,
        details: details,
      );
    } else if (r.failed) {
      await ladder.fail(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: _mode.name,
        difficulty: difficulty,
        details: details,
      );
    } else {
      await SessionReport.send(
        gameType: 'knights_queens',
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: _mode.name,
        difficulty: difficulty,
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  /// 🔴 РАЗБОР — ДО ПАРТИИ: задача — та же, что раздаст «Начать».
  Future<void> _openLesson() async {
    final corpus = _corpus ?? await KqCorpus.load();
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladder.level;
    final steps = kqLessonForLevel(
      corpus,
      _mode,
      level,
      seed: widget.seed ?? level * 131 + _starts,
    );
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('knightsQueens'),
          steps: steps,
          board: (context, side, shown) {
            final frame =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as KqLessonFrame;
            return Center(child: KqLessonBoard(frame: frame, side: side));
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
        title: L.t('knightsQueens'),
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
      title: L.t('knightsQueens'),
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
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Режим и «Начать» — сверху: на 320×568 длинное описание уводило кнопку
          // за край, и игра не начиналась без прокрутки (поймано пробой размера).
          SegmentedButton<KqMode>(
            key: const Key('kq-mode'),
            segments: [
              ButtonSegment(
                value: KqMode.queens,
                label: Text(L.t('kqModeQueens'), key: const Key('kq-mode-queens')),
              ),
              ButtonSegment(
                value: KqMode.tour,
                label: Text(L.t('kqModeTour'), key: const Key('kq-mode-tour')),
              ),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
          const SizedBox(height: 16),
          Text(
            _mode == KqMode.queens ? L.t('kqQueensAbout') : L.t('kqTourAbout'),
            key: const Key('kq-about'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('kq-start'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(L.t('start')),
          ),
          const SizedBox(height: 16),
          Text(
            L.t('knightsQueensDesc'),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }

  Widget _play(KqRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    final queens = run is QueensRun ? run : null;
    final tour = run is TourRun ? run : null;
    String rule() {
      if (queens != null) {
        return L.f('kqQueensRule', {'n': '${queens.board.n}'});
      }
      return tour!.board.end == null
          ? L.t('kqTourRule')
          : L.t('kqTourRuleEnd');
    }

    String count() => queens != null
        ? L.f('kqQueensCount', {
            'k': '${queens.board.queens.length}',
            'n': '${queens.board.n}',
          })
        : L.f('kqTourCount', {
            'k': '${tour!.path.length}',
            'n': '${tour.board.free}',
          });

    String verdictText() => switch (verdict) {
      null => run.mistakeUnknown
          ? L.t('kqMistakeUnknown')
          : run.noMistake
          ? L.t('kqNoMistake')
          : ' ',
      KqVerdict.solved => '✓',
      KqVerdict.stuck =>
        queens != null ? L.t('kqQueensStuck') : L.t('kqTourStuck'),
      KqVerdict.timeout => L.t('timeIsUp'),
    };

    final seconds = run.seconds;
    return LayoutBuilder(
      builder: (context, box) {
        final side = min(box.maxWidth - 16, fieldHeight - 230).clamp(
          120.0,
          440.0,
        );
        return Column(
          children: [
            Text(
              rule(),
              key: const Key('kq-rule'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: side,
              child: LinearProgressIndicator(
                key: const Key('kq-time'),
                value: (left / seconds).clamp(0.0, 1.0),
                minHeight: 8,
                color: left < seconds * 0.25 ? scheme.error : scheme.primary,
              ),
            ),
            Text(
              '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deckLength} · ${count()}',
              key: const Key('kq-count'),
            ),
            const SizedBox(height: 6),
            if (queens != null)
              KqBoardView.queens(
                board: queens.board,
                side: side,
                highlight: queens.highlight,
                hint: queens.hintCell,
                mistake: queens.mistakeCell,
                onTap: (c) => setState(() => queens.tap(c)),
              )
            else
              KqBoardView.tour(
                board: tour!.board,
                path: tour.path,
                side: side,
                targets: tour.targets.toSet(),
                hint: tour.hintCell,
                mistake: tour.mistakeCell,
                onTap: (c) => setState(() => tour.tap(c)),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                if (tour != null && tour.path.length > 1 &&
                    verdict != KqVerdict.solved &&
                    verdict != KqVerdict.timeout)
                  OutlinedButton.icon(
                    key: const Key('kq-undo'),
                    onPressed: () => setState(tour.undo),
                    icon: const Icon(Icons.undo),
                    label: Text(L.t('btn_undo')),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(110, 48),
                    ),
                  ),
                if (verdict == KqVerdict.stuck)
                  FilledButton.icon(
                    key: const Key('kq-restart'),
                    onPressed: () => setState(run.restart),
                    icon: const Icon(Icons.refresh),
                    label: Text(L.t('restart')),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(130, 48),
                    ),
                  ),
                if ((verdict == null || verdict == KqVerdict.stuck) &&
                    (queens?.board.placed.isNotEmpty ??
                        (tour!.path.length > 1)))
                  OutlinedButton(
                    key: const Key('kq-mistake'),
                    onPressed: () => setState(run.whereMistake),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(110, 48),
                    ),
                    child: Text(L.t('puzzleWhereError')),
                  ),
                if (verdict == null && left <= seconds / 2)
                  run.hinted
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            L.t('hintUsed'),
                            key: const Key('kq-hint-used'),
                          ),
                        )
                      : OutlinedButton(
                          key: const Key('kq-hint'),
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
              key: const Key('kq-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: verdict == null
                    ? null
                    : verdict == KqVerdict.solved
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
            key: const Key('kq-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('kq-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('kq-next'),
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
            key: const Key('kq-menu'),
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

/// Доска обоих режимов: R×C клеток (у коня бывает 3×4), фигуры — рисунками из
/// общего набора раздела (`ChessPieceImage`), без знаков U+2654…265F: на телефоне
/// они рисуются пустыми квадратами (память flutter_symbol_glyphs_render_as_empty_boxes).
class KqBoardView extends StatelessWidget {
  const KqBoardView._({
    required this.rows,
    required this.cols,
    required this.side,
    required this.cell,
    this.onTap,
  });

  factory KqBoardView.queens({
    required QueensBoard board,
    required double side,
    bool highlight = false,
    int? hint,
    int? mistake,
    void Function(int cell)? onTap,
  }) {
    final conflicts = board.conflicts;
    final full = board.queens.length == board.n;
    return KqBoardView._(
      rows: board.n,
      cols: board.n,
      side: side,
      onTap: onTap,
      cell: (i, size) => _Cell(
        index: i,
        size: size,
        dark: (i ~/ board.n + i % board.n).isOdd,
        blocked: board.holes.contains(i),
        tinted: highlight && !board.queens.contains(i) && board.attacked(i),
        outline: i == mistake || ((highlight || full) && conflicts.contains(i))
            ? Colors.red
            : i == hint
            ? const Color(0xFFE0A800)
            : null,
        keyName: 'kq-${board.givens.contains(i) ? 'given' : board.placed.contains(i) ? 'queen' : 'sq'}-$i',
        child: board.queens.contains(i)
            ? ChessPieceImage(
                type: 'Q',
                white: !board.givens.contains(i),
                size: size * 0.8,
              )
            : null,
      ),
    );
  }

  factory KqBoardView.tour({
    required TourBoard board,
    required List<int> path,
    required double side,
    Set<int> targets = const {},
    int? hint,
    int? mistake,
    void Function(int cell)? onTap,
  }) {
    final order = {for (var k = 0; k < path.length; k++) path[k]: k + 1};
    return KqBoardView._(
      rows: board.rows,
      cols: board.cols,
      side: side,
      onTap: onTap,
      cell: (i, size) => _Cell(
        index: i,
        size: size,
        dark: (i ~/ board.cols + i % board.cols).isOdd,
        blocked: board.blocked.contains(i),
        dot: targets.contains(i),
        flag: i == board.end && !order.containsKey(i),
        outline: i == mistake
            ? Colors.red
            : i == hint
            ? const Color(0xFFE0A800)
            : null,
        keyName: 'kq-${order.containsKey(i) ? 'seen' : 'sq'}-$i',
        child: i == path.last
            ? ChessPieceImage(type: 'N', white: true, size: size * 0.8)
            : order.containsKey(i)
            ? Text(
                '${order[i]}',
                style: TextStyle(
                  fontSize: size * 0.34,
                  fontWeight: FontWeight.w700,
                  color: Colors.black54,
                ),
              )
            : null,
      ),
    );
  }

  final int rows;
  final int cols;
  final double side;
  final Widget Function(int index, double size) cell;
  final void Function(int cell)? onTap;

  @override
  Widget build(BuildContext context) {
    final size = side / max(rows, cols);
    return SizedBox(
      key: const Key('kq-board'),
      width: size * cols,
      height: size * rows,
      child: Column(
        children: [
          for (var r = 0; r < rows; r++)
            Row(
              children: [
                for (var c = 0; c < cols; c++)
                  GestureDetector(
                    key: Key('kq-${r * cols + c}'),
                    onTap: onTap == null ? null : () => onTap!(r * cols + c),
                    child: cell(r * cols + c, size),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.index,
    required this.size,
    required this.dark,
    required this.keyName,
    this.blocked = false,
    this.tinted = false,
    this.dot = false,
    this.flag = false,
    this.outline,
    this.child,
  });
  final int index;
  final double size;
  final bool dark;
  final String keyName;
  final bool blocked;
  final bool tinted;
  final bool dot;
  final bool flag;
  final Color? outline;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final base = blocked
        ? const Color(0xFF555555)
        : dark
        ? const Color(0xFFB58863)
        : const Color(0xFFF0D9B5);
    return Container(
      key: Key(keyName),
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tinted ? Color.alphaBlend(const Color(0x55D9534F), base) : base,
        border: outline == null
            ? null
            : Border.all(color: outline!, width: max(2, size * 0.07)),
      ),
      alignment: Alignment.center,
      child: blocked
          ? Icon(Icons.close, size: size * 0.5, color: Colors.white54)
          : child ??
                (flag
                    ? Icon(Icons.flag, size: size * 0.55, color: Colors.green.shade800)
                    : dot
                    ? Container(
                        width: size * 0.26,
                        height: size * 0.26,
                        decoration: const BoxDecoration(
                          color: Color(0x99000000),
                          shape: BoxShape.circle,
                        ),
                      )
                    : null),
    );
  }
}

/// Доска шага разбора — та же доска партии.
class KqLessonBoard extends StatelessWidget {
  const KqLessonBoard({super.key, required this.frame, required this.side});
  final KqLessonFrame frame;
  final double side;

  @override
  Widget build(BuildContext context) {
    if (frame.mode == KqMode.queens) {
      final start = QueensBoard.parse(frame.rows, frame.code);
      final placed = [
        for (final m in frame.marks)
          if (!start.givens.contains(m)) m,
      ];
      return KqBoardView.queens(
        board: QueensBoard(
          start.n,
          givens: start.givens,
          holes: start.holes,
          placed: placed,
        ),
        side: side,
        highlight: true,
        hint: frame.focus,
      );
    }
    final board = TourBoard.parse(frame.rows, frame.cols, frame.code);
    return KqBoardView.tour(
      board: board,
      path: frame.marks.isEmpty ? [board.start] : frame.marks,
      side: side,
      hint: frame.focus,
    );
  }
}
