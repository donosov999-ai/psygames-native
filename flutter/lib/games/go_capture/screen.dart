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
import 'rules.dart';

/// Ключи, которые экран зовёт выбором по режиму (`L.t(life ? … : …)`). Сборщик словаря
/// (`tools/embed-l10n.mjs`) видит только литерал в вызове или список `…Keys`: без этого
/// списка экран показал бы сам ключ (замер 02.10 на эмуляторе: «gcAbout» на настройке).
const gcScreenKeys = <String>[
  'gcAbout',
  'glAbout',
  'gcRule',
  'glRule',
  'gcWrong',
  'glWrong',
];

String goCaptureDifficulty(int level) => level <= 6
    ? 'easy'
    : level <= 15
    ? 'medium'
    : 'hard';

/// ЭКРАН «ГО» на общем каркасе — тонкий, как у «Уголков»: всё, что засчитывается, —
/// в `game.dart` и закрыто пробами без пикселей; правила и решатели — в `rules.dart`
/// (захват) и `life.dart` (жизнь). Два режима, у каждого своя лестница — как у «Коня
/// и ферзей».
class GoCaptureScreen extends StatefulWidget {
  const GoCaptureScreen({
    super.key,
    required this.state,
    this.corpus,
    this.lifeCorpus,
    this.clock,
    this.seed,
    this.initialMode = GcMode.capture,
  });

  final SharedState state;
  final GoCaptureCorpus? corpus;
  final GoCaptureCorpus? lifeCorpus;
  final GcMode initialMode;
  final int Function()? clock;
  final int? seed;

  @override
  State<GoCaptureScreen> createState() => _GoCaptureScreenState();
}

enum _Phase { config, playing, done }

class _GoCaptureScreenState extends State<GoCaptureScreen> {
  late GcMode _mode = widget.initialMode;
  late final Map<GcMode, LevelLadder> _ladders = {
    for (final m in GcMode.values)
      m: LevelLadder(
        gameId: m == GcMode.capture ? 'go-capture' : 'go-life',
        store: SharedLevelStore(widget.state),
        maxLevel: goCaptureLevels,
      ),
  };
  LevelLadder get _ladder => _ladders[_mode]!;
  GameTimer? _ticker;
  final Map<GcMode, GoCaptureCorpus> _corpora = {};
  GoCaptureCorpus? get _corpus => _corpora[_mode];
  String? _error;
  _Phase _phase = _Phase.config;
  GoCaptureRun? _run;

