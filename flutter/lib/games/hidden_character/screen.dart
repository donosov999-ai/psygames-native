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

/// ЭКРАН «КТО СПРЯТАЛСЯ?» — развилка «Головоломки», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем нативно, дорабатываем потом»). Веб-двойника нет
/// (`NATIVE_ONLY_GAMES`). Дальше экран ведёт раздел «Судоку» — владелец развилки
/// «Головоломки» по доске переезда (задача 5c011a93).
///
/// Спрашиваешь «шляпа?» — неподходящие гаснут сами. Когда уверен — выбираешь
/// персонажа и подтверждаешь. Счёт — вопросы против эталона (наименьшее число
/// вопросов в худшем случае), а не голая победа.
class HiddenCharacterScreen extends StatefulWidget {
  const HiddenCharacterScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<HiddenCharacterScreen> createState() => _HiddenCharacterScreenState();
}

/// Вопрос о признаке — литералом, чтобы словарь собрал ключ из исходника.
String featureQuestion(Feature f) => switch (f) {
      Feature.hat => L.t('hcAskHat'),
      Feature.glasses => L.t('hcAskGlasses'),
      Feature.beard => L.t('hcAskBeard'),
      Feature.redShirt => L.t('hcAskRedShirt'),
      Feature.smile => L.t('hcAskSmile'),
      Feature.earring => L.t('hcAskEarring'),
    };

/// Подпись вопроса без знака вопроса: «¿Sombrero?» → «Sombrero», «Chapeau ?» → «Chapeau».
String _bare(String q) => q.replaceFirst(RegExp(r'^¿'), '').replaceFirst(RegExp(r'\s*[?？؟]$'), '').trim();

