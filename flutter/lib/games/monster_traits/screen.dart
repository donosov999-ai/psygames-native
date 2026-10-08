import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «НАЙДИ ПРИЗНАК» — развилка «Поиск глазами», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем нативно, дорабатываем потом»). Веб-двойника нет
/// (`NATIVE_ONLY_GAMES`). Дальше экран ведёт раздел «Поиск» (задача 664b414a).
///
/// Сверху — признак («отметь всех, у кого: три глаза»), ниже — карточки. Отметил и
/// нажал «Проверить»: зачёт только точным набором, и на поле видно, кого пропустил
/// и кого отметил лишним — отказ называется, а не молчит.
class MonsterTraitsScreen extends StatefulWidget {
  const MonsterTraitsScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<MonsterTraitsScreen> createState() => _MonsterTraitsScreenState();
}

/// Подпись признака существительным («три глаза», «красный цвет»): так фраза
/// «отметь всех, у кого: …» собирается на любом из двенадцати языков без
/// согласования прилагательных.
String traitLabel(Trait t, int v) => switch ((t, v)) {
      (Trait.color, 0) => L.t('mtColorRed'),
      (Trait.color, 1) => L.t('mtColorBlue'),
      (Trait.color, _) => L.t('mtColorYellow'),
      (Trait.body, 0) => L.t('mtBodyRound'),
      (Trait.body, 1) => L.t('mtBodySquare'),
      (Trait.body, _) => L.t('mtBodySpiky'),
      (Trait.eyes, 1) => L.t('mtEyes1'),
      (Trait.eyes, 2) => L.t('mtEyes2'),
      (Trait.eyes, _) => L.t('mtEyes3'),
    };

