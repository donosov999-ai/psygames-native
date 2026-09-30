import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../languages/json_asset.dart';
import 'model.dart';

/// «Story Recall» — экран раздела «Языки» на Flutter. Правила и сверка с живым TS —
/// в `model.dart` и `test/story_recall_test.dart`.
///
/// Партия: чтение → счёт в уме → немедленный пересказ → счёт подольше → отложенный
/// пересказ. Провала нет по устройству: пересказ доводят до конца, и уровень
/// засчитывается завершением, как в вебе.
enum StoryPhase { config, reading, distractor1, recall1, distractor2, recall2, result }

const Color _ready = Color(0xFF22C55E);

class StoryRecallScreen extends StatefulWidget {
  const StoryRecallScreen({super.key, required this.state, this.clock, this.random, this.storiesOverride});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final List<Story>? storiesOverride;

  @override
  State<StoryRecallScreen> createState() => _StoryRecallScreenState();
}

class _StoryRecallScreenState extends State<StoryRecallScreen> {
  late LevelLadder _ladder;
  List<Story>? _stories;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  StoryPhase _phase = StoryPhase.config;
  Story? _story;
  int _remaining = 0;
  Timer? _tick;

  StoryMath _math = const StoryMath(1, 1, true);
  int _mathScore = 0;
  final _mathInput = TextEditingController();
  final _recall1 = TextEditingController();
  final _recall2 = TextEditingController();
  int _hits1 = 0;
  int _hits2 = 0;
  int _levelPlayed = 1;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _lang => widget.state.language;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'story_recall', store: SharedLevelStore(widget.state), maxLevel: storyMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _mathInput.dispose();
    _recall1.dispose();
    _recall2.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final stories = widget.storiesOverride ??
        [
          for (final s in ((await loadJsonAsset('assets/vocab/story-recall.json') as Map)['stories'] as List))
            Story.fromJson(s as Map),
        ];
    if (!mounted) return;
    setState(() => _stories = stories);
    if (mounted && GamePreset.autostart) _start();
  }

  /// Фаза со счётом секунд: остаток считается от начала фазы, а не тиками —
  /// тик может опоздать, время нет.
  void _runPhase(StoryPhase phase, int seconds, VoidCallback onEnd) {
    _tick?.cancel();
    final start = _now;
    setState(() {
      _phase = phase;
      _remaining = seconds;
    });
    _tick = Timer.periodic(const Duration(milliseconds: 200), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      final left = seconds - ((_now - start) / 1000).floor();
      setState(() => _remaining = max(0, left));
      if (left <= 0) {
        t.cancel();
        onEnd();
      }
    });
  }

  void _start() {
    final stories = _stories ?? const <Story>[];
    if (stories.isEmpty) return;
    final story = stories[(_rng() * stories.length).floor()];
    _recall1.clear();
    _recall2.clear();
    setState(() {
      _story = story;
      _hits1 = 0;
      _hits2 = 0;
      _mathScore = 0;
      _levelPlayed = _ladder.level;
    });
    _runPhase(StoryPhase.reading, readSecondsFor(story.readSeconds, _ladder.level), _startDistractor1);
  }

  /// 🔴 Чтение можно закончить раньше — подписанной кнопкой. Отчёт 3c7b98c5
  /// (26.09.2026): «И где кнопка проверить? Или автопереход дальше».
  void _finishReading() {
    _tick?.cancel();
    _startDistractor1();
  }

  void _nextMath() {
    _math = nextStoryMath(_rng);
    _mathInput.clear();
  }

  void _startDistractor1() {
    _nextMath();
    _runPhase(StoryPhase.distractor1, distractorSecondsFor(storyDistractor1Sec, _ladder.level),
        () => setState(() => _phase = StoryPhase.recall1));
  }

  void _startDistractor2() {
    _nextMath();
    _runPhase(StoryPhase.distractor2, distractorSecondsFor(storyDistractor2Sec, _ladder.level),
        () => setState(() => _phase = StoryPhase.recall2));
  }

  void _submitMath() {
    if (int.tryParse(_mathInput.text.trim()) == _math.answer) _mathScore += 1;
    setState(_nextMath);
  }

  /// «Готов к пересказу»: помеху можно закончить раньше, как в вебе.
  void _skipDistractor() {
    _tick?.cancel();
    setState(() => _phase = _phase == StoryPhase.distractor1 ? StoryPhase.recall1 : StoryPhase.recall2);
  }

  void _submitRecall1() {
    _hits1 = countStoryMatches(_recall1.text, _story!.keywordsFor(_lang));
    _startDistractor2();
  }

  Future<void> _submitRecall2() async {
    final kws = _story!.keywordsFor(_lang);
    final hits = countStoryMatches(_recall2.text, kws);
    final total = storyKeys(kws).length;
    final immediate = total > 0 ? _hits1 / total : 0.0;
    final delayed = total > 0 ? hits / total : 0.0;
    final retention = immediate > 0 ? delayed / immediate : 0.0;
    double r3(double v) => double.parse(v.toStringAsFixed(3));
    setState(() {
      _hits2 = hits;
      _phase = StoryPhase.result;
    });
    // `passed` веб не пишет НАМЕРЕННО: провала нет, уровень засчитан завершением.
    await _ladder.win(
      score: ((_hits1 + hits) * 50).round(),
      timeSeconds: 0,
      errors: total - hits,
      mode: 'standard',
      difficulty: 'medium',
      details: {
        'level': _levelPlayed,
        'n_keywords': total,
        'immediate_recall_count': _hits1,
        'delayed_recall_count': hits,
        'immediate_recall_pct': r3(immediate),
        'delayed_recall_pct': r3(delayed),
        'retention_rate': r3(retention),
        'distractor_score': _mathScore,
      },
    );
    if (mounted) setState(() {});
  }

  /// Разбор до партии: рассказ целиком и то, что засчитывается, — ключевые детали.
  List<DemoTrial> _demoTrials() {
    final s = (_stories ?? const <Story>[]).firstOrNull;
    if (s == null) return [DemoTrial(text: '', rule: L.t('storyIntroDesc'))];
    final text = s.textFor(_lang);
    return [
      DemoTrial(
        text: text,
        // ⚠️ Стимул — целый рассказ: текстом карточки он шёл бы крупным шрифтом и
        // вылезал снизу. Виджетом `art` карточка ужимает его целиком.
        art: SizedBox(width: 300, child: Text(text, style: const TextStyle(fontSize: 15, height: 1.35))),
        sub: L.t('storyReadHint'),
        answer: storyKeys(s.keywordsFor(_lang)).take(6).join(', '),
        rule: L.t('storyIntroDesc'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_stories == null) {
      return GameShell(title: L.t('story'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final isDistractor = _phase == StoryPhase.distractor1 || _phase == StoryPhase.distractor2;
    final isRecall = _phase == StoryPhase.recall1 || _phase == StoryPhase.recall2;
    return GameShell(
      title: L.t('story'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('story'), trials: _demoTrials()),
      hud: switch (_phase) {
        StoryPhase.reading => [
            HudItem(label: L.t('storyReadPhase'), value: '$_remaining${L.t('secShort')}', icon: Icons.menu_book),
          ],
        StoryPhase.distractor1 || StoryPhase.distractor2 => [
            HudItem(
              label: _phase == StoryPhase.distractor1 ? L.t('storyDistractor1') : L.t('storyDistractor2'),
              value: '$_remaining${L.t('secShort')}',
              icon: Icons.timer_outlined,
            ),
            HudItem(label: L.t('hud_correct'), value: '$_mathScore', icon: Icons.check),
          ],
        _ => const [],
      },
      field: (context, h) => switch (_phase) {
        StoryPhase.config => _config(context, h),
        StoryPhase.reading => _reading(context, h),
        StoryPhase.distractor1 || StoryPhase.distractor2 => _distractor(context, h),
        StoryPhase.recall1 || StoryPhase.recall2 => _recallField(context, h),
        StoryPhase.result => _result(context, h),
      },
      toolbar: _phase == StoryPhase.reading
          ? _bar([
              FilledButton(key: const Key('story-read-done'), onPressed: _finishReading, child: Text(L.t('storyReadDone'))),
            ])
          : isDistractor
              ? _bar([
                  FilledButton(key: const Key('story-math-ok'), onPressed: _submitMath, child: const Text('OK')),
                  FilledButton.icon(
                    key: const Key('story-ready'),
                    style: FilledButton.styleFrom(backgroundColor: _ready, foregroundColor: Colors.white),
                    onPressed: _skipDistractor,
                    icon: const Icon(Icons.check),
                    label: FittedBox(fit: BoxFit.scaleDown, child: Text(L.t('storyReadyRecall'))),
                  ),
                ])
              : isRecall
                  ? _bar([
                      FilledButton(
                        key: const Key('story-done'),
                        onPressed: _phase == StoryPhase.recall1 ? _submitRecall1 : _submitRecall2,
                        child: Text(L.t('storyDone')),
                      ),
                    ])
                  : null,
    );
  }

  Widget _bar(List<Widget> buttons) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(children: [
          for (var i = 0; i < buttons.length; i += 1) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: SizedBox(height: 52, child: buttons[i])),
          ],
        ]),
      );

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('story'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('storyDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('storyInfo'), style: theme.textTheme.titleSmall),
          Text(L.t('storyInfoBody'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text('${L.t('level')} ${_ladder.level}', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(key: const Key('story-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _reading(BuildContext context, double h) {
    final hint = Theme.of(context).textTheme.bodySmall;
    return SizedBox(
      height: h,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(_story!.textFor(_lang), key: const Key('story-text'), style: const TextStyle(fontSize: 17, height: 1.45)),
          ),
          const SizedBox(height: 14),
          Text(L.t('storyReadHint'), textAlign: TextAlign.center, style: hint),
          Text(L.t('storyReadAuto').replaceAll('{n}', '$_remaining'), key: const Key('story-read-auto'),
              textAlign: TextAlign.center, style: hint),
        ]),
      ),
    );
  }

  Widget _distractor(BuildContext context, double h) => SizedBox(
        height: h,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Text(L.t('storyDistractorHint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            Text(_math.text, key: const Key('story-math'), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            SizedBox(
              width: 180,
              child: TextField(
                key: const Key('story-math-input'),
                controller: _mathInput,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
                decoration: const InputDecoration(border: OutlineInputBorder()),
                onSubmitted: (_) => _submitMath(),
              ),
            ),
          ]),
        ),
      );

  Widget _recallField(BuildContext context, double h) {
    final first = _phase == StoryPhase.recall1;
    return SizedBox(
      height: h,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(first ? L.t('storyImmediate') : L.t('storyDelayed'),
              textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(L.t('storyRecallHint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          TextField(
            key: Key(first ? 'story-recall1' : 'story-recall2'),
            controller: first ? _recall1 : _recall2,
            autofocus: true,
            autocorrect: false,
            minLines: 6,
            maxLines: 10,
            keyboardType: TextInputType.multiline,
            decoration: InputDecoration(border: const OutlineInputBorder(), hintText: L.t('storyRecallPlaceholder')),
          ),
        ]),
      ),
    );
  }

  Widget _result(BuildContext context, double h) {
    final total = storyKeys(_story!.keywordsFor(_lang)).length;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(L.t('levelDone').replaceAll('{n}', '$_levelPlayed'),
              style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('${L.t('storyImmediate')}: $_hits1 / $total', key: const Key('story-hits1')),
          Text('${L.t('storyDelayed')}: $_hits2 / $total', key: const Key('story-hits2')),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('story-again'),
            onPressed: () => setState(() => _phase = StoryPhase.config),
            child: Text(L.t('nextNow')),
          ),
        ]),
      ),
    );
  }
}
