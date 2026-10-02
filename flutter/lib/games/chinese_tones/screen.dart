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
import '../hearing_common/lesson_cue.dart';
import 'lesson.dart';
import 'model.dart';

/// «Тоны китайского» — экран раздела «Языки» на Flutter. Правила и сверка с живым
/// TS — в `model.dart` и `test/chinese_tones_test.dart`.
///
/// Звучит односложное слово HSK 1–3: на младших уровнях назвать тон (после ответа
/// виден иероглиф и пиньинь), с шестого — вслепую, с одиннадцатого — слог целиком.
enum CtPhase { config, playing, result }

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFF43F5E);
const Color _accent = Color(0xFFB91C1C);

class ChineseTonesScreen extends StatefulWidget {
  const ChineseTonesScreen({super.key, required this.state, this.clock, this.random, this.voice, this.noise});
  final SharedState state;
  final int Function()? clock;
  final double Function()? random;
  final VoiceLayer? voice;
  final NoiseLayer? noise;

  @override
  State<ChineseTonesScreen> createState() => _ChineseTonesScreenState();
}

class _ChineseTonesScreenState extends State<ChineseTonesScreen> {
  late LevelLadder _ladder;
  Map<int, List<ZhSyllable>>? _bank;

  /// Банк заданий партии — тот, что прозвучит на этом устройстве ([ctPlayableBank]).
  /// Разбор берёт полный [_bank]: ему нужна основа во всех четырёх тонах, а таких с записью нет.
  Map<int, List<ZhSyllable>>? _playBank;
  VoiceLayer? _voice;
  NoiseLayer? _noise;
  VoiceBlock? _block;
  late final double Function() _rng = widget.random ?? Random().nextDouble;

