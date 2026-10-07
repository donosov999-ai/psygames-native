import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
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
import '../cloze/model.dart';
import '../languages/json_asset.dart';
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import '../vocab_srs/typing.dart';
import 'lesson.dart';
import 'model.dart';

/// «Диктант» — экран раздела «Языки» на Flutter. Правила и сверка с живым TS — в
/// `model.dart` и `test/dictation_test.dart`.
///
/// Звучит фраза целиком; на экране она НЕ написана — ненабранные знаки стоят
/// точками. Печатать по памяти на слух; опечатка держит курсор на месте. Три
/// ошибки подряд на одном знаке открывают его слог.
///
/// ⚠️ ТОЛЬКО С НАСТОЯЩЕЙ КЛАВИАТУРОЙ: на экранной нет ни слепого набора, ни темпа.
/// Веб решает это указателем (`pointer: fine`), здесь — платформой: настольные да,
/// телефоны нет. Без клавиатуры экран говорит об этом, а не делает вид.
enum DictationPhase { config, playing, result }

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFF43F5E);

bool _desktop() => const {TargetPlatform.macOS, TargetPlatform.windows, TargetPlatform.linux}
    .contains(defaultTargetPlatform);

class DictationScreen extends StatefulWidget {
  const DictationScreen({
    super.key,
    required this.state,
    this.clock,
    this.random,
    this.voice,
    this.noise,
    this.keyboard,
  });
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final VoiceLayer? voice;
  final NoiseLayer? noise;

  /// Есть ли настоящая клавиатура. Пусто — по платформе.
  final bool? keyboard;

  @override
  State<DictationScreen> createState() => _DictationScreenState();
}

class _DictationScreenState extends State<DictationScreen> {
  late LevelLadder _ladder;
  Map<String, List<ClozePhrase>>? _cloze;
  List<Map<String, String>> _vocab = const [];
  Set<String> _vowels = const {};
  LangNames _names = LangNames.empty;
  VoiceLayer? _voice;
  NoiseLayer? _noise;
  VoiceBlock? _block;
  late final double Function() _rng = widget.random ?? Random().nextDouble;
  late final bool _keyboard = widget.keyboard ?? _desktop();

  DictationPhase _phase = DictationPhase.config;
  String _targetLang = 'en';
  List<DictationPhrase> _phrases = const [];
  DictationLevelParams _params = dictationLevelParams(1);
  int _idx = 0;
  int _done = 0;
  int _chars = 0;
  int _typos = 0;
  int _replays = 0;
  int _levelPlayed = 1;
  int _startMs = 0;
  bool _passed = false;
  bool _inputOpen = true;
  TypingState? _typing;
  int? _errorAt;
  int _streakPos = -1, _streak = 0, _revealTo = 0;
  Timer? _sayLater;
  Timer? _openLater;

