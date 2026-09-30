import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «РИСКНИ И СОХРАНИ» — развилка «Конфликт внимания», рядом с пробами
/// решений, но НЕ в их наборе (там выбор по скрытой обратной связи, здесь явный
/// кубик — план каталога). Движок MindLab, решение Дениса 30.09.2026 «добавляем
/// нативно, дорабатываем потом»; дальше экран ведёт «Внимание» (задача ddb5da3b).
///
/// Ход бота показывается бросок за броском: человек видит, чем бот рискует, и
/// учится на нём, а не получает готовый итог.
class RollAndBankScreen extends StatefulWidget {
  const RollAndBankScreen({
    super.key,
    required this.state,
    this.seed,
    this.botDelay = const Duration(milliseconds: 650),
  });

  final SharedState state;

  /// Зерно кубика для проб; без него — случайное.
  final int? seed;

  /// Пауза между бросками бота.
  final Duration botDelay;

  @override
  State<RollAndBankScreen> createState() => _RollAndBankScreenState();
}

class _RollAndBankScreenState extends State<RollAndBankScreen> {
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  RollAndBank? _game;
  int _levelNo = 1;
  Timer? _botTimer;
  String _note = '';
  bool _burnt = false;
  DateTime _started = DateTime.now();

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(gameId: 'roll_and_bank', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _botTimer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_deal);
  }

  void _deal() {
    _botTimer?.cancel();
    _levelNo = _ladder.level;
    final step = rollAndBankStep(_levelNo);
    _game = RollAndBank(goal: step.goal, botHold: step.botHold, rnd: _rnd);
    _note = L.t('rbYourTurn');
    _burnt = false;
    _started = DateTime.now();
  }

  bool get _myTurn => _game != null && !_game!.over && _game!.side == 0;

  Future<void> _roll() async {
    final g = _game;
    if (g == null || !_myTurn) return;
    final v = g.roll();
    setState(() {
      _burnt = v == 1;
      _note = v == 1 ? L.t('rbBust') : L.t('rbYourTurn');
    });
    if (g.over) return _finish();
    if (g.side == 1) _botLater();
  }

  void _bank() {
    final g = _game;
    if (g == null || !_myTurn || g.unbanked(0) <= 0) return;
    setState(() {
      g.bank();
      _burnt = false;
      _note = L.t('rbBotTurn');
    });
    _botLater();
  }

  void _botLater() {
    _botTimer?.cancel();
    _botTimer = Timer(widget.botDelay, _botStep);
  }

  Future<void> _botStep() async {
    final g = _game;
    if (!mounted || g == null || g.over || g.side != 1) return;
    if (g.botWantsToBank) {
      setState(() {
        g.bank();
        _burnt = false;
        _note = L.t('rbYourTurn');
      });
      return;
    }
    final v = g.roll();
    setState(() {
      _burnt = v == 1;
      _note = v == 1 ? L.t('rbBotBust') : L.t('rbBotTurn');
    });
    if (g.over) return _finish();
    if (g.side == 1) _botLater();
  }

  Future<void> _finish() async {
    final g = _game!;
    final details = <String, Object?>{
      'winner': g.winner == 0 ? 'player' : 'bot',
      'player_position': g.position[0],
      'bot_position': g.position[1],
      'goal': g.goal,
      'bot_hold': g.botHold,
      'rolls': g.rolls,
      'busts': g.busts,
      'banks': g.banks,
    };
    final seconds = DateTime.now().difference(_started).inSeconds;
    setState(() => _note = g.winner == 0 ? L.t('rbWin') : L.t('rbLose'));
    if (g.winner == 0) {
      await _ladder.win(errors: g.busts, timeSeconds: seconds, score: g.position[0], details: details);
    } else {
      await _ladder.fail(errors: g.busts, timeSeconds: seconds, score: g.position[0], details: details);
    }
    if (mounted) setState(() {});
  }

  void _next() => setState(_deal);

  /*
   * РАЗБОР — ПРИЁМ, А НЕ ПОДСКАЗКА «ОСТАНОВИСЬ ЗДЕСЬ»: считать ожидание броска против
   * риска, и смотреть на соперника. Доска на всех шагах — эта партия как есть.
   */
  Future<void> _openLesson() async {
    final g = _game;
    if (g == null) return;
    final steps = [
      LessonStep(payload: 0, techniqueKey: 'teachBankAverage', text: L.t('teachBankAverage')),
      LessonStep(payload: 1, techniqueKey: 'teachBankRule', text: L.t('teachBankRule')),
      LessonStep(payload: 2, techniqueKey: 'teachBankRace', text: L.t('teachBankRace')),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('rollAndBank'),
        steps: steps,
        board: (context, side, shown) => SizedBox(
          width: side,
          height: side,
          child: _Board(game: g, burnt: false),
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('rollAndBank'),
      onLesson: g.over ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        HudItem(label: L.t('rbGoal'), value: '${g.goal}', icon: Icons.sports_score),
        HudItem(label: L.t('rbBusts'), value: '${g.busts}', icon: Icons.local_fire_department_outlined),
      ],
      field: (context, h) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Text(
              _note,
              key: const ValueKey('rb-note'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: _burnt ? const Color(0xFFDC2626) : null,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          Expanded(child: _Board(game: g, burnt: _burnt)),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_deal)),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.all(12),
        child: g.over
            ? FilledButton.icon(
                key: const ValueKey('rb-next'),
                onPressed: _next,
                icon: Icon(g.winner == 0 ? Icons.arrow_forward : Icons.refresh),
                label: Text(g.winner == 0 ? L.t('nextLabel') : L.t('rbAgain')),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('rb-roll'),
                      onPressed: _myTurn ? _roll : null,
                      icon: const Icon(Icons.casino_outlined),
                      label: Text(L.t('rbRoll')),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('rb-bank'),
                      onPressed: _myTurn && g.unbanked(0) > 0 ? _bank : null,
                      icon: const Icon(Icons.savings_outlined),
                      label: Text('${L.t('rbBank')} +${g.unbanked(0)}'),
                    ),
                  ),
                ],
              ),
      ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_deal)),
      ],
    );
  }
}

