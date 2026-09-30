import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Кубики Корси» на общем каркасе.
///
/// Ряд вспыхивает блок за блоком, человек повторяет его тычками — с L10 задом
/// наперёд. Доска нерегулярная, поэтому она не сетка, а картинка с блоками в
/// заданных точках; размер берётся от высоты, которую дал каркас, и от ширины —
/// смотря что меньше. Ровно на этом ошибалась веб-версия: доска 400×420 стояла
/// числом и вылезала за экран 390.
enum Phase { ready, show, hold, recall, done }

/// Что показать в поле после нажатия: верно, промах или ничего.
enum Feedback { none, right, wrong }

class CorsiScreen extends StatefulWidget {
  const CorsiScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<CorsiScreen> createState() => _CorsiScreenState();
}

class _CorsiScreenState extends State<CorsiScreen> {
  late LevelLadder _ladder;
  CorsiGame? _game;
  Phase _phase = Phase.ready;
  Feedback _feedback = Feedback.none;

  /// Какой блок горит прямо сейчас (во время показа).
  int? _lit;

  /// Человек попросил ответ: партия кончается без зачёта, блоки показывают порядок.
  bool _revealed = false;
  Timer? _timer;
  DateTime? _startedAt;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'corsi', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (mounted) setState(_reset);
  }

  void _reset() {
    _timer?.cancel();
    _game = CorsiGame(level: _ladder.level);
    _phase = Phase.ready;
    _feedback = Feedback.none;
    _lit = null;
    _revealed = false;
    _startedAt = null;
  }

  void _start() {
    _startedAt ??= DateTime.now();
    _showSequence();
  }

  /// Показ ряда: блок горит `flashMs`, следующий начинается через `tickMs`.
  void _showSequence() {
    setState(() {
      _phase = Phase.show;
      _feedback = Feedback.none;
      _lit = null;
    });
    _flash(0);
  }

  void _flash(int i) {
    final g = _game!;
    if (!mounted) return;
    if (i >= g.sequence.length) {
      // Выше потолка объёма между показом и вводом стоит задержка — ось сложности.
      setState(() => _phase = g.params.holdMs > 0 ? Phase.hold : Phase.recall);
      if (g.params.holdMs == 0) return;
      _timer = Timer(Duration(milliseconds: g.params.holdMs), () {
        if (mounted) setState(() => _phase = Phase.recall);
      });
      return;
    }
    setState(() => _lit = g.sequence[i]);
    _timer = Timer(Duration(milliseconds: g.params.flashMs), () {
      if (!mounted) return;
      setState(() => _lit = null);
      _timer = Timer(
        Duration(milliseconds: g.params.tickMs - g.params.flashMs),
        () => _flash(i + 1),
      );
    });
  }

  void _tap(int block) {
    final g = _game!;
    if (_phase != Phase.recall || _feedback != Feedback.none) return;
    final outcome = g.tap(block);
    if (outcome == TapOutcome.progress || outcome == TapOutcome.ignored) {
      setState(() {});
      return;
    }
    final won = outcome == TapOutcome.roundWon;
    setState(() => _feedback = won ? Feedback.right : Feedback.wrong);
    // Паузы взяты из веб-версии: после промаха человек успевает понять, где сбился.
    _timer = Timer(Duration(milliseconds: won ? 600 : 700), () {
      if (!mounted) return;
      if (g.finished) {
        _finish();
        return;
      }
      setState(() {
        won ? g.nextRound() : g.retryRound();
        _feedback = Feedback.none;
      });
      _showSequence();
    });
  }

  /// Показать ответ: как у соседних перенесённых игр — партия заканчивается и в
  /// лестницу НЕ идёт ни победой, ни провалом. Подсмотренный ряд не должен ни
  /// поднимать уровень, ни опускать его.
  void _reveal() {
    _timer?.cancel();
    setState(() {
      _revealed = true;
      _phase = Phase.done;
      _feedback = Feedback.none;
      _lit = null;
    });
  }

  void _finish() {
    final g = _game!;
    final seconds = _startedAt == null
        ? 0
        : DateTime.now().difference(_startedAt!).inSeconds;
    setState(() {
      _phase = Phase.done;
      _feedback = Feedback.none;
      _lit = null;
    });
    final mode = g.params.reverse ? 'backward' : 'forward';
    // Уровень взят, если человек повторил ряд той длины, с которой уровень начинается.
    if (g.passed) {
      _ladder.win(score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode);
    } else {
      _ladder.fail(score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('corsi'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('hud_span'), value: '${g.span}', icon: Icons.straighten),
        HudItem(label: L.t('errors'), value: '${g.errors}', icon: Icons.close),
      ],
      field: (context, h) => _Board(
        game: g,
        phase: _phase,
        feedback: _feedback,
        lit: _lit,
        revealed: _revealed,
        height: h,
        onStart: _start,
        onTap: _tap,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.refresh,
          label: L.t('restart'),
          onPressed: () => setState(_reset),
        ),
        AuxAction(
          icon: Icons.visibility_outlined,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: _phase == Phase.recall && _feedback == Feedback.none ? _reveal : null,
        ),
      ]),
      toolbar: _phase == Phase.done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: () => setState(_reset),
                icon: const Icon(Icons.arrow_forward),
                label: Text(g.passed && !_revealed ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Доска: девять блоков в заданных точках, размер — от поля каркаса.
class _Board extends StatelessWidget {
  const _Board({
    required this.game,
    required this.phase,
    required this.feedback,
    required this.lit,
    required this.revealed,
    required this.height,
    required this.onStart,
    required this.onTap,
  });

  final CorsiGame game;
  final Phase phase;
  final Feedback feedback;
  final int? lit;
  final bool revealed;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    if (phase == Phase.ready) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              game.params.reverse ? L.t('reproduceBackward') : L.t('reproduceForward'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Доска влезает целиком: масштаб берётся от МЕНЬШЕГО из ширины и высоты
        // поля. Подпись фазы занимает свою строку и в этот расчёт не лезет.
        const captionH = 34.0;
        final scale = ((c.maxWidth - 24) / corsiBoardWidth)
            .clamp(0.1, (height - captionH) / corsiBoardHeight);
        final block = 60 * scale;
        return Column(
          children: [
            SizedBox(
              height: captionH,
              child: Center(child: Text(_caption(), style: Theme.of(context).textTheme.bodyMedium)),
            ),
            SizedBox(
              width: corsiBoardWidth * scale,
              height: corsiBoardHeight * scale,
              child: Stack(
                children: [
                  for (var i = 0; i < corsiPositions.length; i++)
                    Positioned(
                      left: corsiPositions[i].x * scale - block / 2,
                      top: corsiPositions[i].y * scale - block / 2,
                      width: block,
                      height: block,
                      child: _Block(
                        index: i,
                        game: game,
                        phase: phase,
                        feedback: feedback,
                        lit: lit,
                        order: revealed ? game.expected.indexOf(i) + 1 : 0,
                        onTap: onTap,
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  String _caption() {
    if (phase == Phase.show) return L.t('memorize');
    if (phase == Phase.hold) return L.t('memorize');
    if (phase == Phase.done) {
      if (revealed) return L.t('puzzleShowSolution');
      return game.passed ? L.t('nextLabel') : L.t('retry');
    }
    return game.params.reverse ? L.t('reproduceBackward') : L.t('reproduceForward');
  }
}

class _Block extends StatelessWidget {
  const _Block({
    required this.index,
    required this.game,
    required this.phase,
    required this.feedback,
    required this.lit,
    required this.order,
    required this.onTap,
  });

  final int index;
  final CorsiGame game;
  final Phase phase;
  final Feedback feedback;
  final int? lit;

  /// Номер блока в ответе (1…n), когда показан ответ; 0 — блок в ответ не входит.
  final int order;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tapped = game.answer.contains(index);
    final last = game.answer.isNotEmpty && game.answer.last == index;

    Color fill = scheme.surfaceContainerHighest;
    if (order > 0) {
      fill = scheme.primaryContainer;
    } else if (phase == Phase.show && lit == index) {
      fill = scheme.primary;
    } else if (feedback == Feedback.right && last) {
      fill = scheme.primary;
    } else if (feedback == Feedback.wrong && last) {
      fill = scheme.errorContainer;
    } else if (tapped) {
      fill = scheme.secondary;
    }

    final enabled = phase == Phase.recall && feedback == Feedback.none;
    return Material(
      color: fill,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        key: Key('блок$index'),
        borderRadius: BorderRadius.circular(10),
        onTap: enabled ? () => onTap(index) : null,
        child: order > 0
            ? Center(
                child: Text('$order',
                    key: Key('порядок$index'),
                    style: TextStyle(fontWeight: FontWeight.w800, color: scheme.onPrimaryContainer)),
              )
            : const SizedBox.expand(),
      ),
    );
  }
}
