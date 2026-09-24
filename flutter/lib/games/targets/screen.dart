/// «Мишени» — десятый экран раздела «Конфликт внимания» на Flutter.
///
/// 🔴 ЛЕСТНИЦА ЗДЕСЬ ИДЁТ ВНУТРИ ПАРТИИ. Каждые десять раундов уровень растёт
/// прямо по ходу игры, и достигнутое сохраняется сразу (`pick`), а не в конце:
/// партия кончается потерей жизней, и ждать конца значило бы терять ступень,
/// которую человек уже взял.
///
/// ⚠️ ОТЛИЧИЕ ОТ ВЕБ-ВЕРСИИ, НАМЕРЕННОЕ И ОБЩЕЕ ДЛЯ ВСЕХ ПЕРЕНЕСЁННЫХ ИГР:
/// конец партии идёт через `win`/`fail` каркаса, и три провала подряд опускают
/// текущий уровень на один. В веб-версии уровень только рос. Правило каркаса
/// (см. `LevelLadder`) одно на тридцать шесть экранов, и расходиться с ним ради
/// одной игры дороже, чем принять его здесь.
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

enum TargetsPhase { ready, playing, done }

/// Сколько держится отклик на ответ и какая пауза между раундами. Числа из
/// веб-версии: отклик 300 мс, пауза 200 мс, перед первым раундом 500 мс.
const int targetsFeedbackMs = 300;
const int targetsGapMs = 200;
const int targetsFirstGapMs = 500;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool targetsAutostart = bool.fromEnvironment('AUTOSTART');

class TargetsScreen extends StatefulWidget {
  const TargetsScreen({super.key, required this.state, this.mode = TargetsMode.field, this.clock, this.rnd});

  final SharedState state;

  /// «Поле» — совпадение внутри раунда, «Джокер» — с кругом прошлого раунда.
  final TargetsMode mode;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие.
  ///
  /// ⚠️ Нужен ПРОБАМ: на неспящем Random партия иногда доживала до перехода
  /// уровня, а иногда нет, и одна и та же проба то краснела, то зеленела. Плавающая
  /// проба не сторожит ничего — мутация на ней с равным успехом «краснеет».
  final Random? rnd;

  @override
  State<TargetsScreen> createState() => _TargetsScreenState();
}

