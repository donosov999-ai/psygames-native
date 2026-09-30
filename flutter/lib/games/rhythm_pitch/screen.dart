import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/audio_host.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'core.dart';
import 'strings.dart';
import 'tones.dart';

/// «Ритм и высота» — перенос `frontend/app/games/rhythm-pitch.tsx` и модуля
/// `src/games/rhythm-pitch/RhythmPitchGame.tsx`. Правила и счёт — в `core.dart`
/// (сверка с живым TS: `test/rhythm_pitch_test.dart`), звук — `tones.dart`.
///
/// Слух, а не глаз: «Эхо ритма» — повторить рисунок ударов в том же времени,
/// «Путь высоты» — удержать последовательность высот. Режимы чередуются по уровню.
///
/// Отличия от веба — три, все нарочные:
///   · экран настройки и правила модуля — один экран: в вебе «Начать» нажимали дважды
///     подряд (настройка → правила модуля → снова «Начать»);
///   · подстройка задержки переносится между уровнями одного захода
///     ([RpSession.carryCalibration]) — веб заставлял стучать метроном перед каждым;
///   · мишень для ударов ритма стоит внизу неподвижно, как мишень калибровки в вебе.
enum RpScreenPhase { config, playing, done }

const Color _grad0 = Color(0xFF4338CA);
const Color _grad1 = Color(0xFF22D3EE);

/// Звёзды по точности — как `starsFor` веба; порог зачёта — у ядра ([rpPassed]).
int rpStars(double accuracy) => accuracy >= 0.95 ? 3 : (accuracy >= 0.85 ? 2 : 1);

/// Ступень сложности для статистики — как `difficulty` в `saveSession` веба.
String rpDifficultyTag(int level) => level <= 7 ? 'easy' : (level <= 19 ? 'medium' : 'hard');

class RhythmPitchScreen extends StatefulWidget {
  const RhythmPitchScreen({super.key, required this.state, this.clock, this.backend});
  final SharedState state;

  /// Часы партии в мс. Ими же движок ставит время сигналов — одни часы на оба конца.
  final double Function()? clock;
  final RpToneBackend? backend;

  @override
  State<RhythmPitchScreen> createState() => _RhythmPitchScreenState();
}

