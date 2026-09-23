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

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
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
  late LevelLadder _ladder;
  WcstGame? _game;
  WcstPhase _phase = WcstPhase.ready;
  int? _flashIdx;
  bool _flashOk = false;
  bool _ruleShiftNote = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
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
    if (wcstAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = WcstGame(level: _ladder.level, classic: widget.classic, rnd: widget.rnd);
    _phase = WcstPhase.ready;
    _flashIdx = null;
    _ruleShiftNote = false;
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
    // ⚠️ В классике лестница не трогается: там нет и уровня.
    if (widget.classic) return;
    if (g.passed) {
      _ladder.win(score: g.hits * 10, errors: g.errors);
    } else {
      _ladder.fail(score: g.hits * 10, errors: g.errors);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('wcst'),
      hud: [
        if (!widget.classic) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('hud_streak'), value: '${g.streak}', icon: Icons.trending_up),
        // «Повторы» — персеверативные ошибки, главная мера пробы.
        HudItem(label: L.t('hud_repeats'), value: '${g.perseverative}', icon: Icons.replay),
      ],
      field: (context, h) => _Field(
        game: g,
        classic: widget.classic,
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
        return _Centered(
          height: height,
          children: [
            Text(L.t('wcst'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('wcstHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('wcstLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{s}', '${game.ruleStreak}'),
              key: const Key('wcst-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
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
                          border: flashIdx == i
                              ? (flashOk ? const Color(0xFF22C55E) : const Color(0xFFEF4444))
                              : null,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              _CardView(card: t, keyName: 'wcst-target', onTap: null, border: null),
              const SizedBox(height: 12),
              SizedBox(
                height: 32,
                child: ruleShiftNote
                    ? Text(L.t('wcstRuleShifted'),
                        key: const Key('wcst-shift-note'),
                        style: Theme.of(context).textTheme.labelLarge,
                        textAlign: TextAlign.center)
                    : const SizedBox.shrink(),
              ),
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
