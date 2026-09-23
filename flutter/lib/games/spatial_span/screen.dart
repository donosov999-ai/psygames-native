import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «ПРОСТРАНСТВЕННЫЙ РЯД» — экран на общем каркасе.
///
/// Показ ведёт таймер, ответ идёт тычками по клеткам В ОБРАТНОМ ПОРЯДКЕ. Служебных действий у
/// экрана почти нет, и это не упущение: подсказка, отмена и повтор показа врали бы прямо в замер
/// — спан меряется тем, докуда человек дошёл САМ до двух ошибок на одной длине.
enum Phase { ready, show, recall, done }

class SpatialSpanScreen extends StatefulWidget {
  const SpatialSpanScreen({super.key, required this.state, this.random});

  final SharedState state;

  /// Случайность ряда. Проба подставляет семенную и знает порядок вспышек заранее.
  final math.Random? random;

  @override
  State<SpatialSpanScreen> createState() => _SpatialSpanScreenState();
}

class _SpatialSpanScreenState extends State<SpatialSpanScreen> {
  late LevelLadder _ladder;
  bool _ready = false;

  SpatialSpanGame? _game;
  Phase _phase = Phase.ready;

  /// Какая клетка горит прямо сейчас; −1 — ни одна.
  int _lit = -1;
  bool? _lastAnswer;
  Timer? _ticker;
  Timer? _flash;
  Timer? _hold;
  Timer? _after;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'spatial_span', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    // ⚠️ Четыре таймера: показ, гашение вспышки, задержка перед вводом и разбор ответа.
    _ticker?.cancel();
    _flash?.cancel();
    _hold?.cancel();
    _after?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _ready = true;
      _game = SpatialSpanGame(level: _ladder.level, random: widget.random);
    });
  }

  void _restart() {
    _ticker?.cancel();
    _flash?.cancel();
    _hold?.cancel();
    _after?.cancel();
    setState(() {
      _game = SpatialSpanGame(level: _ladder.level, random: widget.random);
      _phase = Phase.ready;
      _lit = -1;
      _lastAnswer = null;
    });
  }

  void _start() {
    final g = _game!;
    _show(g.params.startSpan);
  }

  /// Показ ряда: вспышка за вспышкой, затем задержка — и только потом ввод.
  void _show(int len) {
    final g = _game!;
    setState(() {
      g.deal(len);
      _phase = Phase.show;
      _lit = -1;
      _lastAnswer = null;
    });
    var i = 0;
    _ticker?.cancel();
    _ticker = Timer.periodic(Duration(milliseconds: g.params.tickMs), (t) {
      if (!mounted) return;
      if (i < g.sequence.length) {
        final cell = g.sequence[i];
        setState(() => _lit = cell);
        _flash?.cancel();
        _flash = Timer(Duration(milliseconds: g.params.flashMs), () {
          if (mounted) setState(() => _lit = -1);
        });
        i++;
        return;
      }
      t.cancel();
      // 🔴 Задержка перед вводом ИСПОЛНЯЕТСЯ здесь, а не только объявлена в параметрах ступени.
      void open() {
        if (!mounted) return;
        setState(() {
          _phase = Phase.recall;
          g.recalling = true;
        });
      }

      if (g.params.holdMs > 0) {
        _hold?.cancel();
        _hold = Timer(Duration(milliseconds: g.params.holdMs), open);
      } else {
        open();
      }
    });
  }

  void _tap(int cell) {
    final g = _game!;
    final result = g.tap(cell);
    if (result == Tap.ignored) return;
    setState(() {});
    if (result == Tap.ok) return;

    setState(() => _lastAnswer = result == Tap.done);
    _after?.cancel();
    _after = Timer(Duration(milliseconds: result == Tap.done ? 600 : 700), () {
      if (!mounted) return;
      if (g.finished) {
        _finish();
        return;
      }
      // Ошибка — тот же ряд ещё раз, успех — на клетку длиннее.
      _show(result == Tap.done ? g.sequence.length + 1 : g.sequence.length);
    });
  }

  Future<void> _finish() async {
    final g = _game!;
    setState(() {
      _phase = Phase.done;
      _lit = -1;
    });
    if (g.passed) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final g = _game!;
    return GameShell(
      title: 'Пространственный ряд',
      onRules: () => showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Пространственный ряд'),
          content: const Text(
            'Клетки вспыхивают по одной. Повтори их В ОБРАТНОМ ПОРЯДКЕ — от последней к первой. '
            'Ряд растёт, пока получается; две ошибки на одной длине заканчивают партию.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Понятно')),
          ],
        ),
      ),
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Спан', value: '${g.span}', icon: Icons.straighten),
        HudItem(
          label: 'Ошибки на длине',
          value: '${g.errorsAtLength}/2',
          icon: Icons.close,
        ),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        lit: _lit,
        lastAnswer: _lastAnswer,
        height: h,
        onTap: _tap,
      ),
      auxRow: AuxBar(
        children: [
          AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
        ],
      ),
      toolbar: switch (_phase) {
        Phase.ready => Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            key: const Key('показать-ряд'),
            onPressed: _start,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Показать ряд'),
          ),
        ),
        Phase.done => Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            key: const Key('ещё-раз'),
            onPressed: _restart,
            icon: const Icon(Icons.arrow_forward),
            label: Text(g.passed ? 'Следующий уровень' : 'Ещё раз'),
          ),
        ),
        _ => null,
      },
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Поле: сетка клеток и подпись, что сейчас делать. Всё внутри высоты, которую дал каркас.
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.lit,
    required this.lastAnswer,
    required this.height,
    required this.onTap,
  });

  final SpatialSpanGame game;
  final Phase phase;
  final int lit;
  final bool? lastAnswer;
  final double height;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final n = game.params.gridSize;
    // 🔴 ВЕРДИКТ ВИДЕН СРАЗУ. Первый вариант оставлял «Повтори…» и после ошибки — человек не
    // понимал, кончился ли ввод, и тыкал дальше в уже закрытый ряд. Нашла это проба.
    final note = phase == Phase.done
        ? (game.passed
              ? 'Уровень пройден. Спан: ${game.span}'
              : 'Спан: ${game.span} — планка ступени ${game.params.startSpan}')
        : lastAnswer == false
        ? 'Ошибка. Тот же ряд ещё раз'
        : lastAnswer == true
        ? 'Верно'
        : switch (phase) {
            Phase.ready => 'Сетка $n×$n, ряд из ${game.params.startSpan} клеток',
            Phase.show => 'Смотри и запоминай',
            _ => 'Повтори В ОБРАТНОМ ПОРЯДКЕ: ${game.entered.length}/${game.expected.length}',
          };

    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Доска считается от МЕНЬШЕЙ стороны поля, а не от окна: подпись и полоса счётчиков
        // окну неизвестны, и сетка вылезала бы ровно на их высоту.
        final side = math.min(c.maxWidth - 24, height - 72).clamp(120.0, 520.0).toDouble();
        final cell = (side - (n - 1) * 6) / n;
        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              note,
              key: const Key('подсказка'),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: lastAnswer == null
                    ? scheme.onSurfaceVariant
                    : lastAnswer!
                    ? scheme.primary
                    : scheme.error,
                fontWeight: lastAnswer == null ? FontWeight.normal : FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: side,
              height: side,
              child: Column(
                children: [
                  for (var row = 0; row < n; row++) ...[
                    if (row > 0) const SizedBox(height: 6),
                    Row(
                      children: [
                        for (var col = 0; col < n; col++) ...[
                          if (col > 0) const SizedBox(width: 6),
                          _Cell(
                            index: row * n + col,
                            size: cell,
                            lit: lit == row * n + col,
                            picked: game.entered.contains(row * n + col),
                            on: phase == Phase.recall,
                            onTap: onTap,
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.index,
    required this.size,
    required this.lit,
    required this.picked,
    required this.on,
    required this.onTap,
  });

  final int index;
  final double size;
  final bool lit;
  final bool picked;
  final bool on;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        key: Key('клетка$index'),
        color: lit
            ? scheme.primary
            : picked
            ? scheme.secondaryContainer
            : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: on ? () => onTap(index) : null,
          borderRadius: BorderRadius.circular(10),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}
