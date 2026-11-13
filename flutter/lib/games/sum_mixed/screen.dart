import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/js_compat.dart' show Rng, createRng;
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/suite_switch.dart' show SuiteModeAction;
import '../counter/model.dart' show counterLevelParams, makeCounterRound;
import '../counter/screen.dart' show CounterField, CounterFeedback;
import '../number_bonds/model.dart' show bondsMinPicked;
import '../number_bonds/screen.dart' show BondsField;
import 'model.dart';
import 'route.dart';

/// «Собери сумму · Вперемешку»: правило раунда меняется — то «Считалка» (на скорость), то «Числовые
/// пары» (состав числа). Правила и поля — те же, что у родителей (`CounterField`, `BondsField`,
/// генераторы `makeCounterRound` / `makePuzzle`); здесь только смена правила и плашка правила.
///
/// 🔴 ПРАВИЛО ВИДНО ДО РАУНДА. Перед каждым раундом поле занимает крупная плашка с названием правила
/// ([_RuleBanner]), таймер раунда стартует ПОСЛЕ неё: человек, не успевший понять, что правило
/// сменилось, терял бы раунд на прочтении, а не на счёте. В ходе раунда правило остаётся в шапке
/// показателей («Режим»).
///
/// 🔴 СВОЯ ЛЕСТНИЦА `sum_mixed`; лестницы `counter` и `number_bonds` не читаются и не пишутся.
class SumMixedScreen extends StatefulWidget {
  const SumMixedScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<SumMixedScreen> createState() => _SumMixedScreenState();
}

enum _Phase { banner, playing, feedback, result }

class _SumMixedScreenState extends State<SumMixedScreen> {
  /// Сколько стоит плашка правила до раунда.
  static const _bannerDelay = Duration(milliseconds: 1400);
  static const _feedbackDelay = Duration(milliseconds: 700);
  static const _resetDelay = Duration(milliseconds: 300);
  static const _tickMs = 100;

  late final AppHaptics _haptics = AppHaptics(widget.state);
  late LevelLadder _ladder;
  late Rng _rng;
  late MixedCfg _cfg;
  List<SumRule> _rules = const [];

