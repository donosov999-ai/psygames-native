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
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import 'model.dart';

/// «Беглость речи» (COWAT) — экран раздела «Языки» на Flutter. Правила и сверка
/// с живым TS — в `model.dart` и `test/phonemic_fluency_test.dart`.
///
/// Провала нет по устройству: сколько слов назвал, столько назвал. Лестница здесь —
/// СЧЁТЧИК ПРОХОЖДЕНИЙ: буква берётся из нормативного набора, иначе прошлые
/// результаты человека перестали бы сравниваться.
enum PhonemicPhase { config, playing, result }

const Color _accent = Color(0xFF16A085);
const Color _ok = Color(0xFF22C55E);
const Color _no = Color(0xFFF43F5E);

class PhonemicFluencyScreen extends StatefulWidget {
  const PhonemicFluencyScreen({super.key, required this.state, this.clock, this.random, this.dataOverride});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final PhonemicData? dataOverride;

  @override
  State<PhonemicFluencyScreen> createState() => _PhonemicFluencyScreenState();
}

class _PhonemicFluencyScreenState extends State<PhonemicFluencyScreen> {
  late LevelLadder _runs;
  PhonemicData? _data;
  LangNames _names = LangNames.empty;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  PhonemicPhase _phase = PhonemicPhase.config;
  String _wordLang = 'en';
  int _duration = 60;
  bool _autoPick = true;
  String _letter = '';
  final List<PhonemicSaid> _said = [];
  final _input = TextEditingController();
  int _startMs = 0;
  int _remaining = 60;
  int _runPlayed = 1;
  Timer? _tick;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();

  /// Ключ выбора языка слов — тот же, что у веба (`wordLangKey`): по игре И по профилю.
  String get _wordLangKey => 'psygames_phonemic_fluency_wordlang_${widget.state.activeProfile}';

  List<String> get _pool => _data?.poolFor(_wordLang) ?? const [];

  @override
  void initState() {
    super.initState();
    _runs = LevelLadder(gameId: 'phonemic_fluency', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _input.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    await _runs.load();
    final data = widget.dataOverride ??
        PhonemicData.fromJson(await loadJsonAsset('assets/vocab/phonemic-fluency.json') as Map);
    final names = await LangNames.load();
    if (!mounted) return;
    final saved = widget.state.get(_wordLangKey);
    final fromStep = GamePreset.str('targetLang', '');
    setState(() {
      _data = data;
      _names = names;
      // Шаг зарядки прежде хранилища, хранилище прежде языка интерфейса — как `useWordLanguage`.
      _wordLang = data.wordLangs.contains(fromStep)
          ? fromStep
          : data.wordLangs.contains(saved)
              ? saved!
              : phonemicDefaultWordLang(widget.state.language, data.wordLangs);
      final d = GamePreset.num('duration', 60);
      _duration = const [60, 90, 120].contains(d) ? d : 60;
    });
    if (mounted && GamePreset.autostart) _start();
  }

  Future<void> _pickWordLang(String lang) async {
    setState(() {
      _wordLang = lang;
      if (!_pool.contains(_letter)) _letter = '';
    });
    await widget.state.set(_wordLangKey, lang);
  }

  void _start() {
    final pool = _pool;
    if (pool.isEmpty) return;
    final letter = _autoPick ? pool[(_rng() * pool.length).floor()] : (_letter.isNotEmpty ? _letter : pool.first);
    _tick?.cancel();
    _input.clear();
    final start = _now;
    setState(() {
      _letter = letter;
      _said.clear();
      _remaining = _duration;
      _runPlayed = _runs.level;
      _startMs = start;
      _phase = PhonemicPhase.playing;
    });
    _tick = Timer.periodic(const Duration(milliseconds: 200), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      final left = _duration - ((_now - start) / 1000).floor();
      setState(() => _remaining = max(0, left));
      if (left <= 0) {
        t.cancel();
        _finish();
      }
    });
  }

  void _submit() {
    final raw = _input.text.trim().toLowerCase();
    _input.clear();
    if (raw.isEmpty || _phase != PhonemicPhase.playing) return;
    final script = _data!.scripts[phonemicScriptFor(_wordLang)]!;
    final v = phonemicJudge(raw, _letter, script, _said);
    setState(() => _said.add(PhonemicSaid(raw, _now, v.valid, v.reason)));
  }

  Future<void> _finish() async {
    final s = phonemicSummary(_said, _startMs, _duration);
    setState(() => _phase = PhonemicPhase.result);
    // `passed` веб не пишет НАМЕРЕННО: провала нет, подход засчитан завершением.
    await _runs.win(
      score: s.validWords.length * 10,
      timeSeconds: _duration,
      errors: s.repetitions + s.wrongLetter + s.tooShort,
      mode: '${_duration}s',
      // Машинное значение: от языка интерфейса не зависит.
      difficulty: 'letter-$_letter',
      details: {
        'level': _runPlayed,
        'word_count': s.validWords.length,
        'repetitions': s.repetitions,
        'wrong_letter': s.wrongLetter,
        'too_short': s.tooShort,
        'mean_inter_word_sec': double.parse(s.meanInter.toStringAsFixed(2)),
        'first_half_count': s.firstHalf,
        'second_half_count': s.secondHalf,
        'letter': _letter,
        'words_list': [for (final w in s.validWords) w.word],
      },
    );
    if (mounted) setState(() {});
  }

