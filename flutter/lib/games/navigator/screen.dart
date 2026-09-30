import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/js_compat.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'generator.dart';
import 'geometry.dart';
import 'scoring.dart';
import 'session.dart';
import 'strings.dart';
import 'types.dart';

/// «НАВИГАТОР» — ЭКРАН НА ОБЩЕМ КАРКАСЕ. Перенос `frontend/src/games/navigator/NavigatorGame.tsx`
/// и стыковки из `frontend/app/games/navigator.tsx`.
///
/// Ядро (раздача, сессия, ввод, счёт) — Dart-перенос TS один в один, сверенный эталоном живого
/// ядра. Здесь только отрисовка и стыковка с приложением, и перенесены они ВМЕСТЕ С ВВОДОМ:
/// кнопки ответа, свайп по полю и клавиши (стрелки, WASD, цифры, P, R) — урок «Лаборатории»,
/// где перенос потерял двойное нажатие, добавленное по отчёту Дениса.
///
/// Что взято из стыковки веба:
///   · зерно — от уровня (`navigator-<уровень>`): повтор уровня даёт тот же маршрут, вторая
///     попытка, а не лотерея;
///   · уровень и режим можно задать шагом зарядки (`level`, `mode`); чужой режим игнорируется;
///   · порог прохождения — `isPassed` ядра, а не число здесь;
///   · уход приложения в фон ставит партию на паузу — часы партии не идут, пока человека нет;
///   · «Начать заново» — значком под полем и пунктом паузы, а не кнопкой в теле партии.
class NavigatorScreen extends StatefulWidget {
  const NavigatorScreen({super.key, required this.state, this.now, this.bundle});

  final SharedState state;

  /// Часы партии в миллисекундах. Проба подставляет свои и гоняет партию без ожидания.
  final num Function()? now;

  /// Откуда брать словарь модуля; проба подставляет свой набор ассетов.
  final AssetBundle? bundle;

  @override
  State<NavigatorScreen> createState() => _NavigatorScreenState();
}

class _NavigatorScreenState extends State<NavigatorScreen> with WidgetsBindingObserver {
  late final LevelLadder _ladder =
      LevelLadder(gameId: 'navigator', store: SharedLevelStore(widget.state), maxLevel: navigatorLevels);
  final Stopwatch _clock = Stopwatch()..start();
  final FocusNode _keys = FocusNode(debugLabel: 'navigator-keys');

  NavigatorStrings? _s;
  NavigatorSession? _session;
  int _level = 1;
  bool _reported = false;
  bool _passed = false;