  static const String _langKey = 'psygames_dictation_lang';

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();
  String get _base => widget.state.language;
  List<String> get _langs => [
        for (final l in dictationLangs(_cloze ?? const {}, _vocab)) if (l != _base) l,
      ];
  String get _target {
    final langs = _langs;
    return langs.contains(_targetLang) ? _targetLang : (langs.isEmpty ? 'en' : langs.first);
  }

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'dictation', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _sayLater?.cancel();
    _openLater?.cancel();
    _voice?.cancel();
    _noise?.stop();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final clozeRaw = await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map;
    final cloze = <String, List<ClozePhrase>>{
      for (final e in clozeRaw.entries)
        '${e.key}': [for (final f in (e.value as List)) ClozePhrase('${(f as Map)['text']}', '${f['answerEn']}')],
    };
    final vocab = [
      for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List<dynamic>)
        (e as Map).map((k, v) => MapEntry('$k', '$v')),
    ];
    final vowels = {for (final v in ((await loadJsonAsset('assets/vocab/dictation.json') as Map)['vowels'] as List)) '$v'};
    final names = await LangNames.load();
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final noise = widget.noise ?? AudioHost.noise(widget.state);
    if (!mounted) return;
    setState(() {
      _cloze = cloze;
      _vocab = vocab;
      _vowels = vowels;
      _names = names;
      _voice = voice;
      _noise = noise;
      final langs = dictationLangs(cloze, vocab);
      final fromStep = GamePreset.str('targetLang', '');
      _targetLang = langs.contains(fromStep) ? fromStep : (_base == 'en' ? 'es' : 'en');
      if (!GamePreset.isPreset) {
        final saved = widget.state.get(_langKey);
        if (saved != null && langs.contains(saved)) _targetLang = saved;
      }
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

  /// Партия: годные фразы уровня вперемешку, первые N.
  ///
  /// ⚠️ Веб перемешивает `sort(() => Math.random() - 0.5)`: порядок такой сортировки
  /// зависит от движка и шаг в шаг не переносится. Здесь — Фишер–Йетс: правило то же
  /// («случайные N из годных»), а перемешивание честно равномерное.
  void _start() {
    _sayLater?.cancel();
    _openLater?.cancel();
    final p = dictationLevelParams(_ladder.level);
    final fit = [...levelPhrases(buildDictationPhrases(_cloze!, _vocab, _target), _ladder.level)];
    for (var i = fit.length - 1; i > 0; i -= 1) {
      final j = (_rng() * (i + 1)).floor();
      final t = fit[i];
      fit[i] = fit[j];
      fit[j] = t;
    }
    setState(() {
      _params = p;
      _phrases = fit.take(p.count).toList();
      _idx = 0;
      _done = 0;
      _chars = 0;
      _typos = 0;
      _replays = 0;
      _levelPlayed = _ladder.level;
      _startMs = _now;
      _phase = DictationPhase.playing;
    });
    _present();
  }

  void _present() {
    final phrase = _phrases[_idx];
    setState(() {
      _typing = TypingState.create([phrase.text], lenient: true, nowMs: () => _now);
      _errorAt = null;
      _streakPos = -1;
      _streak = 0;
      _revealTo = 0;
      _inputOpen = _params.delayMs == 0;
    });
    _sayLater = Timer(const Duration(milliseconds: 450), () async {
      await _say();
      if (!mounted || _params.delayMs == 0) return;
      // Пауза перед вводом: фразу удерживают в голове, а не пишут под диктовку.
      _openLater = Timer(Duration(milliseconds: _params.delayMs), () {
        if (mounted) setState(() => _inputOpen = true);
      });
    });
  }

  Future<void> _say() async {
    if (_phase != DictationPhase.playing) return;
    await _noise?.start(_params.snrDb);
    await _voice?.speak(_phrases[_idx].text, _target, rate: _params.rate);
    await _noise?.stop(); // помеха звучит ровно под речью, а не фоном партии
  }

  void _replay() {
    if (_phase != DictationPhase.playing) return;
    _replays += 1; // не штрафуется: это подача задания
    _say();
  }

  void _key(String ch) {
    final st = _typing;
    if (st == null || !_inputOpen || _phase != DictationPhase.playing) return;
    final before = st.errors;
    final r = st.pressChar(ch, blockOnError: true, lenient: true);
    setState(() {
      _errorAt = st.errors > before ? st.pos : null;
      if (st.errors > before) {
        _streak = _streakPos == st.pos ? _streak + 1 : 1;
        _streakPos = st.pos;
        if (_streak >= dictationErrorsBeforeHint) {
          // Подсказка только растёт вперёд: открытое назад не закрываем.
          _revealTo = max(_revealTo, syllableEnd(st.pattern, st.pos, _vowels));
        }
      } else {
        _streakPos = -1;
        _streak = 0;
      }
    });
    if (r.finished) _phraseDone(st.errors);
  }

  void _backspace() {
    final st = _typing;
    if (st == null || !_inputOpen) return;
    setState(() {
      st.backspace();
      _errorAt = null;
    });
  }

  void _phraseDone(int typos) {
    _chars += _phrases[_idx].length;
    _typos += typos;
    _done += 1;
    if (_idx + 1 >= _phrases.length) {
      _finish();
      return;
    }
    setState(() => _idx += 1);
    _present();
  }

  Future<void> _finish() async {
    final secs = (_now - _startMs) / 1000;
    final s = dictationSummary(_chars, _typos, secs);
    // `weak_keys` веб шлёт пустым: слабые знаки там не считаются (30.09.2026) —
    // пишем так же, чтобы статистика половин не расходилась.
    final details = <String, Object?>{
      'level': _levelPlayed,
      'chars': _chars,
      'typos': _typos,
      'cpm': s.cpm,
      'accuracy': s.accuracy,
      'replays': _replays,
      'target_lang': _target,
      'weak_keys': const <String>[],
    };
    if (s.passed) {
      await _ladder.win(score: s.cpm, timeSeconds: secs.round(), errors: _typos, mode: _target,
          difficulty: 'L$_levelPlayed', details: details);
    } else {
      await _ladder.fail(score: s.cpm, timeSeconds: secs.round(), errors: _typos, mode: _target,
          difficulty: 'L$_levelPlayed', details: details);
    }
    if (mounted) {
      setState(() {
        _passed = s.passed;
        _phase = DictationPhase.result;
      });
    }
  }

  /// Тексты разбора — из словаря, теми же ключами, что зовёт веб-учитель.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachDictIntro' => L.t('teachDictIntro'),
      'teachDictListen' => L.t('teachDictListen'),
      'teachDictChunk' => L.t('teachDictChunk'),
      'teachDictStuck' => L.t('teachDictStuck'),
      _ => L.t('teachDictDone'),
    };
    args.forEach((k, v) => out = out.replaceAll('{$k}', v));
    return out;
  }

  final Random _lessonRandom = Random();

  /// 🎓 Разбор по шагам (раздел «Память и слух», `lesson.dart`) вместо демо-карточки: фраза уровня,
  /// не текущая, кусками по два-три слова (китайская — клаузами), каждый кусок проговаривается.
  /// Идёт партия — разбор делает её незачётной (LessonUsed).
  Future<void> _openLesson() async {
    final cloze = _cloze;
    if (cloze == null) return;
    final pool = [for (final p in levelPhrases(buildDictationPhrases(cloze, _vocab, _target), _ladder.level)) p.text];
    final playing = _phase == DictationPhase.playing && _idx < _phrases.length;
    final r = dictationLessonCards(
      pool: pool,
      lang: _target,
      exclude: playing ? _phrases[_idx].text : null,
      rnd: _lessonRandom.nextDouble,
    );
    if (r == null) return;
    if (playing) LessonUsed.mark();
    await _voice?.cancel();
    final steps = dictationLessonSteps(r.cards, _teach);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('dictation'),
        steps: steps,
        board: (context, side, i) {
          final card = steps[i.clamp(0, steps.length - 1)].payload as DictCard;
          return KeyedSubtree(
            key: ValueKey('dict-lesson-$i'),
            child: _DictLessonBoard(card: card, chunks: r.chunks, lang: _target, voice: _voice, rate: _params.rate, side: side),
          );
        },
      ),
    ));
    await _voice?.cancel();
  }

  @override
  Widget build(BuildContext context) {
    if (_cloze == null) {
      return GameShell(title: L.t('dictation'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final playing = _phase == DictationPhase.playing;
    return GameShell(
      title: L.t('dictation'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: _openLesson,
      hud: !playing
          ? const []
          : [
              HudItem(
                label: L.t('round'),
                value: '${_idx + 1}/${_phrases.length} · ${L.t('label_level_short')}$_levelPlayed',
                icon: Icons.numbers,
              ),
              HudItem(label: L.t('hud_correct'), value: '$_done', icon: Icons.check),
            ],
      field: (context, h) => switch (_phase) {
        DictationPhase.config => _config(context, h),
        DictationPhase.playing => _playing(context, h),
        DictationPhase.result => _result(context, h),
      },
      toolbar: playing ? _answer(context) : null,
    );
  }

  Widget _warn(Key key, IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Row(key: key, children: [
          Icon(icon, color: _bad),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ]),
      );

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('dictation'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('dictationConfigDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('langToTrain'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('dict-lang'),
            keyPrefix: 'dict-lang',
            langs: _langs,
            value: _target,
            label: _names.name,
            onChanged: _pickLang,
          ),
          const SizedBox(height: 12),
          Text('${L.t('level')} ${_ladder.level}', style: theme.textTheme.titleMedium),
          if (!_keyboard) _warn(const Key('dict-keyboard-warning'), Icons.desktop_windows_outlined, L.t('dictationNeedsKeyboard')),
          if (_block != null)
            _warn(
              const Key('dict-voice-warning'),
              Icons.volume_off,
              _block == VoiceBlock.soundOff
                  ? L.t('voiceSoundOff')
                  : L.t('voiceMissingLang').replaceAll('{lang}', _names.name(_target)),
            ),
          const SizedBox(height: 16),
          FilledButton(key: const Key('dict-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _playing(BuildContext context, double h) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Крупный знак — КНОПКА повтора, а не картинка: подпись обязательна.
          InkWell(
            key: const Key('dict-replay'),
            borderRadius: BorderRadius.circular(64),
            onTap: _replay,
            child: Container(
              width: 128,
              height: 128,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: muted.withValues(alpha: 0.4))),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.volume_up, size: 44, color: muted),
                Text(L.t('replaySound'), style: TextStyle(fontSize: 12, color: muted)),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          Text(L.t('dictationTask'), textAlign: TextAlign.center, style: TextStyle(color: muted)),
        ]),
      ),
    );
  }

  Widget _answer(BuildContext context) {
    final st = _typing;
    if (!_inputOpen || st == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Icon(Icons.hourglass_empty, key: Key('dict-wait'), size: 30),
      );
    }
    return _DictationTyping(
      state: st,
      errorAt: _errorAt,
      revealTo: _revealTo,
      hint: L.t('dictationHint'),
      onKey: _key,
      onBackspace: _backspace,
    );
  }

  Widget _result(BuildContext context, double h) {
    final s = dictationSummary(_chars, _typos, (_now - _startMs) / 1000);
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_passed ? L.t('levelDone').replaceAll('{n}', '$_levelPlayed') : L.t('sameLevelRetry'),
              style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('${s.cpm} · ${s.accuracy}% · ${L.t('hud_errors')}: $_typos', key: const Key('dict-score')),
          const SizedBox(height: 20),
          FilledButton(key: const Key('dict-again'), onPressed: _start, child: Text(_passed ? L.t('nextNow') : L.t('retry'))),
          TextButton(onPressed: () => setState(() => _phase = DictationPhase.config), child: Text(L.t('skip'))),
        ]),
      ),
    );
  }
}

