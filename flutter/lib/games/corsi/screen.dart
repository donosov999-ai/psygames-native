import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/suite_switch.dart';
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

/// Личный рекорд размаха — тот же ключ, что у веб-половины (`bumpPersonalBest('corsi', 'span')`).
///
/// ⚠️ Мост пока не возит веб-пространство `psygames.`: `SharedState.set` отбрасывает ключ молча
/// (задача координатору d3eeeba9) — рекорд живёт до выхода с экрана. Ключ оставлен веб-ским нарочно:
/// после правки моста рекорд станет общим без переноса данных.
const corsiBestSpanKey = 'psygames.best.span.corsi';

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

  /// Итог боя с боссом на вехе лестницы; null — боя в этой партии не было.
  bool? _boss;

  /// Все паузы — на игровых часах каркаса: пауза приложения останавливает показ и замер.
  GameTimer? _timer;
  int? _startedAt;

  /// Длительность партии в секундах — для строки итога.
  int _seconds = 0;

  /// Рекорд размаха; null — рекорда ещё нет.
  int? _bestSpan;

  /// Вибрация — через общий выключатель «Вибрация» (веб `psygames_haptic_enabled`).
  late final AppHaptics _haptics = AppHaptics(widget.state);

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'corsi', store: SharedLevelStore(widget.state));
    _bestSpan = int.tryParse(widget.state.get(corsiBestSpanKey) ?? '');
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (GamePreset.autostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    // В шаге зарядки и «Оценки» правила задаёт шаг: длина ряда, темп и направление
    // (см. LevelParams.preset). Уровень человека — только потолок длины.
    _game = GamePreset.isPreset
        ? CorsiGame(
            level: _ladder.level,
            params: LevelParams.preset(
              level: _ladder.level,
              want: GamePreset.num('startLen', 3),
              reverse: GamePreset.str('mode', 'forward') == 'backward',
            ),
          )
        : CorsiGame(level: _ladder.level);
    _phase = Phase.ready;
    _feedback = Feedback.none;
    _lit = null;
    _revealed = false;
    _boss = null;
    _startedAt = null;
    _seconds = 0;
    // Новая раздача — партия снова зачётная. Без этого одна открытая карточка
    // разбора замораживала лестницу: отметка общая на всё приложение.
    LessonUsed.reset();
  }

  void _start() {
    _startedAt ??= gameNow();
    _showSequence();
  }

  /// Показ ряда: блок горит `flashMs`, следующий начинается через `tickMs`. Первый — тоже через
  /// `tickMs`, как веб-интервал: секунда «разгона» на то, чтобы перевести взгляд на доску.
  void _showSequence() {
    setState(() {
      _phase = Phase.show;
      _feedback = Feedback.none;
      _lit = null;
    });
    _timer?.cancel();
    _timer = gameTimeout(Duration(milliseconds: _game!.params.tickMs), () {
      if (mounted) _flash(0);
    });
  }

  void _flash(int i) {
    final g = _game!;
    if (!mounted) return;
    if (i >= g.sequence.length) {
      // Выше потолка объёма между показом и вводом стоит задержка — ось сложности.
      setState(() => _phase = g.params.holdMs > 0 ? Phase.hold : Phase.recall);
      if (g.params.holdMs == 0) return;
      _timer = gameTimeout(Duration(milliseconds: g.params.holdMs), () {
        if (mounted) setState(() => _phase = Phase.recall);
      });
      return;
    }
    setState(() => _lit = g.sequence[i]);
    _timer = gameTimeout(Duration(milliseconds: g.params.flashMs), () {
      if (!mounted) return;
      setState(() => _lit = null);
      _timer = gameTimeout(
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
      if (outcome == TapOutcome.progress) _haptics.hit();   // верный блок — щелчок, как в «Матрице»
      setState(() {});
      return;
    }
    final won = outcome == TapOutcome.roundWon;
    if (won) {
      _haptics.medium();
      // Рекорд — по ходу, как веб `bumpPersonalBest`: «дошёл дальше, чем когда-либо» видно сразу.
      if (g.span > (_bestSpan ?? 0)) {
        _bestSpan = g.span;
        widget.state.set(corsiBestSpanKey, '${g.span}');
      }
    } else {
      _haptics.heavy();
    }
    setState(() => _feedback = won ? Feedback.right : Feedback.wrong);
    // Паузы взяты из веб-версии: после промаха человек успевает понять, где сбился.
    _timer = gameTimeout(Duration(milliseconds: won ? 600 : 700), () {
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

  Future<void> _finish() async {
    final g = _game!;
    final seconds = _startedAt == null ? 0 : ((gameNow() - _startedAt!) / 1000).round();
    _seconds = seconds;
    /*
     * 🔴 МЕТКИ ПАРТИИ — КАК У ВЕБ-ЭКРАНА, А В ШАГЕ «ОЦЕНКИ» — МЕТКИ ШАГА.
     * «Оценка» опознаёт партию по difficulty и mode ДОСЛОВНО (sessionFitsStep,
     * frontend/src/services/assessment.ts) и берёт метрику из details.span. Без
     * этого домен «пространственная рабочая память» молча считался средним
     * (z = 0): замер 30.09.2026 — партия уходила с difficulty = уровень, без
     * details. Вне шага — как пишет corsi.tsx: difficulty = направление,
     * mode = L<уровень>.
     */
    final direction = g.params.reverse ? 'backward' : 'forward';
    final preset = GamePreset.isPreset;
    final difficulty = preset ? GamePreset.str('diff', 'medium') : direction;
    final mode = preset ? direction : 'L${g.level}';
    final details = <String, Object?>{'level': g.level, 'span': g.span};
    // Уровень взят, если человек повторил ряд той длины, с которой уровень начинается.
    // Веха как в вебе (corsi.tsx, BOSS_EVERY = 3): каждый третий ЗАСЧИТАННЫЙ уровень —
    // бой «сложи подсвеченные», резкая смена правила: память позиций → счёт чисел.
    // Бой идёт ДО итога партии; пока он открыт, поле держит последний отклик и нажатий
    // не принимает (_tap ждёт Feedback.none), а «спокойного момента» для правила
    // уровня ещё нет — карточка правила не встанет поверх боя.
    bool? boss;
    if (g.passed) {
      boss = await BossRound.winThenBoss(context, _ladder,
          type: BossType.counting,
          color: const Color(0xFF0083B0),
          win: () => _ladder.win(score: g.score, timeSeconds: seconds, errors: g.errors,
              mode: mode, difficulty: difficulty, details: details));
    } else {
      await _ladder.fail(score: g.score, timeSeconds: seconds, errors: g.errors,
          mode: mode, difficulty: difficulty, details: details);
    }
    if (!mounted) return;
    setState(() {
      _phase = Phase.done;
      _feedback = Feedback.none;
      _lit = null;
      _boss = boss;
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх партии (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'corsi', level: _ladder.level, state: widget.state, calm: _phase == Phase.ready || _phase == Phase.done),
      title: L.t('corsi'),
      onLesson: () => openDemoLesson(context, title: L.t('corsi'), trials: corsiLessonTrials()),
      // Шапка — как у веба: охват, длина показа / набрано, рекорд, уровень. Ошибок в шапке нет
      // НАМЕРЕННО (corsi.tsx): при подстройке сложности ошибка — норма, красный счётчик наказывает
      // за то, чего требует обучение.
      hud: [
        HudItem(label: L.t('hud_span'), value: '${g.span}', icon: Icons.straighten),
        _phase == Phase.show
            ? HudItem(label: L.t('lengthLabel'), value: '${g.sequence.length}', icon: Icons.visibility_outlined)
            : HudItem(
                label: L.t('hud_entered'),
                value: '${g.answer.length}/${g.sequence.length}',
                icon: Icons.touch_app_outlined),
        if (_bestSpan != null)
          HudItem(label: L.t('hud_best'), value: '$_bestSpan', icon: Icons.emoji_events_outlined),
        if (!GamePreset.isPreset) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
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
        // Набор «Позиции»: плашки Матрица · Корси · Наоборот (веб GameSuiteSwitch).
        suiteSwitch: SuiteSwitch(route: '/games/corsi', state: widget.state),
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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BossOutcomeLine(_boss),
                  // Итог партии: счёт, время, ошибки — то, что веб показывает экраном итога.
                  if (!_revealed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '${L.t('score')}: ${g.score} · ${L.t('time')}: ${_seconds ~/ 60}:${(_seconds % 60).toString().padLeft(2, '0')}'
                        ' · ${L.t('errors')}: ${g.errors}',
                        key: const Key('corsi-result'),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  FilledButton.icon(
                    onPressed: () => setState(_reset),
                    icon: const Icon(Icons.arrow_forward),
                    label: Text(g.passed && !_revealed ? L.t('nextLabel') : L.t('retry')),
                  ),
                ],
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
    this.suiteSwitch,
  });

  final CorsiGame game;
  final Phase phase;
  final Feedback feedback;
  final int? lit;
  final bool revealed;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  /// Переключатель режимов набора — только на экране настройки, до партии.
  final Widget? suiteSwitch;

  @override
  Widget build(BuildContext context) {
    if (phase == Phase.ready) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ?suiteSwitch,
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
        return Column(
          children: [
            SizedBox(
              height: captionH,
              child: Center(child: Text(_caption(), style: Theme.of(context).textTheme.bodyMedium)),
            ),
            CorsiBoardView(
              width: c.maxWidth - 24,
              height: height - captionH,
              block: (i, side) => _Block(
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
        key: Key('corsi-block-$index'),
        borderRadius: BorderRadius.circular(10),
        onTap: enabled ? () => onTap(index) : null,
        child: order > 0
            ? Center(
                child: Text('$order',
                    key: Key('corsi-order-$index'),
                    style: TextStyle(fontWeight: FontWeight.w800, color: scheme.onPrimaryContainer)),
              )
            : const SizedBox.expand(),
      ),
    );
  }
}

/// Доска Корси — ОДНА для партии и для разбора: девять блоков в точках веб-доски,
/// масштаб от меньшего из ширины и высоты. Разбор, нарисованный «похоже», учил бы не
/// той игре: здесь трудность и есть расположение блоков.
class CorsiBoardView extends StatelessWidget {
  const CorsiBoardView({
    super.key,
    required this.width,
    required this.height,
    required this.block,
    this.route = const [],
  });

  final double width;
  final double height;
  final Widget Function(int index, double side) block;

  /// Линия маршрута через центры блоков — только в разборе.
  final List<int> route;

  @override
  Widget build(BuildContext context) {
    final scale = (width / corsiBoardWidth).clamp(0.1, height / corsiBoardHeight);
    final side = 60 * scale;
    return SizedBox(
      width: corsiBoardWidth * scale,
      height: corsiBoardHeight * scale,
      child: Stack(
        children: [
          if (route.length > 1)
            Positioned.fill(
              child: CustomPaint(
                painter: _RoutePainter(route, scale, Theme.of(context).colorScheme.primary),
              ),
            ),
          for (var i = 0; i < corsiPositions.length; i++)
            Positioned(
              left: corsiPositions[i].x * scale - side / 2,
              top: corsiPositions[i].y * scale - side / 2,
              width: side,
              height: side,
              child: block(i, side),
            ),
        ],
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter(this.route, this.scale, this.color);
  final List<int> route;
  final double scale;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.55)
      ..strokeWidth = 4 * scale
      ..strokeCap = StrokeCap.round;
    for (var k = 1; k < route.length; k++) {
      final a = corsiPositions[route[k - 1]];
      final b = corsiPositions[route[k]];
      canvas.drawLine(Offset(a.x * scale, a.y * scale), Offset(b.x * scale, b.y * scale), paint);
    }
  }

  @override
  bool shouldRepaint(_RoutePainter old) => old.route != route || old.scale != scale || old.color != color;
}

/// Доска разбора: блоки ряда пронумерованы в ПОРЯДКЕ НАЖАТИЯ, между ними — маршрут.
/// `level` и `sequence` — те, по которым пример собран, чтобы проба могла сыграть
/// показанный ответ настоящей партией.
class CorsiLessonArt extends StatelessWidget {
  const CorsiLessonArt({
    super.key,
    required this.level,
    required this.sequence,
    this.missedStep,
  });

  final int level;

  /// Ряд в порядке ПОКАЗА.
  final List<int> sequence;

  /// Шаг ответа (с нуля), вспышку которого человек пропустил взглядом: на доске «?».
  final int? missedStep;

  /// Порядок нажатия — правилом самой игры, а не своей копией.
  List<int> get order => CorsiGame(level: level, sequence: sequence).expected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final answer = order;
    // Пропорции доски 400×420 сохранены: расположение блоков и есть задача. Ужимает
    // её под экран общая DemoCard — по ширине и, с #22, по высоте.
    return CorsiBoardView(
      width: 280,
      height: 294,
      route: missedStep == null ? answer : const [],
      block: (i, side) {
        final step = answer.indexOf(i);
        final missed = step >= 0 && step == missedStep;
        final fill = step < 0
            ? scheme.surface
            : missed
                ? scheme.errorContainer
                : scheme.primaryContainer;
        return DecoratedBox(
          decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(10)),
          child: step < 0
              ? const SizedBox.expand()
              : Center(
                  child: Text(
                    missed ? '?' : '${step + 1}',
                    key: Key('corsi-lesson-block-$i'),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: side * 0.42,
                      color: missed ? scheme.onErrorContainer : scheme.onPrimaryContainer,
                    ),
                  ),
                ),
        );
      },
    );
  }
}

/// Примеры разбора — ИЗ ГЕНЕРАТОРА САМОЙ ИГРЫ, не придуманные: ряд тянет
/// `CorsiGame.drawSequence`, порядок ответа считает `CorsiGame.expected`.
///
/// Три приёма, и каждый про то, на чём здесь ошибаются:
/// · маршрут — вспышки складывают в путь, а не держат по одной (прямой порядок, L2);
/// · обратный порядок — путь запоминают вперёд, а проходят с конца (с L10);
/// · взгляд на доске — одна пропущенная вспышка рвёт весь маршрут, «?» на её месте.
List<DemoTrial> corsiLessonTrials({Random? rnd}) {
  final r = rnd ?? Random(930);
  final forward = CorsiGame(level: 2, rnd: r).sequence;
  final backward = CorsiGame(level: 10, rnd: r).drawSequence(4);
  return [
    DemoTrial(
      text: '',
      sub: L.t('reproduceForward'),
      rule: L.t('teachCorsiPath'),
      art: CorsiLessonArt(level: 2, sequence: forward),
    ),
    DemoTrial(
      text: '',
      sub: L.t('reproduceBackward'),
      rule: L.t('teachCorsiBackward'),
      art: CorsiLessonArt(level: 10, sequence: backward),
    ),
    DemoTrial(
      text: '',
      sub: L.t('reproduceForward'),
      rule: L.t('teachCorsiEyes'),
      art: CorsiLessonArt(level: 2, sequence: forward, missedStep: 2),
    ),
  ];
}
