import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/audio_host.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/noise.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import '../languages/json_asset.dart';
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import '../lexical_decision/model.dart';
import 'model.dart';

/// «Эхо: псевдослова» — экран раздела «Языки» на Flutter. Правила и сверка с живым
/// TS — в `model.dart` и `test/pseudoword_echo_test.dart`.
///
/// Псевдослово ЗВУЧИТ, на экране — четыре написания; выбрать услышанное. Первый
/// перенесённый экран, который говорит: голос — `AudioHost.voice` (записи →
/// системный голос → честный отказ), шум под словом — `AudioHost.noise`.
enum EchoPhase { config, playing, result }

const Color _accent = Color(0xFF8E2DE2);
const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFF43F5E);

class PseudowordEchoScreen extends StatefulWidget {
  const PseudowordEchoScreen({
    super.key,
    required this.state,
    this.clock,
    this.random,
    this.vocabOverride,
    this.voice,
    this.noise,
  });
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final List<Map<String, String>>? vocabOverride;

  /// Голос и шум подставляются пробой; в приложении — из [AudioHost].
  final VoiceLayer? voice;
  final NoiseLayer? noise;

  @override
  State<PseudowordEchoScreen> createState() => _PseudowordEchoScreenState();
}

class _PseudowordEchoScreenState extends State<PseudowordEchoScreen> {
  late LevelLadder _ladder;
  List<Map<String, String>>? _vocab;
  LdLetters _letters = LdLetters.empty;
  LangNames _names = LangNames.empty;
  VoiceLayer? _voice;
  NoiseLayer? _noise;
  VoiceBlock? _block;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  EchoPhase _phase = EchoPhase.config;
  String _targetLang = 'en';
  List<EchoRound> _rounds = const [];
  int _idx = 0;
  String? _answered;
  int _hits = 0;
  int _errors = 0;
  int _levelPlayed = 1;
  EchoLevelParams _params = echoLevelParams(1);
  int _startMs = 0;
  bool _passed = false;
  Timer? _advance;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _base => widget.state.language;

  /// Свой язык целью не бывает: выбран он — берётся запасной, как `tgt` веба.
  String get _target => _targetLang == _base ? (_base == 'en' ? 'es' : 'en') : _targetLang;