/// ПОЛЕ НАБОРА ДИКТАНТА: ненабранные знаки — точками, ввод принимает ДВИЖОК.
///
/// ⚠️ Скрыта и ТЕКУЩАЯ буква: иначе фразу можно прочитать по знаку, вообще не
/// слушая. Позицию курсора несёт подчёркивание. Поле-приёмник невидимо и после
/// каждого символа сбрасывается — вставка куском не проходит.
class _DictationTyping extends StatefulWidget {
  const _DictationTyping({
    required this.state,
    required this.errorAt,
    required this.revealTo,
    required this.hint,
    required this.onKey,
    required this.onBackspace,
  });
  final TypingState state;
  final int? errorAt;
  final int revealTo;
  final String hint;
  final void Function(String) onKey;
  final VoidCallback onBackspace;

  @override
  State<_DictationTyping> createState() => _DictationTypingState();
}

class _DictationTypingState extends State<_DictationTyping> {
  // Поле держит один «служебный» знак: его стирание — это Backspace человека.
  static const String _sentinel = '​';
  final _ctrl = TextEditingController(text: _sentinel);
  final _focus = FocusNode();

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed(String v) {
    if (v.isEmpty) {
      widget.onBackspace();
    } else if (v.length > _sentinel.length) {
      widget.onKey(v.characters.last);
    }
    _ctrl.value = const TextEditingValue(text: _sentinel, selection: TextSelection.collapsed(offset: 1));
  }

