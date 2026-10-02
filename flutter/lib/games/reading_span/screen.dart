import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../languages/fresh_pool.dart';
import '../languages/json_asset.dart';
import 'model.dart';

/// «ОБЪЁМ ПРИ ЧТЕНИИ» на общем каркасе — перенос `app/games/reading-span.tsx`.
///
/// Предложения набора идут по одному: оценить смысл кнопкой под полем и запомнить
/// последнее слово; после набора — набрать последние слова в порядке показа.
///
/// ⚠️ ВВОД СЛОВ — ТЕКСТОМ, С КЛАВИАТУРЫ СИСТЕМЫ, КАК В ВЕБЕ. Своего ряда под полем у ввода
/// нет сознательно: это решение Дениса (задача 6596a00d, варианты а/б). (а) свой ряд набора —
/// по сути полная клавиатура; (б) выбор слов из сетки превращает СВОБОДНОЕ воспоминание в
/// УЗНАВАНИЕ — тест мерил бы другое, более лёгкое. Пока решения нет, мера остаётся прежней.
///
/// Новое по сравнению с вебом: «Показать решение» и разбор до партии (8d9be1b7, 45bb6f2a).
enum RspanPhase { ready, judge, hold, recall, done, revealed }

/// Тёмно-зелёный градиента веб-экрана (`#1f4037`).
const _accent = Color(0xFF1F4037);
const _sense = Color(0xFF22C55E);
const _nonsense = Color(0xFFF43F5E);

/// Запас «невиданного» — общий с веб-половиной (`pickFresh('reading_span')`).
const _seenPool = 'reading_span';

class ReadingSpanScreen extends StatefulWidget {
  const ReadingSpanScreen({super.key, required this.state, this.sentences, this.rng});

  final SharedState state;

  /// Предложения игры. `null` — из ассета `assets/reading_span/sentences.json`.
  final List<RspanSentence>? sentences;

  /// Случайность раздачи; пробы подставляют семенную.
  final double Function()? rng;

  @override
  State<ReadingSpanScreen> createState() => _ReadingSpanScreenState();
}

class _ReadingSpanScreenState extends State<ReadingSpanScreen> {
  /// Вибрация — через общий выключатель «Вибрация» (веб `psygames_haptic_enabled`).
  late final AppHaptics _haptics = AppHaptics(widget.state);

  late LevelLadder _ladder;
  late final double Function() _rng = widget.rng ?? Random().nextDouble;
  final _input = TextEditingController();
  List<RspanSentence> _pool = const [];

  ReadingSpanGame? _game;
  RspanPhase _phase = RspanPhase.ready;
  int _setSize = 3;
  int _holdMs = 0;
  GameTimer? _timer;
  int? _startedAt;