class _MonsterTraitsScreenState extends State<MonsterTraitsScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  TraitRound? _round;
  final Set<int> _selected = {};

  /// Итог проверки; `null` — ещё отмечаем.
  ({Set<int> missed, Set<int> extras})? _graded;
  int _levelNo = 1;
  // Часы партии (lib/shell/game_clock.dart): стоят под паузой, разбором и в фоне.
  int _startedMs = gameNow();

  /// Время раунда (с L12): сколько секунд осталось; `null` — раунд без времени.
  int? _left;
  GameTimer? _tick;

  bool get _checked => _graded != null;
  bool get _won => _graded != null && _graded!.missed.isEmpty && _graded!.extras.isEmpty;

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(gameId: 'monster_traits', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_deal);
  }

  void _deal() {
    // Новая раздача — снова зачётная: отметку разбора снимает новая партия.
    LessonUsed.reset();
    _tick?.cancel();
    _levelNo = _ladder.level;
    _round = TraitRound.deal(_levelNo, _rnd);
    _selected.clear();
    _graded = null;
    _startedMs = gameNow();
    _left = traitLevelFor(_levelNo).seconds;
    if (_left != null) {
      _tick = gameInterval(const Duration(seconds: 1), () {
        if (!mounted || _checked) return;
        if (_left! <= 1) {
          setState(() => _left = 0);
          _check(timeUp: true);
        } else {
          setState(() => _left = _left! - 1);
        }
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _toggle(int i) {
    if (_checked) return;
    setState(() {
      if (!_selected.remove(i)) _selected.add(i);
    });
  }

  /// Проверка по кнопке или по концу времени: тогда проверяется то, что успел отметить.
  Future<void> _check({bool timeUp = false}) async {
    final round = _round;
    if (round == null || _checked || (_selected.isEmpty && !timeUp)) return;
    _tick?.cancel();
    final g = round.grade(_selected);
    setState(() => _graded = g);
    final errors = g.missed.length + g.extras.length;
    errors == 0 ? _haptics.win() : _haptics.miss();
    final seconds = (gameNow() - _startedMs) ~/ 1000;
    final details = <String, Object?>{
      'trait': round.trait.name,
      'value': round.value,
      'correct_count': round.target.length,
      'selected_count': _selected.length,
      'missed': g.missed.length,
      'extras': g.extras.length,
      if (round.isPair) 'trait2': round.trait2!.name,
      if (round.isPair) 'value2': round.value2,
      if (round.negate2) 'negate2': true,
      if (traitLevelFor(_levelNo).seconds != null) 'seconds': traitLevelFor(_levelNo).seconds,
      if (timeUp) 'time_up': true,
    };
    if (errors == 0) {
      await _ladder.win(errors: 0, timeSeconds: seconds, score: 100, details: details);
    } else {
      await _ladder.fail(errors: errors, timeSeconds: seconds, details: details);
    }
    if (mounted) setState(() {});
  }

  void _next() => setState(_deal);

  /*
   * РАЗБОР — ПРИЁМ, А НЕ ОТВЕТ: «смотри только на один признак». Шаги отмечают
   * нужные карточки по одной в порядке чтения, последний — «пройди поле ещё раз».
   */
  Future<void> _openLesson() async {
    final round = _round;
    if (round == null) return;
    final label = traitLabel(round.trait, round.value);
    final order = round.target.toList()..sort();
    // Приём зависит от условия: один признак — смотри только на него; два — сперва
    // первый, среди найденных второй; «но не» — сперва первый, потом ОТБРОСЬ второй.
    final second = round.isPair ? traitLabel(round.trait2!, round.value2!) : '';
    final steps = <LessonStep>[
      LessonStep(
        payload: const <int>{},
        techniqueKey: 'teachTraitScan',
        text: L.f('teachTraitScan', {'trait': label}),
      ),
      if (round.isPair)
        LessonStep(
          payload: const <int>{},
          techniqueKey: round.negate2 ? 'teachTraitNot' : 'teachTraitPair',
          // Литералы в обеих ветках: сборщик словаря видит ключ только в `L.f('…')`.
          text: round.negate2
              ? L.f('teachTraitNot', {'trait': label, 'trait2': second})
              : L.f('teachTraitPair', {'trait': label, 'trait2': second}),
        ),
      for (var k = 0; k < order.length; k++)
        LessonStep(
          payload: order.take(k + 1).toSet(),
          techniqueKey: 'teachTraitMark',
          text: L.f('teachTraitMark', {'trait': label}),
        ),
      LessonStep(
        payload: order.toSet(),
        techniqueKey: 'teachTraitCheck',
        text: L.t('teachTraitCheck'),
      ),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('monsterTraits'),
        steps: steps,
        board: (context, side, shown) {
          final sel = shown == 0 ? const <int>{} : steps[(shown - 1).clamp(0, steps.length - 1)].payload as Set<int>;
          return SizedBox(
            width: side,
            height: side,
            child: _Grid(round: round, selected: sel, graded: null, maxW: side, maxH: side),
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final round = _round;
    if (round == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final g = _graded;
    return GameShell(
      title: L.t('monsterTraits'),
      onLesson: _checked ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        if (_left != null) HudItem(label: L.t('time'), value: '$_left', icon: Icons.timer_outlined),
        HudItem(label: L.t('puzzleHudMarked'), value: '${_selected.length}', icon: Icons.touch_app_outlined),
        if (g != null)
          HudItem(label: L.t('errors'), value: '${g.missed.length + g.extras.length}', icon: Icons.error_outline),
      ],
      field: (context, h) => Column(
        children: [
          _Prompt(round: round),
          const SizedBox(height: 8),
          Expanded(
            child: LayoutBuilder(
              builder: (context, c) => _Grid(
                round: round,
                selected: _selected,
                graded: g,
                maxW: c.maxWidth,
                maxH: c.maxHeight,
                onTap: _checked ? null : _toggle,
              ),
            ),
          ),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.clear_all,
          label: L.t('mtClear'),
          onPressed: _checked || _selected.isEmpty ? null : () => setState(_selected.clear),
        ),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.all(12),
        child: !_checked
            ? FilledButton.icon(
                key: const ValueKey('mt-check'),
                onPressed: _selected.isEmpty ? null : _check,
                icon: const Icon(Icons.check),
                label: Text(L.t('check')),
              )
            : FilledButton.icon(
                key: const ValueKey('mt-next'),
                onPressed: _next,
                icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                label: Text(_won
                    ? '★★★ · ${L.t('nextLabel')}'
                    : '${L.t('mtMissed')}: ${g!.missed.length} · ${L.t('mtExtra')}: ${g.extras.length}'),
              ),
      ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_deal)),
      ],
    );
  }
}

/// «Отметь всех, у кого: [знак признака] подпись».
class _Prompt extends StatelessWidget {
  const _Prompt({required this.round});

  final TraitRound round;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Wrap(
        key: const ValueKey('mt-prompt'),
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 6,
        children: [
          Text(L.t('mtFind'), style: text.titleMedium),
          _TraitChip(trait: round.trait, value: round.value),
          if (round.isPair) ...[
            Text(
              round.negate2 ? L.t('mtButNot') : L.t('mtAnd'),
              key: const ValueKey('mt-joint'),
              style: text.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: round.negate2 ? const Color(0xFFDC2626) : null,
              ),
            ),
            _TraitChip(trait: round.trait2!, value: round.value2!, crossed: round.negate2),
          ],
        ],
      ),
    );
  }
}

/// Признак плашкой: значок и подпись. Зачёркнутый — тот, что надо отбросить («но не»).
class _TraitChip extends StatelessWidget {
  const _TraitChip({required this.trait, required this.value, this.crossed = false});

  final Trait trait;
  final int value;
  final bool crossed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: crossed ? const Color(0xFFFEE2E2) : scheme.primaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(width: 26, height: 26, child: CustomPaint(painter: _TraitIconPainter(trait, value))),
        const SizedBox(width: 6),
        Text(
          traitLabel(trait, value),
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: crossed ? const Color(0xFF991B1B) : scheme.onPrimaryContainer,
            decoration: crossed ? TextDecoration.lineThrough : null,
          ),
        ),
      ]),
    );
  }
}

