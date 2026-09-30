/// BART — «Воздушный шар», пятнадцатый экран раздела «Конфликт внимания».
///
/// 🔴 ПРЕДЕЛ ШАРА ЧЕЛОВЕКУ НЕ ПОКАЗЫВАЕТСЯ — в этом вся проба. На экране видно
/// только, сколько уже накачано и сколько поставлено на кон; где рванёт,
/// узнаётся единственным способом.
///
/// ⚠️ С третьего уровня предел у КАЖДОГО ШАРА свой (разброс вокруг `maxBurst`),
/// и выучить одно безопасное число больше нельзя. Среднее при этом не меняется,
/// поэтому мера прохода `adj_avg_pumps` остаётся сравнимой сама с собой.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum BartPhase { ready, playing, done }

/// Сколько держится отклик, мс. Из веб-версии: взрыв дольше, чем кэш.
const int bartPopMs = 1200;
const int bartCashMs = 800;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool bartAutostart = bool.fromEnvironment('AUTOSTART');

class BartScreen extends StatefulWidget {
  const BartScreen({super.key, required this.state, this.classic, this.rnd});

  final SharedState state;

  /// Классический режим: предел из пресета, лестница не трогается.
  final Difficulty? classic;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<BartScreen> createState() => _BartScreenState();
}

class _BartScreenState extends State<BartScreen> {
  late LevelLadder _ladder;
  BartGame? _game;
  BartPhase _phase = BartPhase.ready;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'bart', store: SharedLevelStore(widget.state), maxLevel: bartMaxLevel);
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
    if (bartAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = BartGame(
      level: _ladder.level,
      useLevels: widget.classic == null,
      classicDifficulty: widget.classic,
      rnd: widget.rnd,
    );
    _phase = BartPhase.ready;
  }

  void _start() {
    _game!.begin();
    setState(() => _phase = BartPhase.playing);
  }

  void _pump() {
    if (_phase != BartPhase.playing) return;
    final g = _game!;
    final out = g.pump();
    if (out == null) return;
    setState(() {});
    if (out == PumpOutcome.popped) _afterBalloon(bartPopMs);
  }

  void _cash() {
    if (_phase != BartPhase.playing) return;
    if (!_game!.cashOut()) return;
    setState(() {});
    _afterBalloon(bartCashMs);
  }

  /// Шар закрыт: подержать отклик и выдать следующий либо кончить партию.
  void _afterBalloon(int holdMs) {
    _timer?.cancel();
    _timer = Timer(Duration(milliseconds: holdMs), () {
      if (!mounted) return;
      final g = _game!;
      if (g.finished) {
        _finish();
        return;
      }
      setState(g.newBalloon);
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    setState(() => _phase = BartPhase.done);
    // ⚠️ В классике лестница не трогается: там нет и уровня.
    if (widget.classic != null) return;
    if (g.passed) {
      _ladder.win(score: g.bank, errors: g.metrics.popped);
    } else {
      _ladder.fail(score: g.bank, errors: g.metrics.popped);
    }
  }

  /// 🔴 КАРТОЧКИ БЕЗ ОТВЕТА — И ЭТО НЕ ПРОПУСК. Верного хода на ОТДЕЛЬНОЙ пробе
  /// здесь нет: выигрывает стратегия. Подписать карточке «верно: так» значило бы
  /// соврать — человек сделает так и проиграет на следующем шаге.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachBartPlan')),
        DemoTrial(text: '', rule: L.t('teachBartScout')),
      ];

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('bart'),
      onLesson: () => openDemoLesson(context, title: L.t('bart'), trials: _demoTrials()),
      hud: [
        if (widget.classic == null)
          HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('label_balloon'), value: '${g.round}/${g.params.balloons}', icon: Icons.circle_outlined),
        HudItem(label: L.t('hud_bank'), value: '${g.bank}', icon: Icons.account_balance_wallet_outlined),
        // «В игре» — сколько потеряется при взрыве прямо сейчас.
        HudItem(label: L.t('hud_atRisk'), value: '${g.pending}', icon: Icons.warning_amber_outlined),
        HudItem(label: L.t('hud_pops'), value: '${g.metrics.popped}', icon: Icons.local_fire_department_outlined),
      ],
      field: (context, h) => _Field(
        game: g,
        classic: widget.classic != null,
        phase: _phase,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == BartPhase.playing ? _Buttons(onPump: _pump, onCash: _cash) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.classic,
    required this.phase,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final BartGame game;
  final bool classic;
  final BartPhase phase;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case BartPhase.ready:
        final p = game.params;
        return _Centered(
          height: height,
          children: [
            Text(L.t('bart'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('bartHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('bartLvlParams').replaceAll('{n}', '${p.balloons}').replaceAll('{m}', '${p.maxBurst}'),
              key: const Key('bart-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case BartPhase.done:
        final m = game.metrics;
        return _Centered(
          height: height,
          children: [
            Text(
              classic
                  ? '${L.t('hud_bank')}: ${game.bank}'
                  : (game.passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry')),
              key: const Key('bart-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_bank')}: ${game.bank} · ${L.t('hud_pops')}: ${m.popped}'),
            // Биомаркер показывается числом: это главное, что уносит партия.
            Text('${L.t('bartPump')}: ${m.adjAvgPumps}', key: const Key('bart-adj')),
            const SizedBox(height: 8),
            Text(L.t('bartPass'), style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case BartPhase.playing:
        // Размер шара растёт с каждым нажатием — единственная подсказка о том,
        // сколько уже накачано. Про ПРЕДЕЛ она не говорит ничего.
        final size = 60.0 + game.pumps * 6.0;
        return SizedBox(
          height: height,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 240,
                  child: Center(
                    child: game.popped
                        ? const Icon(Icons.local_fire_department,
                            key: Key('bart-popped'), size: 96, color: Color(0xFFEF4444))
                        : (game.cashed
                            ? const Icon(Icons.check_circle,
                                key: Key('bart-cashed'), size: 96, color: Color(0xFF22C55E))
                            : Container(
                                key: const Key('bart-balloon'),
                                width: min(size, 220),
                                height: min(size, 220),
                                decoration: const BoxDecoration(
                                  color: Color(0xFFF43F5E),
                                  shape: BoxShape.circle,
                                ),
                              )),
                  ),
                ),
                const SizedBox(height: 8),
                Text('${game.pumps}',
                    key: const Key('bart-pumps'),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                Text(
                  game.popped ? L.t('bartPopped') : (game.cashed ? L.t('bartCashed') : L.t('hud_atRisk')),
                  key: const Key('bart-state'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        );
    }
  }
}

class _Centered extends StatelessWidget {
  const _Centered({required this.height, required this.children});
  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      );
}

class _Buttons extends StatelessWidget {
  const _Buttons({required this.onPump, required this.onCash});
  final VoidCallback onPump;
  final VoidCallback onCash;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: TapLatency(
                where: 'Flutter/BART',
                child: SizedBox(
                  height: 56,
                  child: FilledButton(
                    key: const Key('bart-pump'),
                    onPressed: onPump,
                    child: FittedBox(child: Text(L.t('bartPump'), style: const TextStyle(fontWeight: FontWeight.w800))),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TapLatency(
                where: 'Flutter/BART',
                child: SizedBox(
                  height: 56,
                  child: FilledButton(
                    key: const Key('bart-cash'),
                    onPressed: onCash,
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF22C55E)),
                    child: FittedBox(child: Text(L.t('bartCash'), style: const TextStyle(fontWeight: FontWeight.w800))),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
}