  /// Разбор до партии: буква задания и слово, которое засчитается.
  List<DemoTrial> _demoTrials() {
    final pool = _pool;
    final letter = pool.isEmpty ? '' : pool.first;
    return [
      DemoTrial(
        text: letter,
        sub: L.t('phonemicHint').replaceAll('{L}', letter),
        rule: L.t('phonemicIntroDesc'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      return GameShell(title: L.t('phonemic'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final valid = _said.where((w) => w.valid).length;
    return GameShell(
      title: L.t('phonemic'),
      onBack: () => Navigator.of(context).maybePop(),
      onLesson: () => openDemoLesson(context, title: L.t('phonemic'), trials: _demoTrials()),
      hud: _phase == PhonemicPhase.playing
          ? [
              HudItem(label: L.t('timeLeftLabel'), value: '$_remaining${L.t('secShort')}', icon: Icons.timer_outlined),
              HudItem(label: L.t('hud_words'), value: '$valid', icon: Icons.text_fields),
            ]
          : const [],
      field: (context, h) => switch (_phase) {
        PhonemicPhase.config => _config(context, h),
        PhonemicPhase.playing => _playing(context, h),
        PhonemicPhase.result => _result(context, h, valid),
      },
      toolbar: _phase == PhonemicPhase.playing ? _answer() : null,
    );
  }

  Widget _choice(Key key, String label, bool selected, VoidCallback onTap) => ChoiceChip(
        key: key,
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
      );

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('phonemic'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('phonemicDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text(L.t('wordLangLabel'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('pf-lang'),
            keyPrefix: 'pf-lang',
            langs: _data!.wordLangs,
            value: _wordLang,
            label: _names.label,
            onChanged: _pickWordLang,
          ),
          const SizedBox(height: 12),
          Text(L.t('duration'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final d in const [60, 90, 120])
              _choice(Key('pf-dur-$d'), '${d}s', _duration == d, () => setState(() => _duration = d)),
          ]),
          const SizedBox(height: 12),
          Text(L.t('hud_letter'), style: theme.textTheme.titleSmall),
          CheckboxListTile(
            key: const Key('pf-autopick'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _autoPick,
            title: Text(L.t('phonemicAutoPick')),
            onChanged: (v) => setState(() => _autoPick = v ?? true),
          ),
          if (!_autoPick)
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final l in _pool.take(8))
                _choice(Key('pf-letter-$l'), l, _letter == l, () => setState(() => _letter = l)),
            ]),
          const SizedBox(height: 8),
          Text(L.t('phonemicRules'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 16),
          FilledButton(key: const Key('pf-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _playing(BuildContext context, double h) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SizedBox(
      height: h,
      child: Column(children: [
        const SizedBox(height: 8),
        Container(
          width: 96,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: _accent, width: 3),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(children: [
            Text(L.t('hud_letter'), style: TextStyle(fontSize: 12, color: muted)),
            Text(_letter, key: const Key('pf-letter'), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800)),
          ]),
        ),
        const SizedBox(height: 8),
        Text(L.t('phonemicHint').replaceAll('{L}', _letter), textAlign: TextAlign.center, style: TextStyle(color: muted)),
        const SizedBox(height: 8),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final w in _said.reversed)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: (w.valid ? _ok : _no).withValues(alpha: 0.13),
                    border: Border.all(color: w.valid ? _ok : _no),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${w.word}${_mark(w)}',
                    style: TextStyle(color: w.valid ? _ok : _no, fontWeight: FontWeight.w600),
                  ),
                ),
            ]),
          ),
        ),
      ]),
    );
  }

  /// Знак причины отказа — те же, что в вебе: повтор ↻, чужая буква ✗, коротко ‹.
  String _mark(PhonemicSaid w) => w.valid
      ? ''
      : switch (w.reason) {
          'repetition' => ' ↻',
          'wrong_letter' => ' ✗',
          'too_short' => ' ‹',
          _ => '',
        };

  Widget _answer() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(children: [
          Expanded(
            child: TextField(
              key: const Key('pf-input'),
              controller: _input,
              autocorrect: false,
              textCapitalization: TextCapitalization.none,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(
                border: const OutlineInputBorder(),
                isDense: true,
                hintText: L.t('phonemicPlaceholder').replaceAll('{L}', _letter.toLowerCase()),
              ),
              onSubmitted: (_) => _submit(),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            height: 48,
            child: FilledButton(
              key: const Key('pf-add'),
              style: FilledButton.styleFrom(backgroundColor: _accent),
              onPressed: _submit,
              child: Text('+ ${L.t('phonemicAdd')}'),
            ),
          ),
        ]),
      );

  Widget _result(BuildContext context, double h, int valid) => SizedBox(
        height: h,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(L.t('levelDone').replaceAll('{n}', '$_runPlayed'),
                style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('${L.t('hud_words')}: $valid', key: const Key('pf-count')),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('pf-again'),
              onPressed: () => setState(() => _phase = PhonemicPhase.config),
              child: Text(L.t('nextNow')),
            ),
          ]),
        ),
      );
}