  num _now() => widget.now?.call() ?? _clock.elapsedMicroseconds / 1000;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _keys.dispose();
    super.dispose();
  }

  /// Как `AppState` в вебе: приложение ушло с экрана — партия на паузе.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _update((s) => pauseNavigatorSession(s, _now()));
  }

  Future<void> _boot() async {
    await _ladder.load();
    final strings = await NavigatorStrings.load(bundle: widget.bundle);
    if (!mounted) return;
    setState(() {
      _s = strings;
      _deal();
    });
  }

  /// Новая партия на текущем уровне. Уровень из шага зарядки важнее сохранённого.
  void _deal() {
    // Новая раздача — снова зачётная (договор shell/lesson.dart).
    LessonUsed.reset();
    _level = GamePreset.num('level', _ladder.level).clamp(1, navigatorLevels);
    final asked = GamePreset.str('mode');
    final mode = NavigatorMode.values.where((m) => m.wire == asked).firstOrNull ?? navigatorModeForLevel(_level);
    _session = createNavigatorSession(NavigatorSessionConfig(seed: 'navigator-$_level', level: _level, mode: mode));
    _reported = false;
    _passed = false;
  }

  void _update(NavigatorSession Function(NavigatorSession) step) {
    final current = _session;
    if (current == null) return;
    final next = step(current);
    if (identical(next, current)) return;
    setState(() => _session = next);
    final result = next.result;
    if (next.phase == NavigatorPhase.result && result != null && !_reported) {
      _reported = true;
      _report(result);
    }
  }

  /// Итог уходит в лестницу, а лестница отдаёт партию веб-половине (`SessionReport`).
  Future<void> _report(NavigatorMetrics m) async {
    _passed = isPassed(m);
    final seconds = jsRound(m.durationMs / 1000).toInt();
    if (_passed) {
      await _ladder.win(score: m.score, timeSeconds: seconds, errors: m.errors, mode: m.mode.wire);
    } else {
      await _ladder.fail(score: m.score, timeSeconds: seconds, errors: m.errors, mode: m.mode.wire);
    }
    if (mounted) setState(() {});
  }

  void _restart() {
    _reported = false;
    _passed = false;
    _update((s) => restartNavigatorSession(s, _now()));
  }

  void _answer(Object value) {
    final now = _now();
    _update((s) => switch (value) {
          Cardinal d => inputNavigatorRouteDirection(s, d, now),
          Turn t => inputNavigatorTurn(s, t, now),
          HomeSector h => inputNavigatorHomeSector(s, h, now),
          _ => s,
        });
  }

  /// Клавиши слушаются только там, где нажатию есть что делать: в ответе и на паузе.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final phase = _session?.phase;
    if (phase != NavigatorPhase.recall && phase != NavigatorPhase.paused) return KeyEventResult.ignored;
    final key = navigatorKeyName(event);
    if (key == null) return KeyEventResult.ignored;
    if (key == 'p') {
      _update((s) => pauseNavigatorSession(s, _now()));
    } else if (key == 'r') {
      _restart();
    } else {
      _update((s) => handleNavigatorKey(s, key, _now()));
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final session = _session;
    if (s == null || session == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final done = session.phase == NavigatorPhase.result;
    return Focus(
      focusNode: _keys,
      autofocus: true,
      onKeyEvent: _onKey,
      child: GameShell(
        title: L.t('navigator'),
        onLesson: () => openDemoLesson(context, title: L.t('navigator'), trials: navigatorLessonTrials(s)),
        hud: [HudItem(label: L.t('level'), value: '$_level', icon: Icons.flag_outlined)],
        field: (context, h) => _field(context, h, s, session),
        auxRow: AuxBar(children: [
          AuxAction(icon: Icons.refresh, label: s.t('restart'), onPressed: done ? null : _restart),
        ]),
        toolbar: done
            ? Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton.icon(
                  key: const Key('nav-next'),
                  onPressed: () => setState(_deal),
                  icon: Icon(_passed ? Icons.arrow_forward : Icons.replay),
                  label: Text(_passed ? L.t('nextLabel') : L.t('retry')),
                ),
              )
            : null,
        pauseActions: [
          PauseAction(label: s.t('restart'), icon: Icons.refresh, onPressed: _restart),
        ],
      ),
    );
  }

  Widget _field(BuildContext context, double h, NavigatorStrings s, NavigatorSession session) {
    switch (session.phase) {
      case NavigatorPhase.rules:
        return _RulesView(
          strings: s,
          onStart: () {
            // Доска партии впервые показывается здесь. Разбор, открытый на экране правил, показывал
            // ДРУГИЕ доски — эту партию он не подсказывал, и засчитывать её можно.
            LessonUsed.reset();
            _update((x) => startNavigatorRound(x, _now()));
          },
        );
      case NavigatorPhase.paused:
        return _CardView(children: [
          _Heading(s.t('pause')),
          FilledButton(
            key: const Key('nav-resume'),
            onPressed: () => _update((x) => resumeNavigatorSession(x, _now())),
            child: Text(s.t('resume')),
          ),
          OutlinedButton(key: const Key('nav-restart'), onPressed: _restart, child: Text(s.t('restart'))),
        ]);
      case NavigatorPhase.delay:
        return _CardView(children: [
          _Heading(s.t('delay')),
          Text(s.t('delayBody'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, height: 1.5)),
          Text(
            '${session.delayIndex + 1} / ${session.round.delaySteps}',
            key: const Key('nav-delay-count'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: navigatorGradient[0]),
          ),
          FilledButton(
            key: const Key('nav-continue'),
            onPressed: () => _update(advanceNavigatorDelay),
            child: Text(s.t('continue')),
          ),
        ]);
      case NavigatorPhase.result:
        final m = session.result!;
        return _CardView(children: [
          _Heading(_passed ? L.f('levelDone', {'n': '$_level'}) : s.mode(m.mode)),
          Text('${L.t('score')}: ${m.score}', key: const Key('nav-score'), textAlign: TextAlign.center),
          Text('${L.t('errors')}: ${m.errors}', textAlign: TextAlign.center),
        ]);
      case NavigatorPhase.disposed:
        return const SizedBox.shrink();
      case NavigatorPhase.study:
      case NavigatorPhase.recall:
        return _play(context, h, s, session);
    }
  }

  Widget _play(BuildContext context, double h, NavigatorStrings s, NavigatorSession session) {
    final scheme = Theme.of(context).colorScheme;
    final round = session.round;
    final isStudy = session.phase == NavigatorPhase.study;
    final steps = round.routeSteps;
    final progressText = switch (round.mode) {
      NavigatorMode.routeRecall =>
        s.fill('routeProgress', {'current': math.min(session.routeIndex + 1, steps), 'total': steps}),
      NavigatorMode.turnSequence =>
        s.fill('turnProgress', {'current': math.min(session.turnIndex + 1, steps), 'total': steps}),
      NavigatorMode.homeDirection => s.t('homePrompt'),
    };
    final prompt = switch (round.mode) {
      NavigatorMode.routeRecall => s.t('routePrompt'),
      NavigatorMode.turnSequence => s.t('turnPrompt'),
      NavigatorMode.homeDirection => s.t('homePrompt'),
    };
    final turnMode = round.mode == NavigatorMode.turnSequence;
    final squareMap = !turnMode && (isStudy || !round.hideMapDuringRecall);

    // Невидимое, но с размером: шапка держит место под более длинный из двух заголовков, строка
    // хода и органы ответа стоят и при изучении — поэтому карта одна и та же в обеих фазах.
    Widget ghost(Widget child) =>
        Visibility(visible: false, maintainSize: true, maintainAnimation: true, maintainState: true, child: child);
    Widget title(String text) => Text(text, style: const TextStyle(fontSize: 23, height: 1.22, fontWeight: FontWeight.w900));

    final header = Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(children: [
                ghost(title(isStudy ? s.t('recall') : s.t('study'))),
                title(isStudy ? s.t('study') : s.t('recall')),
              ]),
              Text(
                '${s.mode(round.mode)} · ${s.fill('grid', {'size': round.gridSize, 'steps': steps})} · ${round.mapRotation}°',
                style: TextStyle(fontSize: 12, height: 1.4, fontWeight: FontWeight.w700, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        OutlinedButton(
          key: const Key('nav-pause'),
          onPressed: () => _update((x) => pauseNavigatorSession(x, _now())),
          child: Text(s.t('pauseAction')),
        ),
      ],
    );

    final progressLine = Text(
      progressText,
      key: isStudy ? null : const Key('nav-progress'),
      textAlign: TextAlign.center,
      style: TextStyle(fontSize: 14, height: 1.43, fontWeight: FontWeight.w800, color: scheme.onSurfaceVariant),
    );

    final answers = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NavigatorSwipeSurface(
          label: prompt,
          hint: s.t('swipeHint'),
          onSwipe: (dx, dy) => _update((x) => handleNavigatorSwipe(x, dx, dy, _now())),
        ),
        const SizedBox(height: 10),
        NavigatorChoices(session: session, strings: s, onAnswer: _answer),
      ],
    );

    final Widget map;
    if (turnMode) {
      map = isStudy ? NavigatorTurnStudy(session: session, strings: s) : const SizedBox.shrink();
    } else if (squareMap) {
      map = LayoutBuilder(
        builder: (context, c) => NavigatorMap(
          session: session,
          strings: s,
          side: c.maxWidth,
          showRoute: isStudy,
          showCurrent: !isStudy,
        ),
      );
    } else {
      map = NavigatorHiddenMap(strings: s);
    }

    final bottom = isStudy
        ? Stack(
            alignment: Alignment.center,
            children: [
              ghost(answers),
              FilledButton(
                key: const Key('nav-ready'),
                onPressed: () => _update(completeNavigatorStudy),
                child: Text(s.t('ready')),
              ),
            ],
          )
        : answers;

    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        key: const Key('nav-play'),
        child: NavigatorPlayLayout(
          fieldHeight: h,
          widthLimit: math.min(600, math.max(220, c.maxWidth - 24)),
          minSide: round.gridSize * navigatorMinCell,
          squareMap: squareMap,
          header: header,
          progress: isStudy ? ghost(progressLine) : progressLine,
          map: map,
          bottom: bottom,
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
        header: true,
        child: Text(text,
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, height: 1.25, fontWeight: FontWeight.w900)),
      );
}

