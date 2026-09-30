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
import '../languages/fresh_pool.dart';
import '../languages/json_asset.dart';
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import 'model.dart';

/// «Cloze: фразы» — экран раздела «Языки» на Flutter. Правила и сверка с живым
/// TS — в `model.dart` и `test/cloze_test.dart`.
enum ClozePhase { config, playing, result }

/// Время вышло: сентинел, не совпадающий ни с одним вариантом — подсвечивается
/// только верный ответ, как в вебе.
const String clozeTimeoutPick = '⏰';

class ClozeScreen extends StatefulWidget {
  const ClozeScreen({super.key, required this.state, this.clock, this.random, this.vocabOverride, this.phrasesOverride});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final List<Map<String, String>>? vocabOverride;
  final Map<String, List<ClozePhrase>>? phrasesOverride;

  @override
  State<ClozeScreen> createState() => _ClozeScreenState();
}

class _ClozeScreenState extends State<ClozeScreen> {
  late LevelLadder _ladder;
  List<Map<String, String>>? _vocab;
  Map<String, List<ClozePhrase>> _phrases = const {};
  LangNames _names = LangNames.empty;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  ClozePhase _phase = ClozePhase.config;
  String _targetLang = 'en';
  bool _bilingual = false;
  String _wantedSecond = 'es';