  /// Выбор языка — тот же ключ, что у веба (`psygames_pseudoword_echo_targetlang`).
  static const String _langKey = 'psygames_pseudoword_echo_targetlang';

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'pseudoword_echo', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _advance?.cancel();
    _voice?.cancel();
    _noise?.stop(); // помеха не переживает выход с экрана
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final vocab = widget.vocabOverride ??
        [
          for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List<dynamic>)
            (e as Map).map((k, v) => MapEntry('$k', '$v')),
        ];
    final letters = LdLetters.fromJson(await loadJsonAsset('assets/vocab/pseudoword-letters.json') as Map);
    final names = await LangNames.load();
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final noise = widget.noise ?? AudioHost.noise(widget.state);
    var lang = GamePreset.str('targetLang', _base == 'en' ? 'es' : 'en');
    if (!GamePreset.isPreset) {
      final saved = widget.state.get(_langKey);
      if (saved != null && echoLangs.contains(saved)) lang = saved;
    }
    if (!mounted) return;
    setState(() {
      _vocab = vocab;
      _letters = letters;
      _names = names;
      _voice = voice;
      _noise = noise;
      _targetLang = lang;
    });
    await _checkVoice();
    if (mounted && GamePreset.autostart) _start();
  }

  Future<void> _checkVoice() async {
    final b = await _voice?.blockedReason(_target);
    if (mounted) setState(() => _block = b);
  }

  Future<void> _pickLang(String code) async {
    setState(() => _targetLang = code);
    await widget.state.set(_langKey, code);
    await _checkVoice();
  }

  void _start() {
    _advance?.cancel();
    final p = echoLevelParams(_ladder.level);
    final rounds = buildEchoRounds(
      vocab: _vocab ?? const [],
      letters: _letters,
      lang: _target,
      count: p.trials,
      lenMin: p.lenMin,
      lenMax: p.lenMax,
      hardShare: p.hardShare,
      rng: _rng,
    );
    if (rounds.isEmpty) return;
    setState(() {
      _params = p;
      _rounds = rounds;
      _idx = 0;
      _answered = null;
      _hits = 0;
      _errors = 0;
      _levelPlayed = _ladder.level;
      _startMs = _now;
      _phase = EchoPhase.playing;
    });
    _say();
  }

  /// Сказать слово раунда — с шумом уровня, который гаснет, когда слово прозвучало.
  /// Повтор не штрафуется: это подача задания, а не подсказка.
  Future<void> _say() async {
    if (_phase != EchoPhase.playing) return;
    final word = _rounds[_idx].word;
    await _noise?.start(_params.snrDb);
    await _voice?.speak(word, _target, rate: _params.rate);
    await _noise?.stop();
  }

  void _pick(String option) {
    if (_answered != null || _phase != EchoPhase.playing) return;
    final ok = option == _rounds[_idx].word;
    setState(() {
      _answered = option;
      if (ok) {
        _hits += 1;
      } else {
        _errors += 1;
      }
    });
    _advance = Timer(Duration(milliseconds: ok ? 600 : 1300), () {
      if (!mounted) return;
      final next = _idx + 1;
      if (next >= _rounds.length) {
        _finish();
        return;
      }
      setState(() {
        _answered = null;
        _idx = next;
      });
      _say();
    });
  }

  Future<void> _finish() async {
    await _voice?.cancel();
    final passed = echoPassed(_errors);
    final details = <String, Object?>{
      'level': _levelPlayed,
      'hits': _hits,
      'errors': _errors,
      'trials': _rounds.length,
      'target_lang': _target,
      'word_len': '${_params.lenMin}-${_params.lenMax}',
    };
    final secs = ((_now - _startMs) / 1000).round();
    // Шаг зарядки уровень не трогает: лестница сама не двигается на пресете.
    if (passed) {
      await _ladder.win(
          score: echoScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: _target,
          difficulty: '$_target · L$_levelPlayed', details: details);
    } else {
      await _ladder.fail(
          score: echoScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: _target,
          difficulty: '$_target · L$_levelPlayed', details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = EchoPhase.result;
      });
    }
  }

  /// Правило уровня — объявляется до партии, как у соседних перенесённых экранов.
  /// Ключи целиком: `embed-l10n` вырезает из словаря только те, что видит в исходнике.
  (String, String)? _rule(int level) => level >= 9
      ? (L.t('lr_pseudoword_echo_longer8_title'), L.t('lr_pseudoword_echo_longer8_rule'))
      : level >= 5
          ? (L.t('lr_pseudoword_echo_longer6_title'), L.t('lr_pseudoword_echo_longer6_rule'))
          : null;

  List<DemoTrial> _demoTrials() {
    final p = echoLevelParams(1);
    final r = buildEchoRounds(
      vocab: _vocab ?? const [],
      letters: _letters,
      lang: _target,
      count: 1,
      lenMin: p.lenMin,
      lenMax: p.lenMax,
      rng: Random(3).nextDouble,
    );
    if (r.isEmpty) return [DemoTrial(text: '', rule: L.t('pseudowordEchoIntroDesc'))];
    return [
      DemoTrial(
        text: r.first.options.join('  ·  '),
        // ⚠️ Четыре написания — виджетом `art`: строкой стимула они шли шрифтом
        // до 44 и вылезали из карточки (замер пробой: на 220 px).
        art: SizedBox(
          width: 260,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final o in r.first.options)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(o, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
              ),
          ]),
        ),
        sub: L.t('pwEchoPickSpelling'),
        answer: r.first.word,
        rule: L.t('pseudowordEchoIntroDesc'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_vocab == null) {
      return GameShell(title: L.t('pseudowordEcho'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final r = _phase == EchoPhase.playing ? _rounds[_idx] : null;
    return GameShell(
      title: L.t('pseudowordEcho'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('pseudowordEcho'), trials: _demoTrials()),
      hud: r == null
          ? const []
          : [
              HudItem(label: L.t('round'), value: '${_idx + 1}/${_rounds.length}', icon: Icons.numbers),
              HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check),
              HudItem(label: L.t('label_level_short'), value: '$_levelPlayed', icon: Icons.flag),
            ],
      field: (context, h) => switch (_phase) {
        EchoPhase.config => _config(context, h),
        EchoPhase.playing => _playing(context, h),
        EchoPhase.result => _result(context, h),
      },
      toolbar: r == null ? null : _options(context, r),
    );
  }

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    final rule = _rule(_ladder.level);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('pseudowordEcho'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('pwEchoConfigDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('langToTrain'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('echo-lang'),
            keyPrefix: 'echo-lang',
            langs: [for (final l in echoLangs) if (l != _base) l],
            value: _target,
            label: _names.name,
            onChanged: _pickLang,
          ),
          const SizedBox(height: 4),
          Text(L.t('pwEchoUnsupportedNote'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('pwEchoLvlAuto').replaceAll('{n}', '${_ladder.level}'), style: theme.textTheme.titleSmall),
          if (rule != null) ...[
            const SizedBox(height: 8),
            Text(rule.$1, key: const Key('echo-rule'), style: theme.textTheme.titleSmall),
            Text(rule.$2, style: theme.textTheme.bodySmall),
          ],
          if (_block != null) ...[
            const SizedBox(height: 12),
            Row(key: const Key('echo-voice-warning'), children: [
              const Icon(Icons.warning_amber, color: Color(0xFFF59E0B)),
              const SizedBox(width: 8),
              Expanded(child: Text(_block == VoiceBlock.soundOff ? L.t('voiceSoundOff') : L.t('voiceMissing'))),
            ]),
          ],
          const SizedBox(height: 16),
          FilledButton(key: const Key('echo-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _playing(BuildContext context, double h) => SizedBox(
        height: h,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            InkWell(
              key: const Key('echo-replay'),
              borderRadius: BorderRadius.circular(64),
              onTap: _say,
              child: Container(
                width: 128,
                height: 128,
                decoration: BoxDecoration(shape: BoxShape.circle, color: _accent.withValues(alpha: 0.12)),
                child: const Icon(Icons.volume_up, size: 64, color: _accent),
              ),
            ),
            const SizedBox(height: 8),
            Text(L.t('replaySound'), style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            Text(L.t('pwEchoPickSpelling'), textAlign: TextAlign.center),
          ]),
        ),
      );

  Widget _result(BuildContext context, double h) => SizedBox(
        height: h,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              _passed ? L.t('levelDone').replaceAll('{n}', '$_levelPlayed') : L.t('sameLevelRetry'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: $_hits / ${_rounds.length} · ${L.t('hud_errors')}: $_errors',
                key: const Key('echo-score')),
            const SizedBox(height: 20),
            FilledButton(key: const Key('echo-again'), onPressed: _start, child: Text(_passed ? L.t('nextNow') : L.t('retry'))),
            TextButton(onPressed: () => setState(() => _phase = EchoPhase.config), child: Text(L.t('skip'))),
          ]),
        ),
      );

  Widget _options(BuildContext context, EchoRound r) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: LayoutBuilder(
        builder: (context, c) => Wrap(spacing: 8, runSpacing: 8, children: [
          for (final o in r.options)
            SizedBox(
              width: (c.maxWidth - 8) / 2,
              height: 56,
              child: FilledButton(
                key: Key('echo-option-$o'),
                onPressed: _answered == null ? () => _pick(o) : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _answered == null
                      ? scheme.surfaceContainerHighest
                      : o == r.word
                          ? _good
                          : o == _answered
                              ? _bad
                              : scheme.surfaceContainerHighest,
                  foregroundColor: _answered != null && (o == r.word || o == _answered) ? Colors.white : scheme.onSurface,
                  disabledBackgroundColor: o == r.word ? _good : (o == _answered ? _bad : null),
                  disabledForegroundColor: o == r.word || o == _answered ? Colors.white : null,
                ),
                child: FittedBox(fit: BoxFit.scaleDown, child: Text(o, style: const TextStyle(fontSize: 18))),
              ),
            ),
        ]),
      ),
    );
  }
}