  /// Последний ответ на суждение — подсветка кнопки на миг, как отклик.
  bool? _lastJudge;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'reading_span', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _input.dispose();
    super.dispose();
  }

  String get _lang => L.locale;

  Future<void> _boot() async {
    await _ladder.load();
    final pool = widget.sentences ??
        [
          for (final e in await loadJsonAsset('assets/reading_span/sentences.json') as List)
            RspanSentence.fromJson((e as Map).cast<String, Object?>()),
        ];
    if (!mounted) return;
    _pool = pool;
    setState(_reset);
    if (GamePreset.autostart) _start();
  }

  /// Правила партии: по уровню, а в шаге зарядки — по шагу (размер набора — желание шага,
  /// но не выше освоенного + 1, правило `capPresetByLevel`; удержания в шаге нет).
  void _reset() {
    _timer?.cancel();
    final p = RspanLevelParams.of(_ladder.level, _pool.length);
    if (GamePreset.isPreset) {
      _setSize = capPresetByLevel(
        want: GamePreset.num('setSize', 4),
        atLevel: p.setSize,
        atTop: p.setSize >= _pool.length,
      );
      _holdMs = 0;
    } else {
      _setSize = p.setSize;
      _holdMs = p.holdMs;
    }
    _game = null;
    _phase = RspanPhase.ready;
    _input.clear();
    _lastJudge = null;
    _startedAt = null;
  }

  Future<void> _start() async {
    if (_phase != RspanPhase.ready || _pool.isEmpty) return;
    final deal = rspanDeal(_pool, _setSize, readSeen(widget.state, _seenPool), _rng);
    await writeSeen(widget.state, _seenPool, deal.seen);
    if (!mounted) return;
    setState(() {
      _game = ReadingSpanGame(level: _ladder.level, seq: deal.picked);
      _phase = RspanPhase.judge;
    });
    _startedAt = gameNow();
  }

  void _judge(bool saysSense) {
    final g = _game;
    if (g == null || _phase != RspanPhase.judge) return;
    g.judge(saysSense);
    _haptics.selection();
    setState(() => _lastJudge = saysSense);
    if (!g.judged) return;
    // Ось 3 — удержание: последние слова надо ещё додержать, прежде чем откроется ввод.
    if (_holdMs > 0) {
      setState(() => _phase = RspanPhase.hold);
      _timer = gameTimeout(Duration(milliseconds: _holdMs), () {
        if (mounted && _phase == RspanPhase.hold) setState(() => _phase = RspanPhase.recall);
      });
    } else {
      setState(() => _phase = RspanPhase.recall);
    }
  }

  Future<void> _check() async {
    final g = _game;
    if (g == null || _phase != RspanPhase.recall) return;
    g.check(_lang, _input.text);
    final seconds = ((gameNow() - (_startedAt ?? gameNow())) / 1000).round();
    setState(() => _phase = RspanPhase.done);
    // Метки и details — как пишет веб-экран (`saveSession` в reading-span.tsx).
    final difficulty = rspanDifficulty(_setSize);
    final mode = '$_setSize-set';
    final details = <String, Object?>{
      'level': g.level,
      'judgments': g.judgeHits,
      'recalled': g.hits,
      'expected': g.recall!.expected.join(' '),
    };
    if (g.passed) {
      await _ladder.win(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    } else {
      await _ladder.fail(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    }
    if (mounted) setState(() {});
  }

  /// «Показать решение»: весь набор с последними словами по порядку и пометкой смысла;
  /// партия кончается без зачёта — ни победой, ни провалом.
  void _reveal() {
    _timer?.cancel();
    setState(() => _phase = RspanPhase.revealed);
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (_pool.isEmpty) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final calm = _phase == RspanPhase.ready || _phase == RspanPhase.done || _phase == RspanPhase.revealed;
    final playing = _phase == RspanPhase.judge || _phase == RspanPhase.hold || _phase == RspanPhase.recall;
    return GameShell(
      levelRule: LevelRuleSpot(gameId: 'reading_span', level: _ladder.level, state: widget.state, calm: calm),
      title: L.t('readingSpan'),
      onLesson: () => openDemoLesson(context, title: L.t('readingSpan'), trials: readingSpanLessonTrials(_pool, _lang)),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: L.t('hud_step'),
          value: g == null ? '0/$_setSize' : '${min(g.judgments.length + 1, g.seq.length)}/${g.seq.length}',
          icon: Icons.notes,
        ),
        HudItem(label: L.t('hud_correct'), value: '${g?.judgeHits ?? 0}', icon: Icons.check_circle_outline),
      ],
      field: (context, h) => switch (_phase) {
        RspanPhase.ready => _Ready(level: _ladder.level, onStart: _start),
        RspanPhase.judge => _Judge(sentence: g!.current, language: _lang),
        RspanPhase.hold => const _Hold(),
        RspanPhase.recall => _Recall(controller: _input, onSubmit: _check),
        RspanPhase.done => _Done(game: g!),
        RspanPhase.revealed => RspanSolution(seq: g?.seq ?? const [], language: _lang),
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: playing ? _reveal : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: switch (_phase) {
        RspanPhase.judge => _JudgeButtons(last: _lastJudge, onJudge: _judge),
        RspanPhase.recall => Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton(key: const Key('rspan-check'), onPressed: _check, child: Text(L.t('check'))),
          ),
        RspanPhase.done || RspanPhase.revealed => Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              key: const Key('rspan-again'),
              onPressed: () => setState(_reset),
              icon: const Icon(Icons.arrow_forward),
              label: Text(_phase == RspanPhase.done && g!.passed ? L.t('nextLabel') : L.t('retry')),
            ),
          ),
        _ => null,
      },
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

