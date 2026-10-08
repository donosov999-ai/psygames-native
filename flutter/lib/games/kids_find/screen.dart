import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «НАЙДИ ДРУГУЮ» — развилка «Поиск глазами», движок MindLab `kids/find.py`.
///
/// Пять досок на ступень, на каждой одна фигура не как все — нажать её. Промах не
/// заканчивает доску: фигура вздрагивает красным, ошибка считается, ищем дальше.
/// Ступень взята, если ошибок не больше одной. С L16 у доски есть время; не успел —
/// доска засчитана ошибкой и сменяется следующей.
class KidsFindScreen extends StatefulWidget {
  const KidsFindScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<KidsFindScreen> createState() => _KidsFindScreenState();
}

enum _Phase { playing, right, result }

class _KidsFindScreenState extends State<KidsFindScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  FindBoard? _board;
  _Phase _phase = _Phase.playing;
  int _levelNo = 1;
  int _boardNo = 0; // с нуля
  int _errors = 0;
  int? _wrongAt; // клетка, по которой только что промахнулись
  bool _won = false;
  double? _left;
  // Часы партии (lib/shell/game_clock.dart): стоят под паузой, разбором и в фоне.
  GameTimer? _tick, _next;
  int _startedMs = gameNow();

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(gameId: 'kids_find', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_newLevel);
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    super.dispose();
  }

  void _newLevel() {
    // Новая партия — снова зачётная: отметку разбора снимает новая раздача.
    LessonUsed.reset();
    _levelNo = _ladder.level;
    _boardNo = 0;
    _errors = 0;
    _won = false;
    _startedMs = gameNow();
    _deal();
  }

  void _deal() {
    _tick?.cancel();
    _next?.cancel();
    _board = FindBoard.deal(_levelNo, _rnd);
    _phase = _Phase.playing;
    _wrongAt = null;
    final seconds = findLevelFor(_levelNo).seconds;
    _left = seconds;
    if (seconds != null) {
      _tick = gameInterval(const Duration(milliseconds: 100), () {
        if (!mounted || _phase != _Phase.playing) return;
        final left = (_left! - 0.1).clamp(0.0, 999.0);
        setState(() => _left = left);
        if (left <= 1e-9) {
          // Не успел — доска засчитана ошибкой.
          _haptics.miss();
          _errors += 1;
          _advance();
        }
      });
    }
  }

  void _tap(int i) {
    final b = _board;
    if (b == null || _phase != _Phase.playing) return;
    if (i == b.target) {
      _haptics.hit();
      setState(() => _phase = _Phase.right);
      _tick?.cancel();
      _next = gameTimeout(const Duration(milliseconds: 450), _advance);
    } else {
      _haptics.miss();
      setState(() {
        _errors += 1;
        _wrongAt = i;
      });
      _next?.cancel();
      _next = gameTimeout(const Duration(milliseconds: 350), () {
        if (mounted && _phase == _Phase.playing) setState(() => _wrongAt = null);
      });
    }
  }

  Future<void> _advance() async {
    if (!mounted) return;
    _tick?.cancel();
    if (_boardNo + 1 < findBoards) {
      setState(() {
        _boardNo += 1;
        _deal();
      });
      return;
    }
    final passed = _errors <= findErrorsAllowed;
    final seconds = (gameNow() - _startedMs) ~/ 1000;
    final lv = findLevelFor(_levelNo);
    final details = <String, Object?>{
      'side': lv.side,
      'axis': lv.axis.name,
      'mixed': lv.mixed,
      if (lv.seconds != null) 'seconds': lv.seconds,
      'boards': findBoards,
    };
    final score = math.max(0, (findBoards - _errors) * 100);
    if (passed) {
      await _ladder.win(score: score, timeSeconds: seconds, errors: _errors, details: details);
    } else {
      await _ladder.fail(score: score, timeSeconds: seconds, errors: _errors, details: details);
    }
    if (!mounted) return;
    setState(() {
      _won = passed;
      _phase = _Phase.result;
    });
  }

  /// РАЗБОР — ПРИЁМ ПО ОСИ ДОСКИ: цвет выскакивает сам, если окинуть поле целиком;
  /// форму и размер сравнивают по одному признаку; сочетание — назвать виды помех.
  List<DemoTrial> _demoTrials() {
    final b = _board!;
    final rule = switch (b.axis) {
      FindAxis.color => L.t('teachFindPopout'),
      FindAxis.shape || FindAxis.size => L.t('teachFindOneTrait'),
      FindAxis.conjunction => L.t('teachFindConjunction'),
    };
    return [
      DemoTrial(text: '', rule: rule, art: _BoardArt(board: b, mark: b.target)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final b = _board;
    if (b == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('kidsFind'),
      onLesson: _phase == _Phase.playing
          ? () => openDemoLesson(context, title: L.t('kidsFind'), trials: _demoTrials())
          : null,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${math.min(_boardNo + 1, findBoards)}/$findBoards', icon: Icons.grid_view),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.error_outline),
        if (_left != null && _phase != _Phase.result)
          HudItem(label: L.t('time'), value: _left!.toStringAsFixed(1), icon: Icons.timer_outlined),
      ],
      field: (context, h) => LayoutBuilder(builder: (context, c) {
        final side = math.min(c.maxWidth, c.maxHeight) - 16;
        final cell = side / b.side;
        return Center(
          child: SizedBox(
            key: const ValueKey('kf-board'),
            width: side,
            height: side,
            child: Stack(children: [
              for (var i = 0; i < b.items.length; i++)
                Positioned(
                  left: (i % b.side) * cell,
                  top: (i ~/ b.side) * cell,
                  width: cell,
                  height: cell,
                  child: Semantics(
                    button: true,
                    label: _label(b.items[i]),
                    child: GestureDetector(
                      key: ValueKey('kf-item-$i'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _tap(i),
                      child: Container(
                        margin: EdgeInsets.all(cell * 0.06),
                        decoration: BoxDecoration(
                          color: _phase == _Phase.right && i == b.target
                              ? const Color(0x3322C55E)
                              : _wrongAt == i
                                  ? const Color(0x33EF4444)
                                  : Colors.transparent,
                          borderRadius: BorderRadius.circular(cell * 0.18),
                        ),
                        child: CustomPaint(painter: FindItemPainter(b.items[i])),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        );
      }),
      toolbar: _phase != _Phase.result
          ? null
          : Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('kf-next'),
                onPressed: () => setState(_newLevel),
                icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                label: Text('${_won ? L.t('nextLabel') : L.t('retry')} · ${L.t('errors')} $_errors'),
              ),
            ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_newLevel)),
      ],
    );
  }

  /// Подпись для диктора — то же, что видит глаз: цвет, форма, размер.
  String _label(FindItem m) => '${m.color.name} ${m.shape.name} ${m.size.name}';
}

/// Рисунок шага разбора: та же доска теми же фигурами, другая обведена.
class _BoardArt extends StatelessWidget {
  const _BoardArt({required this.board, required this.mark});
  final FindBoard board;
  final int mark;

  @override
  Widget build(BuildContext context) => FittedBox(
        child: SizedBox(
          width: 300,
          height: 300,
          child: Stack(children: [
            for (var i = 0; i < board.items.length; i++)
              Positioned(
                left: (i % board.side) * 300 / board.side,
                top: (i ~/ board.side) * 300 / board.side,
                width: 300 / board.side,
                height: 300 / board.side,
                child: Container(
                  margin: const EdgeInsets.all(3),
                  decoration: i == mark
                      ? BoxDecoration(
                          border: Border.all(color: const Color(0xFF22C55E), width: 3),
                          borderRadius: BorderRadius.circular(8),
                        )
                      : null,
                  child: CustomPaint(painter: FindItemPainter(board.items[i])),
                ),
              ),
          ]),
        ),
      );
}

const Map<FindColor, Color> findColors = {
  FindColor.vermillion: Color(0xFFD55E00),
  FindColor.blue: Color(0xFF0072B2),
  FindColor.yellow: Color(0xFFE6C619),
  FindColor.purple: Color(0xFFCC79A7),
};

/// Фигура: круг, квадрат, треугольник или звезда; маленькая — 55 % большой.
class FindItemPainter extends CustomPainter {
  const FindItemPainter(this.m);
  final FindItem m;

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height) * (m.size == FindSize.big ? 0.84 : 0.46);
    final c = Offset(size.width / 2, size.height / 2);
    final fill = Paint()..color = findColors[m.color]!;
    final edge = Paint()
      ..color = Colors.black54
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1, s * 0.04);
    final path = switch (m.shape) {
      FindShape.circle => Path()..addOval(Rect.fromCircle(center: c, radius: s / 2)),
      FindShape.square => Path()
        ..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: s * 0.9, height: s * 0.9),
            Radius.circular(s * 0.08))),
      FindShape.triangle => Path()
        ..moveTo(c.dx, c.dy - s / 2)
        ..lineTo(c.dx + s / 2, c.dy + s / 2 * 0.86)
        ..lineTo(c.dx - s / 2, c.dy + s / 2 * 0.86)
        ..close(),
      FindShape.star => _star(c, s / 2, s / 4.6),
    };
    canvas.drawPath(path, fill);
    canvas.drawPath(path, edge);
  }

  Path _star(Offset c, double r, double inner) {
    final p = Path();
    for (var k = 0; k < 10; k++) {
      final a = -math.pi / 2 + k * math.pi / 5;
      final rr = k.isEven ? r : inner;
      final pt = Offset(c.dx + rr * math.cos(a), c.dy + rr * math.sin(a));
      k == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
    }
    return p..close();
  }

  @override
  bool shouldRepaint(FindItemPainter old) => old.m != m;
}
