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
import '../languages/bilingual.dart';
import '../languages/json_asset.dart';
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import '../languages/fresh_pool.dart';
import 'model.dart';

/// «Сортировка слов» — второй экран раздела «Языки» на Flutter.
///
/// Слово на изучаемом языке → к какой категории оно относится. Правила и их
/// сверка с живым TS — в `model.dart` и `test/semantic_sort_test.dart`.
enum SemanticPhase { config, playing, result }

/// Пауза перед следующим раундом: на ошибке дольше — верную категорию надо успеть
/// увидеть, иначе ошибка ничему не учит (числа из веб-версии).
const int semanticNextOkMs = 350;
const int semanticNextWrongMs = 900;

/// Имя категории — ЛИТЕРАЛОМ `L.t('…')` на каждую из четырнадцати.
///
/// 🔴 НЕ СОБИРАТЬ КЛЮЧ ИЗ ЧАСТЕЙ. Сборщик словаря (`flutter/tools/embed-l10n.mjs`)
/// берёт из исходника только литералы `L.t('…')`; ключ вида `'catVocab_$cat'` в
/// `assets/l10n/<язык>.json` не попадёт вовсе, и человек увидел бы на кнопке
/// `catVocab_food` — а проба «кнопок столько-то» осталась бы зелёной.
String semanticCategoryName(String cat) => switch (cat) {
      'adjectives' => L.t('catVocab_adjectives'),
      'animals' => L.t('catVocab_animals'),
      'basics' => L.t('catVocab_basics'),
      'body' => L.t('catVocab_body'),
      'colors' => L.t('catVocab_colors'),
      'concepts' => L.t('catVocab_concepts'),
      'food' => L.t('catVocab_food'),
      'home' => L.t('catVocab_home'),
      'nature' => L.t('catVocab_nature'),
      'numbers' => L.t('catVocab_numbers'),
      'people' => L.t('catVocab_people'),
      'places' => L.t('catVocab_places'),
      'time' => L.t('catVocab_time'),
      'verbs' => L.t('catVocab_verbs'),
      _ => cat,
    };

class SemanticSortScreen extends StatefulWidget {
  const SemanticSortScreen({super.key, required this.state, this.clock, this.random, this.vocabOverride, this.distractorsOverride});

  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final List<Map<String, String>>? vocabOverride;
  final Map<String, List<String>>? distractorsOverride;

  @override
  State<SemanticSortScreen> createState() => _SemanticSortScreenState();
}

class _SemanticSortScreenState extends State<SemanticSortScreen> {
  late LevelLadder _ladder;
  List<Map<String, String>>? _vocab;
  LangNames _names = LangNames.empty;
  Map<String, List<String>> _distractors = const {};
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  SemanticPhase _phase = SemanticPhase.config;
  String _targetLang = 'en';
  bool _bilingual = false;
  String _wantedSecond = 'es';