  @override
  Widget build(BuildContext context) {
    final st = widget.state;
    final scheme = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Wrap(alignment: WrapAlignment.center, children: [
            for (var i = 0; i < st.pattern.length; i += 1)
              Container(
                key: Key('dict-char-$i'),
                padding: const EdgeInsets.symmetric(horizontal: 1),
                decoration: i == st.pos
                    ? BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: widget.errorAt != null ? _bad : scheme.onSurface, width: 3),
                        ),
                      )
                    : null,
                child: Text(
                  i < st.pos && st.marks[i] == Mark.correct
                      ? st.pattern[i]
                      : (i >= widget.revealTo ? (st.pattern[i] == ' ' ? ' ' : '·') : st.pattern[i]),
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w500,
                    color: i < st.pos && st.marks[i] == Mark.correct
                        ? _good
                        : (i == st.pos && widget.errorAt != null ? _bad : scheme.onSurfaceVariant),
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 4),
          Text(widget.hint, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          SizedBox(
            height: 1,
            child: TextField(
              key: const Key('dict-input'),
              controller: _ctrl,
              focusNode: _focus,
              autofocus: true,
              showCursor: false,
              autocorrect: false,
              enableSuggestions: false,
              style: const TextStyle(color: Colors.transparent, fontSize: 1),
              decoration: const InputDecoration(border: InputBorder.none, isDense: true),
              onChanged: _changed,
            ),
          ),
        ]),
      ),
    );
  }
}

