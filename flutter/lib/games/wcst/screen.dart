/// WCST — «Сортировка карт», шестнадцатый экран раздела «Конфликт внимания».
///
/// 🔴 ПРАВИЛО ЧЕЛОВЕКУ НЕ ПОКАЗЫВАЕТСЯ И МЕНЯЕТСЯ МОЛЧА — в этом вся проба.
/// На экране нет ни имени правила, ни отметки «правило сменилось» до того, как
/// человек на нём ошибётся: подсказка «правило только что сменилось»
/// показывается ПОСЛЕ ошибки и объясняет, что она не его вина, а механика теста.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/game_preset.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/drop_baskets.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/session_report.dart';
import '../../shell/setup_scroll.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum WcstPhase { ready, playing, done }

/// Сколько держится отклик, мс. Из веб-версии.
const int wcstFeedbackMs = 600;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool wcstAutostart = bool.fromEnvironment('AUTOSTART');

/// Цвета карт. Значения те же, что в веб-версии.
const Map<CardColor, Color> wcstColorHex = {
  CardColor.r: Color(0xFFEF4444),
  CardColor.g: Color(0xFF22C55E),
  CardColor.b: Color(0xFF3B82F6),
  CardColor.y: Color(0xFFEAB308),
};

class WcstScreen extends StatefulWidget {
  const WcstScreen({super.key, required this.state, this.classic = false, this.rnd});

  final SharedState state;

  /// Классический режим: серия 10, классическая раздача, лестница не трогается.
  final bool classic;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<WcstScreen> createState() => _WcstScreenState();
}

