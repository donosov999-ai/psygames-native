import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/audio_host.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/noise.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import '../languages/json_asset.dart';
import '../languages/lang_names.dart';
import '../hearing_common/lesson_cue.dart';
import 'lesson.dart';
import '../languages/lang_picker.dart';
import 'model.dart';

/// «Фонемы: минимальные пары» — экран раздела «Языки» на Flutter. Правила и сверка
/// с живым TS — в `model.dart` и `test/phoneme_pairs_test.dart`.
///
/// Звучит ОДНО слово пары (ship/sheep) — выбрать услышанное из двух написаний.
/// Повтор не штрафуется, только считается.
enum PhPhase { config, playing, result }

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFF43F5E);
const Color _accent = Color(0xFFF7971E);

class PhonemePairsScreen extends StatefulWidget {
  const PhonemePairsScreen({super.key, required this.state, this.clock, this.random, this.voice, this.noise});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final VoiceLayer? voice;
  final NoiseLayer? noise;

  @override
  State<PhonemePairsScreen> createState() => _PhonemePairsScreenState();
}

class _PhonemePairsScreenState extends State<PhonemePairsScreen> {
  late LevelLadder _ladder;
  PhData? _data;
  LangNames _names = LangNames.empty;
  VoiceLayer? _voice;
  NoiseLayer? _noise;
  VoiceBlock? _block;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  PhPhase _phase = PhPhase.config;
  String _targetLang = 'en';
  List<PhTrial> _trials = const [];
  PhLevelParams _params = phLevelParams(1);
  int _idx = 0;
  int? _answered;
  int _hits = 0, _errors = 0, _replays = 0;
  int _levelPlayed = 1;
  int _startMs = 0;
  bool _passed = false;
  Timer? _advance;
  Timer? _sayLater;

  static const String _langKey = 'psygames_phoneme_pairs_targetlang';

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _base => widget.state.language;
  String get _target => _targetLang == _base ? (_base == 'en' ? 'es' : 'en') : _targetLang;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'phoneme_pairs', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _advance?.cancel();
    _sayLater?.cancel();
    _voice?.cancel();
    _noise?.stop();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final data = PhData.fromJson(await loadJsonAsset('assets/vocab/phoneme-pairs.json') as Map);
    final names = await LangNames.load();
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final noise = widget.noise ?? AudioHost.noise(widget.state);
    final fromStep = GamePreset.str('targetLang', '');
    var lang = data.pairs.containsKey(fromStep) ? fromStep : (_base == 'en' ? 'es' : 'en');
    if (!GamePreset.isPreset) {
      final saved = widget.state.get(_langKey);
      if (saved != null && data.pairs.containsKey(saved)) lang = saved;
    }
    if (!mounted) return;
    setState(() {
      _data = data;
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
    _sayLater?.cancel();
    final data = _data!;
    final p = phLevelParams(_ladder.level);
    final all = data.pairs[_target] ?? data.pairs['en']!;
    setState(() {
      _params = p;
      _trials = buildPhTrials(phPool(all, p.easyOnly), p.trials, _rng);
      _idx = 0;
      _answered = null;
      _hits = _errors = _replays = 0;
      _levelPlayed = _ladder.level;
      _startMs = _now;
      _phase = PhPhase.playing;
    });
    _sayRound();
  }

  /// Слово звучит через 400 мс после показа пробы — как в вебе.
  void _sayRound() {
    _sayLater?.cancel();
    _sayLater = Timer(const Duration(milliseconds: 400), _say);
  }

  Future<void> _say() async {
    if (_phase != PhPhase.playing) return;
    await _noise?.start(_params.snrDb);
    await _voice?.speak(_trials[_idx].spoken, _target, rate: _params.rate);
    await _noise?.stop();
  }

  void _replay() {
    if (_phase != PhPhase.playing || _answered != null) return;
    _replays += 1; // не штрафуется, только считается
    _say();
  }

  void _answer(int choice) {
    if (_phase != PhPhase.playing || _answered != null) return;
    final ok = choice == _trials[_idx].correctIdx;
    setState(() {
      _answered = choice;
      if (ok) {
        _hits += 1;
      } else {
        _errors += 1;
      }
    });
    final delay = _params.showWord ? 1100 : (_params.blind ? 450 : 700);
    _advance = Timer(Duration(milliseconds: delay), () {
      if (!mounted) return;
      if (_idx + 1 >= _trials.length) {
        _finish();
        return;
      }
      setState(() {
        _answered = null;
        _idx += 1;
      });
      _sayRound();
    });
  }

  Future<void> _finish() async {
    final passed = _errors <= _params.maxErrors;
    final details = <String, Object?>{
      'level': _levelPlayed,
      'hits': _hits,
      'errors': _errors,
      'trials': _params.trials,
      'target_lang': _target,
      'replays': _replays,
    };
    final secs = ((_now - _startMs) / 1000).round();
    if (passed) {
      await _ladder.win(score: phScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: _target,
          difficulty: 'L$_levelPlayed', details: details);
    } else {
      await _ladder.fail(score: phScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: _target,
          difficulty: 'L$_levelPlayed', details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = PhPhase.result;
      });
    }
  }