  /// Пробе: текущий подход, чтобы решать касаниями.
  @visibleForTesting
  GoCaptureRun? get debugRun => _run;
  int _runLevel = 1;
  GoCaptureResult? _last;
  int _starts = 0;

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
      final capture = widget.corpus ?? await GoCaptureCorpus.load();
      final life =
          widget.lifeCorpus ?? await GoCaptureCorpus.load(GcMode.life);
      if (!mounted) return;
      setState(() {
        _corpora[GcMode.capture] = capture;
        _corpora[GcMode.life] = life;
      });
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('goCapture')}: $e");
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
    final deck = goCaptureDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    setState(() {
      _run = GoCaptureRun(level: level, deck: deck, now: _now, mode: _mode);
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

  Future<void> _complete(GoCaptureResult r) async {
    final level = _runLevel;
    final mode = _run?.mode ?? _mode;
    final ladder = _ladders[mode]!;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final step = goCaptureStep(level);
    final details = <String, Object?>{
      'level': level,
      'solved': r.solved,
      'clean': r.clean,
      'retries': [for (final a in r.attempts) a.retries],
      'hints': r.attempts.where((a) => a.hinted).length,
      'puzzles': [for (final a in r.attempts) a.puzzleId],
      'group': step.group,
      'band': step.band,
      'mode': mode.name,
    };
    setState(() {
      _last = r;
      _phase = _Phase.done;
    });
    final difficulty = goCaptureDifficulty(level);
    if (r.passed) {
      await ladder.win(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: mode.name,
        difficulty: difficulty,
        details: details,
      );
    } else if (r.failed) {
      await ladder.fail(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: mode.name,
        difficulty: difficulty,
        details: details,
      );
    } else {
      await SessionReport.send(
        gameType: 'go-capture',
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: mode.name,
        difficulty: difficulty,
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  Future<void> _openLesson() async {
    final mode = _phase == _Phase.playing ? (_run?.mode ?? _mode) : _mode;
    final corpus = _corpora[mode] ?? await GoCaptureCorpus.load(mode);
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladders[mode]!.level;
    final seed = widget.seed ?? level * 131 + _starts;
    final deck = goCaptureDeckFor(corpus, level, seed: seed, count: 1);
    final steps = goLessonForLevel(corpus, level, mode, seed: seed);
    final mine = mode == GcMode.life ? goBlack : goWhite;
    if (steps.isEmpty || deck.isEmpty) return;
    final puzzle = deck.first;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('goCapture'),
          steps: steps,
          board: (context, side, shown) {
            final f =
                steps[shown.clamp(0, steps.length - 1)].payload
                    as GcLessonFrame;
            return Center(
              child: GoBoardView(
                position: f.position,
                side: side,
                target: f.position.at(puzzle.target) == mine
                    ? f.position.group(puzzle.target).stones
                    : const {},
                targetRing: _ringFor(mode),
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
        title: L.t('goCapture'),
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
      title: L.t('goCapture'),
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

  static Color _ringFor(GcMode mode) =>
      mode == GcMode.life ? const Color(0xFF1E88E5) : const Color(0xFFD32F2F);

  Widget _config() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<GcMode>(
          key: const Key('gc-mode'),
          segments: [
            ButtonSegment(
              value: GcMode.capture,
              label: Text(L.t('gcModeCapture'), key: const Key('gc-mode-capture')),
            ),
            ButtonSegment(
              value: GcMode.life,
              label: Text(L.t('gcModeLife'), key: const Key('gc-mode-life')),
            ),
          ],
          selected: {_mode},
          onSelectionChanged: (v) => setState(() => _mode = v.first),
        ),
        // «Старт» — сразу под режимом: правила длинные, и на 320×568 под ними кнопка
        // уезжала за край (замер 02.10, когда ключ правил впервые дошёл до словаря).
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('gc-start'),
          onPressed: _start,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: Text(L.t('start')),
        ),
        const SizedBox(height: 16),
        Text(
          L.t(_mode == GcMode.capture ? 'gcAbout' : 'glAbout'),
          key: const Key('gc-about'),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Text(L.t('goCaptureDesc'), style: Theme.of(context).textTheme.bodyMedium),
      ],
    ),
  );

  Widget _play(GoCaptureRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    final wrong = verdict == GoCaptureVerdict.wrong;
    final life = run.mode == GcMode.life;
    String verdictText() => switch (verdict) {
      null => run.refusal == 'ko'
          ? L.t('gcKo')
          : run.refusal == 'suicide'
          ? L.t('gcSuicide')
          : run.waitingReply
          ? L.t('gcWhiteThinks')
          : ' ',
      GoCaptureVerdict.solved => '✓',
      GoCaptureVerdict.wrong => L.t(life ? 'glWrong' : 'gcWrong'),
      GoCaptureVerdict.timeout => L.t('timeIsUp'),
    };
    return LayoutBuilder(
      builder: (context, box) {
        // Подписи — не длиннее двух строк, под доской — один ряд кнопок («Заново» с
        // подсказкой или с «Дальше»): запас 182 по замеру 320×568, где пункт 9×9 при
        // запасе 232 выходил 27 px, а кнопки «так не взять» уезжали за край.
        final side = min(box.maxWidth - 16, fieldHeight - 182).clamp(120.0, 440.0);
        return SingleChildScrollView(
          child: Column(
            children: [
              Text(
                L.f(life ? 'glRule' : 'gcRule', {'n': '${run.puzzle.moves}'}),
                key: const Key('gc-rule'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: side,
                child: LinearProgressIndicator(
                  key: const Key('gc-time'),
                  value: (left / goCaptureSeconds).clamp(0.0, 1.0),
                  minHeight: 8,
                  color: left < goCaptureSeconds * 0.25
                      ? scheme.error
                      : scheme.primary,
                ),
              ),
              Text(
                '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length} · ${L.f('cnMoves', {'n': '${run.made}', 'max': '${run.puzzle.moves}'})}',
                key: const Key('gc-count'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 6),
              GoBoardView(
                position: run.position,
                side: side,
                target: run.targetStones,
                targetRing: _ringFor(run.mode),
                lastMove: run.lastMove,
                hint: run.hintPoint,
                onTap: (p) => setState(() => run.tap(p)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  if (verdict == null || wrong)
                    OutlinedButton(
                      key: const Key('gc-restart'),
                      onPressed: run.made == 0 && !wrong
                          ? null
                          : () => setState(run.restart),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(100, 48),
                      ),
                      child: Text(L.t('restart')),
                    ),
                  if (wrong)
                    TextButton(
                      key: const Key('gc-next'),
                      onPressed: () => setState(run.giveUp),
                      child: Text(L.t('eyeStereoNext')),
                    ),
                  if (verdict == null && left <= goCaptureSeconds / 2)
                    run.hinted
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              L.t('hintUsed'),
                              key: const Key('gc-hint-used'),
                            ),
                          )
                        : OutlinedButton(
                            key: const Key('gc-hint'),
                            onPressed: run.canHint
                                ? () => setState(run.takeHint)
                                : null,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(110, 48),
                            ),
                            child: Text(L.t('btn_hint')),
                          ),
                ],
              ),
              Text(
                verdictText(),
                key: const Key('gc-verdict'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: verdict == null
                      ? (run.refusal == null ? null : scheme.error)
                      : verdict == GoCaptureVerdict.solved
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
            key: const Key('gc-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('gc-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('gc-again'),
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
            key: const Key('gc-menu'),
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

/// Доска го: линии и пункты на пересечениях, камни — чёрные и белые кружки; группа-
/// цель обведена кольцом (захват — красным, жизнь — синим), последний ход — точкой,
/// подсказка — золотым кольцом.
class GoBoardView extends StatelessWidget {
  const GoBoardView({
    super.key,
    required this.position,
    required this.side,
    this.target = const {},
    this.targetRing = const Color(0xFFD32F2F),
    this.lastMove,
    this.hint,
    this.onTap,
  });

  final GoPosition position;
  final double side;
  final Set<int> target;
  final Color targetRing;
  final int? lastMove;
  final int? hint;
  final void Function(int point)? onTap;

  @override
  Widget build(BuildContext context) {
    final n = position.size;
    final cell = side / n;
    return Container(
      key: const Key('gc-board'),
      width: side,
      height: side,
      color: const Color(0xFFDCB35C),
      child: CustomPaint(
        painter: _GoGridPainter(n),
        child: Column(
          children: [
            for (var r = 0; r < n; r++)
              Row(children: [for (var c = 0; c < n; c++) _point(r * n + c, cell)]),
          ],
        ),
      ),
    );
  }

  Widget _point(int p, double cell) {
    final v = position.at(p);
    final stone = v != goEmpty;
    final inTarget = target.contains(p);
    Color? ring;
    if (p == hint) {
      ring = const Color(0xFFE0A800);
    } else if (inTarget) {
      ring = targetRing;
    }
    return GestureDetector(
      key: Key('gc-$p'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap == null ? null : () => onTap!(p),
      child: SizedBox(
        width: cell,
        height: cell,
        child: Center(
          child: stone
              ? Container(
                  key: Key(v == goBlack ? 'gc-black-$p' : 'gc-white-$p'),
                  width: cell * 0.88,
                  height: cell * 0.88,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: v == goBlack
                        ? const Color(0xFF1E1E1E)
                        : const Color(0xFFF7F7F2),
                    border: Border.all(
                      color: ring ??
                          (v == goBlack ? Colors.black : const Color(0xFF777777)),
                      width: ring == null ? max(1.0, cell * 0.03) : max(2.5, cell * 0.09),
                    ),
                  ),
                  alignment: Alignment.center,
                  child: p == lastMove
                      ? Container(
                          width: cell * 0.22,
                          height: cell * 0.22,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: v == goBlack ? Colors.white : Colors.black,
                          ),
                        )
                      : null,
                )
              : ring != null
              ? Container(
                  key: Key('gc-hint-$p'),
                  width: cell * 0.6,
                  height: cell * 0.6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: ring, width: max(2.5, cell * 0.08)),
                  ),
                )
              : null,
        ),
      ),
    );
  }
}

class _GoGridPainter extends CustomPainter {
  _GoGridPainter(this.n);
  final int n;

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / n;
    final half = cell / 2;
    final paint = Paint()
      ..color = const Color(0xFF3A2A10)
      ..strokeWidth = max(1.0, cell * 0.03);
    for (var i = 0; i < n; i++) {
      final at = half + i * cell;
      canvas.drawLine(Offset(half, at), Offset(size.width - half, at), paint);
      canvas.drawLine(Offset(at, half), Offset(at, size.height - half), paint);
    }
  }

  @override
  bool shouldRepaint(_GoGridPainter old) => old.n != n;
}
