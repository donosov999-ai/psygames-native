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
import 'model.dart';

/// «Слово или нет?» (лексическое решение) — экран раздела «Языки» на Flutter.
/// Правила и сверка с живым TS — в `model.dart` и `test/lexical_decision_test.dart`.
enum LdPhase { config, playing, result }

const Color _accent = Color(0xFF0EA5E9);
const Color _good = Color(0xFF34D399);
const Color _bad = Color(0xFFF43F5E);

class LexicalDecisionScreen extends StatefulWidget {
  const LexicalDecisionScreen({super.key, required this.state, this.clock, this.random, this.vocabOverride});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final List<Map<String, String>>? vocabOverride;

  @override
  State<LexicalDecisionScreen> createState() => _LexicalDecisionScreenState();
}

class _LexicalDecisionScreenState extends State<LexicalDecisionScreen> {
  late LevelLadder _ladder;

  /// «По норме?» — своя лестница (ключ `lexical_decision_norm`, как у веба), партия — тем же
  /// типом `lexical_decision` с режимом `norm<N>`.
  late LevelLadder _normLadder;
  Map<String, List<NsForm>> _ns = const {};
  bool _normWanted = false;

  /// Режим идущей партии: выбор на экране настройки во время партии не меняется.
  bool _normPlay = false;
  List<Map<String, String>>? _vocab;
  LangNames _names = LangNames.empty;
  LdLetters _letters = LdLetters.empty;
  Set<String> _ldLangs = const {};
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  LdPhase _phase = LdPhase.config;
  String _targetLang = 'en';
  bool _bilingual = false;
  String _wantedSecond = 'es';

  List<LdTrial> _trials = const [];
  int _idx = 0;

  /// Выбор на текущей пробе: `true` — «слово», `false` — «не слово». По дедлайну
  /// ставится НЕВЕРНЫЙ ответ, чтобы карточка подсветилась красным, как в вебе.
  bool? _picked;
  int _correct = 0;
  int _errors = 0;
  int _hits = 0, _falseAlarms = 0, _misses = 0, _rejections = 0, _timeouts = 0;
  int _rtSum = 0, _rtCount = 0;
  int _shownAtMs = 0;
  int _startMs = 0;
  int _windowMs = 0;
  int _levelPlayed = 1;
  bool _passed = false;
  Timer? _deadline;
  Timer? _advance;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _baseLang => widget.state.language;

  /// 🔴 Родной язык — тоже язык задания (решение Дениса 01.10.2026, d0ad03d9): раньше он
  /// отсекался, и англоязычный игрок никогда не получал английский. Откат — только для языка
  /// без словаря, как `tgt` веба.
  String get _target =>
      _ldLangs.isEmpty || _ldLangs.contains(_targetLang) ? _targetLang : (_baseLang == 'en' ? 'es' : 'en');
  String get _second => secondNotFirst(_baseLang, _target, _wantedSecond);

