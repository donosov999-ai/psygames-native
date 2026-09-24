/// «Корректура» — восемнадцатый, последний экран раздела «Конфликт внимания».
///
/// 🔴 ПОЛЕ ДОЛЖНО ВЛЕЗАТЬ ЦЕЛИКОМ. На верхних уровнях это 16×12 = 192 клетки, и
/// прокрутка тут не годится: корректурная проба меряет ОБХОД поля глазами, а
/// прокручиваемое поле превращает её в другую задачу — «успеть пролистать».
/// Поэтому размер клетки считается от высоты, которую дал каркас, и от ширины
/// экрана, а не задан числом.
///
/// ⚠️ Перенесено задание «буквы/цифры». Филворды — другая проба под тем же
/// game_type, со своим генератором и своей лестницей; она переносится отдельно.
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

enum ProofPhase { ready, playing, done }

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool proofAutostart = bool.fromEnvironment('AUTOSTART');

/// Сколько держится вспышка ошибки, мс. Из веб-версии.
const int proofWrongFlashMs = 350;

class ProofreadingScreen extends StatefulWidget {
  const ProofreadingScreen({
    super.key,
    required this.state,
    this.script = 'cyrillic',
    this.digits = false,
    this.clock,
    this.rnd,
  });

  final SharedState state;

  /// Письменность поля.
  final String script;

  /// Цифровое поле вместо письменности.
  final bool digits;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<ProofreadingScreen> createState() => _ProofreadingScreenState();
}