class _WcstScreenState extends State<WcstScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late LevelLadder _ladder;
  WcstGame? _game;
  WcstPhase _phase = WcstPhase.ready;
  int? _flashIdx;
  bool _flashOk = false;
  bool _ruleShiftNote = false;
  Timer? _timer;
  late final SessionLaunch _sessionLaunch;

  /// «Свободно» (классика) — выбор на настройке, как у веба (`GameModeSwitch`); иначе уровни.
  late bool _free = widget.classic;

  /// Число проб свободной классики (20 / 40 / 60), по умолчанию 40 — как у веба.
  int _trials = 40;

  /// Ввод: карту тащат под стопку (по умолчанию) или тапают по стопке. Выбор человека помним.
  late bool _drag = widget.state.get(_inputKey) != 'tap';

  static final String _inputKey = '${SharedState.prefix}wcst_input';

  /// Шаг зарядки — тоже классика (веб: `const classic = isPreset || mode === 'classic'`). До
  /// 13.11.2026 натив брал классику только из конструктора, и шаг играл уровневый режим.
  bool get _classic => _free || GamePreset.isPreset;

  /// Число проб классики: шаг зарядки может задать своё (`trials`), иначе — выбор на настройке.
  int get _classicTrials => GamePreset.isPreset ? GamePreset.num('trials', _trials) : _trials;

  @override
  void initState() {
    super.initState();
    _sessionLaunch = SessionLaunch.capture();
    _ladder = LevelLadder(gameId: 'wcst', store: SharedLevelStore(widget.state), maxLevel: wcstMaxLevel);
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
    if (wcstAutostart || GamePreset.autostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = WcstGame(level: _ladder.level, classic: _classic, trialsOverride: _classic ? _classicTrials : null, rnd: widget.rnd);
    _phase = WcstPhase.ready;
    _flashIdx = null;
    _ruleShiftNote = false;
  }

  /// Выбор режима, числа проб и ввода — только до начала партии.
  void _pickFree(bool v) {
    if (_phase != WcstPhase.ready || v == _free) return;
    setState(() {
      _free = v;
      _reset();
    });
  }

  void _pickTrials(int n) {
    if (_phase != WcstPhase.ready || n == _trials) return;
    setState(() {
      _trials = n;
      _reset();
    });
  }

  void _pickDrag(bool v) {
    if (v == _drag) return;
    setState(() => _drag = v);
    widget.state.set(_inputKey, v ? 'drag' : 'tap');
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = WcstPhase.playing;
      _flashIdx = null;
      _ruleShiftNote = false;
    });
  }

  void _pick(int idx) {
    if (_phase != WcstPhase.playing) return;
    final g = _game!;
    // ⚠️ Признак «правило только что сменилось» снимается ДО выбора: сам выбор
    // его гасит, и после него объяснить ошибку было бы уже нечем.
    final wasJustChanged = g.awaitingCatch;
    final out = g.pick(idx);
    if (out == null) return;
    out == WcstOutcome.hit ? _haptics.hit() : _haptics.miss();
    setState(() {
      _flashIdx = idx;
      _flashOk = out == WcstOutcome.hit;
      // Ошибка сразу после смены правила — не вина человека, а механика теста.
      _ruleShiftNote = out == WcstOutcome.miss && wasJustChanged;
    });
    _timer = Timer(const Duration(milliseconds: wcstFeedbackMs), () {
      if (!mounted) return;
      g.closeTrial();
      if (!g.nextTrial()) {
        _finish();
        return;
      }
      setState(() {
        _flashIdx = null;
        _ruleShiftNote = false;
      });
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    setState(() => _phase = WcstPhase.done);
    // ⚠️ В классике лестницы нет вовсе: партия не двигает уровень, потому что там нет и уровня.
    // Свободная классика всё равно ПИШЕТСЯ (веб `saveSession`: метка `classic_<N>t`, по ней «Оценка»
    // узнаёт классику); шаг зарядки — через замороженную лестницу, она отдаёт запись и исход.
    if (_classic && !GamePreset.isPreset) {
      SessionReport.send(
        launch: _sessionLaunch,
        gameType: 'wcst',
        score: g.hits * 10,
        timeSeconds: 0,
        errors: g.errors,
        difficulty: 'medium',
        mode: 'classic_${g.trialsTotal}t',
        details: wcstSessionDetails(g),
      );
      return;
    }
    if (g.passed) {
      _ladder.win(score: g.hits * 10, errors: g.errors, details: wcstSessionDetails(g), stars: wcstStars(g.perseverative));
    } else {
      _ladder.fail(score: g.hits * 10, errors: g.errors, details: wcstSessionDetails(g));
    }
  }

  /// 🔴 КАРТОЧКИ БЕЗ ОТВЕТА — И ЭТО НЕ ПРОПУСК. Верного хода на ОТДЕЛЬНОЙ пробе
  /// здесь нет: выигрывает стратегия. Подписать карточке «верно: так» значило бы
  /// соврать — человек сделает так и проиграет на следующем шаге.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachWcstHypothesis')),
        DemoTrial(text: '', rule: L.t('teachWcstSwitch')),
        DemoTrial(text: '', rule: L.t('teachWcstHold')),
      ];

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('wcst'),
      onLesson: () => openDemoLesson(context, title: L.t('wcst'), trials: _demoTrials()),
      hud: [
        if (!_classic) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('hud_streak'), value: '${g.streak}', icon: Icons.trending_up),
        // «Повторы» — персеверативные ошибки, главная мера пробы.
        HudItem(label: L.t('hud_repeats'), value: '${g.perseverative}', icon: Icons.replay),
      ],
      field: (context, h) => _Field(
        game: g,
        classic: _classic,
        free: _free,
        trials: _trials,
        drag: _drag,
        onFree: _pickFree,
        onTrials: _pickTrials,
        onDrag: _pickDrag,
        phase: _phase,
        flashIdx: _flashIdx,
        flashOk: _flashOk,
        ruleShiftNote: _ruleShiftNote,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
        onPick: _pick,
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.classic,
    required this.free,
    required this.trials,
    required this.drag,
    required this.onFree,
    required this.onTrials,
    required this.onDrag,
    required this.phase,
    required this.flashIdx,
    required this.flashOk,
    required this.ruleShiftNote,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onPick,
  });

  final WcstGame game;
  final bool classic;

  /// «Свободно» выбрано на настройке (в шаге зарядки классика есть, а выбора нет).
  final bool free;
  final int trials;

  /// Ввод перетаскиванием (иначе — тапом по стопке).
  final bool drag;
  final ValueChanged<bool> onFree;
  final ValueChanged<int> onTrials;
  final ValueChanged<bool> onDrag;
  final WcstPhase phase;
  final int? flashIdx;
  final bool flashOk;
  final bool ruleShiftNote;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final void Function(int) onPick;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case WcstPhase.ready:
        return SetupScroll(
          height: height,
          onStart: onStart,
          children: [
            Text(L.t('wcst'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('wcstHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            // «Уровни / Свободно» — как у веба (`GameModeSwitch`). Шаг зарядки — всегда классика, выбора там нет.
            if (!GamePreset.isPreset) ...[
              SetupChoice<bool>(
                label: L.t('mode'),
                options: [(false, L.t('sudokuModeLevels'), 'wcst-mode-levels'), (true, L.t('sudokuModeFree'), 'wcst-mode-free')],
                value: free,
                onPick: onFree,
              ),
              const SizedBox(height: 4),
              Text(free ? L.t('wcstModeClassicDesc') : L.t('wcstModeLevelsDesc'),
                  key: const Key('wcst-mode-desc'),
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center),
              if (free) ...[
                const SizedBox(height: 8),
                SetupChoice<int>(
                  label: L.t('trialsLabel'),
                  options: [for (final n in const [20, 40, 60]) (n, '$n', 'wcst-trials-$n')],
                  value: trials,
                  onPick: onTrials,
                ),
              ],
              const SizedBox(height: 8),
            ],
            // Ввод: карту тащат под стопку (по умолчанию) или тапают по стопке; выбор помним.
            SetupChoice<bool>(
              label: L.t('dropInputLabel'),
              options: [(true, L.t('dropModeDrag'), 'wcst-input-drag'), (false, L.t('dropModeTap'), 'wcst-input-tap')],
              value: drag,
              onPick: onDrag,
            ),
            const SizedBox(height: 8),
            Text(
              L.t('wcstLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{s}', '${game.ruleStreak}'),
              key: const Key('wcst-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        );
      case WcstPhase.done:
        final rc = game.ruleCatch;
        return _Centered(
          height: height,
          children: [
            Text(
              classic
                  ? '${L.t('hud_correct')}: ${game.hits}/${game.trialsTotal}'
                  : (game.passed
                      ? L.t('levelDone').replaceAll('{n}', '${game.level}')
                      : L.t('sameLevelRetry')),
              key: const Key('wcst-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits} · ${L.t('hud_repeats')}: ${game.perseverative}'),
            // ⚠️ Прочерк, а не ноль: сдвигов не было — перехватывать было нечего,
            // и ноль означал бы мгновенный перехват, которого не случалось.
            Text(
              rc.mean == null ? '${L.t('hud_streak')}: —' : '${L.t('hud_streak')}: ${rc.mean} (${rc.shifts})',
              key: const Key('wcst-catch'),
            ),
            const SizedBox(height: 8),
            Text(L.t('wcstPass').replaceAll('{c}', '${game.params.persevCap}'),
                style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case WcstPhase.playing:
        final t = game.target!;
        Color? flashOf(int i) =>
            flashIdx == i ? (flashOk ? const Color(0xFF22C55E) : const Color(0xFFEF4444)) : null;
        final shiftNote = SizedBox(
          height: 32,
          child: ruleShiftNote
              ? Text(L.t('wcstRuleShifted'),
                  key: const Key('wcst-shift-note'),
                  style: Theme.of(context).textTheme.labelLarge,
                  textAlign: TextAlign.center)
              : const SizedBox.shrink(),
        );
        if (drag) {
          // Карту ТАЩАТ под одну из четырёх стопок (общий компонент каркаса, решение Дениса 13.11).
          // ⚠️ Правило по-прежнему не показывается, и «верно / неверно» известно только игре: поэтому
          // isCorrect всегда «да» — никаких встрясок и «неверной» карточки до отклика игры. Время
          // реакции WCST не меряет, меряет переключение правила, так что перенос жеста замер не искажает.
          final live = flashIdx == null;
          return SizedBox(
            height: height,
            child: DropBasketsScope<int, int>(
              enabled: live,
              canDrop: (item) => live && item == game.round,
              isCorrect: (_, _) => true,
              onAnswer: (_, target) => onPick(target),
              implicitItem: game.round,
              resetKey: game.round,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < wcstRefCards.length; i++)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: DropBasket<int, int>(
                            target: i,
                            label: '${L.t('wcst')} ${i + 1}',
                            borderRadius: 10,
                            builder: (context, highlighted) => _CardView(
                              card: wcstRefCards[i],
                              keyName: 'wcst-ref-$i',
                              onTap: null,
                              border: flashOf(i) ?? (highlighted ? Theme.of(context).colorScheme.primary : null),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  DropCard<int>(
                    item: game.round,
                    label: L.t('wcst'),
                    builder: (context, selected) => _CardView(
                      card: t,
                      keyName: 'wcst-target',
                      onTap: null,
                      border: selected ? Theme.of(context).colorScheme.primary : null,
                    ),
                  ),
                  const SizedBox(height: 12),
                  shiftNote,
                ],
              ),
            ),
          );
        }
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Четыре эталона — по ним и сортируют.
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < wcstRefCards.length; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: TapLatency(
                        where: 'Flutter/WCST',
                        child: _CardView(
                          card: wcstRefCards[i],
                          keyName: 'wcst-ref-$i',
                          onTap: () => onPick(i),
                          border: flashOf(i),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              _CardView(card: t, keyName: 'wcst-target', onTap: null, border: null),
              const SizedBox(height: 12),
              shiftNote,
            ],
          ),
        );
    }
  }
}

/// Карта: N фигур одного цвета.
class _CardView extends StatelessWidget {
  const _CardView({required this.card, required this.keyName, required this.onTap, required this.border});
  final WcstCard card;
  final String keyName;
  final VoidCallback? onTap;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    final color = wcstColorHex[card.color]!;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        key: Key(keyName),
        width: 72,
        height: 96,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(width: border == null ? 1 : 3, color: border ?? Theme.of(context).dividerColor),
        ),
        child: Wrap(
          alignment: WrapAlignment.center,
          spacing: 4,
          runSpacing: 4,
          // Каждая фигура названа своим ключом: и число, и форма, и цвет карты
          // читаются с экрана, а не из модели. ПРАВИЛО при этом остаётся скрытым.
          children: [
            for (var i = 0; i < card.count; i++)
              _Shape(
                key: Key('$keyName-glyph-${card.shape.name}-${card.color.name}-$i'),
                shape: card.shape,
                color: color,
              ),
          ],
        ),
      ),
    );
  }
}

class _Shape extends StatelessWidget {
  const _Shape({super.key, required this.shape, required this.color});
  final CardShape shape;
  final Color color;

  @override
  Widget build(BuildContext context) {
    const size = 16.0;
    switch (shape) {
      case CardShape.circle:
        return Container(width: size, height: size, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
      case CardShape.square:
        return Container(
            width: size,
            height: size,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)));
      case CardShape.triangle:
        return Icon(Icons.change_history, size: size + 4, color: color);
      case CardShape.star:
        return Icon(Icons.star, size: size + 4, color: color);
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