  MixedRound? _deal;
  final List<int> _picked = [];
  int _round = 1;
  int _hits = 0;
  int _errors = 0;
  int _timeouts = 0;
  bool? _right;
  bool _won = false;
  bool? _boss;
  bool _ready = false;
  _Phase _phase = _Phase.banner;
  int _leftMs = 0;
  Timer? _tick;
  Timer? _next;
  Timer? _clear;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'sum_mixed', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    _clear?.cancel();
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
    // Новая партия — снова зачётная (договор shell/lesson.dart).
    LessonUsed.reset();
    _tick?.cancel();
    _next?.cancel();
    _clear?.cancel();
    _cfg = mixedLevelParams(_ladder.level);
    _rules = dealRules(_cfg.rounds, _rng);
    _round = 1;
    _hits = 0;
    _errors = 0;
    _timeouts = 0;
    _won = false;
    _boss = null;
    _beginRound();
  }

  SumRule get _rule => _rules[_round - 1];

  /// Раздача раунда и плашка правила; таймер включится, когда плашка уйдёт.
  void _beginRound() {
    _tick?.cancel();
    _clear?.cancel();
    _picked.clear();
    _right = null;
    _deal = makeMixedRound(_rule, _cfg, _rng);
    _leftMs = _cfg.limitMs(_rule);
    _phase = _Phase.banner;
    _next?.cancel();
    _next = Timer(_bannerDelay, _startPlaying);
  }

  void _startPlaying() {
    if (!mounted || _phase != _Phase.banner) return;
    setState(() => _phase = _Phase.playing);
    if (_leftMs <= 0) return;
    _tick = Timer.periodic(const Duration(milliseconds: _tickMs), (_) {
      if (!mounted) return;
      setState(() => _leftMs = math.max(0, _leftMs - _tickMs));
      if (_leftMs <= 0) _onTimeout();
    });
  }

  int get _sum => _picked.fold(0, (s, i) => s + _deal!.values[i]);

  void _toggle(int index) {
    if (_phase != _Phase.playing) return;
    setState(() {
      if (!_picked.remove(index)) _picked.add(index);
    });
    final target = _deal!.target;
    if (_rule == SumRule.speed) {
      if (_sum == target) {
        _hit();
      } else if (_sum > target) {
        _overshoot();
      }
    } else if (_picked.length >= bondsMinPicked && _sum == target) {
      _hit();
    }
  }

  /// Протяжка (общий жест каркаса): берёт плитку, не переключая её; возврат снимает последнюю.
  void _swipePick(int index) {
    // Пока выбор гаснет после перебора («Считалка», 300 мс), протяжка новых плиток не берёт: иначе
    // каждая следующая плитка заново «перебирала» бы сумму — «ошибки 0 → 3» за одно движение.
    if (_clear?.isActive ?? false) return;
    if (_phase == _Phase.playing && !_picked.contains(index)) _toggle(index);
  }

  void _swipeUnpick(int index) {
    if (_phase == _Phase.playing && _picked.contains(index)) _toggle(index);
  }

  void _hit() {
    _haptics.win();
    _tick?.cancel();
    setState(() {
      _hits += 1;
      _right = true;
      _phase = _Phase.feedback;
    });
    _after();
  }

  /// Перебор в «Считалке» — ошибка с задержкой сброса, раунд продолжается (правило родителя).
  void _overshoot() {
    _haptics.miss();
    setState(() => _errors += 1);
    _clear?.cancel();
    _clear = Timer(_resetDelay, () {
      if (!mounted) return;
      setState(_picked.clear);
    });
  }

  /// «Проверить» в «Числовых парах»: неверная сумма или меньше двух фишек — ошибка, раунд потерян.
  void _validate() {
    if (_phase != _Phase.playing || _rule != SumRule.composition) return;
    if (_picked.length < bondsMinPicked || _sum != _deal!.target) {
      _failRound();
      return;
    }
    _hit();
  }

  void _failRound() {
    _haptics.miss();
    _tick?.cancel();
    setState(() {
      _errors += 1;
      _right = false;
      _phase = _Phase.feedback;
    });
    _after();
  }

  void _onTimeout() {
    _haptics.miss();
    _tick?.cancel();
    setState(() {
      _timeouts += 1;
      _errors += 1;
      _right = false;
      _phase = _Phase.feedback;
    });
    _after();
  }

  void _after() {
    _next?.cancel();
    _next = Timer(_feedbackDelay, _advance);
  }

  Future<void> _advance() async {
    if (!mounted) return;
    if (_round >= _cfg.rounds) {
      final passed = _hits >= _cfg.passNeed;
      bool? boss;
      if (passed) {
        boss = await BossRound.winThenBoss(context, _ladder,
            type: BossType.counting, color: const Color(0xFF7C83FD));
      } else {
        await _ladder.fail();
      }
      if (!mounted) return;
      setState(() {
        _won = passed;
        _boss = boss;
        _phase = _Phase.result;
      });
      return;
    }
    setState(() {
      _round += 1;
      _beginRound();
    });
  }

  String get _title => L.t('suiteSum');

  String _ruleName(SumRule r) => L.t(r == SumRule.speed ? 'suiteModeSpeed' : 'suiteModeComposition');

  /// Разбор — на настоящих раздачах обоих правил: первый пример у генератора «Считалки», второй —
  /// приём «Числовых пар».
  List<DemoTrial> _demoTrials() {
    final cfg = counterLevelParams(1);
    final deal = makeCounterRound(cfg.gridSize, cfg.cellMax, cfg.tripleShare, createRng('lesson-mixed'));
    final nums = deal.numbers;
    List<int> pick = const [];
    for (var i = 0; i < nums.length && pick.isEmpty; i++) {
      for (var j = i + 1; j < nums.length; j++) {
        if (nums[i] + nums[j] == deal.target) {
          pick = [i, j];
          break;
        }
      }
    }
    return [
      DemoTrial(
        text: '${deal.target}',
        sub: pick.map((i) => '${nums[i]}').join(' + '),
        answer: pick.map((i) => '${nums[i]}').join(' · '),
        rule: L.t('counterHint'),
      ),
      DemoTrial(text: '', rule: L.t('teachBondsTen')),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final deal = _deal!;
    final timed = _cfg.limitMs(_rule) > 0;
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('round'), value: '$_round/${_cfg.rounds}', icon: Icons.repeat),
        HudItem(label: L.t('mode'), value: _ruleName(_rule), icon: Icons.shuffle),
        if (timed)
          HudItem(
            label: L.t('timeLeftLabel'),
            value: '${(_leftMs / 1000).ceil()}${L.t('secShort')}',
            icon: Icons.timer_outlined,
          ),
        HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check_circle_outline),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) {
        if (_phase == _Phase.banner) return _RuleBanner(rule: _rule, name: _ruleName(_rule));
        if (_rule == SumRule.speed) {
          final c = deal.speed!;
          return CounterField(
            numbers: c.numbers,
            picked: _picked.toSet(),
            gridSize: _cfg.speed.gridSize,
            target: c.target,
            sum: _sum,
            feedback: _phase != _Phase.feedback
                ? CounterFeedback.none
                : _right == true
                    ? CounterFeedback.success
                    : CounterFeedback.timeout,
            height: h,
            onTap: _toggle,
            onSwipePick: _swipePick,
            onSwipeUnpick: _swipeUnpick,
          );
        }
        return BondsField(
          puzzle: deal.composition!,
          picked: _picked,
          sum: _sum,
          right: _right,
          height: h,
          onTap: _toggle,
          onSwipePick: _swipePick,
          onSwipeUnpick: _swipeUnpick,
        );
      },
      auxRow: AuxBar(children: [
        // Лист режимов набора: «Вперемешку» — текущий.
        SuiteModeAction(route: '/games/counter', state: widget.state, current: sumMixedRoute, extra: sumMixedMode),
        AuxAction(
          icon: Icons.backspace_outlined,
          label: L.t('clear'),
          onPressed: _phase == _Phase.playing && _picked.isNotEmpty ? () => setState(_picked.clear) : null,
        ),
        AuxAction(inPause: true, icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.result) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            '$_hits/${_cfg.rounds} · ${L.t('errors')} $_errors · ${L.t('hud_missed')} $_timeouts',
            key: const Key('result'),
            textAlign: TextAlign.center,
            style: text.titleMedium,
          ),
          BossOutcomeLine(_boss),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('next'),
            onPressed: () => setState(_reset),
            icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
            label: Text(_won ? L.t('nextLabel') : L.t('retry')),
          ),
        ]),
      );
    }
    if (_rule == SumRule.composition) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('check'),
          onPressed: _phase == _Phase.playing ? _validate : null,
          icon: const Icon(Icons.check),
          label: Text(L.t('check')),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        L.t('counterHint'),
        key: const Key('hint'),
        textAlign: TextAlign.center,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: text.bodySmall,
      ),
    );
  }
}

/// Крупная плашка правила перед раундом: значок, название правила, одна строка о том, что делать, и
/// напоминание, что правило может смениться.
class _RuleBanner extends StatelessWidget {
  const _RuleBanner({required this.rule, required this.name});

  final SumRule rule;
  final String name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          key: Key('rule-banner-${rule.name}'),
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(L.t('suiteModeMixed'), key: const Key('mode-caption'), style: text.labelLarge?.copyWith(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 8),
            Icon(rule == SumRule.speed ? Icons.bolt : Icons.extension, size: 72, color: scheme.primary),
            const SizedBox(height: 12),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                name,
                key: const Key('rule-banner-name'),
                textAlign: TextAlign.center,
                style: text.displaySmall?.copyWith(fontWeight: FontWeight.w800, color: scheme.primary),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              // Ключи — литералами в `L.t(...)`: сборщик словаря (`embed-l10n.mjs`) ищет их именно так.
              rule == SumRule.speed ? L.t('sumRuleSpeedSub') : L.t('sumRuleCompSub'),
              textAlign: TextAlign.center,
              style: text.titleMedium,
            ),
            const SizedBox(height: 16),
            Text(
              L.t('sumMixedRuleChanges'),
              textAlign: TextAlign.center,
              style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
