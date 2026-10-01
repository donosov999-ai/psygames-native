import 'dart:math';

import 'package:bishop/bishop.dart' as bishop;
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
import 'mate.dart';
import 'shogi_rules.dart';
import 'view.dart';

String xsDifficulty(int level) => level <= 6
    ? 'easy'
    : level <= 15
    ? 'medium'
    : 'hard';

/// ЭКРАН «СЯНЦИ И СЁГИ» на общем каркасе — тонкий, как у «Го»: всё, что засчитывается,
/// — в `game.dart` и закрыто пробами без пикселей; правила — bishop (сянци) и
/// `shogi_rules.dart`, решатель — `mate.dart`. Два режима, у каждого своя лестница.
class XiangqiShogiScreen extends StatefulWidget {
  const XiangqiShogiScreen({
    super.key,
    required this.state,
    this.xiangqiCorpus,
    this.shogiCorpus,
    this.clock,
    this.seed,
    this.initialMode = XsMode.xiangqi,
  });

  final SharedState state;
  final XsCorpus? xiangqiCorpus;
  final XsCorpus? shogiCorpus;
  final int Function()? clock;
  final int? seed;
  final XsMode initialMode;

  @override
  State<XiangqiShogiScreen> createState() => _XiangqiShogiScreenState();
}

enum _Phase { config, playing, done }

class _XiangqiShogiScreenState extends State<XiangqiShogiScreen> {
  late XsMode _mode = widget.initialMode;
  late final Map<XsMode, LevelLadder> _ladders = {
    for (final m in XsMode.values)
      m: LevelLadder(
        gameId: m == XsMode.xiangqi ? 'xiangqi' : 'shogi',
        store: SharedLevelStore(widget.state),
        maxLevel: xsLevels,
      ),
  };
  LevelLadder get _ladder => _ladders[_mode]!;
  GameTimer? _ticker;
  final Map<XsMode, XsCorpus> _corpora = {};
  String? _error;
  _Phase _phase = _Phase.config;
  XsRun? _run;