class _TargetsScreenState extends State<TargetsScreen> {
  late LevelLadder _ladder;
  TargetsGame? _game;
  TargetsPhase _phase = TargetsPhase.ready;
  TargetsOutcome? _flash;
  Timer? _timer;
  String? _prevCircle;
  int _startedAt = 0;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'targets', store: SharedLevelStore(widget.state), maxLevel: targetsMaxLevel);
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
    if (targetsAutostart) _start();
  }

  int _now() => widget.clock?.call() ?? DateTime.now().millisecondsSinceEpoch;

  void _reset() {
    _timer?.cancel();
    _game = TargetsGame(startLevel: _ladder.level, mode: widget.mode, rnd: widget.rnd, nowMs: widget.clock);
    _phase = TargetsPhase.ready;
    _flash = null;
    _prevCircle = null;
  }

  void _start() {
    _startedAt = _now();
    setState(() {
      _phase = TargetsPhase.playing;
      _flash = null;
    });
    _timer = Timer(const Duration(milliseconds: targetsFirstGapMs), _round);
  }

  void _round() {
    if (!mounted || _phase != TargetsPhase.playing) return;
    final g = _game!;
    // Цвет круга ПРОШЛОГО раунда показывается в «Джокере» — он и есть то, что
    // надо удержать. Снимаем его ДО нового раунда, иначе подсказка показывала бы
    // текущий круг, и удерживать стало бы нечего.
    _prevCircle = g.current?.circle;
    if (!g.nextRound()) {
      _finish();
      return;
    }
    setState(() {});
    // Замер: отметка показа уже поставлена в nextRound(), меряем до кадра.
    measureStimulusFrame('Flutter/Targets');
    _timer = Timer(Duration(milliseconds: g.params.delayMs), () {
      if (!mounted || _phase != TargetsPhase.playing) return;
      _after(g.timeout());
    });
  }

  void _tap() {
    if (_phase != TargetsPhase.playing) return;
    _after(_game!.tap());
  }

  void _after(TargetsOutcome? outcome) {
    if (outcome == null) return;
    _timer?.cancel();
    final g = _game!;
    if (g.over) {
      _finish();
      return;
    }
    // Верное торможение отклика не получает: человек ничего не делал, и зелёная
    // галочка за бездействие обесценила бы её на попаданиях.
    if (outcome == TargetsOutcome.correctReject) {
      // 🔴 И ЗДЕСЬ ТОЖЕ СОХРАНЯЕМ СТУПЕНЬ. Раньше стояло `setState(g.advance)` —
      // возврат отбрасывался, и когда десятым раундом уровня оказывалось верное
      // торможение (а это половина раундов), взятая ступень не записывалась
      // вовсе. Дефект нашёлся только потому, что проба плавала на неспящем
      // Random: при одних раскладах десятый раунд был мишенью, при других нет.
      setState(() {
        if (g.advance()) _ladder.pick(g.level);
      });
      _timer = Timer(const Duration(milliseconds: targetsGapMs), _round);
      return;
    }
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: targetsFeedbackMs), () {
      if (!mounted) return;
      setState(() {
        _flash = null;
        if (g.advance()) _ladder.pick(g.level);
      });
      if (g.over) {
        _finish();
        return;
      }
      _timer = Timer(const Duration(milliseconds: targetsGapMs), _round);
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    setState(() => _phase = TargetsPhase.done);
    final seconds = ((_now() - _startedAt) / 1000).round();
    // Прошёл — значит дошёл до верха лестницы, а не «кончились жизни».
    if (g.lives > 0) {
      _ladder.win(score: g.score, timeSeconds: seconds, errors: g.errors, mode: widget.mode.name);
    } else {
      _ladder.fail(score: g.score, timeSeconds: seconds, errors: g.errors, mode: widget.mode.name);
    }
  }

  /// Примеры разбора: раунд С совпадением и БЕЗ него. Сличать надо цвет круга с
  /// квадратами — этим «Мишени» и отличаются от простого «жми на зелёное».
  List<DemoTrial> _demoTrials() {
    final rule = L.t('targetsDesc');
    const a = '#22C55E', b = '#3B82F6', c = '#EF4444';
    return [
      DemoTrial(
        text: '',
        art: const TargetsRow(
          round: TargetsRound(circle: a, squares: [b, a, c], isTarget: true),
        ),
        answer: L.t('demoPress'),
        rule: rule,
      ),
      DemoTrial(
        text: '',
        art: const TargetsRow(
          round: TargetsRound(circle: a, squares: [b, c, b], isTarget: false),
        ),
        answer: L.t('demoHold'),
        rule: rule,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('targets'),
      hud: [
        HudItem(label: L.t('level'), value: '${g.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('score'), value: '${g.score}', icon: Icons.star_outline),
        HudItem(label: L.t('label_lives'), value: '${g.lives}', icon: Icons.favorite_outline),
      ],
      onLesson: () => openDemoLesson(context, title: L.t('targets'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        mode: widget.mode,
        phase: _phase,
        flash: _flash,
        prevCircle: _prevCircle,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == TargetsPhase.playing ? _TargetButton(onTap: _tap) : null,
    );
  }
}

Color _hex(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

/// Ряд раунда: круг и квадраты. Вынесен из поля, чтобы разбор показывал ровно ту
/// же картинку, а не «похожую»: цель здесь — СОВПАДЕНИЕ цвета круга с одним из
/// квадратов, и своя раскладка в разборе легко перестала бы это показывать.
class TargetsRow extends StatelessWidget {
  const TargetsRow({super.key, required this.round});

  final TargetsRound round;

  @override
  Widget build(BuildContext context) => Wrap(
        alignment: WrapAlignment.center,
        spacing: 12,
        runSpacing: 12,
        children: [
          TargetsShape(color: round.circle, round: true, id: 'circle', dy: 0),
          for (var i = 0; i < round.squares.length; i += 1)
            TargetsShape(color: round.squares[i], round: false, id: '$i', dy: 0),
        ],
      );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.mode,
    required this.phase,
    required this.flash,
    required this.prevCircle,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final TargetsGame game;
  final TargetsMode mode;
  final TargetsPhase phase;
  final TargetsOutcome? flash;
  final String? prevCircle;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case TargetsPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('targetsDesc'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              mode == TargetsMode.field ? L.t('field') : L.t('joker'),
              key: const Key('targets-mode'),
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case TargetsPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(
              // Жизни целы — значит партия кончилась на верху лестницы.
              game.lives > 0 ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry'),
              key: const Key('targets-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('score')}: ${game.score}'),
            Text(game.meanRtMs == null
                ? '${L.t('meanReaction')}: —'
                : '${L.t('meanReaction')}: ${game.meanRtMs} ${L.t('msShort')}'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case TargetsPhase.playing:
        final r = game.current;
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                height: 32,
                child: switch (flash) {
                  TargetsOutcome.hit => const Icon(Icons.check_circle, color: Color(0xFF22C55E), key: Key('targets-hit')),
                  TargetsOutcome.commission => const Icon(Icons.cancel, color: Color(0xFFEF4444), key: Key('targets-wrong')),
                  TargetsOutcome.omission => const Icon(Icons.timer_off, color: Color(0xFFEF4444), key: Key('targets-miss')),
                  _ => const SizedBox.shrink(),
                },
              ),
              const SizedBox(height: 12),
              if (r != null)
                // Высота ряда с запасом на разброс (±26 px): без него фигуры
                // верхних уровней вылезали бы за поле и резались.
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    TargetsShape(color: r.circle, round: true, id: 'circle', dy: r.dy.isEmpty ? 0 : r.dy[0]),
                    for (var i = 0; i < r.squares.length; i++)
                      TargetsShape(color: r.squares[i], round: false, id: '$i', dy: r.dy.length > i + 1 ? r.dy[i + 1] : 0),
                  ],
                ),
              const SizedBox(height: 16),
              // Подсказка «Джокера»: круг ПРОШЛОГО раунда. В «Поле» её нет —
              // там сличать надо внутри раунда, и память не при чём.
              SizedBox(
                height: 28,
                child: mode == TargetsMode.joker && prevCircle != null
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(L.t('label_prev_circle'), style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(width: 8),
                          Container(
                            key: const Key('targets-prev-circle'),
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(color: _hex(prevCircle!), shape: BoxShape.circle),
                          ),
                        ],
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        );
    }
  }
}

class TargetsShape extends StatelessWidget {
  const TargetsShape({super.key, required this.color, required this.round, required this.id, required this.dy});
  final String color;
  final bool round;
  final String id;

  /// Смещение по вертикали — третья ось сложности.
  ///
  /// ⚠️ Именно СДВИГ, а не отступ: отступ подвинул бы соседей и менял бы заодно
  /// расстояние между фигурами, то есть вторую ось разом.
  final int dy;

  @override
  Widget build(BuildContext context) => Transform.translate(
        offset: Offset(0, dy.toDouble()),
        child: Container(
          key: Key('targets-shape-$id-$color'),
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: _hex(color),
            shape: round ? BoxShape.circle : BoxShape.rectangle,
            borderRadius: round ? null : BorderRadius.circular(8),
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

class _TargetButton extends StatelessWidget {
  const _TargetButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: TapLatency(
          where: 'Flutter/Targets',
          child: SizedBox(
            height: 56,
            width: double.infinity,
            child: FilledButton(
              key: const Key('targets-press'),
              onPressed: onTap,
              child: FittedBox(
                child: Text(L.t('label_target_excl'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              ),
            ),
          ),
        ),
      );
}