/// Поле карточек: колонок столько, чтобы всё встало без прокрутки.
class _Grid extends StatelessWidget {
  const _Grid({
    required this.round,
    required this.selected,
    required this.graded,
    required this.maxW,
    required this.maxH,
    this.onTap,
  });

  final TraitRound round;
  final Set<int> selected;
  final ({Set<int> missed, Set<int> extras})? graded;
  final double maxW;
  final double maxH;
  final void Function(int)? onTap;

  @override
  Widget build(BuildContext context) {
    final n = round.cards.length;
    final cols = n <= 6 ? 3 : n <= 9 ? 3 : n <= 12 ? 4 : 5;
    final rows = (n / cols).ceil();
    const gap = 8.0;
    final cell = math.max(40.0, math.min((maxW - 16 - gap * (cols - 1)) / cols, (maxH - 8 - gap * (rows - 1)) / rows));
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Wrap(
        spacing: gap,
        runSpacing: gap,
        alignment: WrapAlignment.center,
        children: [
          for (var i = 0; i < n; i++) _card(i, cell, scheme),
        ],
      ),
    );
  }

  Widget _card(int i, double cell, ColorScheme scheme) {
    final m = round.cards[i];
    final g = graded;
    final isSel = selected.contains(i);
    Color border = isSel ? const Color(0xFF6D4C41) : scheme.outlineVariant;
    double width = isSel ? 4 : 1.5;
    IconData? mark;
    Color? markColor;
    if (g != null) {
      if (g.missed.contains(i)) {
        border = const Color(0xFFFB8C00);
        width = 4;
        mark = Icons.priority_high;
        markColor = const Color(0xFFFB8C00);
      } else if (g.extras.contains(i)) {
        border = const Color(0xFFDC2626);
        width = 4;
        mark = Icons.close;
        markColor = const Color(0xFFDC2626);
      } else if (isSel) {
        border = const Color(0xFF16A34A);
        mark = Icons.check;
        markColor = const Color(0xFF16A34A);
      }
    }
    final tap = onTap;
    return Semantics(
      button: tap != null,
      selected: isSel,
      label: '${traitLabel(Trait.color, m.color)}, ${traitLabel(Trait.body, m.body)}, ${traitLabel(Trait.eyes, m.eyes)}',
      child: InkWell(
        key: ValueKey('mt-card-$i'),
        borderRadius: BorderRadius.circular(cell * 0.18),
        onTap: tap == null ? null : () => tap(i),
        child: Container(
          width: cell,
          height: cell,
          decoration: BoxDecoration(
            color: isSel ? const Color(0xFFFFF3E0) : scheme.surface,
            borderRadius: BorderRadius.circular(cell * 0.18),
            border: Border.all(color: border, width: width),
          ),
          child: Stack(children: [
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(cell * 0.1),
                child: CustomPaint(painter: MonsterPainter(m)),
              ),
            ),
            if (mark != null)
              Positioned(
                right: 2,
                top: 2,
                child: Icon(mark, size: math.max(14, cell * 0.24), color: markColor),
              ),
          ]),
        ),
      ),
    );
  }
}