  /// Пробе: текущий подход, чтобы решать касаниями.
  @visibleForTesting
  XsRun? get debugRun => _run;
  int _runLevel = 1;
  XsResult? _last;
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
      final xq = widget.xiangqiCorpus ?? await XsCorpus.load(XsMode.xiangqi);
      final sg = widget.shogiCorpus ?? await XsCorpus.load(XsMode.shogi);
      if (!mounted) return;
      setState(() {
        _corpora[XsMode.xiangqi] = xq;
        _corpora[XsMode.shogi] = sg;
      });
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('xiangqiShogi')}: $e");
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
    final corpus = _corpora[_mode];
    if (corpus == null) return;
    final level = _ladder.level;
    final deck = xsDeckFor(corpus, level, seed: _seed(level));
    _starts++;
    if (deck.isEmpty) return;
    setState(() {
      _run = XsRun(level: level, deck: deck, now: _now, mode: _mode);
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

  Future<void> _complete(XsResult r) async {
    final level = _runLevel;
    final mode = _run?.mode ?? _mode;
    final ladder = _ladders[mode]!;
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000).round();
    final step = xsStep(level);
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
    final difficulty = xsDifficulty(level);
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
        gameType: 'xiangqi-shogi',
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
    final corpus = _corpora[mode] ?? await XsCorpus.load(mode);
    if (!mounted) return;
    final level = _phase == _Phase.playing ? _runLevel : _ladders[mode]!.level;
    final seed = widget.seed ?? level * 131 + _starts;
    final steps = xsLessonForLevel(corpus, level, seed: seed);
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LessonPlayerScreen(
          title: L.t('xiangqiShogi'),
          steps: steps,
          board: (context, side, shown) {
            final f = steps[shown.clamp(0, steps.length - 1)].payload as XsLessonFrame;
            return Center(
              // Сянци — 10 рядов на 9 вертикалей: в квадратное окно плеера по высоте.
              child: XsBoardView(
                view: f.view,
                width: f.view.mode == XsMode.xiangqi ? side * 0.9 : side,
                lastMove: f.move,
              ),
            );
          },
        ),
      ),
    );
  }

  void _openGuide() {
    final mode = _run?.mode ?? _mode;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.85,
        child: XsPieceGuide(mode: mode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_corpora.length < 2) {
      return GameShell(
        title: L.t('xiangqiShogi'),
        onLesson: _openLesson,
        field: (context, h) => Center(
          child: _error == null ? const CircularProgressIndicator() : Text(_error!),
        ),
      );
    }
    final run = _run;
    final playing = _phase == _Phase.playing && run != null;
    return GameShell(
      title: L.t('xiangqiShogi'),
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
          PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _start),
        PauseAction(
          label: L.t('xsPieces'),
          icon: Icons.menu_book_outlined,
          onPressed: _openGuide,
        ),
      ],
    );
  }

  Widget _config() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<XsMode>(
          key: const Key('xs-mode'),
          segments: [
            ButtonSegment(
              value: XsMode.xiangqi,
              label: Text(L.t('xsModeXiangqi'), key: const Key('xs-mode-xiangqi')),
            ),
            ButtonSegment(
              value: XsMode.shogi,
              label: Text(L.t('xsModeShogi'), key: const Key('xs-mode-shogi')),
            ),
          ],
          selected: {_mode},
          onSelectionChanged: (v) => setState(() => _mode = v.first),
        ),
        const SizedBox(height: 12),
        Text(
          L.t(_mode == XsMode.xiangqi ? 'xsAboutXiangqi' : 'xsAboutShogi'),
          key: const Key('xs-about'),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        FilledButton(
          key: const Key('xs-start'),
          onPressed: _start,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: Text(L.t('start')),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('xs-guide'),
          onPressed: _openGuide,
          icon: const Icon(Icons.menu_book_outlined),
          label: Text(L.t('xsPieces')),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
        const SizedBox(height: 16),
        Text(L.t('xiangqiShogiDesc'), style: Theme.of(context).textTheme.bodyMedium),
      ],
    ),
  );

  Widget _play(XsRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final left = run.secondsLeft;
    final verdict = run.verdict;
    final wrong = verdict == XsVerdict.wrong;
    final view = run.view;
    final shogi = run.mode == XsMode.shogi;
    String verdictText() => switch (verdict) {
      null => run.refusal == 'check'
          ? L.t('xsNeedCheck')
          : run.waitingReply
          ? L.t('xsDefenceThinks')
          : ' ',
      XsVerdict.solved => '✓',
      XsVerdict.wrong => L.t('xsWrong'),
      XsVerdict.timeout => L.t('timeIsUp'),
    };
    return LayoutBuilder(
      builder: (context, box) {
        // Доска сянци — 10 рядов пересечений, сёги — 9 клеток и ряд руки (+6 на его
        // отступы). Подписи — не длиннее двух строк, под доской один ряд кнопок: запас
        // 182, как у «Го» (замер 320×568: без +6 сёги вылезали на 0,65 px).
        final cell = min(
          (box.maxWidth - 16) / 9,
          (fieldHeight - 182 - (shogi ? 6 : 0)) / 10,
        ).clamp(14.0, 48.0);
        final width = cell * 9;
        return SingleChildScrollView(
          child: Column(
            children: [
              Text(
                L.f('xsRule', {'n': '${run.puzzle.moves}'}),
                key: const Key('xs-rule'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: width,
                child: LinearProgressIndicator(
                  key: const Key('xs-time'),
                  value: (left / xsSeconds).clamp(0.0, 1.0),
                  minHeight: 8,
                  color: left < xsSeconds * 0.25 ? scheme.error : scheme.primary,
                ),
              ),
              Text(
                '${left.toStringAsFixed(0)} ${L.t('secShort')} · ${run.step + 1}/${run.deck.length} · ${L.f('cnMoves', {'n': '${run.made}', 'max': '${run.puzzle.moves}'})}',
                key: const Key('xs-count'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 6),
              XsBoardView(
                view: view,
                width: width,
                selected: run.selected,
                targets: run.targets,
                lastMove: run.lastMove,
                hint: run.hint,
                onTap: (i) => setState(() => run.tapCell(i)),
              ),
              if (shogi)
                XsHandView(
                  view: view,
                  width: width,
                  cell: cell * 0.92,
                  selected: run.selectedDrop,
                  hint: run.hint?.drop,
                  onTap: (k) => setState(() => run.tapHand(k)),
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  if (run.pendingPromotion != null) ...[
                    _promoButton(run, false, cell),
                    _promoButton(run, true, cell),
                  ] else ...[
                    if (verdict == null || wrong)
                      OutlinedButton(
                        key: const Key('xs-restart'),
                        onPressed: run.made == 0 && !wrong ? null : () => setState(run.restart),
                        style: OutlinedButton.styleFrom(minimumSize: const Size(100, 48)),
                        child: Text(L.t('restart')),
                      ),
                    if (wrong)
                      TextButton(
                        key: const Key('xs-next'),
                        onPressed: () => setState(run.giveUp),
                        child: Text(L.t('eyeStereoNext')),
                      ),
                    if (verdict == null && left <= xsSeconds / 2)
                      run.hinted
                          ? Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Text(L.t('hintUsed'), key: const Key('xs-hint-used')),
                            )
                          : OutlinedButton(
                              key: const Key('xs-hint'),
                              onPressed: run.canHint ? () => setState(run.takeHint) : null,
                              style: OutlinedButton.styleFrom(minimumSize: const Size(110, 48)),
                              child: Text(L.t('btn_hint')),
                            ),
                  ],
                ],
              ),
              Text(
                verdictText(),
                key: const Key('xs-verdict'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: verdict == null
                      ? (run.refusal == null ? null : scheme.error)
                      : verdict == XsVerdict.solved
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

  /// Кнопка выбора при превращении: знак фигуры как есть или превращённой.
  Widget _promoButton(XsRun run, bool promote, double cell) {
    final p = run.pendingPromotion!;
    final mv = XsMove.parse(run.mode, p.$1);
    final kind = run.view.cells[mv.from!]!.kind;
    return OutlinedButton(
      key: Key(promote ? 'xs-promote' : 'xs-keep'),
      onPressed: () => setState(() => run.choosePromotion(promote)),
      style: OutlinedButton.styleFrom(minimumSize: const Size(72, 52)),
      child: XsPieceView(
        mode: run.mode,
        piece: XsPiece(0, promote ? '+$kind' : kind),
        size: max(36, cell),
      ),
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
            key: const Key('xs-solved'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(
            L.f('solClean', {'n': '${r.clean}'}),
            key: const Key('xs-clean'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('xs-again'),
            onPressed: _start,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            child: Text(
              up
                  ? '${L.t('nextLabel')} · ${L.t('label_level_short')} ${_ladder.level}'
                  : L.t('restart'),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('xs-menu'),
            onPressed: () => setState(() => _phase = _Phase.config),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: Text(L.t('mode')),
          ),
        ],
      ),
    );
  }
}

/// Знак фигуры: традиционный иероглиф. Сянци — красные и чёрные; сёги — пятиугольник
/// не рисуем, кружок светлый у сэнтэ и тёмный у готэ, знак готэ повёрнут.
String xsGlyph(XsMode mode, XsPiece p) {
  if (mode == XsMode.xiangqi) {
    const red = {'K': '帥', 'A': '仕', 'B': '相', 'N': '傌', 'R': '俥', 'C': '炮', 'P': '兵'};
    const black = {'K': '將', 'A': '士', 'B': '象', 'N': '馬', 'R': '車', 'C': '砲', 'P': '卒'};
    return (p.side == 0 ? red : black)[p.kind] ?? p.kind;
  }
  const shogi = {
    'R': '飛',
    'B': '角',
    'G': '金',
    'S': '銀',
    'N': '桂',
    'L': '香',
    'P': '歩',
    '+R': '龍',
    '+B': '馬',
    '+S': '全',
    '+N': '圭',
    '+L': '杏',
    '+P': 'と',
  };
  if (p.kind == 'K') return p.side == 0 ? '王' : '玉';
  return shogi[p.kind] ?? p.kind;
}

class XsPieceView extends StatelessWidget {
  const XsPieceView({super.key, required this.mode, required this.piece, required this.size});
  final XsMode mode;
  final XsPiece piece;
  final double size;

  @override
  Widget build(BuildContext context) {
    final attacker = piece.side == 0;
    final Color ink;
    final Color disc;
    if (mode == XsMode.xiangqi) {
      ink = attacker ? const Color(0xFFC62828) : const Color(0xFF1B1B1B);
      disc = const Color(0xFFF6E7C1);
    } else {
      ink = piece.kind.startsWith('+') ? const Color(0xFFC62828) : const Color(0xFF1B1B1B);
      disc = attacker ? const Color(0xFFF3D9A4) : const Color(0xFFD9C08A);
    }
    final glyph = Text(
      xsGlyph(mode, piece),
      style: TextStyle(fontSize: size * 0.56, height: 1.0, color: ink, fontWeight: FontWeight.w700),
    );
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: disc,
        shape: BoxShape.circle,
        border: Border.all(color: ink, width: max(1.2, size * 0.05)),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 2, offset: Offset(0, 1))],
      ),
      child: mode == XsMode.shogi && !attacker
          ? Transform.rotate(angle: pi, child: glyph)
          : glyph,
    );
  }
}

/// Доска: сянци — фигуры на пересечениях, река и дворцы; сёги — клетки 9×9.
class XsBoardView extends StatelessWidget {
  const XsBoardView({
    super.key,
    required this.view,
    required this.width,
    this.selected,
    this.targets = const {},
    this.lastMove,
    this.hint,
    this.onTap,
  });

  final XsView view;
  final double width;
  final int? selected;
  final Set<int> targets;
  final XsMove? lastMove;
  final XsMove? hint;
  final void Function(int index)? onTap;

  @override
  Widget build(BuildContext context) {
    final cell = width / 9;
    final rows = view.ranks;
    final xiangqi = view.mode == XsMode.xiangqi;
    return Container(
      key: const Key('xs-board'),
      width: width,
      height: cell * rows,
      color: xiangqi ? const Color(0xFFE8C88A) : const Color(0xFFEBC97F),
      child: CustomPaint(
        painter: _XsGridPainter(view.mode),
        child: Column(
          children: [
            for (var r = 0; r < rows; r++)
              Row(children: [for (var c = 0; c < 9; c++) _cell(r * 9 + c, cell)]),
          ],
        ),
      ),
    );
  }

  Widget _cell(int i, double cell) {
    final p = view.cells[i];
    Color? ring;
    if (hint != null && (i == hint!.to || i == hint!.from)) {
      ring = const Color(0xFFE0A800);
    } else if (i == selected) {
      ring = const Color(0xFF2E7D32);
    } else if (lastMove != null && (i == lastMove!.to || i == lastMove!.from)) {
      ring = const Color(0x99E0A800);
    }
    return GestureDetector(
      key: Key('xs-$i'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap == null ? null : () => onTap!(i),
      child: Container(
        width: cell,
        height: cell,
        alignment: Alignment.center,
        decoration: ring == null
            ? null
            : BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: ring, width: max(2, cell * 0.08)),
              ),
        child: p != null
            ? XsPieceView(
                key: Key('xs-p-$i'),
                mode: view.mode,
                piece: p,
                size: cell * 0.86,
              )
            : targets.contains(i)
            ? Container(
                key: Key('xs-t-$i'),
                width: cell * 0.28,
                height: cell * 0.28,
                decoration: const BoxDecoration(color: Color(0xAA2E7D32), shape: BoxShape.circle),
              )
            : null,
      ),
    );
  }
}

class _XsGridPainter extends CustomPainter {
  _XsGridPainter(this.mode);
  final XsMode mode;

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / 9;
    final half = cell / 2;
    final paint = Paint()
      ..color = const Color(0xFF5A3A12)
      ..strokeWidth = max(1.0, cell * 0.03);
    if (mode == XsMode.shogi) {
      for (var i = 0; i <= 9; i++) {
        canvas.drawLine(Offset(i * cell, 0), Offset(i * cell, size.height), paint);
        canvas.drawLine(Offset(0, i * cell), Offset(size.width, i * cell), paint);
      }
      return;
    }
    // Сянци: 10 горизонталей, 9 вертикалей; река между 5-м и 6-м рядом сверху.
    for (var r = 0; r < 10; r++) {
      final y = half + r * cell;
      canvas.drawLine(Offset(half, y), Offset(size.width - half, y), paint);
    }
    for (var c = 0; c < 9; c++) {
      final x = half + c * cell;
      if (c == 0 || c == 8) {
        canvas.drawLine(Offset(x, half), Offset(x, half + 9 * cell), paint);
      } else {
        canvas.drawLine(Offset(x, half), Offset(x, half + 4 * cell), paint);
        canvas.drawLine(Offset(x, half + 5 * cell), Offset(x, half + 9 * cell), paint);
      }
    }
    // Дворцы: диагонали d–f.
    for (final top in [0, 7]) {
      final y0 = half + top * cell, y1 = y0 + 2 * cell;
      final x0 = half + 3 * cell, x1 = half + 5 * cell;
      canvas.drawLine(Offset(x0, y0), Offset(x1, y1), paint);
      canvas.drawLine(Offset(x1, y0), Offset(x0, y1), paint);
    }
  }

  @override
  bool shouldRepaint(_XsGridPainter old) => old.mode != mode;
}

/// Рука сэнтэ (сёги): фигуры для сброса с числом.
class XsHandView extends StatelessWidget {
  const XsHandView({
    super.key,
    required this.view,
    required this.width,
    required this.cell,
    this.selected,
    this.hint,
    this.onTap,
  });
  final XsView view;
  final double width;
  final double cell;
  final String? selected;
  final String? hint;
  final void Function(String kind)? onTap;

  @override
  Widget build(BuildContext context) {
    final hand = view.hands[0];
    return SizedBox(
      key: const Key('xs-hand'),
      width: width,
      height: cell + 4,
      child: Row(
        children: [
          for (final k in sgHandKinds)
            if ((hand[k] ?? 0) > 0)
              GestureDetector(
                key: Key('xs-hand-$k'),
                onTap: onTap == null ? null : () => onTap!(k),
                child: Container(
                  margin: const EdgeInsets.only(right: 4, top: 2),
                  decoration: k == selected || k == hint
                      ? BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: k == hint ? const Color(0xFFE0A800) : const Color(0xFF2E7D32),
                            width: 3,
                          ),
                        )
                      : null,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      XsPieceView(mode: XsMode.shogi, piece: XsPiece(0, k), size: cell),
                      if ((hand[k] ?? 0) > 1)
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Text(
                            '${hand[k]}',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

/// СПРАВКА «ФИГУРЫ»: знак, название, правило и схема ходов. Схема снята с движка —
/// фигура на пустой доске, точки там, куда движок пускает (сянци — bishop, сёги — свой).
class XsPieceGuide extends StatelessWidget {
  const XsPieceGuide({super.key, required this.mode});
  final XsMode mode;

  static const xiangqiKinds = ['K', 'A', 'B', 'N', 'R', 'C', 'P'];
  static const shogiKinds = ['K', 'R', 'B', 'G', 'S', 'N', 'L', 'P', '+R', '+B'];

  /// Где стоит фигура на схеме и куда ходит: (центр окна, поля назначения) в индексах доски.
  static (int, Set<int>) diagram(XsMode mode, String kind) {
    if (mode == XsMode.shogi) {
      final cells = List<SgPiece?>.filled(81, null);
      const at = 40; // e5
      cells[at] = SgPiece(sgSente, kind);
      final pos = ShogiPosition(cells, [{}, {}], sgSente);
      return (at, pos.targets(at).toSet());
    }
    // Сянци: генералы по углам дворцов, чтобы позиция была законной.
    final at = switch (kind) {
      'K' || 'A' => xsIndex(mode, 'e2'),
      'B' => xsIndex(mode, 'e3'),
      'P' => xsIndex(mode, 'e6'),
      _ => xsIndex(mode, 'e5'),
    };
    final cells = <int, String>{
      xsIndex(mode, 'd1'): 'K',
      xsIndex(mode, 'f10'): 'k',
    };
    if (kind != 'K') cells[at] = kind;
    if (kind == 'K') {
      cells.remove(xsIndex(mode, 'd1'));
      cells[at] = 'K';
    }
    final rows = <String>[];
    for (var r = 0; r < 10; r++) {
      var row = '';
      var empty = 0;
      for (var c = 0; c < 9; c++) {
        final p = cells[r * 9 + c];
        if (p == null) {
          empty++;
          continue;
        }
        if (empty > 0) row += '$empty';
        empty = 0;
        row += p;
      }
      if (empty > 0) row += '$empty';
      rows.add(row);
    }
    final game = bishop.Game(variant: xiangqiVariant, fen: '${rows.join('/')} w - - 0 1');
    final from = xsSquare(mode, at);
    final out = <int>{};
    for (final m in game.generateLegalMoves()) {
      final name = game.toAlgebraic(m);
      final mv = XsMove.parse(mode, name);
      if (xsSquare(mode, mv.from!) == from) out.add(mv.to);
    }
    return (at, out);
  }

  @override
  Widget build(BuildContext context) {
    final kinds = mode == XsMode.xiangqi ? xiangqiKinds : shogiKinds;
    return ListView(
      key: const Key('xs-guide-list'),
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          L.t('xsPieces'),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        for (final k in kinds) _row(k),
      ],
    );
  }

  Widget _row(String kind) {
    final (at, to) = diagram(mode, kind);
    final key = xsPieceKey(mode, kind);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _mini(at, to, kind),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(L.t(key), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(L.t('${key}Rule')),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Окно 5×5 вокруг фигуры: она в центре, точки — куда ходит.
  Widget _mini(int at, Set<int> to, String kind) {
    const cell = 18.0;
    final r0 = at ~/ 9, c0 = at % 9;
    return Container(
      key: Key('xs-guide-$kind'),
      color: const Color(0xFFEBC97F),
      child: Column(
        children: [
          for (var dr = -2; dr <= 2; dr++)
            Row(
              children: [
                for (var dc = -2; dc <= 2; dc++)
                  () {
                    final r = r0 + dr, c = c0 + dc;
                    final inside = r >= 0 && r < xsRanks(mode) && c >= 0 && c < 9;
                    final i = r * 9 + c;
                    return Container(
                      width: cell,
                      height: cell,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0x55000000), width: 0.5),
                      ),
                      child: !inside
                          ? null
                          : i == at
                          ? XsPieceView(mode: mode, piece: XsPiece(0, kind), size: cell)
                          : to.contains(i)
                          ? Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: Color(0xFF2E7D32),
                                shape: BoxShape.circle,
                              ),
                            )
                          : null,
                    );
                  }(),
              ],
            ),
        ],
      ),
    );
  }
}
