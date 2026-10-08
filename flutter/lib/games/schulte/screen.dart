import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/game_preset.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Таблица Шульте» на общем каркасе — первая перенесённая тап-игра раздела.
///
/// Жалоба Дениса, с которой начался переезд, ровно про этот класс игр: «везде,
/// где перетаскивание тапом или соединением, глюки сильнее всего». Здесь нажатие
/// идёт по клетке напрямую, без веб-слоя.
///
/// 🔴 ПОЛЕ БЕРЁТ ВЫСОТУ У КАРКАСА ЧИСЛОМ. Веб считал клетку от ОКНА
/// (`windowDimensions.height - 230`), и это число приходилось держать в голове
/// при каждой правке шапки: любой новый ряд счётчиков уводил нижний ряд клеток
/// за экран. Здесь высота приходит из `field: (context, h)`.
class SchulteScreen extends StatefulWidget {
  const SchulteScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<SchulteScreen> createState() => _SchulteScreenState();
}

enum _Phase { ready, playing, done }

class _SchulteScreenState extends State<SchulteScreen> {
  static const _levelErrorsAllowed = 2;   // ровно как в вебе: errsArg <= 2 — уровень взят
  static const _ruleRevealDelay = Duration(milliseconds: 1500);

  late LevelLadder _ladder;
  SchulteGame? _game;
  _Phase _phase = _Phase.ready;

  /// Ось 9: до объявления правило скрыто, а нажатия не считаются.
  bool _ruleRevealed = true;
  bool _won = false;

  /// Итог боя с боссом после этой партии; `null` — боя не было (веб: `bossWon`).
  bool? _boss;
  Duration _elapsed = Duration.zero;

  Timer? _reveal;
  Timer? _ticker;
  final Stopwatch _watch = Stopwatch();

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'schulte_table', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _reveal?.cancel();
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (GamePreset.autostart) _start();
  }

  /// Письменность как в вебе: у русского языка — кириллица, иначе латиница
  /// (`app/games/schulte.tsx:274`). Выбор письменности вручную живёт в свободном
  /// режиме, он приедет вместе с ним.
  String get _alphabet {
    final lang = widget.state.get('${SharedState.prefix}language') ??
        widget.state.get('language') ??
        'ru';
    return lang.startsWith('ru')
        ? 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _reveal?.cancel();
    _ticker?.cancel();
    _watch
      ..reset()
      ..stop();
    _elapsed = Duration.zero;
    _game = SchulteGame(level: _ladder.level, alphabet: _alphabet);
    _phase = _Phase.ready;
    _ruleRevealed = !_game!.params.surpriseStart;
    _won = false;
  }

  void _start() {
    final g = _game!;
    setState(() {
      _phase = _Phase.playing;
      _ruleRevealed = !g.params.surpriseStart;
    });
    _watch
      ..reset()
      ..start();
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      setState(() => _elapsed = _watch.elapsed);
    });
    if (!g.params.surpriseStart) return;
    // Правило объявляется ПОСЛЕ показа поля: полторы секунды — столько, чтобы
    // взгляд успел пробежать таблицу и не успел построить план.
    _reveal = Timer(_ruleRevealDelay, () {
      if (!mounted) return;
      setState(() => _ruleRevealed = true);
    });
  }

  void _tap(int cell) {
    final g = _game!;
    if (_phase != _Phase.playing) return;
    final res = g.press(cell, ruleRevealed: _ruleRevealed);
    if (res == PressResult.ignored) return;
    setState(() {});
    if (res != PressResult.finished) return;
    _watch.stop();
    _ticker?.cancel();
    final ok = g.errors <= _levelErrorsAllowed;
    setState(() {
      _phase = _Phase.done;
      _won = ok;
      _boss = null; // итог боя — только этой партии; бой, если будет, допишет его ниже
      _elapsed = _watch.elapsed;
    });
    if (!ok) {
      _ladder.fail();
      return;
    }
    _winThenBoss();
  }

  /// Веха как в вебе: каждый третий ЗАСЧИТАННЫЙ уровень — бой «сложи подсвеченные».
  Future<void> _winThenBoss() async {
    final boss = await BossRound.winThenBoss(context, _ladder,
        type: BossType.counting, color: const Color(0xFF667EEA));
    if (!mounted || boss == null) return;
    setState(() => _boss = boss);
  }

  String get _time {
    final s = _elapsed.inMilliseconds / 1000;
    return '${s.toStringAsFixed(1)} ${L.t('secShort')}';
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('schulteTable');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachSchulteCenter')),
      ];

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('errors'), value: '${g.errors}', icon: Icons.close),
        HudItem(label: L.t('time'), value: _time, icon: Icons.timer_outlined),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        ruleRevealed: _ruleRevealed,
        won: _won,
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
          icon: Icons.grid_view,
          label: L.f('schulteGridSize', {'n': '${g.size}'}),
          onPressed: null,
        ),
      ]),
      toolbar: _phase == _Phase.done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  _won
                      ? L.f('schulteResultWin', {'t': _time, 'errors': '${g.errors}'})
                      : L.f('schulteResultFail', {'errors': '${g.errors}', 'max': '$_levelErrorsAllowed'}),
                  textAlign: TextAlign.center,
                ),
                BossOutcomeLine(_boss),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: () => setState(_reset),
                  icon: const Icon(Icons.arrow_forward),
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