const _bodyColors = [Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFFFDD835)];

/// Монстр: тело (круг / квадрат / колючее), цвет и 1–3 глаза.
class MonsterPainter extends CustomPainter {
  const MonsterPainter(this.m);
  final Monster m;

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height);
    final c = Offset(size.width / 2, size.height / 2);
    final r = s * 0.42;
    final fill = Paint()..color = _bodyColors[m.color];
    final edge = Paint()
      ..color = Colors.black54
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, s * 0.03);
    final Path body;
    switch (m.body) {
      case 0:
        body = Path()..addOval(Rect.fromCircle(center: c, radius: r));
      case 1:
        body = Path()
          ..addRRect(RRect.fromRectAndRadius(Rect.fromCircle(center: c, radius: r * 0.92), Radius.circular(r * 0.2)));
      default:
        body = Path();
        const spikes = 9;
        for (var k = 0; k < spikes * 2; k++) {
          final a = -math.pi / 2 + k * math.pi / spikes;
          final rr = k.isEven ? r : r * 0.72;
          final p = c + Offset(math.cos(a) * rr, math.sin(a) * rr);
          k == 0 ? body.moveTo(p.dx, p.dy) : body.lineTo(p.dx, p.dy);
        }
        body.close();
    }
    canvas.drawPath(body, fill);
    canvas.drawPath(body, edge);
    // Глаза: белок и зрачок, в ряд по верхней половине.
    final eyeR = r * (m.eyes == 3 ? 0.2 : 0.24);
    final gap = eyeR * 2.3;
    final y = c.dy - r * 0.18;
    final white = Paint()..color = Colors.white;
    final pupil = Paint()..color = Colors.black87;
    for (var k = 0; k < m.eyes; k++) {
      final x = c.dx + (k - (m.eyes - 1) / 2) * gap;
      canvas.drawCircle(Offset(x, y), eyeR, white);
      canvas.drawCircle(Offset(x, y), eyeR, edge);
      canvas.drawCircle(Offset(x, y + eyeR * 0.15), eyeR * 0.45, pupil);
    }
    // Рот — чтобы монстр читался лицом, а не пятном.
    final mouth = Paint()
      ..color = Colors.black87
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, s * 0.035)
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(Rect.fromCenter(center: c + Offset(0, r * 0.35), width: r * 0.7, height: r * 0.35), 0.2, math.pi - 0.4,
        false, mouth);
  }

  @override
  bool shouldRepaint(MonsterPainter old) => old.m != m;
}

/// Значок признака в подсказке: пятно цвета, контур тела или ряд глаз.
class _TraitIconPainter extends CustomPainter {
  const _TraitIconPainter(this.trait, this.value);
  final Trait trait;
  final int value;

  @override
  void paint(Canvas canvas, Size size) {
    switch (trait) {
      case Trait.color:
        MonsterPainter(Monster(value, 0, 2)).paint(canvas, size);
      case Trait.body:
        // Серое тело той формы — цвет тут ни при чём, и значок не должен его подсказывать.
        final grey = Monster(0, value, 2);
        canvas.saveLayer(Offset.zero & size, Paint()..colorFilter = const ColorFilter.matrix(_grey));
        MonsterPainter(grey).paint(canvas, size);
        canvas.restore();
      case Trait.eyes:
        final grey = Monster(0, 0, value);
        canvas.saveLayer(Offset.zero & size, Paint()..colorFilter = const ColorFilter.matrix(_grey));
        MonsterPainter(grey).paint(canvas, size);
        canvas.restore();
    }
  }

  static const _grey = <double>[
    0.33, 0.33, 0.33, 0, 40, //
    0.33, 0.33, 0.33, 0, 40,
    0.33, 0.33, 0.33, 0, 40,
    0, 0, 0, 1, 0,
  ];

  @override
  bool shouldRepaint(_TraitIconPainter old) => old.trait != trait || old.value != value;
}