/// Две дорожки (ты и бот) и кубик между ними.
class _Board extends StatelessWidget {
  const _Board({required this.game, required this.burnt});

  final RollAndBank game;
  final bool burnt;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final die = math.min(96.0, math.max(56.0, c.maxHeight * 0.3));
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _Lane(
              label: L.t('rbYou'),
              pos: game.position[0],
              banked: game.banked[0],
              goal: game.goal,
              color: const Color(0xFF1E88E5),
              active: !game.over && game.side == 0,
            ),
            SizedBox(
              key: const ValueKey('rb-die'),
              width: die,
              height: die,
              child: CustomPaint(painter: _DiePainter(game.lastRoll, burnt)),
            ),
            _Lane(
              label: L.t('rbBot'),
              pos: game.position[1],
              banked: game.banked[1],
              goal: game.goal,
              color: const Color(0xFFFB8C00),
              active: !game.over && game.side == 1,
            ),
          ],
        ),
      );
    });
  }
}

/// Дорожка: сохранённое — сплошным, несохранённое — светлым, финиш — флажком.
class _Lane extends StatelessWidget {
  const _Lane({
    required this.label,
    required this.pos,
    required this.banked,
    required this.goal,
    required this.color,
    required this.active,
  });

  final String label;
  final int pos;
  final int banked;
  final int goal;
  final Color color;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(children: [
          if (active) Icon(Icons.play_arrow, size: 18, color: color),
          Text(label, style: TextStyle(fontWeight: active ? FontWeight.w800 : FontWeight.w500)),
          const Spacer(),
          Text('$pos / $goal', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
          if (pos > banked) Text('  (+${pos - banked})', style: TextStyle(color: color)),
        ]),
        const SizedBox(height: 4),
        LayoutBuilder(builder: (context, c) {
          final w = c.maxWidth;
          return SizedBox(
            height: 22,
            child: Stack(children: [
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(11),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: w * pos / goal,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(11),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: w * banked / goal,
                child: DecoratedBox(
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(11)),
                ),
              ),
              const Positioned(right: 2, top: 1, child: Icon(Icons.flag, size: 18)),
            ]),
          );
        }),
      ],
    );
  }
}

/// Грань кубика: точки как на настоящем; единица — красным, она сжигает.
class _DiePainter extends CustomPainter {
  const _DiePainter(this.value, this.burnt);
  final int? value;
  final bool burnt;

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height);
    final rect = RRect.fromRectAndRadius(Offset.zero & Size(s, s), Radius.circular(s * 0.18));
    canvas.drawRRect(rect, Paint()..color = burnt ? const Color(0xFFFEE2E2) : Colors.white);
    canvas.drawRRect(
        rect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = s * 0.04
          ..color = burnt ? const Color(0xFFDC2626) : Colors.black54);
    final v = value;
    if (v == null) return;
    final pip = Paint()..color = v == 1 ? const Color(0xFFDC2626) : Colors.black87;
    final r = s * 0.09;
    final a = s * 0.27, m = s * 0.5, b = s * 0.73;
    const layout = {
      1: [(1, 1)],
      2: [(0, 0), (2, 2)],
      3: [(0, 0), (1, 1), (2, 2)],
      4: [(0, 0), (2, 0), (0, 2), (2, 2)],
      5: [(0, 0), (2, 0), (1, 1), (0, 2), (2, 2)],
      6: [(0, 0), (2, 0), (0, 1), (2, 1), (0, 2), (2, 2)],
    };
    final xs = [a, m, b];
    for (final (x, y) in layout[v]!) {
      canvas.drawCircle(Offset(xs[x], xs[y]), r, pip);
    }
  }

  @override
  bool shouldRepaint(_DiePainter old) => old.value != value || old.burnt != burnt;
}