/// Поле: квадратная сетка внутри высоты, которую дал каркас, и строка цели над ней.
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.ruleRevealed,
    required this.won,
    required this.height,
    required this.onStart,
    required this.onTap,
  });

  final SchulteGame game;
  final _Phase phase;
  final bool ruleRevealed;
  final bool won;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  /// Фраза целиком на каждое сочетание «что ищем × в каком порядке»: склейка
  /// «Ищи $что $куда» не переводится — в других языках другой порядок слов.
  String get _rule {
    final p = game.params;
    return switch ((p.contentMode, p.direction)) {
      (ContentMode.numbers, Direction.forward) => L.t('schulteRuleNumFwd'),
      (ContentMode.numbers, Direction.backward) => L.t('schulteRuleNumBack'),
      (ContentMode.numbers, Direction.centerOut) => L.t('schulteRuleNumCenter'),
      (ContentMode.letters, Direction.forward) => L.t('schulteRuleLetFwd'),
      (ContentMode.letters, Direction.backward) => L.t('schulteRuleLetBack'),
      (ContentMode.letters, Direction.centerOut) => L.t('schulteRuleLetCenter'),
      (ContentMode.mixed, Direction.forward) => L.t('schulteRuleMixFwd'),
      (ContentMode.mixed, Direction.backward) => L.t('schulteRuleMixBack'),
      (ContentMode.mixed, Direction.centerOut) => L.t('schulteRuleMixCenter'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (phase == _Phase.ready) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_rule, style: text.titleMedium, textAlign: TextAlign.center),
            if (game.params.surpriseStart)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(L.t('schulteSurpriseStart'),
                    style: text.bodySmall, textAlign: TextAlign.center),
              ),
            const SizedBox(height: 12),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        ),
      );
    }

    final target = ruleRevealed ? '${game.target}' : '?';
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(
            phase == _Phase.done
                ? (won ? L.t('storyDone') : L.t('schulteCollected'))
                : L.f('schulteFind', {'x': target}),
            key: const Key('цель'),
            style: text.titleMedium,
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, c) {
              // 🔴 Сторона берётся от МЕНЬШЕГО из высоты каркаса и ширины. Высота
              // здесь — та, что осталась под полем, а не высота окна.
              final free = height - 34;   // строка цели над сеткой
              final side = (free < c.maxWidth ? free : c.maxWidth) - 12;
              final n = game.size;
              final cell = side / n;
              return Center(
                child: SizedBox(
                  width: side,
                  height: side,
                  child: Column(
                    children: [
                      for (var row = 0; row < n; row++)
                        SizedBox(
                          height: cell,
                          child: Row(
                            children: [
                              for (var col = 0; col < n; col++)
                                _Cell(
                                  index: row * n + col,
                                  size: cell,
                                  game: game,
                                  enabled: phase == _Phase.playing && ruleRevealed,
                                  onTap: onTap,
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.index,
    required this.size,
    required this.game,
    required this.enabled,
    required this.onTap,
  });

  final int index;
  final double size;
  final SchulteGame game;
  final bool enabled;
  final void Function(int) onTap;

  /// Цвет клетки — помеха, а не правило (ось «двойная задача»). Он закреплён за
  /// ЗНАЧЕНИЕМ, а не за местом: на убегающей цели клетки меняются местами, и
  /// цвет, привязанный к месту, мигал бы на каждом ходу.
  Color? _tint(ColorScheme scheme) {
    if (!game.params.colorMode) return null;
    const palette = [Color(0xFFEF4444), Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFB45309)];
    return palette[game.items[index].hashCode.abs() % palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final value = game.items[index];
    final tint = _tint(scheme);
    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Material(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            key: Key('клетка$index'),
            borderRadius: BorderRadius.circular(8),
            onTap: enabled ? () => onTap(index) : null,
            child: Center(
              child: Text(
                '$value',
                style: TextStyle(
                  fontSize: size * 0.42,
                  fontWeight: FontWeight.w700,
                  color: tint ?? scheme.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
