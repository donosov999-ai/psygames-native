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
import 'words.dart';

/// «Эмоциональный Струп» на Flutter: называть ЦВЕТ ЧЕРНИЛ, а слово мешает
/// не значением цвета, как у обычного Струпа, а своим ЗАРЯДОМ.
enum EmoPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double emoPassAccuracy = 0.8;

/// Пауза на отклик между пробами, мс — то же число, что в веб-версии.
const int emoFeedbackMs = 350;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool emoAutostart = bool.fromEnvironment('AUTOSTART');

class EmoStroopScreen extends StatefulWidget {
  const EmoStroopScreen({super.key, required this.state, this.clock, this.rnd, this.words});

  final SharedState state;
  final int Function()? clock;
  final Random? rnd;

  /// Слова можно передать напрямую — так проба играет партию без ассета.
  final EmoWords? words;

  @override
  State<EmoStroopScreen> createState() => _EmoStroopScreenState();
}

class _EmoStroopScreenState extends State<EmoStroopScreen> {
  late LevelLadder _ladder;
  EmoStroopGame? _game;
  EmoWords? _words;
  EmoPhase _phase = EmoPhase.ready;
  EmoOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'stroop_emotional', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final w = widget.words ?? await EmoWords.load(widget.state.language);
    if (!mounted) return;
    setState(() {
      _words = w;
      _reset();
    });
    if (emoAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = EmoStroopGame(
      level: _ladder.level,
      words: _words!.byValence,
      nowMs: widget.clock,
      rnd: widget.rnd,
    );
    _phase = EmoPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = EmoPhase.playing;
      _flash = null;
    });
    _game!.begin();
    _nextTrial();
  }

  /// Название цвета словом — ключи ЛИТЕРАЛАМИ в каждой ветке.
  ///
  /// ⚠️ Сборщик словаря (`tools/embed-l10n.mjs`) видит только `L.t('имя')`:
  /// запись вида `L.t('color_' + имя)` он пропустил бы молча, и человек увидел
  /// бы на карточке «color_red».
  static String _colorWord(String name) => switch (name) {
        'red' => L.t('color_red'),
        'green' => L.t('color_green'),
        'blue' => L.t('color_blue'),
        _ => L.t('color_yellow'),
      };

  /// Примеры разбора: нейтральное слово, УГРОЗА и позитив — и на всех трёх ответ
  /// один по устройству: цвет чернил. В этом и упражнение: заряженное слово
  /// тормозит ответ, хотя к задаче отношения не имеет.
  ///
  /// ⚠️ Чернила и ответ берутся из ОДНОЙ переменной: разойтись им негде, а
  /// партия засчитывает ответ сравнением с тем же именем цвета (`answer`).
  List<DemoTrial> _demoTrials() {
    final w = _words!;
    const pairs = [
      (Valence.neutral, 'blue'),
      (Valence.threat, 'red'),
      (Valence.positive, 'green'),
    ];
    return [
      for (final (valence, ink) in pairs)
        if (w.byValence[valence]!.isNotEmpty)
          DemoTrial(
            text: w.byValence[valence]!.first,
            color: _hex(emoColorHex[ink]!),
            answer: _colorWord(ink),
            ruleKey: 'stroop2Hint',
          ),
    ];
  }

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() {});
    // Межстимульная пауза: на экране пусто, слово ещё не показано.
    _timer = Timer(Duration(milliseconds: g.isiMs), () {
      if (!mounted || _phase != EmoPhase.playing) return;
      setState(g.showStimulus);
      measureStimulusFrame('Flutter/EmoStroop');
      _timer = Timer(Duration(milliseconds: g.params.answerWindowMs), () {
        if (!mounted || _phase != EmoPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _answer(String color) {
    final g = _game;
    if (g == null || _phase != EmoPhase.playing || !g.stimulusShown) return;
    _after(g.answer(color));
  }

  void _after(EmoOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: emoFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= emoPassAccuracy;
    setState(() {
      _phase = EmoPhase.done;
      _passed = passed;
    });
    if (passed) {
      _ladder.win();
    } else {
      _ladder.fail();
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    final w = _words;
    if (g == null || w == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('stroopEmotional'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      onLesson: (_game == null || _words == null)
          ? null
          : () => openDemoLesson(context, title: L.t('stroopEmotional'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        words: w,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == EmoPhase.playing ? _Answers(onPick: _answer) : null,
    );
  }
}

Color _hex(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.words,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final EmoStroopGame game;
  final EmoWords words;
  final EmoPhase phase;
  final EmoOutcome? flash;
  final bool passed;
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case EmoPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('stroop2Hint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('stroopEmoLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{w}', (game.params.answerWindowMs / 1000).toStringAsFixed(1))
                  .replaceAll('{p}', '${(emotionalRatio * 100).round()}'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(L.t('stroopEmoPass'),
                style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            // 🔴 Честное предупреждение: наборы слов есть на двух языках, на
            // остальных проба идёт по-английски и заряд для человека слабее.
            if (words.lang != L.locale) ...[
              const SizedBox(height: 8),
              Text(L.t('stroopEmoLangFallback'),
                  key: const Key('emostroop-lang-fallback'),
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case EmoPhase.done:
        final threat = game.interferenceThreatMs;
        return _Centered(
          height: height,
          children: [
            Text(
              passed
                  ? L.t('levelDone').replaceAll('{n}', '${game.level}')
                  : L.t('sameLevelRetry'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits}/${game.trialsTotal} · '
                '${L.t('hud_errors')}: ${game.errors}'),
            Text(game.meanRtMs == null
                ? '${L.t('meanReaction')}: —'
                : '${L.t('meanReaction')}: ${game.meanRtMs} ${L.t('msShort')}'),
            /**
             * ⚠️ НА ЭКРАНЕ ОДНА МЕРА, В ПАРТИИ ДВЕ. Веб-версия показывает человеку
             * помеху от УГРОЗЫ (ключ `hud_interference`), а помеха от позитива идёт
             * только в запись партии. Заводить для второй подпись значило бы завести
             * новый ключ в общем словаре — а он правится параллельно другими чатами.
             * Обе величины модель считает, отдаёт `interferencePositiveMs` и проба её
             * проверяет; на экране остаётся то же, что в вебе.
             * Прочерк честнее нуля: ноль означал бы «заряд не мешает».
             */
            Text(threat == null
                ? '${L.t('hud_interference')}: —'
                : '${L.t('hud_interference')}: $threat ${L.t('msShort')}',
                key: const Key('emostroop-threat')),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case EmoPhase.playing:
        final t = game.trial!;
        final border = switch (flash) {
          EmoOutcome.hit => _good,
          null => Theme.of(context).dividerColor,
          _ => _bad,
        };
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                height: 160,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border, width: flash == null ? 1 : 3),
                ),
                child: Center(
                  child: game.stimulusShown
                      ? Text(
                          t.word,
                          key: const Key('emostroop-word'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 40,
                            fontWeight: FontWeight.w800,
                            color: _hex(emoColorHex[t.color]!),
                          ),
                        )
                      : const Text('•', style: TextStyle(fontSize: 36)),
                ),
              ),
              const SizedBox(height: 12),
              Text(L.t('stroop2Hint'), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  EmoOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('emostroop-hit')),
                  EmoOutcome.wrong => const Icon(Icons.cancel, color: _bad, key: Key('emostroop-wrong')),
                  EmoOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('emostroop-miss')),
                  null => const SizedBox.shrink(),
                },
              ),
            ],
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
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: children),
            ),
          ),
        ),
      );
}

/// Четыре кнопки-цвета: ответ — это ЦВЕТ ЧЕРНИЛ.
class _Answers extends StatelessWidget {
  const _Answers({required this.onPick});
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            for (final c in emoColors)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: TapLatency(
                    where: 'Flutter/EmoStroop',
                    child: SizedBox(
                      height: 56,
                      child: FilledButton(
                        key: Key('emostroop-answer-$c'),
                        onPressed: () => onPick(c),
                        style: FilledButton.styleFrom(
                          backgroundColor: _hex(emoColorHex[c]!),
                          padding: EdgeInsets.zero,
                        ),
                        child: const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}