/// Поле разбора: набранные куски, текущий — выделен, остальные — точками. При показе карточка
/// проговаривает свою фразу или кусок тем же голосом, что и партия.
class _DictLessonBoard extends StatefulWidget {
  const _DictLessonBoard({
    required this.card,
    required this.chunks,
    required this.lang,
    required this.voice,
    required this.rate,
    required this.side,
  });

  final DictCard card;
  final List<String> chunks;
  final String lang;
  final VoiceLayer? voice;
  final double rate;
  final double side;

  @override
  State<_DictLessonBoard> createState() => _DictLessonBoardState();
}

class _DictLessonBoardState extends State<_DictLessonBoard> {
  @override
  void initState() {
    super.initState();
    final say = widget.card.speak;
    if (say.isNotEmpty) widget.voice?.speak(say.join(widget.lang == 'zh' ? '' : ' '), widget.lang, rate: widget.rate);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = widget.card;
    final sep = widget.lang == 'zh' ? '' : ' ';
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: SizedBox(
        width: widget.side,
        child: Wrap(alignment: WrapAlignment.center, spacing: 6, runSpacing: 6, children: [
          for (var k = 0; k < widget.chunks.length; k += 1)
            Container(
              key: ValueKey('dict-lesson-chunk-$k'),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: c.chunk == k
                    ? scheme.primaryContainer
                    : k < c.typed
                        ? scheme.surfaceContainerHighest
                        : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: scheme.outlineVariant),
              ),
              child: Text(
                k < c.typed || c.chunk == k ? widget.chunks[k] : '·' * widget.chunks[k].split(sep).length,
                style: TextStyle(fontSize: 18, fontWeight: c.chunk == k ? FontWeight.w800 : FontWeight.w500),
              ),
            ),
        ]),
      ),
    );
  }
}