  CtPhase _phase = CtPhase.config;
  List<CtTrial> _trials = const [];
  CtLevelParams _params = ctLevelParams(1);
  int _idx = 0;
  int? _answered;
  int _hits = 0, _errors = 0, _replays = 0;
  int _levelPlayed = 1;
  int _startMs = 0;
  bool _passed = false;
  Timer? _advance;
  Timer? _sayLater;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'chinese_tones', store: SharedLevelStore(widget.state));
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
    final bank = zhBankFromJson(await loadJsonAsset('assets/vocab/zh-tone-bank.json') as Map);
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final noise = widget.noise ?? AudioHost.noise(widget.state);
    // Без китайского голоса упражнение невозможно по построению — говорим об этом.
    final systemVoice = await voice.hasSystemVoice('zh');
    final playBank = ctPlayableBank(bank, systemVoice: systemVoice, hasRecording: (zh) => voice.hasRecording(zh, 'zh'));
    final silent = playBank.values.any((l) => l.isEmpty);
    final block = await voice.blockedReason('zh') ?? (silent ? VoiceBlock.noVoice : null);
    if (!mounted) return;
    setState(() {
      _bank = bank;
      _playBank = silent ? bank : playBank;
      _voice = voice;
      _noise = noise;
      _block = block;
    });
    if (mounted && GamePreset.autostart) _start();
  }

  void _start() {
    _advance?.cancel();
    _sayLater?.cancel();
    final p = ctLevelParams(_ladder.level);
    setState(() {
      _params = p;
      _trials = buildCtTrials(_playBank ?? _bank!, p.trials, p.pinyinMode, _rng);
      _idx = 0;
      _answered = null;
      _hits = _errors = _replays = 0;
      _levelPlayed = _ladder.level;
      _startMs = _now;
      _phase = CtPhase.playing;
    });
    _sayRound();
  }

  void _sayRound() {
    _sayLater?.cancel();
    _sayLater = Timer(const Duration(milliseconds: 400), _say);
  }

  Future<void> _say() async {
    if (_phase != CtPhase.playing) return;
    await _noise?.start(_params.snrDb);
    await _voice?.speak(_trials[_idx].syll.zh, 'zh', rate: _params.rate);
    await _noise?.stop();
  }

  void _replay() {
    if (_phase != CtPhase.playing || _answered != null) return;
    _replays += 1;
    _say();
  }

  void _answer(int choice) {
    if (_phase != CtPhase.playing || _answered != null) return;
    final ok = choice == _trials[_idx].correctIdx;
    setState(() {
      _answered = choice;
      if (ok) {
        _hits += 1;
      } else {
        _errors += 1;
      }
    });
    _advance = Timer(Duration(milliseconds: _params.showAfter ? 1100 : 700), () {
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
    // Цена ошибки растёт с уровнем: две прощаются, потом одна, с одиннадцатого — ни одной.
    final passed = _errors <= _params.maxErrors;
    final details = <String, Object?>{
      'level': _levelPlayed,
      'hits': _hits,
      'errors': _errors,
      'trials': _params.trials,
      'replays': _replays,
    };
    final secs = ((_now - _startMs) / 1000).round();
    final mode = _params.pinyinMode ? 'pinyin' : 'tone';
    if (passed) {
      await _ladder.win(score: ctScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: mode,
          difficulty: 'L$_levelPlayed', details: details);
    } else {
      await _ladder.fail(score: ctScore(_hits, _errors), timeSeconds: secs, errors: _errors, mode: mode,
          difficulty: 'L$_levelPlayed', details: details);
    }
    if (mounted) {
      setState(() {
        _passed = passed;
        _phase = CtPhase.result;
      });
    }
  }

  /// Тексты разбора — из словаря, теми же ключами, что зовёт веб-учитель.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachZhIntro' => L.t('teachZhIntro'),
      'teachZhTone1' => L.t('teachZhTone1'),
      'teachZhTone2' => L.t('teachZhTone2'),
      'teachZhTone3' => L.t('teachZhTone3'),
      'teachZhTone4' => L.t('teachZhTone4'),
      'teachZhPair23' => L.t('teachZhPair23'),
      _ => L.t('teachZhDone'),
    };
    args.forEach((k, v) => out = out.replaceAll('{$k}', v));
    return out;
  }

  final Random _lessonRandom = Random();

  /// 🎓 Разбор по шагам (раздел «Память и слух», `lesson.dart`) вместо демо-карточки: один слог в
  /// четырёх тонах с линиями голоса и пара «второй — третий»; слог текущего задания не берётся.
  /// Идёт партия — разбор делает её незачётной (LessonUsed).
  Future<void> _openLesson() async {
    final bank = _bank;
    if (bank == null) return;
    final playing = _phase == CtPhase.playing && _idx < _trials.length;
    final r = ctLessonCards(bank: bank, exclude: playing ? _trials[_idx].syll.pinyin : null, rnd: _lessonRandom.nextDouble);
    if (playing) LessonUsed.mark();
    _sayLater?.cancel();
    await _voice?.cancel();
    final steps = ctLessonSteps(r.cards, _teach);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('chineseTonesShort'),
        steps: steps,
        board: (context, side, i) {
          final card = steps[i.clamp(0, steps.length - 1)].payload as CtCard;
          return KeyedSubtree(
            key: ValueKey('ct-lesson-$i'),
            child: _CtLessonBoard(card: card, voice: _voice, side: side),
          );
        },
      ),
    ));
    await _voice?.cancel();
  }

  @override
  Widget build(BuildContext context) {
    if (_bank == null) {
      return GameShell(title: L.t('chineseTonesShort'), field: (c, h) => const Center(child: CircularProgressIndicator()));
    }
    final t = _phase == CtPhase.playing ? _trials[_idx] : null;
    return GameShell(
      title: L.t('chineseTonesShort'),
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
        CtPhase.config => _config(context, h),
        CtPhase.playing => _playing(context, h, t!),
        CtPhase.result => _result(context, h),
      },
      toolbar: t == null ? null : _options(context, t),
    );
  }

  Widget _config(BuildContext context, double h) {
    final theme = Theme.of(context);
    return SizedBox(
      height: h,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('chineseTones'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('ctConfigDesc'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          Text('${L.t('level')} ${_ladder.level}', style: theme.textTheme.titleMedium),
          if (_block != null) ...[
            const SizedBox(height: 12),
            Row(key: const Key('ct-voice-warning'), children: [
              const Icon(Icons.volume_off, color: _bad),
              const SizedBox(width: 8),
              Expanded(
                child: Text(_block == VoiceBlock.soundOff
                    ? L.t('voiceSoundOff')
                    : L.t('voiceMissingLang').replaceAll('{lang}', '中文')),
              ),
            ]),
          ],
          const SizedBox(height: 16),
          FilledButton(key: const Key('ct-start'), onPressed: _start, child: Text(L.t('start'))),
        ],
      ),
    );
  }

  Widget _playing(BuildContext context, double h, CtTrial t) {
    final right = _answered != null && _answered == t.correctIdx;
    return SizedBox(
      height: h,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          IconButton.filledTonal(
            key: const Key('ct-replay'),
            iconSize: 40,
            tooltip: L.t('replaySound'),
            onPressed: _answered == null ? _replay : null,
            icon: const Icon(Icons.volume_up, color: _accent),
          ),
          Text(L.t('replaySound'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          Text(_params.pinyinMode ? L.t('ctPickPinyin') : L.t('ctPickTone'), textAlign: TextAlign.center),
          // Иероглиф и пиньинь — ПОСЛЕ ответа и только на младших уровнях:
          // раньше времени они превращают слух в чтение.
          if (_params.showAfter && _answered != null) ...[
            const SizedBox(height: 12),
            Text('${t.syll.zh} · ${t.syll.pinyin}',
                key: const Key('ct-reveal'),
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: right ? _good : _bad)),
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
                key: const Key('ct-score')),
            const SizedBox(height: 20),
            FilledButton(key: const Key('ct-again'), onPressed: _start, child: Text(_passed ? L.t('nextNow') : L.t('retry'))),
            TextButton(onPressed: () => setState(() => _phase = CtPhase.config), child: Text(L.t('skip'))),
          ]),
        ),
      );

  Widget _options(BuildContext context, CtTrial t) {
    final scheme = Theme.of(context).colorScheme;
    Widget button(int i) => SizedBox(
          height: 64,
          child: FilledButton(
            key: Key('ct-option-$i'),
            onPressed: _answered == null ? () => _answer(i) : null,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              backgroundColor: scheme.surfaceContainerHighest,
              foregroundColor: scheme.onSurface,
              disabledBackgroundColor: _answered == null ? null : (i == t.correctIdx ? _good : (i == _answered ? _bad : null)),
              disabledForegroundColor:
                  _answered != null && (i == t.correctIdx || i == _answered) ? Colors.white : null,
            ),
            child: Semantics(
              label: _params.pinyinMode ? t.options[i] : '${L.t('ctTone')} ${i + 1}',
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (_params.pinyinMode)
                  Text(t.options[i], style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700))
                else
                  // Знаки ˊ ˋ есть не в каждом шрифте (в Roboto сборки — пустые квадраты): линия тона
                  // рисуется сама, той же шкалой, что в разборе.
                  Builder(
                    builder: (context) {
                      final ink = IconTheme.of(context).color ?? scheme.onSurface;
                      return CustomPaint(
                        key: Key('ct-option-line-${i + 1}'),
                        size: const Size(46, 28),
                        painter: _ToneLine(
                          contour: ctToneContours[i + 1]!,
                          color: ink,
                          frame: ink.withValues(alpha: 0.3),
                          lit: true,
                          pad: 6,
                          stroke: 4,
                        ),
                      );
                    },
                  ),
                if (!_params.pinyinMode) Text('${i + 1}', style: const TextStyle(fontSize: 12)),
              ]),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: _params.pinyinMode
          ? Column(mainAxisSize: MainAxisSize.min, children: [
              for (var i = 0; i < t.options.length; i += 1) ...[
                if (i > 0) const SizedBox(height: 6),
                SizedBox(width: double.infinity, child: button(i)),
              ],
            ])
          : Row(children: [
              for (var i = 0; i < t.options.length; i += 1) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: button(i)),
              ],
            ]),
    );
  }
}