  List<ClozeRound> _rounds = const [];
  int _idx = 0;
  String? _picked;
  int _correct = 0;
  int _errors = 0;
  int _rtSum = 0;
  int _shownAtMs = 0;
  int _startMs = 0;
  int _timeLimitMs = 0;
  int _levelPlayed = 1;
  int _secondsLeft = 0;
  bool _passed = false;
  Timer? _deadline;
  Timer? _tick;
  Timer? _advance;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _baseLang => widget.state.language;
  String get _second => secondNotFirst(_baseLang, _targetLang, _wantedSecond);

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'cloze', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _clearTimers();
    super.dispose();
  }

  void _clearTimers() {
    _deadline?.cancel();
    _tick?.cancel();
    _advance?.cancel();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final vocab = widget.vocabOverride ??
        [
          for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List<dynamic>)
            (e as Map).map((k, v) => MapEntry('$k', '$v')),
        ];
    final phrases = widget.phrasesOverride ??
        <String, List<ClozePhrase>>{
          for (final e in (await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map).entries)
            '${e.key}': [for (final f in (e.value as List)) ClozePhrase('${(f as Map)['text']}', '${f['answerEn']}')],
        };
    final names = await LangNames.load();
    if (!mounted) return;
    setState(() {
      _vocab = vocab;
      _phrases = phrases;
      _names = names;
      _targetLang = GamePreset.str('targetLang', _baseLang == 'en' ? 'es' : 'en');
      _bilingual = GamePreset.str(bilingualKey) == '1';
      _wantedSecond = GamePreset.str('lang2', pairFor(_baseLang)[1]);
    });
    if (mounted && GamePreset.autostart) await _start();
  }

  /// Языки, на которых у cloze вообще есть фразы (корпус есть не у всех двенадцати).
  List<String> get _langs => [for (final l in _phrases.keys) if (l != _baseLang) l];

  Future<void> _start() async {
    final p = clozeLevelParams(_ladder.level);
    // Шаг зарядки играет своим числом раундов и БЕЗ лимита времени — как веб.
    final rounds = GamePreset.isPreset ? GamePreset.num('rounds', 10) : p.rounds;
    final pair = [_targetLang, _second];
    final byLang = <String, List<ClozePhrase>>{};
    for (final l in _bilingual ? pair : [_targetLang]) {
      final seen = readSeen(widget.state, clozeSeenPool(l));
      final order = clozeOrderPhrases(_phrases[l] ?? const [], seen, rounds, _rng);
      await writeSeen(widget.state, clozeSeenPool(l), order.seen);
      byLang[l] = order.ordered;
    }
    final built = buildClozeRounds(
      byLang: byLang,
      rounds: rounds,
      bilingual: _bilingual,
      pair: pair,
      vocab: _vocab ?? const [],
      rng: _rng,
    );
    if (!mounted || built.isEmpty) return;
    setState(() {
      _rounds = built;
      _idx = 0;
      _picked = null;
      _correct = 0;
      _errors = 0;
      _rtSum = 0;
      _levelPlayed = _ladder.level;
      _timeLimitMs = GamePreset.isPreset ? 0 : p.timeLimitMs;
      _startMs = _now;
      _phase = ClozePhase.playing;
    });
    _arm();
  }

  /// Взвести лимит на фразу. 0 — без лимита (шаг зарядки).
  void _arm() {
    _clearTimers();
    _shownAtMs = _now;
    if (_timeLimitMs <= 0) return;
    setState(() => _secondsLeft = (_timeLimitMs / 1000).ceil());
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) return;
      final left = ((_shownAtMs + _timeLimitMs - _now) / 1000).ceil();
      setState(() => _secondsLeft = max(0, left));
    });
    _deadline = Timer(Duration(milliseconds: _timeLimitMs), _onTimeout);
  }

  /// Не успел в лимит: ошибка и показ верного ответа, дальше само.
  void _onTimeout() {
    if (!mounted || _picked != null) return;
    _tick?.cancel();
    _rtSum += _timeLimitMs;
    setState(() {
      _errors += 1;
      _picked = clozeTimeoutPick;
    });
    _advance = Timer(const Duration(milliseconds: 1200), _next);
  }

  void _pick(String option) {
    if (_picked != null || _phase != ClozePhase.playing) return;
    _deadline?.cancel();
    _tick?.cancel();
    _rtSum += _now - _shownAtMs;
    final ok = option == _rounds[_idx].answer;
    setState(() {
      _picked = option;
      if (ok) {
        _correct += 1;
      } else {
        _errors += 1;
      }
    });
    _advance = Timer(Duration(milliseconds: ok ? 400 : 1200), _next);
  }

  void _next() {
    if (!mounted) return;
    final next = _idx + 1;
    if (next >= _rounds.length) {
      _finish();
      return;
    }
    setState(() {
      _idx = next;
      _picked = null;
    });
    _arm();
  }

  Future<void> _finish() async {
    _clearTimers();
    final total = _rounds.length;
    final accuracy = total > 0 ? _correct / total : 0.0;
    final passed = total > 0 && accuracy >= clozePassAccuracy;
    final details = <String, Object?>{
      'level': _levelPlayed,
      'target_lang': _bilingual ? '$_targetLang+$_second' : _targetLang,
      'rounds': total,
      'accuracy': accuracy,
      'mean_rt_ms': total > 0 ? (_rtSum / total).round() : 0,
      'time_limit_ms': _timeLimitMs,
    };
    final score = _correct, errors = _errors;
    final secs = ((_now - _startMs) / 1000).round();
    final mode = GamePreset.isPreset ? 'preset' : 'lvl$_levelPlayed';
    final diff = '$_targetLang · $total';
    if (passed) {
      await _ladder.win(score: score, timeSeconds: secs, errors: errors, mode: mode, difficulty: diff, details: details);
    } else {
      await _ladder.fail(score: score, timeSeconds: secs, errors: errors, mode: mode, difficulty: diff, details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = ClozePhase.result;
      });
    }
  }

  /// Разбор до партии: первая фраза корпуса этого языка и её ответ из словаря.
  List<DemoTrial> _demoTrials() {
    final ph = (_phrases[_targetLang] ?? const <ClozePhrase>[]);
    for (final f in ph) {
      for (final w in _vocab ?? const <Map<String, String>>[]) {
        if (w['en'] == f.answerEn && (w[_targetLang] ?? '').isNotEmpty) {
          // ⚠️ Стимул — ЦЕЛАЯ ФРАЗА, а не слово: текстом карточки она шла бы
          // шрифтом до 44 и вылезала снизу (замер пробой: на 121 px). Виджетом
          // `art` карточка ужимает её целиком, сохраняя перенос строк.
          return [
            DemoTrial(
              text: f.text,
              art: SizedBox(
                width: 300,
                child: Text(f.text, textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              ),
              sub: L.t('clozeHint'),
              answer: w[_targetLang],
              rule: L.t('clozeIntroDesc'),
            ),
          ];
        }
      }
    }
    return [DemoTrial(text: '', rule: L.t('clozeIntroDesc'))];
  }

  @override
  Widget build(BuildContext context) {
    if (_vocab == null) {
      return GameShell(title: L.t('cloze'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final r = _phase == ClozePhase.playing ? _rounds[_idx] : null;
    return GameShell(
      title: L.t('cloze'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('cloze'), trials: _demoTrials()),
      hud: r == null
          ? const []
          : [
              if (_bilingual)
                HudItem(label: L.t('bilingualMode'), value: pairPill(r.lang, [_targetLang, _second]), icon: Icons.translate),
              HudItem(label: L.t('round'), value: '${_idx + 1}/${_rounds.length}', icon: Icons.numbers),
              HudItem(label: L.t('hud_correct'), value: '$_correct', icon: Icons.check),
              HudItem(label: L.t('hud_errors'), value: '$_errors', icon: Icons.close),
              if (_timeLimitMs > 0)
                HudItem(label: L.t('timeLeftLabel'), value: '$_secondsLeft ${L.t('secShort')}', icon: Icons.timer_outlined),
            ],
      field: (context, h) => switch (_phase) {
        ClozePhase.config => _config(context, h),
        ClozePhase.playing => _phrase(context, h, r!),
        ClozePhase.result => _result(context, h),
      },
      toolbar: r == null ? null : _options(context, r),
    );
  }

  Widget _config(BuildContext context, double h) {
    final p = clozeLevelParams(_ladder.level);
    final langs = _langs;
    final seconds = [for (final l in langs) if (l != _targetLang) l];
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('cloze'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('clozeDesc'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Text('${L.t('level')} ${_ladder.level}', style: Theme.of(context).textTheme.titleMedium),
          Text(
            L.t('clozeLvlParams').replaceAll('{n}', '${p.rounds}').replaceAll('{w}', (p.timeLimitMs / 1000).toStringAsFixed(p.timeLimitMs % 1000 == 0 ? 0 : 1)),
            key: const Key('cloze-level-params'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Text(L.t('language')),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('cloze-lang'),
            keyPrefix: 'cloze-lang',
            langs: langs,
            value: _targetLang,
            label: _names.name,
            onChanged: (v) => setState(() => _targetLang = v),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('cloze-bilingual'),
            contentPadding: EdgeInsets.zero,
            title: Text(L.t('bilingualMode')),
            subtitle: Text(_names.bilingualDesc(_targetLang, _second), style: Theme.of(context).textTheme.bodySmall),
            value: _bilingual,
            onChanged: (v) => setState(() => _bilingual = v),
          ),
          if (_bilingual)
            LangDropdown(
              key: const Key('cloze-lang2'),
              keyPrefix: 'cloze-lang2',
              langs: seconds,
              value: _second,
              label: _names.name,
              onChanged: (v) => setState(() => _wantedSecond = v),
            ),
          const SizedBox(height: 24),
          FilledButton(key: const Key('cloze-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _phrase(BuildContext context, double h, ClozeRound r) => SizedBox(
        height: h,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(r.text, key: const Key('cloze-text'), textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Text(L.t('clozeHint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
        ),
      );

  Widget _result(BuildContext context, double h) => SizedBox(
        height: h,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(_passed ? L.t('clozePass') : L.t('resultsTitle'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: $_correct / ${_rounds.length} · ${L.t('hud_errors')}: $_errors',
                key: const Key('cloze-score')),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('cloze-again'),
              onPressed: () => setState(() => _phase = ClozePhase.config),
              child: Text(_passed ? L.t('nextLabel') : L.t('retry')),
            ),
          ]),
        ),
      );

  Widget _options(BuildContext context, ClozeRound r) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: LayoutBuilder(
        builder: (context, c) => Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in r.options)
              SizedBox(
                width: (c.maxWidth - 8) / 2,
                height: 56,
                child: FilledButton(
                  key: Key('cloze-option-$o'),
                  onPressed: _picked == null ? () => _pick(o) : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    backgroundColor: _picked == null
                        ? null
                        : o == r.answer
                            ? const Color(0xFF22C55E)
                            : o == _picked
                                ? const Color(0xFFEF4444)
                                : scheme.surfaceContainerHighest,
                  ),
                  child: FittedBox(fit: BoxFit.scaleDown, child: Text(o, maxLines: 2)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