class _RhythmPitchScreenState extends State<RhythmPitchScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'rhythm_pitch',
    store: SharedLevelStore(widget.state),
    maxLevel: rhythmPitchLevels,
  );
  final Stopwatch _sw = Stopwatch()..start();
  late final RpToneEngine _engine = RpToneEngine(
    backend: widget.backend ?? JustAudioToneBackend(),
    soundOn: () => appSoundOn(widget.state),
    clock: _now,
    mutedMessage: () => _s.t('soundOffNotice'),
  );
  late final AppLifecycleListener _life;
  final FocusNode _focus = FocusNode();

  RpStrings _s = RpStrings.empty;
  bool _loaded = false;
  RpScreenPhase _phase = RpScreenPhase.config;
  RpSession? _session;
  RpMetrics? _last;
  bool _passed = false;
  int _levelPlayed = 1;
  int _gen = 0;
  (double, int)? _carried;
  bool _flash = false;
  Timer? _flashOff;

  double _now() => widget.clock?.call() ?? _sw.elapsedMicroseconds / 1000.0;

  /// Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  int get _level => GamePreset.num('level', _ladder.level).clamp(1, rhythmPitchLevels);

  /// Шаг зарядки может попросить режим; иначе режим чередуется по уровню.
  String? get _presetMode {
    final m = GamePreset.str('mode');
    return m == 'rhythm-echo' || m == 'pitch-path' ? m : null;
  }

  bool get _soundOff => widget.state.get('psygames_sound_enabled') == 'false';
  bool get _calm => GamePreset.isCalm;

  @override
  void initState() {
    super.initState();
    _life = AppLifecycleListener(onInactive: _hide, onHide: _hide);
    _boot();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Пауза каркаса и разбор открываются ПОВЕРХ экрана: звук и счёт времени обязаны
    // встать, иначе раунд под шторкой доиграет и засчитается.
    if (ModalRoute.of(context)?.isCurrent == false) scheduleMicrotask(_hide);
  }

  @override
  void dispose() {
    _gen += 1;
    _flashOff?.cancel();
    _life.dispose();
    _focus.dispose();
    unawaited(_engine.dispose());
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final s = await RpStrings.load(widget.state.language);
    if (!mounted) return;
    setState(() {
      _s = s;
      _loaded = true;
    });
    // Автостарт ждёт ответа про звук: прыгать в игру, где играть нечем, незачем.
    if (GamePreset.autostart && !_soundOff && !_calm) _begin();
  }

  void _apply(RpSession Function(RpSession) f) {
    final cur = _session;
    if (cur == null || !mounted) return;
    final next = f(cur);
    if (identical(next, cur)) return;
    setState(() => _session = next);
    if (next.phase == 'result' && next.result != null && cur.phase != 'result') _complete(next.result!);
  }

  void _fail([Object? e]) =>
      _apply((s) => s.markAudioUnavailable(e is RpAudioUnavailable ? e.message : _s.t('unavailableBody')));

  void _hide() {
    if (!mounted || _session == null || _phase != RpScreenPhase.playing) return;
    _gen += 1;
    unawaited(_engine.stop());
    _apply((s) => s.pause(_now()));
  }

  void _begin() {
    final level = _level;
    var s = RpSession.create(seed: 'rhythm-pitch-$level', level: level, mode: _presetMode).start(_now());
    final c = _carried;
    if (c != null) s = s.carryCalibration(c.$1, c.$2);
    if (!_engine.available) s = s.markAudioUnavailable(_s.t('unavailableBody'));
    _gen += 1;
    setState(() {
      _session = s;
      _levelPlayed = level;
      _last = null;
      _phase = RpScreenPhase.playing;
    });
    _focus.requestFocus();
  }

  Future<void> _runCalibration() async {
    final gen = ++_gen;
    try {
      final plan = await _engine.playCalibration(_session!.volume);
      if (gen != _gen || !mounted) return;
      _apply((s) => s.startCalibration(plan.expectedTimesMs));
      await plan.completed;
      if (gen != _gen || !mounted) return;
      _apply((s) => s.completeCalibration());
      final s = _session!;
      if (s.calibrationComplete) _carried = (s.calibrationOffsetMs, s.calibrationSamples);
    } catch (e) {
      if (gen == _gen && mounted) _fail(e);
    }
  }

  Future<void> _play(RpSession Function(RpSession) prepare) async {
    final cur = _session;
    if (cur == null) return;
    final prepared = prepare(cur);
    if (identical(prepared, cur)) return;
    final gen = ++_gen;
    setState(() => _session = prepared);
    try {
      final plan = await _engine.playRound(prepared.round, prepared.volume);
      await plan.completed;
      if (gen != _gen || !mounted) return;
      _apply((s) => s.completePlayback(_now()));
    } catch (e) {
      if (gen == _gen && mounted) _fail(e);
    }
  }

  void _restart() {
    _gen += 1;
    unawaited(_engine.stop());
    _apply((s) => s.restart(_now()));
  }

  void _resume() {
    if (!_engine.available) return _fail(RpAudioUnavailable(_s.t('soundOffNotice')));
    _apply((s) => s.resume(_now()));
  }

  void _tap() {
    final t = _now();
    final s = _session;
    if (s == null) return;
    if (s.phase == 'calibration') {
      _apply((c) => c.recordCalibrationTap(t));
    } else if (s.phase == 'response' && s.round is RhythmEchoRound) {
      _apply((c) => c.recordRhythmTap(t));
    } else {
      return;
    }
    // Отклик глазом — короткая вспышка мишени, счёт времени от неё не зависит.
    _flashOff?.cancel();
    setState(() => _flash = true);
    _flashOff = Timer(const Duration(milliseconds: 90), () {
      if (mounted) setState(() => _flash = false);
    });
  }

  Future<void> _complete(RpMetrics m) async {
    final passed = rpPassed(m);
    final level = _levelPlayed;
    setState(() {
      _last = m;
      _passed = passed;
      _phase = RpScreenPhase.done;
    });
    final sp = m.specific;
    final details = <String, Object?>{
      'level': level,
      'accuracy': m.accuracy,
      // Поправка и число замеров — про УСТРОЙСТВО: без них «почему ритм всегда
      // мимо» не разобрать — мимо может быть не человек, а колонка по Bluetooth.
      'calibration_offset_ms': sp['calibrationOffsetMs'],
      'calibration_samples': sp['calibrationSamples'],
      'replay_count': sp['replayCount'],
      'mean_timing_error_ms': sp['meanTimingErrorMs'],
      'missing_taps': sp['missingTaps'],
      'extra_taps': sp['extraTaps'],
      'bpm': sp['bpm'],
      'pitch_task': sp['pitchTask'],
      'tone_count': sp['toneCount'],
      'interval_semitones': sp['intervalSemitones'],
      'generator_version': rhythmPitchGeneratorVersion,
    };
    final secs = (m.durationMs / 1000).round();
    final mode = '${sp['mode']}';
    if (passed) {
      await _ladder.win(
        score: m.score,
        timeSeconds: secs,
        errors: m.errors,
        mode: mode,
        difficulty: rpDifficultyTag(level),
        details: details,
      );
    } else {
      await _ladder.fail(
        score: m.score,
        timeSeconds: secs,
        errors: m.errors,
        mode: mode,
        difficulty: rpDifficultyTag(level),
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final s = _session;
    if (s == null || _phase != RpScreenPhase.playing) return KeyEventResult.ignored;
    final k = e.logicalKey;
    if (k == LogicalKeyboardKey.keyP) {
      s.phase == 'paused' ? _resume() : _hide();
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.keyR) {
      _restart();
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.space || k == LogicalKeyboardKey.keyT) {
      _tap();
      return KeyEventResult.handled;
    }
    final r = s.round;
    if (s.phase != 'response' || r is! PitchPathRound) return KeyEventResult.ignored;
    if (r.task == 'direction' && (k == LogicalKeyboardKey.arrowUp || k == LogicalKeyboardKey.arrowDown)) {
      _apply((c) => c.selectDirection(k == LogicalKeyboardKey.arrowUp ? 'higher' : 'lower', _now()));
      return KeyEventResult.handled;
    }
    const digits = [LogicalKeyboardKey.digit1, LogicalKeyboardKey.digit2, LogicalKeyboardKey.digit3];
    if (r.task == 'sequence' && digits.contains(k)) {
      _apply((c) => c.appendPitchLevel(digits.indexOf(k)));
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  bool get _desktop =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.windows ||
          defaultTargetPlatform == TargetPlatform.linux);

  List<DemoTrial> _demoTrials() => [
    DemoTrial(text: '● ● ○ ●', sub: _s.mode('rhythm-echo'), answer: _s.t('rhythmTap'), rule: _s.t('rhythmRule')),
    DemoTrial(text: '↑', sub: _s.mode('pitch-path'), answer: _s.direction('higher'), rule: _s.t('pitchRule')),
  ];

  @override
  Widget build(BuildContext context) {
    final title = _loaded ? _s.t('title') : '';
    if (!_loaded) {
      return GameShell(
        title: title,
        field: (c, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final s = _session;
    return Focus(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: _onKey,
      child: GameShell(
        title: title,
        onLesson: () => openDemoLesson(context, title: title, trials: _demoTrials()),
        pauseActions: [
          if (_phase == RpScreenPhase.playing)
            PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
        ],
        hud: _phase == RpScreenPhase.playing && s != null
            ? [
                HudItem(
                  label: L.t('level'),
                  value: '$_levelPlayed · ${_s.mode(s.round.mode)}',
                  icon: s.round is RhythmEchoRound ? Icons.graphic_eq : Icons.height,
                ),
              ]
            : const [],
        field: (context, h) => SizedBox(
          height: h,
          child: switch (_phase) {
            RpScreenPhase.config => _config(context),
            RpScreenPhase.playing => _playing(context, s!),
            RpScreenPhase.done => _done(context),
          },
        ),
        toolbar: _toolbar(context),
      ),
    );
  }

  Widget? _toolbar(BuildContext context) {
    final s = _session;
    if (_phase == RpScreenPhase.config) {
      if (_calm || _soundOff) return null;
      return _bar(
        FilledButton(
          key: const Key('rp-start'),
          onPressed: _begin,
          style: FilledButton.styleFrom(backgroundColor: _grad0, foregroundColor: Colors.white),
          child: Text(L.t('start')),
        ),
      );
    }
    if (_phase != RpScreenPhase.playing || s == null) return null;
    if (s.phase == 'calibration') {
      return _bar(_pad(_s.t('calibrationTap'), s.calibrationPlaying, const Key('rp-calibration-tap')));
    }
    if (s.phase == 'response' && s.round is RhythmEchoRound) {
      return _bar(_pad(_s.t('rhythmTap'), true, const Key('rp-tap')));
    }
    return null;
  }

  Widget _bar(Widget child) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
    child: SizedBox(width: double.infinity, child: child),
  );

  /// Мишень для ударов. 🔴 Нажатие ловится на КАСАНИИ (`onPointerDown`), а не на
  /// отпускании: жест «нажатие» ждёт отпускания или 100 мс спора жестов, и эта
  /// задержка уехала бы прямо в ошибку ритма.
  Widget _pad(String label, bool enabled, Key key) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      onTap: enabled ? _tap : null,
      child: Listener(
        key: key,
        behavior: HitTestBehavior.opaque,
        onPointerDown: enabled ? (_) => _tap() : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 60),
          height: 96,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: !enabled ? scheme.surfaceContainerHighest : (_flash ? _grad1 : _grad0),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: enabled ? Colors.white : scheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }

  Widget _card(BuildContext context, List<Widget> children) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < children.length; i += 1) ...[if (i > 0) const SizedBox(height: 10), children[i]],
        ],
      ),
    );
  }

  Widget _config(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [_grad0, _grad1]),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_s.t('skill'), style: const TextStyle(color: Colors.white, fontSize: 14)),
              const SizedBox(height: 4),
              Text(
                '${L.t('level')} $_level',
                key: const Key('rp-level'),
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(_s.t('catalogDesc'), style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Спокойный шаг главнее выключенного тумблера: там нельзя вовсе, здесь — включить звук.
        if (_calm)
          _notice(Icons.nightlight_outlined, _s.t('calmNotice'), key: const Key('rp-calm'))
        else if (_soundOff)
          _notice(
            Icons.volume_off,
            _s.t('soundOffNotice'),
            key: const Key('rp-sound-off'),
            action: OutlinedButton(
              key: const Key('rp-enable-sound'),
              onPressed: () async {
                await widget.state.set('psygames_sound_enabled', 'true');
                if (mounted) setState(() {});
              },
              child: Text(_s.t('enableSound')),
            ),
          ),
        const SizedBox(height: 12),
        Text(_s.t('rulesTitle'), style: theme.textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(_s.t('rulesBody'), style: theme.textTheme.bodyMedium),
        const SizedBox(height: 8),
        Text(_s.t('rhythmRule')),
        const SizedBox(height: 6),
        Text(_s.t('pitchRule')),
        const SizedBox(height: 8),
        Text(
          _s.t('privacy'),
          style: const TextStyle(color: _grad0, fontWeight: FontWeight.w700),
        ),
        if (_desktop) ...[const SizedBox(height: 8), Text(_s.t('keyboardHelp'), style: theme.textTheme.bodySmall)],
      ],
    );
  }

  Widget _notice(IconData icon, String text, {required Key key, Widget? action}) => Container(
    key: key,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      border: Border.all(color: const Color(0xFFF59E0B)),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: const Color(0xFFF59E0B)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (action != null) ...[const SizedBox(height: 10), action],
            ],
          ),
        ),
      ],
    ),
  );

  Widget _centered(Widget child) => Center(
    child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: child),
  );

  Widget _playing(BuildContext context, RpSession s) {
    final theme = Theme.of(context);
    switch (s.phase) {
      case 'unavailable':
        return _centered(
          _card(context, [
            Text(_s.t('unavailableTitle'), style: theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.error)),
            Text(_s.t('unavailableBody'), textAlign: TextAlign.center),
            if ((s.audioError ?? '').isNotEmpty)
              Text(
                s.audioError!,
                key: const Key('rp-audio-error'),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
            FilledButton(key: const Key('rp-retry'), onPressed: _begin, child: Text(_s.t('retry'))),
          ]),
        );
      case 'paused':
        return _centered(
          _card(context, [
            Text(_s.t('pause'), style: theme.textTheme.titleLarge),
            FilledButton(key: const Key('rp-resume'), onPressed: _resume, child: Text(_s.t('resume'))),
            OutlinedButton(key: const Key('rp-restart'), onPressed: _restart, child: Text(_s.t('restart'))),
          ]),
        );
      case 'calibration':
        return _calibration(context, s);
      case 'ready':
        return _centered(
          _card(context, [
            Text(_s.t('readyTitle'), style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            Text(
              _s.mode(s.round.mode),
              style: const TextStyle(color: _grad0, fontWeight: FontWeight.w800),
            ),
            Text(
              s.round is RhythmEchoRound ? _s.t('readyBodyRhythm') : _s.t('readyBodyPitch'),
              textAlign: TextAlign.center,
            ),
            FilledButton(
              key: const Key('rp-play'),
              onPressed: () => _play((c) => c.startPlayback()),
              style: FilledButton.styleFrom(backgroundColor: _grad0, foregroundColor: Colors.white),
              child: Text(_s.t('play')),
            ),
          ]),
        );
      case 'playback':
        return _centered(
          Semantics(
            label: _s.t('listening'),
            liveRegion: true,
            child: _card(context, [
              const Text('◉', style: TextStyle(fontSize: 64, color: _grad0)),
              Text(_s.t('listening'), key: const Key('rp-listening'), style: theme.textTheme.titleLarge),
              Text(_s.t('noVisualAnswer'), textAlign: TextAlign.center),
            ]),
          ),
        );
      case 'response':
        return _response(context, s);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _calibration(BuildContext context, RpSession s) {
    final theme = Theme.of(context);
    final needTaps = !s.calibrationPlaying && s.calibrationExpectedTimes.isNotEmpty && !s.calibrationComplete;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_s.t('calibrationTitle'), style: theme.textTheme.titleLarge),
        const SizedBox(height: 6),
        Text(_s.t('calibrationBody')),
        const SizedBox(height: 12),
        _card(context, [
          Text(
            _s.t('volume', {'value': (s.volume * 100).round()}),
            key: const Key('rp-volume'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          Wrap(
            spacing: 12,
            alignment: WrapAlignment.center,
            children: [
              OutlinedButton(
                key: const Key('rp-quieter'),
                onPressed: s.calibrationPlaying ? null : () => _apply((c) => c.setVolume(c.volume - 0.1)),
                child: Text(_s.t('quieter')),
              ),
              OutlinedButton(
                key: const Key('rp-louder'),
                onPressed: s.calibrationPlaying ? null : () => _apply((c) => c.setVolume(c.volume + 0.1)),
                child: Text(_s.t('louder')),
              ),
            ],
          ),
          if (!s.calibrationPlaying)
            FilledButton(
              key: const Key('rp-play-calibration'),
              onPressed: _runCalibration,
              child: Text(_s.t('playCalibration')),
            )
          else
            Text(
              _s.t('calibrationPlaying'),
              style: const TextStyle(color: _grad0, fontWeight: FontWeight.w800),
            ),
          Text(_s.t('calibrationTapHint'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
          if (s.calibrationComplete) ...[
            Text(_s.t('calibrationReady', {'samples': s.calibrationSamples}), key: const Key('rp-calibration-ready')),
            Text(_s.t('offset', {'value': s.calibrationOffsetMs})),
            FilledButton(
              key: const Key('rp-continue'),
              onPressed: () => _apply((c) => c.continueAfterCalibration()),
              child: Text(_s.t('continue')),
            ),
          ],
          if (needTaps) ...[
            Text(
              _s.t('calibrationNeedTaps'),
              key: const Key('rp-need-taps'),
              style: const TextStyle(color: Color(0xFFF59E0B)),
            ),
            // Выход из круга: без замера упражнение работает, поправка просто ноль.
            OutlinedButton(
              key: const Key('rp-skip-calibration'),
              onPressed: () => _apply((c) => c.skipCalibration()),
              child: Text(_s.t('calibrationSkip')),
            ),
          ],
        ]),
      ],
    );
  }

  Widget _response(BuildContext context, RpSession s) {
    final theme = Theme.of(context);
    final r = s.round;
    final prompt = r is RhythmEchoRound
        ? _s.t('rhythmPrompt')
        : ((r as PitchPathRound).task == 'direction' ? _s.t('pitchDirectionPrompt') : _s.t('pitchSequencePrompt'));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(prompt, style: theme.textTheme.titleLarge),
        const SizedBox(height: 12),
        if (r is RhythmEchoRound)
          _card(context, [
            Text(
              _s.t('tapsProgress', {'current': s.rhythmTaps.length, 'total': r.beatCount}),
              key: const Key('rp-taps'),
            ),
            OutlinedButton(
              key: const Key('rp-submit'),
              onPressed: () => _apply((c) => c.submitRhythm(_now())),
              child: Text(_s.t('submit')),
            ),
          ])
        else if ((r as PitchPathRound).task == 'direction')
          Row(
            children: [
              Expanded(
                child: _choice(
                  '↓',
                  _s.direction('lower'),
                  const Key('rp-lower'),
                  () => _apply((c) => c.selectDirection('lower', _now())),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _choice(
                  '↑',
                  _s.direction('higher'),
                  const Key('rp-higher'),
                  () => _apply((c) => c.selectDirection('higher', _now())),
                ),
              ),
            ],
          )
        else
          _card(context, [
            Row(
              children: [
                for (final (i, l) in const [(0, 'low'), (1, 'mid'), (2, 'high')]) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: _choice(
                      '${i + 1}',
                      _s.level(l),
                      Key('rp-level-$i'),
                      () => _apply((c) => c.appendPitchLevel(i)),
                    ),
                  ),
                ],
              ],
            ),
            Text(
              _s.t('sequenceProgress', {'current': s.pitchSequenceResponse.length, 'total': r.toneCount}),
              key: const Key('rp-sequence'),
            ),
            Wrap(
              spacing: 12,
              alignment: WrapAlignment.center,
              children: [
                OutlinedButton(
                  key: const Key('rp-undo'),
                  onPressed: s.pitchSequenceResponse.isEmpty ? null : () => _apply((c) => c.removeLastPitchLevel()),
                  child: Text(_s.t('undo')),
                ),
                FilledButton(
                  key: const Key('rp-submit'),
                  onPressed: s.pitchSequenceResponse.length != r.toneCount
                      ? null
                      : () => _apply((c) => c.submitPitchSequence(_now())),
                  child: Text(_s.t('submit')),
                ),
              ],
            ),
          ]),
        const SizedBox(height: 12),
        if (r.tutorialReplay)
          OutlinedButton(
            key: const Key('rp-replay'),
            onPressed: () => _play((c) => c.replayTutorial()),
            child: Text(_s.t('replay')),
          )
        else
          Text(_s.t('replayTutorialOnly'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
        if (_desktop) ...[
          const SizedBox(height: 8),
          Text(_s.t('keyboardHelp'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
        ],
      ],
    );
  }

  Widget _choice(String glyph, String label, Key key, VoidCallback onTap) {
    final scheme = Theme.of(context).colorScheme;
    return OutlinedButton(
      key: key,
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 76),
        backgroundColor: scheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            glyph,
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: _grad0),
          ),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _done(BuildContext context) {
    final m = _last;
    if (m == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final sp = m.specific;
    String pct(Object? v) => v is num ? '${(v * 100).round()}%' : '—';
    final lines = <String>[
      '${_s.t('accuracy')}: ${pct(m.accuracy)}',
      if (sp['mode'] == 'rhythm-echo') ...[
        '${_s.t('meanTimingError')}: ${sp['meanTimingErrorMs'] == null ? '—' : jsText(sp['meanTimingErrorMs']!)} ms',
        '${_s.t('missingTaps')}: ${sp['missingTaps']} · ${_s.t('extraTaps')}: ${sp['extraTaps']}',
      ],
      '${_s.t('duration')}: ${(m.durationMs / 1000).toStringAsFixed(1)}s',
    ];
    return _centered(
      Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _passed ? L.t('levelDone').replaceAll('{n}', '$_levelPlayed') : L.t('sameLevelRetry'),
            key: const Key('rp-verdict'),
            style: theme.textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          if (_passed)
            Text(
              '★' * rpStars(m.accuracy) + '☆' * (3 - rpStars(m.accuracy)),
              key: const Key('rp-stars'),
              style: const TextStyle(fontSize: 28, color: Color(0xFFF59E0B)),
            ),
          const SizedBox(height: 8),
          for (final l in lines) Text(l, textAlign: TextAlign.center),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('rp-again'),
            onPressed: _begin,
            style: FilledButton.styleFrom(backgroundColor: _grad0, foregroundColor: Colors.white),
            child: Text(_passed ? L.t('nextNow') : L.t('retry')),
          ),
          TextButton(onPressed: () => setState(() => _phase = RpScreenPhase.config), child: Text(L.t('skip'))),
        ],
      ),
    );
  }
}