  /// 🔴 «По норме?» (d0ad03d9) — только у языков с данными ненормативных форм и только
  /// одноязычный: норма у каждого языка своя.
  bool get _normAvailable => _ns[_target]?.isNotEmpty ?? false;
  bool get _norm => _normWanted && _normAvailable;
  LevelLadder get _lad => _norm ? _normLadder : _ladder;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'lexical_decision', store: SharedLevelStore(widget.state));
    _normLadder = LevelLadder(
        gameId: 'lexical_decision_norm', store: SharedLevelStore(widget.state), sessionType: 'lexical_decision');
    _boot();
  }

  @override
  void dispose() {
    _clearTimers();
    super.dispose();
  }

  void _clearTimers() {
    _deadline?.cancel();
    _advance?.cancel();
  }

  Future<void> _boot() async {
    await _ladder.load();
    await _normLadder.load();
    final vocab = widget.vocabOverride ??
        [
          for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List<dynamic>)
            (e as Map).map((k, v) => MapEntry('$k', '$v')),
        ];
    final names = await LangNames.load();
    final letters = LdLetters.fromJson(await loadJsonAsset('assets/vocab/pseudoword-letters.json') as Map);
    final ns = nsFormsFromJson(await loadJsonAsset('assets/vocab/nonstandard-forms.json') as Map);
    final langs = <String>{for (final w in vocab) ...w.keys};
    if (!mounted) return;
    setState(() {
      _vocab = vocab;
      _names = names;
      _letters = letters;
      _ns = ns;
      _normWanted = GamePreset.str('ldMode') == 'norm';
      _ldLangs = {for (final l in langs) if (ldProducesPseudowords(vocab, letters, l)) l};
      _targetLang = GamePreset.str('targetLang', _baseLang == 'en' ? 'es' : 'en');
      _bilingual = GamePreset.str(bilingualKey) == '1';
      _wantedSecond = GamePreset.str('lang2', pairFor(_baseLang)[1]);
    });
    if (mounted && GamePreset.autostart) _start();
  }

  /// 🔴 Только языки, на которых псевдослова правда строятся, — в порядке `LANGUAGES`.
  /// Раньше в вебе выбор шёл из всех двенадцати, и на французском игра была пустой.
  List<String> get _langs => [
        for (final l in (_names.languages.isEmpty ? _ldLangs : _names.languages.keys))
          if (_ldLangs.contains(l)) l,
      ];

  void _start() {
    _clearTimers();
    final norm = _norm;
    final ladder = _lad;
    final p = ldLevelParams(ladder.level);
    // Шаг зарядки — прежний темп без дедлайна и своё число проб, как в вебе.
    final count = GamePreset.isPreset ? GamePreset.num('trials', 30) : p.trials;
    final trials = norm
        ? [
            for (final x in ldBuildNormTrials(_ns, target: _target, level: ladder.level, count: count, rng: _rng))
              LdTrial(x.text, x.isNorm, _target, ns: x.item),
          ]
        : buildLexicalTrials(
            vocab: _vocab ?? const [],
            letters: _letters,
            target: _target,
            second: _second,
            bilingual: _bilingual,
            count: count,
            rng: _rng,
          );
    if (trials.isEmpty) return;
    setState(() {
      _trials = trials;
      _idx = 0;
      _picked = null;
      _correct = 0;
      _errors = 0;
      _hits = _falseAlarms = _misses = _rejections = _timeouts = 0;
      _rtSum = _rtCount = 0;
      _levelPlayed = ladder.level;
      _normPlay = norm;
      _windowMs = GamePreset.isPreset ? 0 : p.windowMs;
      _startMs = _now;
      _phase = LdPhase.playing;
    });
    _present();
  }

  /// Показ пробы: момент показа + дедлайн уровня (0 — без дедлайна).
  void _present() {
    _shownAtMs = _now;
    if (_windowMs > 0) _deadline = Timer(Duration(milliseconds: _windowMs), _onTimeout);
  }

  /// Не успел в окно: ошибка, а на СЛОВЕ ещё и пропуск. Время реакции не пишется.
  void _onTimeout() {
    if (!mounted || _picked != null || _phase != LdPhase.playing) return;
    final t = _trials[_idx];
    setState(() {
      _errors += 1;
      _timeouts += 1;
      if (t.isWord) _misses += 1;
      _picked = !t.isWord;
    });
    // «По норме?»: на ошибке видна норма и правило — время прочитать.
    _advance = Timer(Duration(milliseconds: _normPlay ? 2400 : 800), _next);
  }

  void _answer(bool saysWord) {
    if (_picked != null || _phase != LdPhase.playing) return;
    _deadline?.cancel();
    final t = _trials[_idx];
    _rtSum += _now - _shownAtMs;
    _rtCount += 1;
    final ok = saysWord == t.isWord;
    setState(() {
      _picked = saysWord;
      if (ok) {
        _correct += 1;
        if (t.isWord) {
          _hits += 1;
        } else {
          _rejections += 1;
        }
      } else {
        _errors += 1;
        if (t.isWord) {
          _misses += 1;
        } else {
          _falseAlarms += 1;
        }
      }
    });
    _advance = Timer(Duration(milliseconds: ok ? (_normPlay ? 900 : 300) : (_normPlay ? 2400 : 800)), _next);
  }

  void _next() {
    if (!mounted) return;
    final next = _idx + 1;
    if (next >= _trials.length) {
      _finish();
      return;
    }
    setState(() {
      _idx = next;
      _picked = null;
    });
    _present();
  }

  Future<void> _finish() async {
    _clearTimers();
    final total = _trials.length;
    final accuracy = total > 0 ? _correct / total : 0.0;
    // Шаг зарядки уровень не трогает, и веб пишет его партию непройденной.
    final passed = !GamePreset.isPreset && accuracy >= ldPassAccuracy;
    final details = <String, Object?>{
      'level': _levelPlayed,
      'kind': _normPlay ? 'norm' : 'word',
      'target_lang': _target,
      'trials': total,
      'window_ms': _windowMs,
      'timeouts': _timeouts,
      'hits': _hits,
      'false_alarms': _falseAlarms,
      'misses': _misses,
      'correct_rejections': _rejections,
      'accuracy': accuracy,
      'mean_rt_ms': _rtCount > 0 ? (_rtSum / _rtCount).round() : 0,
    };
    final secs = ((_now - _startMs) / 1000).round();
    final mode = '${_normPlay ? 'norm' : 'lvl'}$_levelPlayed';
    final diff = '$_target · $total';
    final ladder = _normPlay ? _normLadder : _ladder;
    if (passed) {
      await ladder.win(score: _correct, timeSeconds: secs, errors: _errors, mode: mode, difficulty: diff, details: details);
    } else {
      await ladder.fail(score: _correct, timeSeconds: secs, errors: _errors, mode: mode, difficulty: diff, details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = LdPhase.result;
      });
    }
  }

  /// Разбор до партии: настоящее слово языка и псевдослово из него же. В режиме «По норме?» —
  /// пара текущей ступени: ненормативная форма с правилом, потом её норма.
  List<DemoTrial> _demoTrials() {
    if (_norm) {
      final tiers = ldNormTiers(_normLadder.level);
      final pair = _ns[_target]!.firstWhere((x) => tiers.contains(x.tier), orElse: () => _ns[_target]!.first);
      final ruleKey = ldNsRuleKey(pair.rule);
      return [
        DemoTrial(
          text: pair.form,
          sub: L.t('ldNormHint'),
          answer: L.t('ldNotNormBtn'),
          rule: '${L.t('ldNormShouldBe').replaceAll('{norm}', pair.norm)}. ${ruleKey == null ? '' : L.t(ruleKey)}',
        ),
        DemoTrial(text: pair.norm, sub: L.t('ldNormHint'), answer: L.t('ldNormBtn'), rule: L.t('ldModeNormDesc')),
      ];
    }
    final vocab = _vocab ?? const <Map<String, String>>[];
    final words = ldRealWords(vocab, _target);
    if (words.isEmpty) return [DemoTrial(text: '', rule: L.t('lexicalDecisionIntroDesc'))];
    List<String> pseudo;
    try {
      pseudo = ldPseudowords(vocab, _letters, _target, 1, Random(7).nextDouble);
    } on StateError {
      pseudo = const [];
    }
    return [
      DemoTrial(text: words.first, sub: L.t('ldHint'), answer: L.t('ldWordBtn'), rule: L.t('lexicalDecisionIntroDesc')),
      if (pseudo.isNotEmpty)
        DemoTrial(text: pseudo.first, sub: L.t('ldHint'), answer: L.t('ldNonwordBtn'), rule: L.t('lexicalDecisionIntroDesc')),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_vocab == null) {
      return GameShell(title: L.t('lexicalDecision'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final t = _phase == LdPhase.playing ? _trials[_idx] : null;
    // Метка языка нужна везде, где язык выбран НЕ человеком на этом экране:
    // в билингво и в шаге зарядки (замечание Дениса 10.09.2026).
    final showLang = (_bilingual && !_normPlay) || GamePreset.isPreset;
    return GameShell(
      title: L.t('lexicalDecision'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('lexicalDecision'), trials: _demoTrials()),
      hud: t == null
          ? const []
          : [
              if (showLang)
                HudItem(
                  label: L.t('bilingualMode'),
                  value: pairPill(t.lang, _bilingual ? [_target, _second] : const []),
                  icon: Icons.translate,
                ),
              HudItem(label: L.t('round'), value: '${_idx + 1}/${_trials.length}', icon: Icons.numbers),
              HudItem(label: L.t('hud_correct'), value: '$_correct', icon: Icons.check),
              HudItem(label: L.t('hud_errors'), value: '$_errors', icon: Icons.close),
            ],
      field: (context, h) => switch (_phase) {
        LdPhase.config => _config(context, h),
        LdPhase.playing => _prompt(context, h, t!, showLang),
        LdPhase.result => _result(context, h),
      },
      toolbar: t == null ? null : _buttons(),
    );
  }

  Widget _config(BuildContext context, double h) {
    final p = ldLevelParams(_lad.level);
    final langs = _langs;
    final seconds = [for (final l in langs) if (l != _target) l];
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('lexicalDecision'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('lexicalDecisionDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          // 🔴 Переключатель ВЫШЕ выбора языка: список языков длинный, и под ним
          // переключатель уходил ниже сгиба (замер кадром 10.09.2026).
          if (_normAvailable) ...[
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final n in const [false, true])
                ChoiceChip(
                  key: Key(n ? 'ld-mode-norm' : 'ld-mode-word'),
                  label: Text(n ? L.t('ldModeNorm') : L.t('lexicalDecision')),
                  selected: _norm == n,
                  onSelected: (_) => setState(() => _normWanted = n),
                ),
            ]),
            if (_norm) ...[
              const SizedBox(height: 6),
              Text(L.t('ldModeNormDesc'), key: const Key('ld-mode-norm-desc'), style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 8),
          ],
          if (!_norm)
          SwitchListTile(
            key: const Key('ld-bilingual'),
            contentPadding: EdgeInsets.zero,
            title: Text(L.t('bilingualMode')),
            subtitle: Text(_names.bilingualDesc(_target, _second), style: theme.textTheme.bodySmall),
            value: _bilingual,
            onChanged: (v) => setState(() => _bilingual = v),
          ),
          if (_bilingual && !_norm)
            LangDropdown(
              key: const Key('ld-lang2'),
              keyPrefix: 'ld-lang2',
              langs: seconds,
              value: _second,
              label: _names.name,
              onChanged: (v) => setState(() => _wantedSecond = v),
            ),
          const SizedBox(height: 12),
          Text('${_names.name(_baseLang)} →', style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('ld-lang'),
            keyPrefix: 'ld-lang',
            langs: langs,
            value: _target,
            label: _names.name,
            onChanged: (l) => setState(() => _targetLang = l),
          ),
          const SizedBox(height: 16),
          Text('${L.t('level')} ${_lad.level}', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          Text(
            L.t('trialsWindowParams').replaceAll('{n}', '${p.trials}').replaceAll('{w}', (p.windowMs / 1000).toStringAsFixed(1)),
            key: const Key('ld-level-params'),
            style: theme.textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
          if (_norm)
            Text(
              L.t('ldNormTiers').replaceAll('{t}', [for (final n in ldNormTiers(_lad.level)) L.t(ldNormTierKeys[n - 1])].join(' · ')),
              key: const Key('ld-norm-tiers'),
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          Text(L.t('passCorrect80Window'), style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
          if (_lad.level > 1)
            Center(
              child: TextButton(
                key: const Key('ld-reset-level'),
                onPressed: () async {
                  await _lad.pick(1);
                  if (mounted) setState(() {});
                },
                child: Semantics(label: L.t('a11yResetLevel'), child: const Text('↺ 1')),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton(key: const Key('ld-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _prompt(BuildContext context, double h, LdTrial t, bool showLang) {
    final scheme = Theme.of(context).colorScheme;
    final shown = _picked != null;
    final right = shown && _picked == t.isWord;
    final switched = _idx > 0 && _trials[_idx - 1].lang != t.lang;
    return SizedBox(
      height: h,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              key: const Key('ld-card'),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 56, horizontal: 20),
              decoration: BoxDecoration(
                color: shown ? (right ? _good : _bad) : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(20),
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  t.text,
                  key: const Key('ld-word'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.w800, color: shown ? Colors.white : scheme.onSurface),
                ),
              ),
            ),
            if (showLang) LanguageBadge(label: _names.label(t.lang), switched: switched, accent: _accent),
            // «По норме?»: после ответа — как по норме и почему (правило пары).
            if (shown && t.ns != null) ...[
              const SizedBox(height: 12),
              Text(
                t.isWord
                    ? L.t('ldNormIsStandard').replaceAll('{form}', t.ns!.form)
                    : L.t('ldNormShouldBe').replaceAll('{norm}', t.ns!.norm),
                key: const Key('ld-norm-why'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(ldNsRuleKey(t.ns!.rule) == null ? '' : L.t(ldNsRuleKey(t.ns!.rule)!),
                  key: const Key('ld-norm-rule'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
            ],
            const SizedBox(height: 16),
            Text(_normPlay ? L.t('ldNormHint') : L.t('ldHint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
      ),
    );
  }

  Widget _result(BuildContext context, double h) {
    final mean = _rtCount > 0 ? (_rtSum / _rtCount).round() : null;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            _passed ? L.t('levelDone').replaceAll('{n}', '$_levelPlayed') : L.t('sameLevelRetry'),
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text('${L.t('hud_correct')}: $_correct / ${_trials.length} · ${L.t('hud_errors')}: $_errors',
              key: const Key('ld-score')),
          Text(mean == null ? '${L.t('meanReaction')}: —' : '${L.t('meanReaction')}: $mean ${L.t('msShort')}'),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('ld-again'),
            onPressed: _start,
            child: Text(_passed ? L.t('nextNow') : L.t('retry')),
          ),
          TextButton(
            key: const Key('ld-stop'),
            onPressed: () => setState(() => _phase = LdPhase.config),
            child: Text(L.t('skip')),
          ),
        ]),
      ),
    );
  }

  Widget _buttons() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(children: [
          Expanded(
              child: _big(const Key('ld-yes'), Icons.check, _normPlay ? L.t('ldNormBtn') : L.t('ldWordBtn'), _good, () => _answer(true))),
          const SizedBox(width: 10),
          Expanded(
              child: _big(
                  const Key('ld-no'), Icons.close, _normPlay ? L.t('ldNotNormBtn') : L.t('ldNonwordBtn'), _bad, () => _answer(false))),
        ]),
      );

  Widget _big(Key key, IconData icon, String label, Color color, VoidCallback onTap) => SizedBox(
        height: 76,
        child: FilledButton(
          key: key,
          style: FilledButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
          // Не выключается на подсветке: выключенная кнопка мигала бы серым между
          // пробами. Второе нажатие отсекает сам `_answer`.
          onPressed: onTap,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 28),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
      );
}