class _CardView extends StatelessWidget {
  const _CardView({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  if (i > 0) const SizedBox(height: 12),
                  children[i],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Экран правил модуля: навык, три режима, что появится дальше — и «Начать раунд».
class _RulesView extends StatelessWidget {
  const _RulesView({required this.strings, required this.onStart});

  final NavigatorStrings strings;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = strings;
    final ink = navigatorOn(navigatorGradient[0]);
    return SingleChildScrollView(
      key: const Key('nav-rules'),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: navigatorGradient[0], borderRadius: BorderRadius.circular(24)),
            child: Column(children: [
              Text(s.t('skill'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, height: 1.4, fontWeight: FontWeight.w700, color: ink)),
              const SizedBox(height: 7),
              Semantics(
                header: true,
                child: Text(s.t('title'),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 34, height: 1.18, fontWeight: FontWeight.w900, color: ink)),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Heading(s.t('rulesTitle')),
                const SizedBox(height: 12),
                Text(s.t('rulesBody'), style: TextStyle(fontSize: 16, height: 1.5, color: scheme.onSurfaceVariant)),
                // Три строки режимов — вызовами с ключом-литералом: по ним проба сверяет словарь.
                for (final rule in [s.t('routeRecallRule'), s.t('turnSequenceRule'), s.t('homeDirectionRule')]) ...[
                  const SizedBox(height: 12),
                  Text(rule, style: const TextStyle(fontSize: 15, height: 1.47, fontWeight: FontWeight.w700)),
                ],
                const SizedBox(height: 12),
                Text(s.t('progressionInfo'),
                    style: TextStyle(
                        fontSize: 14, height: 1.5, fontWeight: FontWeight.w800, color: navigatorGradient[0])),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: FilledButton(key: const Key('nav-start'), onPressed: onStart, child: Text(s.t('start'))),
          ),
        ],
      ),
    );
  }
}