  List<SemanticRound> _rounds = const [];
  int _idx = 0;
  String? _picked;
  int _correct = 0;
  int _errors = 0;
  int _rtSum = 0;
  int _shownAtMs = 0;
  int _startMs = 0;
  int _levelPlayed = 1;
  int _catsPerRound = 2;
  bool _passed = false;
  Timer? _next;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _baseLang => widget.state.language;
  String get _second => secondNotFirst(_baseLang, _targetLang, _wantedSecond);

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'semantic_sort', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final vocab = widget.vocabOverride ??
        [
          for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List<dynamic>)
            (e as Map).map((k, v) => MapEntry('$k', '$v')),
        ];
    final distractors = widget.distractorsOverride ??
        <String, List<String>>{
          for (final e in (await loadJsonAsset('assets/vocab/semantic-distractors.json') as Map).entries)
            '${e.key}': [for (final w in (e.value as List)) '$w'],
        };
    final names = await LangNames.load();
    if (!mounted) return;
    setState(() {
      _names = names;
      _vocab = vocab;
      _distractors = distractors;
      // Настройки шага зарядки — из адреса, как `useGamePreset` в вебе.
      _targetLang = GamePreset.str('targetLang', _baseLang == 'en' ? 'es' : 'en');
      _bilingual = GamePreset.str(bilingualKey) == '1';
      _wantedSecond = GamePreset.str('lang2', pairFor(_baseLang)[1]);
    });
    if (mounted && GamePreset.autostart) await _start();
  }

  List<String> get _langs {
    final v = _vocab;
    if (v == null || v.isEmpty) return const [];
    return [for (final k in v.first.keys) if (k != 'cat' && k != _baseLang) k];
  }

  Future<void> _start() async {
    final vocab = _vocab ?? const <Map<String, String>>[];
    final p = semanticLevelParams(_ladder.level);
    // Шаг зарядки играет СВОИМИ числами (`rounds`, `cats`), а не лестницей — как веб:
    // «0 категорий» значит «шаг не задал», и тогда берётся ступень уровня.
    final useLevel = !GamePreset.isPreset;
    final rc = useLevel ? p.roundsCount : GamePreset.num('rounds', 15);
    final catsAsked = GamePreset.num('cats', 0);
    final cpr = useLevel ? p.catsPerRound : (catsAsked > 0 ? catsAsked : p.catsPerRound);

    final cw = semanticCategories(vocab, _targetLang);
    final effCats = min(cpr, cw.cats.length);
    final langs = _bilingual ? [_targetLang, _second] : [_targetLang];
    final pool = semanticWordsPool(vocab, cw.cats, langs);
    final seen = readSeen(widget.state, semanticSeenPool);
    final fresh = pickFreshWeb(pool, rc, seen, (w) => w['en'] ?? '', _rng);
    await writeSeen(widget.state, semanticSeenPool, fresh.seen);

    final rounds = buildSemanticRounds(
      picked: fresh.picked,
      rounds: rc,
      cats: cw.cats,
      effCats: effCats,
      wordCat: cw.wordCat,
      tgt: _targetLang,
      langsByRound: _bilingual ? rowForPair(rc, _targetLang, _second) : const [],
      bilingual: _bilingual,
      distractors: _distractors,
      rng: _rng,
    );
    if (!mounted || rounds.isEmpty) return;
    setState(() {
      _rounds = rounds;
      _idx = 0;
      _picked = null;
      _correct = 0;
      _errors = 0;
      _rtSum = 0;
      _levelPlayed = _ladder.level;
      _catsPerRound = cpr;
      _startMs = _now;
      _shownAtMs = _now;
      _phase = SemanticPhase.playing;
    });
  }

  void _pick(String cat) {
    if (_picked != null || _phase != SemanticPhase.playing) return;
    final round = _rounds[_idx];
    _rtSum += _now - _shownAtMs;
    final ok = cat == round.correctCat;
    setState(() {
      _picked = cat;
      if (ok) {
        _correct += 1;
      } else {
        _errors += 1;
      }
    });
    _next?.cancel();
    _next = Timer(Duration(milliseconds: ok ? semanticNextOkMs : semanticNextWrongMs), () {
      if (!mounted) return;
      final next = _idx + 1;
      if (next >= _rounds.length) {
        _finish();
        return;
      }
      setState(() {
        _idx = next;
        _picked = null;
        _shownAtMs = _now;
      });
    });
  }

  Future<void> _finish() async {
    _next?.cancel();
    final total = _rounds.length;
    final accuracy = total > 0 ? _correct / total : 0.0;
    // Проход уровня — точность не ниже 80 %. Шаг зарядки лестницу не двигает:
    // это правило оболочки (`LevelLadder`), партия всё равно уходит в статистику.
    final passed = accuracy >= semanticPassAccuracy;
    final details = <String, Object?>{
      'target_lang': _bilingual ? '$_targetLang+$_second' : _targetLang,
      'rounds': total,
      'cats_per_round': _catsPerRound,
      'accuracy': accuracy,
      'mean_rt_ms': total > 0 ? (_rtSum / total).round() : 0,
      if (!GamePreset.isPreset) 'level': _levelPlayed,
    };
    final args = (
      score: _correct,
      timeSeconds: ((_now - _startMs) / 1000).round(),
      errors: _errors,
      difficulty: '$_targetLang · $total × $_catsPerRound',
    );
    if (passed) {
      await _ladder.win(
          score: args.score, timeSeconds: args.timeSeconds, errors: args.errors, difficulty: args.difficulty, details: details);
    } else {
      await _ladder.fail(
          score: args.score, timeSeconds: args.timeSeconds, errors: args.errors, difficulty: args.difficulty, details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = SemanticPhase.result;
      });
    }
  }

  /// 🔴 РАЗБОР ДО ПАРТИИ, НА ДАННЫХ ИГРЫ: первое слово словаря этой пары и его
  /// категория — ровно так, как она подписана на кнопке. Правило — ключ веба
  /// `semanticSortIntroDesc`, уже переведённый на 12 языков.
  List<DemoTrial> _demoTrials() {
    final v = _vocab ?? const <Map<String, String>>[];
    final w = v.firstWhere(
      (e) => (e[_targetLang] ?? '').isNotEmpty && (e['cat'] ?? '').isNotEmpty,
      orElse: () => const <String, String>{},
    );
    return [
      DemoTrial(
        text: w[_targetLang] ?? '',
        sub: L.t('sortHint'),
        answer: semanticCategoryName(w['cat'] ?? ''),
        rule: L.t('semanticSortIntroDesc'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_vocab == null) {
      return GameShell(
        title: L.t('semanticSort'),
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final round = _phase == SemanticPhase.playing ? _rounds[_idx] : null;
    return GameShell(
      title: L.t('semanticSort'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('semanticSort'), trials: _demoTrials()),
      hud: round == null
          ? const []
          : [
              if (_bilingual)
                HudItem(label: L.t('bilingualMode'), value: pairPill(round.lang, [_targetLang, _second]), icon: Icons.translate),
              HudItem(label: L.t('round'), value: '${_idx + 1}/${_rounds.length}', icon: Icons.numbers),
              HudItem(label: L.t('hud_correct'), value: '$_correct', icon: Icons.check),
              HudItem(label: L.t('hud_errors'), value: '$_errors', icon: Icons.close),
            ],
      field: (context, h) => switch (_phase) {
        SemanticPhase.config => _config(context, h),
        SemanticPhase.playing => _word(context, h, round!),
        SemanticPhase.result => _result(context, h),
      },
      toolbar: round == null ? null : _answers(context, round),
    );
  }

  Widget _config(BuildContext context, double h) {
    final p = semanticLevelParams(_ladder.level);
    final langs = _langs;
    final seconds = [for (final l in langs) if (l != _targetLang) l];
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('semanticSort'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('semanticSortDesc'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Text('${L.t('level')} ${_ladder.level}', style: Theme.of(context).textTheme.titleMedium),
          Text(
            L.t('semanticLvlParams').replaceAll('{r}', '${p.roundsCount}').replaceAll('{c}', '${p.catsPerRound}'),
            key: const Key('semantic-level-params'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Text(L.t('language')),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('semantic-lang'),
            keyPrefix: 'semantic-lang',
            langs: langs,
            value: _targetLang,
            label: _names.name,
            onChanged: (v) => setState(() => _targetLang = v),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('semantic-bilingual'),
            contentPadding: EdgeInsets.zero,
            title: Text(L.t('bilingualMode')),
            subtitle: Text(_names.bilingualDesc(_targetLang, _second), style: Theme.of(context).textTheme.bodySmall),
            value: _bilingual,
            onChanged: (v) => setState(() => _bilingual = v),
          ),
          if (_bilingual)
            LangDropdown(
              key: const Key('semantic-lang2'),
              keyPrefix: 'semantic-lang2',
              langs: seconds,
              value: _second,
              label: _names.name,
              onChanged: (v) => setState(() => _wantedSecond = v),
            ),
          const SizedBox(height: 24),
          FilledButton(key: const Key('semantic-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _word(BuildContext context, double h, SemanticRound r) => SizedBox(
        height: h,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(
                r.word,
                key: const Key('semantic-word'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(L.t('sortHint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
        ),
      );

  Widget _result(BuildContext context, double h) {
    final total = _rounds.length;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(L.t('resultsTitle'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text('${L.t('hud_correct')}: $_correct / $total · ${L.t('hud_errors')}: $_errors', key: const Key('semantic-score')),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('semantic-again'),
            onPressed: () => setState(() => _phase = SemanticPhase.config),
            child: Text(_passed ? L.t('nextLabel') : L.t('retry')),
          ),
        ]),
      ),
    );
  }

  Widget _answers(BuildContext context, SemanticRound r) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: LayoutBuilder(
        // Две колонки от ширины САМОЙ полосы, а не окна: иначе на узком экране
        // колонка уезжает за край (отчёт e0ad9f91 на веб-версии «Словаря»).
        builder: (context, c) => Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final cat in r.cats)
              SizedBox(
                width: (c.maxWidth - 8) / 2,
                height: 56,
                child: FilledButton(
                  key: Key('semantic-cat-$cat'),
                  onPressed: _picked == null ? () => _pick(cat) : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    backgroundColor: _picked == null
                        ? null
                        : cat == r.correctCat
                            ? const Color(0xFF22C55E)
                            : cat == _picked
                                ? const Color(0xFFEF4444)
                                : scheme.surfaceContainerHighest,
                  ),
                  child: FittedBox(fit: BoxFit.scaleDown, child: Text(semanticCategoryName(cat), maxLines: 2)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
