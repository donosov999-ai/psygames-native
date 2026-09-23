import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// SET на общем каркасе: двенадцать карт, найти тройку, где каждый признак либо
/// одинаков у всех трёх, либо различен.
///
/// 🔴 РАСКЛАД ВСЕГДА РЕШАЕМ. Стол пересобирается, пока в нём нет ни одного сета:
/// искать то, чего нет, — не задача, а наказание. Свойство держит проба.
///
/// 🔴 ПОДПИСИ — ИЗ ОБЩЕГО СЛОВАРЯ (`L.t`), не зашиты. Правило приехало с main
/// гейтом «зашитого текста не становится больше»: в приложении двенадцать языков.
class SetGameScreen extends StatefulWidget {
  const SetGameScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<SetGameScreen> createState() => _SetGameScreenState();
}

enum _Phase { playing, result }

class _SetGameScreenState extends State<SetGameScreen> {
  late LevelLadder _ladder;
  late Rng _rng;
  late SetParams _params;

  List<SetCard> _board = const [];
  final List<int> _picked = [];
  int _round = 1;
  int _hits = 0;
  int _errors = 0;
  bool? _right;
  int _leftMs = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.playing;
  Timer? _tick;
  Timer? _next;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'set_game', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  void _reset() {
    _tick?.cancel();
    _next?.cancel();
    _params = levelParams(_ladder.level);
    _round = 1;
    _hits = 0;
    _errors = 0;
    _won = false;
    _phase = _Phase.playing;
    _deal();
  }

  void _deal() {
    _tick?.cancel();
    _picked.clear();
    _right = null;
    _board = buildBoard(_rng);
    _leftMs = _params.timeLimit * 1000;
    if (_params.timeLimit <= 0) return;
    // Давление временем с одиннадцатого уровня: просрочка засчитывается ошибкой.
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      setState(() => _leftMs = math.max(0, _leftMs - 100));
      if (_leftMs <= 0) _judge(late: true);
    });
  }

  void _tap(int index) {
    if (_phase != _Phase.playing || _right != null) return;
    setState(() {
      if (_picked.contains(index)) {
        _picked.remove(index);
      } else if (_picked.length < 3) {
        _picked.add(index);
      }
    });
    if (_picked.length == 3) _judge();
  }

  void _judge({bool late = false}) {
    _tick?.cancel();
    final ok = !late && isSet(_board[_picked[0]], _board[_picked[1]], _board[_picked[2]]);
    setState(() {
      _right = ok;
      if (ok) {
        _hits += 1;
      } else {
        _errors += 1;
      }
    });
    _next?.cancel();
    _next = Timer(const Duration(milliseconds: 700), () async {
      if (!mounted) return;
      if (_round >= _params.trials) {
        final passed = _errors <= setErrorsAllowed;
        if (passed) {
          await _ladder.win();
        } else {
          await _ladder.fail();
        }
        if (!mounted) return;
        setState(() {
          _won = passed;
          _phase = _Phase.result;
        });
        return;
      }
      setState(() {
        _round += 1;
        _deal();
      });
    });
  }

  /// Подсказка: первый сет на столе. Показать решение — служебное действие,
  /// как у соседних игр, но оно засчитывается ошибкой, чтобы не обесценивать серию.
  void _showSolution() {
    final found = findAnySet(_board);
    if (found == null || _right != null) return;
    setState(() {
      _picked
        ..clear()
        ..addAll(found);
    });
    _judge(late: true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('setGame'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('round'), value: '$_round/${_params.trials}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check_circle_outline),
        HudItem(label: L.t('hud_errors'), value: '$_errors/$setErrorsAllowed', icon: Icons.error_outline),
        if (_params.timeLimit > 0)
          HudItem(label: L.t('time'), value: '${(_leftMs / 1000).ceil()}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => _Table(
        board: _board,
        picked: _picked,
        right: _right,
        height: h,
        onTap: _tap,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.backspace_outlined,
          label: L.t('a11yErase'),
          onPressed: _picked.isEmpty || _right != null ? null : () => setState(_picked.clear),
        ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
          onPressed: _phase == _Phase.playing && _right == null ? _showSolution : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == _Phase.result
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  '${_won ? L.t('nextLabel') : L.t('retry')} · ${L.t('hud_correct')} $_hits · ${L.t('hud_errors')} $_errors',
                  key: const Key('итог'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('дальше'),
                  onPressed: () => setState(_reset),
                  icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                  label: Text(_won ? L.t('nextLabel') : L.t('retry')),
                ),
              ]),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Стол: двенадцать карт в три колонки, размер — от высоты, которую дал каркас.
class _Table extends StatelessWidget {
  const _Table({
    required this.board,
    required this.picked,
    required this.right,
    required this.height,
    required this.onTap,
  });

  final List<SetCard> board;
  final List<int> picked;
  final bool? right;
  final double height;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: LayoutBuilder(builder: (context, c) {
        final t = setTable(c.maxWidth, math.max(0, height - 16), count: board.length);
        return Center(
          child: SizedBox(
            key: const Key('стол'),
            width: t.card * setColumns + t.gap * (setColumns - 1),
            child: Wrap(
              spacing: t.gap,
              runSpacing: t.gap,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < board.length; i += 1)
                  GestureDetector(
                    key: Key('карта$i'),
                    onTap: () => onTap(i),
                    child: Container(
                      width: t.card,
                      height: t.card * 1.5,
                      decoration: BoxDecoration(
                        color: scheme.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: picked.contains(i)
                              ? (right == null
                                  ? scheme.primary
                                  : (right! ? const Color(0xFF22C55E) : const Color(0xFFF43F5E)))
                              : scheme.outlineVariant,
                          width: picked.contains(i) ? 3 : 1,
                        ),
                      ),
                      child: CustomPaint(painter: _CardPainter(board[i])),
                    ),
                  ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

/// Рисунок карты: столько значков, сколько велит число; форма, цвет и заливка —
/// три остальных признака. Цвета взяты из набора Окабэ–Ито, как в вебе: без них
/// сет не собрать, поэтому они обязаны различаться и при дальтонизме.
class _CardPainter extends CustomPainter {
  _CardPainter(this.card);
  final SetCard card;

  static const Map<String, Color> _colors = {
    'red': Color(0xFFD55E00),
    'green': Color(0xFF009E73),
    'purple': Color(0xFFCC79A7),
  };

  @override
  void paint(Canvas canvas, Size size) {
    final color = _colors[card.color]!;
    final slot = size.height / (card.count + 1);
    final w = size.width * 0.52;
    final h = math.min(slot * 0.7, size.height * 0.2);
    for (var i = 0; i < card.count; i += 1) {
      final center = Offset(size.width / 2, slot * (i + 1));
      final rect = Rect.fromCenter(center: center, width: w, height: h);
      final path = Path();
      switch (card.shape) {
        case 'circle':
          path.addOval(rect);
        case 'square':
          path.addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(3)));
        default:
          path
            ..moveTo(rect.center.dx, rect.top)
            ..lineTo(rect.right, rect.bottom)
            ..lineTo(rect.left, rect.bottom)
            ..close();
      }
      final stroke = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      switch (card.fill) {
        case 'solid':
          canvas.drawPath(path, Paint()..color = color);
        case 'striped':
          canvas.save();
          canvas.clipPath(path);
          for (var y = rect.top; y < rect.bottom; y += 4) {
            canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y),
                Paint()..color = color..strokeWidth = 1.5);
          }
          canvas.restore();
          canvas.drawPath(path, stroke);
        default:
          canvas.drawPath(path, stroke);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CardPainter old) => old.card.id != card.id;
}