class _ProofreadingScreenState extends State<ProofreadingScreen> {
  late LevelLadder _ladder;
  ProofGame? _game;
  ProofPhase _phase = ProofPhase.ready;
  int? _wrongFlash;
  Timer? _tick;
  Timer? _flash;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'proofreading', store: SharedLevelStore(widget.state), maxLevel: proofMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _flash?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    // Алфавиты — материал пробы, лежат ассетом: грузим до первой партии.
    await ProofScripts.load();
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    if (proofAutostart) _start();
  }

  void _reset() {
    _tick?.cancel();
    _flash?.cancel();
    _game = ProofGame(
      level: _ladder.level,
      script: widget.script,
      digits: widget.digits,
      rnd: widget.rnd,
      nowMs: widget.clock,
    );
    _phase = ProofPhase.ready;
    _wrongFlash = null;
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = ProofPhase.playing;
      _wrongFlash = null;
    });
    // Часы партии тикают раз в секунду: на экране остаток времени.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _phase != ProofPhase.playing) return;
      final g = _game!;
      if (g.timeUp) {
        g.stopByTime();
        _finish();
        return;
      }
      setState(() {});
    });
  }

  void _tap(int index) {
    if (_phase != ProofPhase.playing) return;
    final g = _game!;
    final out = g.tap(index);
    if (out == ProofTap.ignored) return;
    setState(() {
      // Вспышка на ошибке — оформление, а не партия: гасится обычным таймером.
      _wrongFlash = out == ProofTap.wrong ? index : null;
    });
    if (out == ProofTap.wrong) {
      _flash?.cancel();
      _flash = Timer(const Duration(milliseconds: proofWrongFlashMs), () {
        if (!mounted) return;
        setState(() => _wrongFlash = null);
      });
    }
    if (g.finished) _finish();
  }

  void _finish() {
    final g = _game!;
    _tick?.cancel();
    _flash?.cancel();
    setState(() => _phase = ProofPhase.done);
    if (g.passed) {
      _ladder.win(score: g.found.length, timeSeconds: g.elapsedSec.round(), errors: g.errors);
    } else {
      _ladder.fail(score: g.found.length, timeSeconds: g.elapsedSec.round(), errors: g.errors);
    }
  }

  /// Примеры разбора: клетка С искомой буквой и клетка без неё.
  ///
  /// ⚠️ Буквы берутся из ЭТОЙ партии (`grid.targets` и её же алфавит), а не
  /// придуманные: на высоких уровнях целей две, и разбор с одной показывал бы
  /// задачу легче настоящей.
  List<DemoTrial> _demoTrials() {
    final g = _game;
    if (g == null) return const [];
    // 🔴 ДО НАЧАЛА ПАРТИИ ПОЛЯ ЕЩЁ НЕТ: `grid` заполняется в `begin()`, а разбор
    // нужен ИМЕННО ДО — объяснять правило после старта поздно, время уже идёт.
    // Поэтому, если поля нет, оно собирается тем же `buildGrid` и теми же
    // параметрами уровня: буквы будут настоящие, а не придуманные.
    final grid = g.grid.targets.isNotEmpty
        ? g.grid
        : buildGrid(
            rows: g.params.rows,
            cols: g.params.cols,
            alphabet: g.alphabet,
            rnd: Random(_ladder.level).nextDouble,
          );
    final targets = grid.targets;
    if (targets.isEmpty) return const [];
    final other = grid.letters.firstWhere(
      (l) => !targets.contains(l),
      orElse: () => '·',
    );
    final rule = '${L.t('proofreadingDesc')}: ${targets.join(', ')}';
    return [
      for (final t in targets)
        DemoTrial(text: t, answer: L.t('demoPress'), rule: rule),
      DemoTrial(text: other, answer: L.t('demoHold'), rule: rule),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final left = (g.params.timeLimitSec - g.elapsedSec).clamp(0, g.params.timeLimitSec.toDouble());
    return GameShell(
      title: L.t('proofreading'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('timeLeftLabel'), value: '${left.round()}', icon: Icons.timer_outlined),
        HudItem(label: L.t('label_found'), value: '${g.found.length}/${g.grid.total}', icon: Icons.check),
        HudItem(label: L.t('hud_errors'), value: '${g.errors}', icon: Icons.close),
      ],
      onLesson: _demoTrials().isEmpty
          ? null
          : () => openDemoLesson(context, title: L.t('proofreading'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        wrongFlash: _wrongFlash,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
        onTap: _tap,
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.wrongFlash,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onTap,
  });

  final ProofGame game;
  final ProofPhase phase;
  final int? wrongFlash;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case ProofPhase.ready:
        final p = game.params;
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('proofreadingDesc'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('proofLvlParams')
                  .replaceAll('{r}', '${p.rows}')
                  .replaceAll('{c}', '${p.cols}')
                  .replaceAll('{w}', '${p.timeLimitSec}'),
              key: const Key('proof-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(L.t('proofPass').replaceAll('{p}', '${(p.minFoundPct * 100).round()}'),
                style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case ProofPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(
              game.passed
                  ? L.t('levelDone').replaceAll('{n}', '${game.level}')
                  : L.t('sameLevelRetry'),
              key: const Key('proof-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('label_found')}: ${game.found.length}/${game.grid.total} · '
                '${L.t('hud_errors')}: ${game.errors}'),
            // Доля пропусков — мера раздела, показывается числом.
            Text('${L.t('hud_missed')}: ${game.omissionPct}%', key: const Key('proof-omission')),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case ProofPhase.playing:
        final g = game;
        // Две цели — над полем: их надо держать в голове всю партию.
        final targets = g.grid.targets.join('  ');
        return SizedBox(
          height: height,
          child: LayoutBuilder(
            builder: (context, box) {
              const headerH = 44.0;
              // 🔴 Клетка считается от МЕНЬШЕГО из двух: по ширине и по высоте.
              // Возьми только ширину — на верхних уровнях поле уедет за нижний
              // край, а прокрутка превратила бы пробу в «успеть пролистать».
              final byWidth = (box.maxWidth - 8) / g.params.cols;
              final byHeight = (box.maxHeight - headerH - 8) / g.params.rows;
              final cell = min(byWidth, byHeight).floorToDouble();
              return Column(
                children: [
                  SizedBox(
                    height: headerH,
                    child: Center(
                      child: Text(
                        '${L.t('find')}: $targets',
                        key: const Key('proof-targets'),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: cell * g.params.cols,
                    height: cell * g.params.rows,
                    child: GridView.builder(
                      physics: const NeverScrollableScrollPhysics(),
                      padding: EdgeInsets.zero,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: g.params.cols),
                      itemCount: g.grid.letters.length,
                      itemBuilder: (context, i) => _Cell(
                        letter: g.grid.letters[i],
                        index: i,
                        found: g.found.contains(i),
                        wrong: wrongFlash == i,
                        size: cell,
                        onTap: () => onTap(i),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        );
    }
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.letter,
    required this.index,
    required this.found,
    required this.wrong,
    required this.size,
    required this.onTap,
  });

  final String letter;
  final int index;
  final bool found;
  final bool wrong;
  final double size;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TapLatency(
        where: 'Flutter/Proofreading',
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            key: Key('proof-cell-$index'),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: found
                  ? const Color(0x3322C55E)
                  : (wrong ? const Color(0x33EF4444) : Colors.transparent),
              border: Border.all(width: 0.5, color: Theme.of(context).dividerColor),
            ),
            child: FittedBox(
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Text(
                  letter,
                  style: TextStyle(
                    fontWeight: found ? FontWeight.w900 : FontWeight.w500,
                    color: found ? const Color(0xFF22C55E) : null,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
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
