/// IGT — «Карточная игра Айовы», тринадцатый экран раздела «Конфликт внимания».
///
/// 🔴 ПРОВАЛИТЬ ЭТУ ПРОБУ НЕЛЬЗЯ. Её доводят до конца или бросают; результат —
/// банк и доля выгодных выборов, а не «прошёл / не прошёл». Поэтому на экране
/// итога нет ни «уровень взят», ни «ещё раз»: есть числа.
///
/// ⚠️ ЗАДЕРЖКА ОБРАТНОЙ СВЯЗИ — ЕДИНСТВЕННАЯ ОСЬ, и она устроена так, что
/// выплаты не меняются вовсе: тяжелее становится связать выбор с исходом.
/// Банк двигается ВМЕСТЕ с показом исхода, а не при нажатии — прыгнувшее число
/// выдавало бы результат до обратной связи, и задержка не нагружала бы ничего.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum IowaPhase { ready, playing, done }

/// Сколько держится отклик, мс. Из веб-версии.
const int iowaFeedbackMs = 1300;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool iowaAutostart = bool.fromEnvironment('AUTOSTART');

class IowaScreen extends StatefulWidget {
  const IowaScreen({super.key, required this.state, this.trials = 60});

  final SharedState state;

  /// Длина партии: 40 / 60 / 100. Канонная длина методики, НЕ ось сложности.
  final int trials;

  @override
  State<IowaScreen> createState() => _IowaScreenState();
}

class _IowaScreenState extends State<IowaScreen> {
  late LevelLadder _runs;
  IowaGame? _game;
  IowaPhase _phase = IowaPhase.ready;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // ⚠️ У этой игры «уровень» — это число ПРОЙДЕННЫХ ПАРТИЙ: провала нет, и
    // лестница двигается фактом завершения. Имя ключа то же, что у веб-версии.
    _runs = LevelLadder(gameId: 'iowa', store: SharedLevelStore(widget.state), maxLevel: iowaMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _runs.load();
    if (!mounted) return;
    setState(_reset);
    if (iowaAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = IowaGame(level: _runs.level, trials: widget.trials);
    _phase = IowaPhase.ready;
  }

  void _start() {
    _game!.begin();
    setState(() => _phase = IowaPhase.playing);
  }

  void _pick(Deck d) {
    if (_phase != IowaPhase.playing) return;
    final g = _game!;
    if (g.pick(d) == null) return;
    setState(() {});
    _timer = Timer(Duration(milliseconds: g.params.feedbackDelayMs), () {
      if (!mounted) return;
      setState(g.revealPending);
      _timer = Timer(const Duration(milliseconds: iowaFeedbackMs), () {
        if (!mounted) return;
        setState(g.closeTrial);
        if (g.finished) _finish();
      });
    });
  }

  void _finish() {
    _timer?.cancel();
    setState(() => _phase = IowaPhase.done);
    // Прохождение засчитано фактом завершения: провалить тест нельзя.
    _runs.win(score: _game!.bank < 0 ? 0 : _game!.bank, errors: _game!.result.disadvantageous);
  }

  /// 🔴 КАРТОЧКИ БЕЗ ОТВЕТА — И ЭТО НЕ ПРОПУСК. Верного хода на ОТДЕЛЬНОЙ пробе
  /// здесь нет: выигрывает стратегия. Подписать карточке «верно: так» значило бы
  /// соврать — человек сделает так и проиграет на следующем шаге.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachIowaTotal')),
        DemoTrial(text: '', rule: L.t('teachIowaSwitch')),
      ];

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('iowa'),
      onLesson: () => openDemoLesson(context, title: L.t('iowa'), trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('hud_bank'), value: '${g.bank}', icon: Icons.account_balance_wallet_outlined),
        HudItem(label: L.t('hud_card'), value: '${g.round}/${g.trials}', icon: Icons.style_outlined),
        HudItem(label: L.t('hud_goodDecks'), value: '${g.result.advantageous}', icon: Icons.thumb_up_outlined),
        HudItem(label: L.t('hud_badDecks'), value: '${g.result.disadvantageous}', icon: Icons.thumb_down_outlined),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == IowaPhase.playing ? _Decks(onPick: _pick, locked: g.locked) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final IowaGame game;
  final IowaPhase phase;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case IowaPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text(L.t('iowa'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('iowaHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              '${L.t('trialsLabel')}: ${game.trials}',
              key: const Key('iowa-trials'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case IowaPhase.done:
        final r = game.result;
        return _Centered(
          height: height,
          children: [
            // Ни «пройдено», ни «ещё раз»: у этой пробы нет исхода, есть числа.
            Text('${L.t('hud_bank')}: ${r.finalBank}',
                key: const Key('iowa-bank'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('${L.t('hud_goodDecks')}: ${r.advantageous} · ${L.t('hud_badDecks')}: ${r.disadvantageous}'),
            Text('${L.t('trialsLabel')}: ${r.nTrials}', key: const Key('iowa-result-trials')),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case IowaPhase.playing:
        final p = game.pending;
        final revealed = p != null && game.revealed;
        return SizedBox(
          height: height,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${L.t('hud_bank')}: ${game.bank}',
                    key: const Key('iowa-live-bank'),
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
                const SizedBox(height: 24),
                // Пока задержка идёт, коробка исхода ПУСТА — и это не «экран
                // завис»: в этом и состоит ось сложности.
                SizedBox(
                  height: 72,
                  child: revealed
                      ? Column(
                          key: const Key('iowa-feedback'),
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('+${p.win}',
                                key: const Key('iowa-win'),
                                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
                            if (p.loss != 0)
                              Text('${p.loss}',
                                  key: const Key('iowa-loss'),
                                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFFEF4444))),
                          ],
                        )
                      : const SizedBox.shrink(key: Key('iowa-waiting')),
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

class _Decks extends StatelessWidget {
  const _Decks({required this.onPick, required this.locked});
  final void Function(Deck) onPick;
  final bool locked;

  /// ⚠️ Буквы колод — НЕ текст интерфейса и переводу не подлежат: это имена
  /// колод из методики, и человек следит именно за буквой.
  static const _labels = {Deck.a: 'A', Deck.b: 'B', Deck.c: 'C', Deck.d: 'D'};

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            for (final d in Deck.values)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: TapLatency(
                    where: 'Flutter/Iowa',
                    child: SizedBox(
                      height: 56,
                      child: FilledButton(
                        key: Key('iowa-deck-${d.name}'),
                        // Кнопки остаются НАЖИМАЕМЫМИ и во время задержки: замок
                        // держит модель. Гасить их значило бы подсказывать, что
                        // ход уже принят, — а именно это и должно быть неясно.
                        onPressed: () => onPick(d),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text(_labels[d]!,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}