/// РАЗБОР «НАВИГАТОРА»: три режима — три приёма, каждый назван словами.
///
/// 🔴 СТИМУЛ — КАРТА САМОЙ ИГРЫ, А НЕ РИСУНОК «ПОХОЖЕ»: тот же [NavigatorMap] с маршрутом, что человек
/// видит при изучении. Ответ подписан так же, как кнопки в партии (глиф и слово из словаря модуля),
/// и посчитан ЯДРОМ по той же раздаче — не придуман.
///
/// ⚠️ Зерно разбора своё (`navigator-lesson`), не зерно партии: разбор учит приёму на соседней доске и
/// не подсказывает ответ текущей партии.
List<DemoTrial> navigatorLessonTrials(NavigatorStrings s) {
  NavigatorSession deal(int level, NavigatorMode mode) =>
      createNavigatorSession(NavigatorSessionConfig(seed: 'navigator-lesson', level: level, mode: mode));
  Widget map(NavigatorSession x) =>
      NavigatorMap(session: x, strings: s, side: 220, showRoute: true, showCurrent: false);
  final route = deal(1, NavigatorMode.routeRecall);
  final turns = deal(2, NavigatorMode.turnSequence);
  final home = deal(3, NavigatorMode.homeDirection);
  final homeSector = rotateHomeSector(home.round.correctHomeSector, home.round.mapRotation);
  return [
    DemoTrial(
      text: '',
      art: map(route),
      answer: route.round.routeDirections
          .map((d) => navigatorDirectionGlyphs[rotateCardinal(d, route.round.mapRotation)]!)
          .join(' '),
      rule: L.t('teachNavigatorRoute'),
    ),
    DemoTrial(
      text: '',
      art: map(turns),
      answer: turns.round.turns.map((t) => '${navigatorTurnGlyphs[t]} ${s.turn(t)}').join(' · '),
      rule: L.t('teachNavigatorTurns'),
    ),
    DemoTrial(
      text: '',
      art: map(home),
      answer: '${navigatorHomeGlyphs[homeSector]} ${s.home(homeSector)}',
      rule: L.t('teachNavigatorHome'),
    ),
  ];
}