/// Первая буква строчной — для второй половины «A или b?» там, где существительные
/// пишутся со строчной (в шаблоне языка это `{b~}`; немецкий берёт `{b}` как есть).
String _lowerFirst(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

/// Текст вопроса: один признак — его вопрос, пара — шаблон «{a} или {b~}?» языка.
/// [second] — `null`, когда второй признак ещё не выбран: подпись «Шляпа или …?».
String eitherText(Feature a, Feature? second) {
  final b = second == null ? '…' : _bare(featureQuestion(second));
  return L.t('hcEither')
      .replaceAll('{a}', _bare(featureQuestion(a)))
      .replaceAll('{b~}', second == null ? b : _lowerFirst(b))
      .replaceAll('{b}', b);
}

String questionText(Question q) {
  final fs = questionFeatures(q);
  return fs.length == 1 ? featureQuestion(fs.single) : eitherText(fs[0], fs[1]);
}

class _HiddenCharacterScreenState extends State<HiddenCharacterScreen> {
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  HiddenRound? _round;
  int _levelNo = 1;
  int? _chosen;
  int? _picked;
  String _note = '';

  /// Режим «или…»: первое нажатие выбирает признак, второе задаёт «A или B?».
  bool _orMode = false;
  Feature? _orFirst;
  DateTime _started = DateTime.now();

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(gameId: 'hidden_character', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_deal);
  }

  void _deal() {
    _levelNo = _ladder.level;
    _round = HiddenRound.deal(_levelNo, _rnd);
    _chosen = null;
    _picked = null;
    _orMode = false;
    _orFirst = null;
    _note = L.t('hcStart');
    _started = DateTime.now();
  }

  bool get _over => _round?.won != null;

  void _ask(Feature f) {
    final r = _round;
    if (r == null || _over) return;
    if (!_orMode) {
      _askQuestion(askAbout(f));
      return;
    }
    final first = _orFirst;
    if (first == null || first == f) {
      setState(() => _orFirst = first == f ? null : f);   // выбрать или снять первый
      return;
    }
    _askQuestion(askEither(first, f));
  }

  void _askQuestion(Question q) {
    final r = _round;
    if (r == null || _over || r.wasAskedQuestion(q)) return;
    final yes = r.askQuestion(q);
    setState(() {
      _note = '${questionText(q)} — ${yes ? L.t('hcYes') : L.t('hcNo')}';
      _orMode = false;
      _orFirst = null;
      if (_chosen != null && !r.remaining.contains(_chosen)) _chosen = null;
    });
  }

  /// Можно ли ещё задать хоть одну пару с признаком [f].
  bool _pairOpen(HiddenRound r, Feature f) =>
      r.features.any((g) => g != f && !r.wasAskedQuestion(askEither(f, g)));

  /// Показывать ли кнопку признака сейчас.
  bool _showFeature(HiddenRound r, Feature f) {
    if (!_orMode) return !r.wasAsked(f);
    final first = _orFirst;
    if (first == null) return _pairOpen(r, f);
    return f == first || !r.wasAskedQuestion(askEither(first, f));
  }

  void _choose(int i) {
    final r = _round;
    if (r == null || _over || !r.remaining.contains(i)) return;
    setState(() => _chosen = _chosen == i ? null : i);
  }

  Future<void> _confirm() async {
    final r = _round;
    final i = _chosen;
    if (r == null || i == null || _over) return;
    final candidates = r.remaining.length;
    final won = r.pick(i);
    setState(() {
      _picked = i;
      _note = won ? L.t('hcRight') : L.t('hcWrong');
    });
    final details = <String, Object?>{
      'won': won,
      'questions_used': r.asked.length,
      'optimal_questions': r.optimal,
      'extra_questions': r.extraQuestions,
      // Навык — ошибочные выборы (вопрос ухудшил гарантию), а не число вопросов.
      'mistakes': r.mistakes,
      'traps': (r.traps * 100).round() / 100,
      'candidates_at_pick': candidates,
      'suspects': r.suspects.length,
      'features': r.features.length,
      'or_questions': r.withOr,
    };
    final seconds = DateTime.now().difference(_started).inSeconds;
    if (won) {
      await _ladder.win(errors: r.mistakes, timeSeconds: seconds, details: details);
    } else {
      await _ladder.fail(errors: r.mistakes + 1, timeSeconds: seconds, details: details);
    }
    if (mounted) setState(() {});
  }

  void _next() => setState(_deal);

  static final _compact = OutlinedButton.styleFrom(
    visualDensity: VisualDensity.compact,
    minimumSize: const Size(0, 36),
    padding: const EdgeInsets.symmetric(horizontal: 10),
  );
  /// Выбранный признак и включённое «или…» — заметно отличаются от остальных кнопок.
  static final _compactPicked = OutlinedButton.styleFrom(
    visualDensity: VisualDensity.compact,
    minimumSize: const Size(0, 36),
    padding: const EdgeInsets.symmetric(horizontal: 10),
    backgroundColor: const Color(0x337F7FD5),
    side: const BorderSide(color: Color(0xFF7F7FD5), width: 2),
  );
  static final _compactFilled = FilledButton.styleFrom(
    visualDensity: VisualDensity.compact,
    minimumSize: const Size(0, 36),
    padding: const EdgeInsets.symmetric(horizontal: 12),
  );

  /// Звёзды — за выбор вопросов, а не за удачу ответов (замер 30.09 в model.dart).
  int get _stars {
    final r = _round!;
    if (r.mistakes == 0) return 3;
    return r.mistakes == 1 ? 2 : 1;
  }

  /*
   * РАЗБОР — ПРИЁМ «ДЕЛИ ПОПОЛАМ». Из того, что осталось сейчас, каждый шаг берёт
   * вопрос с наименьшим худшим случаем и называет, как он делит («да — 5, нет — 7»);
   * ответ применяется настоящий, поэтому партия с разбором не засчитывается.
   */
  Future<void> _openLesson() async {
    final r = _round;
    if (r == null) return;
    var left = r.remaining.toList()..sort();
    // Все ещё не заданные вопросы, включая пары «или» на ступенях 9+.
    final avail = [for (final q in r.questions) if (!r.wasAskedQuestion(q)) q];
    final steps = <LessonStep>[];
    while (left.length > 1) {
      final masks = [for (final i in left) r.suspects[i]];
      final q = bestQuestionFor(masks, avail);
      if (q == null) break;
      final yes = masks.where((m) => answersYes(m, q)).length;
      final answer = answersYes(r.suspects[r.target], q);
      left = [for (final i in left) if (answersYes(r.suspects[i], q) == answer) i];
      avail.remove(q);
      steps.add(LessonStep(
        payload: left.toSet(),
        techniqueKey: 'teachHiddenHalf',
        text: L.f('teachHiddenHalf', {
          'q': questionText(q),
          'yes': '$yes',
          'no': '${masks.length - yes}',
        }),
      ));
    }
    steps.add(LessonStep(payload: left.toSet(), techniqueKey: 'teachHiddenLast', text: L.t('teachHiddenLast')));
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('hiddenCharacter'),
        steps: steps,
        board: (context, side, shown) {
          final alive = shown == 0 ? r.remaining : steps[(shown - 1).clamp(0, steps.length - 1)].payload as Set<int>;
          return SizedBox(
            width: side,
            height: side,
            child: _Grid(round: r, alive: alive, maxW: side, maxH: side),
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final r = _round;
    if (r == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('hiddenCharacter'),
      onLesson: _over ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        HudItem(label: L.t('hcQuestions'), value: '${r.asked.length}', icon: Icons.help_outline),
        HudItem(label: L.t('hcLeft'), value: '${r.remaining.length}', icon: Icons.people_outline),
      ],
      field: (context, h) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Text(
              _note,
              key: const ValueKey('hc-note'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, c) => _Grid(
                round: r,
                alive: r.remaining,
                maxW: c.maxWidth,
                maxH: c.maxHeight,
                chosen: _chosen,
                picked: _picked,
                reveal: _over,
                onTap: _over ? null : _choose,
              ),
            ),
          ),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_deal)),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.all(10),
        child: _over
            ? FilledButton.icon(
                key: const ValueKey('hc-next'),
                onPressed: _next,
                icon: Icon(r.won! ? Icons.arrow_forward : Icons.refresh),
                label: Text(r.won! ? '${'★' * _stars} · ${L.t('nextLabel')}' : L.t('hcAgain')),
              )
            /*
             * 🔴 ВОПРОСЫ И «ЭТО ОН!» — ОДНИМ РЯДОМ С ПЕРЕНОСОМ, КНОПКИ КОМПАКТНЫЕ.
             * Замер 30.09.2026 (проба mindlab_small_screens): на 320×568 шесть вопросов
             * вставали в три ряда, «Это он!» — отдельным четвёртым, и низ выдавливал поле
             * с 24 персонажами — колонка переполнялась на 10 px. Один перенос вместо
             * «ряд + строка» и плотность compact возвращают полю место; высота кнопки не
             * ниже 36 — палец попадает.
             */
            : Wrap(
                alignment: WrapAlignment.center,
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final f in r.features)
                    if (_showFeature(r, f))
                      OutlinedButton(
                        key: ValueKey('hc-ask-${f.name}'),
                        style: f == _orFirst ? _compactPicked : _compact,
                        onPressed: () => _ask(f),
                        child: Text(featureQuestion(f)),
                      ),
                  // Ступени 9+: «или…» — следующие два нажатия задают «A или B?».
                  if (r.withOr && r.features.any((f) => _pairOpen(r, f)))
                    OutlinedButton(
                      key: const ValueKey('hc-or'),
                      style: _orMode ? _compactPicked : _compact,
                      onPressed: () => setState(() {
                        _orMode = !_orMode;
                        _orFirst = null;
                      }),
                      child: Text(_orFirst == null ? L.t('hcOrMode') : eitherText(_orFirst!, null)),
                    ),
                  FilledButton.icon(
                    key: const ValueKey('hc-confirm'),
                    style: _compactFilled,
                    onPressed: _chosen == null ? null : _confirm,
                    icon: const Icon(Icons.person_search, size: 18),
                    label: Text(L.t('hcConfirm')),
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

/// Персонажи сеткой: колонок столько, чтобы все встали без прокрутки.
class _Grid extends StatelessWidget {
  const _Grid({
    required this.round,
    required this.alive,
    required this.maxW,
    required this.maxH,
    this.chosen,
    this.picked,
    this.reveal = false,
    this.onTap,
  });

  final HiddenRound round;
  final Set<int> alive;
  final double maxW;
  final double maxH;
  final int? chosen;
  final int? picked;
  final bool reveal;
  final void Function(int)? onTap;

  @override
  Widget build(BuildContext context) {
    final n = round.suspects.length;
    final cols = n <= 8 ? 4 : n <= 12 ? 4 : n <= 16 ? 4 : n <= 20 ? 5 : 6;
    final rows = (n / cols).ceil();
    const gap = 6.0;
    final cell = math.max(36.0, math.min((maxW - 16 - gap * (cols - 1)) / cols, (maxH - 8 - gap * (rows - 1)) / rows));
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Wrap(
        spacing: gap,
        runSpacing: gap,
        alignment: WrapAlignment.center,
        children: [for (var i = 0; i < n; i++) _card(i, cell, scheme)],
      ),
    );
  }

  Widget _card(int i, double cell, ColorScheme scheme) {
    final on = alive.contains(i);
    var border = scheme.outlineVariant;
    var width = 1.5;
    if (chosen == i) {
      border = const Color(0xFF6D4C41);
      width = 4;
    }
    if (reveal && i == round.target) {
      border = const Color(0xFF16A34A);
      width = 4;
    } else if (reveal && i == picked) {
      border = const Color(0xFFDC2626);
      width = 4;
    }
    final tap = onTap;
    return Semantics(
      button: tap != null && on,
      selected: chosen == i,
      label: [
        for (final f in round.features)
          if (hasFeature(round.suspects[i], f)) featureQuestion(f),
      ].join(' '),
      child: InkWell(
        key: ValueKey('hc-suspect-$i'),
        borderRadius: BorderRadius.circular(cell * 0.16),
        onTap: tap == null || !on ? null : () => tap(i),
        child: Opacity(
          opacity: on || (reveal && i == round.target) ? 1 : 0.28,
          child: Container(
            width: cell,
            height: cell,
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(cell * 0.16),
              border: Border.all(color: border, width: width),
            ),
            child: Stack(children: [
              Positioned.fill(child: CustomPaint(painter: FacePainter(round.suspects[i]))),
              if (!on && !(reveal && i == round.target))
                Positioned.fill(child: Icon(Icons.close, color: const Color(0xFF9CA3AF), size: cell * 0.7)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Лицо персонажа из маски признаков: шляпа, очки, борода, красная/синяя кофта,
/// улыбка, серёжка. Нарисовано, а не собрано из эмодзи: эмодзи не складываются в
/// одно лицо и выглядят на каждой платформе по-своему.
class FacePainter extends CustomPainter {
  const FacePainter(this.mask);
  final int mask;

  bool _has(Feature f) => hasFeature(mask, f);

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height);
    final cx = size.width / 2;
    final top = (size.height - s) / 2;
    final ink = Paint()
      ..color = Colors.black87
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, s * 0.03)
      ..strokeCap = StrokeCap.round;
    // Кофта — плечи по низу карточки.
    final shirt = Paint()..color = _has(Feature.redShirt) ? const Color(0xFFE53935) : const Color(0xFF1E88E5);
    canvas.drawRRect(
      RRect.fromRectAndCorners(
        Rect.fromLTWH(cx - s * 0.36, top + s * 0.74, s * 0.72, s * 0.26),
        topLeft: Radius.circular(s * 0.16),
        topRight: Radius.circular(s * 0.16),
      ),
      shirt,
    );
    // Голова.
    final head = Offset(cx, top + s * 0.46);
    final hr = s * 0.25;
    canvas.drawCircle(head, hr, Paint()..color = const Color(0xFFF5CBA7));
    // Борода — по нижней половине головы.
    if (_has(Feature.beard)) {
      final beard = Path()
        ..moveTo(head.dx - hr * 0.95, head.dy + hr * 0.05)
        ..quadraticBezierTo(head.dx, head.dy + hr * 1.55, head.dx + hr * 0.95, head.dy + hr * 0.05)
        ..quadraticBezierTo(head.dx, head.dy + hr * 0.75, head.dx - hr * 0.95, head.dy + hr * 0.05);
      canvas.drawPath(beard, Paint()..color = const Color(0xFF6D4C41));
    }
    canvas.drawCircle(head, hr, ink);
    // Шляпа или волосы.
    if (_has(Feature.hat)) {
      final hat = Paint()..color = const Color(0xFF263238);
      canvas.drawRect(Rect.fromLTWH(head.dx - hr * 1.2, head.dy - hr * 0.95, hr * 2.4, hr * 0.22), hat);
      canvas.drawRect(Rect.fromLTWH(head.dx - hr * 0.7, head.dy - hr * 1.75, hr * 1.4, hr * 0.85), hat);
    } else {
      canvas.drawArc(Rect.fromCircle(center: head, radius: hr), math.pi * 1.1, math.pi * 0.8, false,
          Paint()
            ..color = const Color(0xFF8D6E63)
            ..style = PaintingStyle.stroke
            ..strokeWidth = hr * 0.35);
    }
    // Глаза и очки.
    final ey = head.dy - hr * 0.12;
    final ex = hr * 0.42;
    final pupil = Paint()..color = Colors.black87;
    canvas.drawCircle(Offset(head.dx - ex, ey), hr * 0.09, pupil);
    canvas.drawCircle(Offset(head.dx + ex, ey), hr * 0.09, pupil);
    if (_has(Feature.glasses)) {
      final frame = Paint()
        ..color = Colors.black87
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(1.4, s * 0.035);
      canvas.drawCircle(Offset(head.dx - ex, ey), hr * 0.3, frame);
      canvas.drawCircle(Offset(head.dx + ex, ey), hr * 0.3, frame);
      canvas.drawLine(Offset(head.dx - ex + hr * 0.3, ey), Offset(head.dx + ex - hr * 0.3, ey), frame);
    }
    // Рот: улыбка или прямая черта.
    final my = head.dy + hr * 0.42;
    if (_has(Feature.smile)) {
      canvas.drawArc(Rect.fromCenter(center: Offset(head.dx, my - hr * 0.12), width: hr * 0.9, height: hr * 0.5),
          0.15, math.pi - 0.3, false, ink);
    } else {
      canvas.drawLine(Offset(head.dx - hr * 0.3, my), Offset(head.dx + hr * 0.3, my), ink);
    }
    // Серёжка — золотой кружок у уха.
    if (_has(Feature.earring)) {
      final ear = Offset(head.dx + hr * 0.98, head.dy + hr * 0.25);
      canvas.drawCircle(ear, hr * 0.16, Paint()..color = const Color(0xFFFFC107));
      canvas.drawCircle(ear, hr * 0.16, ink..strokeWidth = math.max(1, s * 0.02));
    }
  }

  @override
  bool shouldRepaint(FacePainter old) => old.mask != mask;
}