/// Поле разбора: слова карточки с линиями тонов — горит та, о которой речь (на паре — обе). Рамка
/// обязательна: тон — не только форма, но и высота; без шкалы ровная первая и падающая четвёртая
/// читаются одинаково «где-то наверху» (кадр веба 30.09.2026). Карточка со словом звучит сама.
class _CtLessonBoard extends StatefulWidget {
  const _CtLessonBoard({required this.card, required this.voice, required this.side});

  final CtCard card;
  final VoiceLayer? voice;
  final double side;

  @override
  State<_CtLessonBoard> createState() => _CtLessonBoardState();
}

class _CtLessonBoardState extends State<_CtLessonBoard> with SingleTickerProviderStateMixin {
  late final LessonCue _cue = LessonCue(this);

  @override
  void initState() {
    super.initState();
    // Как в вебе: через 350 мс знаки по очереди, между ними 300 мс, темп 0,85.
    final words = widget.card.speak;
    _cue.run(words.length, (i) => widget.voice?.speak(words[i], 'zh', rate: 0.85), gap: const Duration(milliseconds: 300));
  }

  @override
  void dispose() {
    _cue.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = widget.card;
    final lineW = min(96.0, ((widget.side - 24) / max(4, c.sylls.length)).floorToDouble());
    // Естественная ширина ряда, ужатая под поле: подписи пиньиня шире линии (замер пробой: +8 px на 4 слогах).
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final s in c.sylls)
          () {
            final lit = c.kind == 'pair' || c.tone == s.tone;
            return Padding(
              key: ValueKey('ct-lesson-syll-${s.tone}'),
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                CustomPaint(
                  key: ValueKey('ct-lesson-line-${s.tone}${lit ? '-lit' : ''}'),
                  size: Size(lineW, (lineW * 0.62).roundToDouble()),
                  painter: _ToneLine(
                    contour: ctToneContours[s.tone]!,
                    color: lit ? _accent : scheme.onSurfaceVariant,
                    frame: scheme.outlineVariant,
                    lit: lit,
                  ),
                ),
                const SizedBox(height: 4),
                Text(s.zh,
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: lit ? scheme.onSurface : scheme.onSurfaceVariant)),
                Text('${s.pinyin} · ${s.tone}', style: TextStyle(fontSize: 14, color: scheme.onSurfaceVariant)),
              ]),
            );
          }(),
      ]),
    );
  }
}

/// Линия тона в рамке шкалы: ступени 1–5 снизу вверх, точки равномерно по ширине.
class _ToneLine extends CustomPainter {
  _ToneLine({
    required this.contour,
    required this.color,
    required this.frame,
    required this.lit,
    this.pad = 8,
    this.stroke = 6,
  });

  final List<int> contour;
  final Color color;
  final Color frame;
  final bool lit;
  final double pad;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(1, 1, size.width - 2, size.height - 2), const Radius.circular(8)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = frame,
    );
    final path = Path();
    for (var i = 0; i < contour.length; i += 1) {
      final x = pad + i * (size.width - 2 * pad) / (contour.length - 1);
      final y = pad + (5 - contour[i]) * (size.height - 2 * pad) / 4;
      i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = color.withValues(alpha: lit ? 1 : 0.45),
    );
  }

  @override
  bool shouldRepaint(_ToneLine old) => old.color != color || old.lit != lit || old.contour != contour;
}