class _Ready extends StatelessWidget {
  const _Ready({required this.level, required this.onStart});

  final int level;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.menu_book_outlined, size: 48, color: _accent),
          const SizedBox(height: 8),
          Text(L.t('readingSpanDesc'), textAlign: TextAlign.center, style: text.titleMedium),
          const SizedBox(height: 12),
          Text(
            L.t('rspanLvlAuto').replaceAll('{n}', '$level'),
            key: const Key('rspan-level-params'),
            textAlign: TextAlign.center,
            style: text.bodySmall,
          ),
          const SizedBox(height: 20),
          FilledButton(key: const Key('rspan-start'), onPressed: onStart, child: Text(L.t('start'))),
        ],
      ),
    );
  }
}

/// Карточка предложения — та же в партии, в решении и в разборе.
class RspanSentenceCard extends StatelessWidget {
  const RspanSentenceCard({super.key, required this.sentence, required this.language, this.mark});

  final RspanSentence sentence;
  final String language;

  /// Пометка смысла (в решении и разборе): `true` — смысл есть, `false` — бессмыслица.
  final bool? mark;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 480),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: mark == null ? null : Border.all(color: mark! ? _sense : _nonsense, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(sentence.text(language),
              key: const Key('rspan-sentence'),
              textAlign: TextAlign.center,
              style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600, height: 1.35)),
          const SizedBox(height: 14),
          Text.rich(
            TextSpan(children: [
              TextSpan(text: '${L.t('rememberLast')}: '),
              TextSpan(
                text: sentence.last(language),
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
              ),
            ]),
            key: const Key('rspan-last-word'),
            style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _Judge extends StatelessWidget {
  const _Judge({required this.sentence, required this.language});

  final RspanSentence sentence;
  final String language;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          children: [
            RspanSentenceCard(sentence: sentence, language: language),
            const SizedBox(height: 16),
            Text(L.t('readingSpanJudge'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}

/// Кнопки суждения — прибиты к низу, как в вебе (эталон math-sprint).
class _JudgeButtons extends StatelessWidget {
  const _JudgeButtons({required this.last, required this.onJudge});

  final bool? last;
  final ValueChanged<bool> onJudge;

  @override
  Widget build(BuildContext context) {
    Widget button(Key key, bool says, IconData icon, String label, Color color) => Expanded(
          child: FilledButton.icon(
            key: key,
            style: FilledButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: () => onJudge(says),
            icon: Icon(icon, size: 26),
            label: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Row(children: [
        button(const Key('rspan-sense'), true, Icons.check, L.t('makesSense'), _sense),
        const SizedBox(width: 12),
        button(const Key('rspan-nonsense'), false, Icons.close, L.t('nonsense'), _nonsense),
      ]),
    );
  }
}

class _Hold extends StatelessWidget {
  const _Hold();

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.psychology_outlined, size: 56, color: _accent),
            const SizedBox(height: 8),
            Text(L.t('memorize'),
                key: const Key('rspan-hold'),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          ],
        ),
      );
}

class _Recall extends StatelessWidget {
  const _Recall({required this.controller, required this.onSubmit});

  final TextEditingController controller;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          Text(L.t('recallNow'), textAlign: TextAlign.center, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(L.t('recallHint'), textAlign: TextAlign.center, style: text.bodySmall),
          const SizedBox(height: 16),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: TextField(
              key: const Key('rspan-input'),
              controller: controller,
              autofocus: true,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.none,
              minLines: 2,
              maxLines: 4,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => onSubmit(),
              decoration: InputDecoration(
                hintText: L.t('recallPlaceholder'),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Done extends StatelessWidget {
  const _Done({required this.game});

  final ReadingSpanGame game;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final r = game.recall;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Icon(game.passed ? Icons.check_circle_outline : Icons.replay,
              key: Key(game.passed ? 'rspan-passed' : 'rspan-failed'),
              size: 56,
              color: game.passed ? _sense : _nonsense),
          const SizedBox(height: 12),
          Text('${L.t('hud_correct')}: ${game.hits}/${game.seq.length}', key: const Key('rspan-hits'), style: text.titleMedium),
          Text('${L.t('hud_errors')}: ${game.errors}', key: const Key('rspan-errors'), style: text.titleMedium),
          if (r != null) ...[
            const SizedBox(height: 8),
            Text(r.expected.join(' · '), key: const Key('rspan-expected'), textAlign: TextAlign.center, style: text.bodyMedium),
          ],
          if (!game.passed) ...[
            const SizedBox(height: 8),
            Text(L.t('sameLevelRetry'), style: text.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// Решение: весь набор по порядку — предложение с пометкой смысла и его последнее слово.
class RspanSolution extends StatelessWidget {
  const RspanSolution({super.key, required this.seq, required this.language});

  final List<RspanSentence> seq;
  final String language;

  /// Слова, которые засчитала бы игра, в порядке ответа — та же функция проверки.
  List<String> get answer => rspanRecallScore(seq, language, '').expected;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        key: const Key('rspan-solution'),
        padding: const EdgeInsets.all(16),
        // Набор строится целиком, а не лениво: до 62 строк, и каждая — часть решения.
        child: Column(children: [
          for (var i = 0; i < seq.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Semantics(
                label: 'rspan-sol-$i-${seq[i].ok ? 'sense' : 'nonsense'}',
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(radius: 13, backgroundColor: _accent, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))),
                    const SizedBox(width: 10),
                    Expanded(child: RspanSentenceCard(sentence: seq[i], language: language, mark: seq[i].ok)),
                  ],
                ),
              ),
            ),
        ]),
      );
}

/// РАЗБОР ДО ПАРТИИ — на карточке предложения самой игры и по её правилу засчёта.
///
/// 1) осмысленное предложение: «Со смыслом», а последнее слово — запомнить; 2) бессмыслица:
/// всё равно запомнить последнее слово — оценка и память идут вместе; 3) после набора —
/// набрать последние слова в порядке показа. Верный ответ на суждение берётся из флага
/// предложения (`ok`), то есть ровно так, как партию засчитывает игра.
List<DemoTrial> readingSpanLessonTrials(List<RspanSentence> pool, String language) {
  final sense = pool.firstWhere((s) => s.ok, orElse: () => pool.first);
  final nonsense = pool.firstWhere((s) => !s.ok, orElse: () => pool.last);
  final three = pool.take(3).toList();
  return [
    DemoTrial(
      text: '',
      // Каждый ключ — своим L.t('…'): ключ внутри тернарника сборщик словаря не видит.
      answer: sense.ok ? L.t('makesSense') : L.t('nonsense'),
      rule: L.t('teachRspanJudge'),
      art: RspanSentenceCard(sentence: sense, language: language),
    ),
    DemoTrial(
      text: '',
      answer: nonsense.ok ? L.t('makesSense') : L.t('nonsense'),
      rule: L.t('teachRspanNonsense'),
      art: RspanSentenceCard(sentence: nonsense, language: language),
    ),
    DemoTrial(
      text: rspanRecallScore(three, language, '').expected.join(' '),
      rule: L.t('teachRspanRecall'),
      art: RspanSolution(seq: three, language: language),
    ),
  ];
}