  /// Тексты разбора — из словаря, теми же ключами, что зовёт веб-учитель.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachPhIntro' => L.t('teachPhIntro'),
      'teachPhSpot' => L.t('teachPhSpot'),
      'teachPhVowel' => L.t('teachPhVowel'),
      'teachPhProbe' => L.t('teachPhProbe'),
      'teachPhAnswerSpot' => L.t('teachPhAnswerSpot'),
      'teachPhAnswerVowel' => L.t('teachPhAnswerVowel'),
      _ => L.t('teachPhDone'),
    };
    args.forEach((k, v) => out = out.replaceAll('{$k}', v));
    return out;
  }

  final Random _lessonRandom = Random();

  /// 🎓 Разбор по шагам (раздел «Память и слух», `lesson.dart`) вместо демо-карточки: две пары из пула
  /// уровня, не текущая; где пара расходится — и проба «слушайте только это место».
  /// Идёт партия — разбор делает её незачётной (LessonUsed).
  Future<void> _openLesson() async {
    final data = _data;
    if (data == null) return;
    final playing = _phase == PhPhase.playing && _idx < _trials.length;
    final all = data.pairs[_target] ?? data.pairs['en']!;
    final pool = phPool(all, playing ? _params.easyOnly : phLevelParams(_ladder.level).easyOnly);
    final r = phLessonCards(
      pool: pool,
      lang: _target,
      exclude: playing ? _trials[_idx].words : null,
      pinyin: data.pinyin,
      rnd: _lessonRandom.nextDouble,
    );
    if (playing) LessonUsed.mark();
    _sayLater?.cancel();
    await _voice?.cancel();
    await _noise?.stop();
    final steps = phLessonSteps(r.cards, _teach);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('phonemePairsShort'),
        steps: steps,
        board: (context, side, i) {
          final card = steps[i.clamp(0, steps.length - 1)].payload as PhCard;
          return KeyedSubtree(
            key: ValueKey('ph-lesson-$i'),
            child: _PhLessonBoard(card: card, lang: _target, pinyin: data.pinyin, voice: _voice, side: side),
          );
        },
      ),
    ));
    await _voice?.cancel();
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      return GameShell(title: L.t('phonemePairsShort'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final t = _phase == PhPhase.playing ? _trials[_idx] : null;
    return GameShell(
      title: L.t('phonemePairsShort'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: _openLesson,
      hud: t == null
          ? const []
          : [
              HudItem(
                label: L.t('round'),
                value: '${_idx + 1}/${_trials.length} · ${L.t('label_level_short')}$_levelPlayed',
                icon: Icons.numbers,
              ),
              HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check),
            ],
      field: (context, h) => switch (_phase) {
        PhPhase.config => _config(context, h),
        PhPhase.playing => _playing(context, h, t!),
        PhPhase.result => _result(context, h),
      },
      toolbar: t == null ? null : _pair(context, t),
    );
  }

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('phonemePairs'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('phPairsConfigDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('langToTrain'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('ph-lang'),
            keyPrefix: 'ph-lang',
            langs: [for (final l in _data!.langs) if (l != _base) l],
            value: _target,
            label: _names.name,
            onChanged: _pickLang,
          ),
          const SizedBox(height: 12),
          Text(L.t('level'), style: theme.textTheme.titleSmall),
          Text(L.t('phPairsLvlAuto').replaceAll('{n}', '${_ladder.level}'), style: theme.textTheme.bodySmall),
          if (_block != null) ...[
            const SizedBox(height: 12),
            Row(key: const Key('ph-voice-warning'), children: [
              const Icon(Icons.volume_off, color: _bad),
              const SizedBox(width: 8),
              Expanded(
                child: Text(_block == VoiceBlock.soundOff
                    ? L.t('voiceSoundOff')
                    : L.t('voiceMissingLang').replaceAll('{lang}', _names.name(_target))),
              ),
            ]),
          ],
          const SizedBox(height: 16),
          FilledButton(key: const Key('ph-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _playing(BuildContext context, double h, PhTrial t) {
    final right = _answered != null && _answered == t.correctIdx;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          IconButton.filledTonal(
            key: const Key('ph-replay'),
            iconSize: 40,
            tooltip: L.t('replaySound'),
            onPressed: _answered == null ? _replay : null,
            icon: const Icon(Icons.volume_up, color: _accent),
          ),
          Text(L.t('replaySound'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          Text(L.t('phPairsPickHint'), textAlign: TextAlign.center),
          if (_params.showWord && _answered != null) ...[
            const SizedBox(height: 12),
            Text(
              L.t('phPairsPlayed').replaceAll('{w}', t.spoken),
              key: const Key('ph-played'),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: right ? _good : _bad),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _result(BuildContext context, double h) => SizedBox(
        height: h,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(_passed ? L.t('levelDone').replaceAll('{n}', '$_levelPlayed') : L.t('sameLevelRetry'),
                style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: $_hits / ${_trials.length} · ${L.t('hud_errors')}: $_errors',
                key: const Key('ph-score')),
            const SizedBox(height: 20),
            FilledButton(key: const Key('ph-again'), onPressed: _start, child: Text(_passed ? L.t('nextNow') : L.t('retry'))),
            TextButton(onPressed: () => setState(() => _phase = PhPhase.config), child: Text(L.t('skip'))),
          ]),
        ),
      );

  Widget _pair(BuildContext context, PhTrial t) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < 2; i += 1) ...[
          if (i > 0) const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 64,
            child: FilledButton(
              key: Key('ph-word-$i'),
              onPressed: _answered == null ? () => _answer(i) : null,
              style: FilledButton.styleFrom(
                backgroundColor: scheme.surfaceContainerHighest,
                foregroundColor: scheme.onSurface,
                // Слепой режим — ни цвета, ни подсветки: верность только звуком.
                disabledBackgroundColor: !_params.blind && _answered != null
                    ? (i == t.correctIdx ? _good : (i == _answered ? _bad : null))
                    : null,
                disabledForegroundColor: !_params.blind && _answered != null && (i == t.correctIdx || i == _answered)
                    ? Colors.white
                    : null,
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(t.wordAt(i), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                if ((_data!.pinyin[t.wordAt(i)] ?? '').isNotEmpty)
                  Text(_data!.pinyin[t.wordAt(i)]!, style: const TextStyle(fontSize: 13)),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

/// Поле разбора: оба слова пары, место расхождения подчёркнуто (у китайского — в пиньине), на пробе —
/// значок звука, в ответе прозвучавшее обведено. Карточка со словами звучит сама: разбор про слух.
class _PhLessonBoard extends StatefulWidget {
  const _PhLessonBoard({
    required this.card,
    required this.lang,
    required this.pinyin,
    required this.voice,
    required this.side,
  });

  final PhCard card;
  final String lang;
  final Map<String, String> pinyin;
  final VoiceLayer? voice;
  final double side;

  @override
  State<_PhLessonBoard> createState() => _PhLessonBoardState();
}

class _PhLessonBoardState extends State<_PhLessonBoard> with SingleTickerProviderStateMixin {
  late final LessonCue _cue = LessonCue(this);

  @override
  void initState() {
    super.initState();
    // Как в вебе: через 350 мс слова по очереди, между ними 450 мс, темп 0,9.
    final words = widget.card.speak;
    _cue.run(words.length, (i) => widget.voice?.speak(words[i], widget.lang, rate: 0.9), gap: const Duration(milliseconds: 450));
  }

  @override
  void dispose() {
    _cue.dispose();
    super.dispose();
  }

  TextSpan _marked(String text, PhSpan? s, TextStyle base, Color accent) {
    if (s == null) return TextSpan(text: text, style: base);
    final r = text.runes.toList();
    String part(int from, int to) => String.fromCharCodes(r.sublist(min(from, r.length), min(to, r.length)));
    return TextSpan(style: base, children: [
      TextSpan(text: part(0, s.$1)),
      TextSpan(
        text: part(s.$1, s.$2),
        style: TextStyle(color: accent, decoration: TextDecoration.underline, decorationColor: accent),
      ),
      TextSpan(text: part(s.$2, r.length)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = widget.card;
    final pair = c.pair;
    if (pair == null) return Icon(Icons.hearing, size: (widget.side * 0.3).roundToDouble(), color: _accent);
    final zh = widget.lang == 'zh';
    final words = [pair.$1, pair.$2];
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: SizedBox(
        width: widget.side,
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (c.kind == 'probe') ...[
            Icon(Icons.volume_up, key: const ValueKey('ph-lesson-probe'), size: 30, color: scheme.onSurfaceVariant),
            const SizedBox(width: 8),
          ],
          for (var i = 0; i < 2; i += 1) ...[
            if (i > 0) const SizedBox(width: 10),
            Flexible(
              child: Container(
                key: ValueKey('ph-lesson-word-$i'),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: c.kind == 'answer' && c.sounding == i
                      ? Border.all(color: _good, width: 3)
                      : Border.all(color: scheme.outlineVariant),
                ),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text.rich(
                    zh
                        ? TextSpan(text: words[i], style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: scheme.onSurface))
                        : _marked(words[i], i == 0 ? c.diff?.a : c.diff?.b,
                            TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: scheme.onSurface), _accent),
                    key: ValueKey('ph-lesson-text-$i'),
                  ),
                  if (zh)
                    Text.rich(
                      _marked(widget.pinyin[words[i]] ?? '', i == 0 ? c.diff?.a : c.diff?.b,
                          TextStyle(fontSize: 15, color: scheme.onSurfaceVariant), _accent),
                      key: ValueKey('ph-lesson-pinyin-$i'),
                    ),
                ]),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}
