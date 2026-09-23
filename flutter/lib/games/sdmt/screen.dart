import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «SDMT: символ→цифра» на общем каркасе: легенда сверху, значок посередине,
/// цифры внизу. Меряется скорость обработки, поэтому легенда ВИДНА всё время —
/// прятать её значило бы мерить память.
///
/// 🔴 РАСКЛАДКА ПЕРЕНЕСЕНА ПРАВИЛОМ (`sdmtLayout`): пад цифр когда-то ложился в
/// ПЯТЬ рядов вместо трёх и прятал легенду под шапку. Полоса ответа отступает по
/// 66 точек с ОБЕИХ сторон — это и есть причина, а не округление.
class SdmtScreen extends StatefulWidget {
  const SdmtScreen({super.key, required this.state, this.rnd, this.seconds});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  /// Только для проб: укорачивает раунд.
  final int? seconds;

  @override
  State<SdmtScreen> createState() => _SdmtScreenState();
}

enum _Phase { ready, playing, result }

/// Значки берутся по силуэту, а не по красоте: огонь и каплю на 22 точках
/// путали, поэтому вместо огня — месяц.
const Map<String, IconData> _icons = {
  'star': Icons.star,
  'heart': Icons.favorite,
  'leaf': Icons.eco,
  'flash': Icons.bolt,
  'cloud': Icons.cloud,
  'flower': Icons.local_florist,
  'snow': Icons.ac_unit,
  'water': Icons.water_drop,
  'moon': Icons.nightlight_round,
};

class _SdmtScreenState extends State<SdmtScreen> {
  late LevelLadder _ladder;
  late Rng _rng;
  late SdmtParams _params;

  List<KeyMap> _keymap = const [];
  String _stim = '';
  int _hits = 0;
  int _errors = 0;
  double _left = 0;
  int _elapsedMs = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.ready;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(
      gameId: 'sdmt',
      store: SharedLevelStore(widget.state),
      maxLevel: 999,
    );
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  int get _duration => widget.seconds ?? _params.durationSec;

  void _reset() {
    _tick?.cancel();
    _params = levelParams(_ladder.level);
    // Легенда перемешивается на КАЖДУЮ партию: заученная превращает пробу
    // скорости обработки в замер моторики.
    _keymap = buildKeymap(_params.symbolCount, _rng);
    _stim = _keymap[(_rng() * _keymap.length).floor()].sym;
    _hits = 0;
    _errors = 0;
    _elapsedMs = 0;
    _left = _duration.toDouble();
    _won = false;
    _phase = _Phase.ready;
  }

  void _start() {
    setState(() => _phase = _Phase.playing);
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      _elapsedMs += 100;
      setState(() => _left = math.max(0, _duration - _elapsedMs / 1000));
      if (_left <= 0) _finish();
    });
  }

  void _press(int digit) {
    if (_phase != _Phase.playing) return;
    final entry = _keymap.firstWhere((k) => k.sym == _stim);
    setState(() {
      if (entry.digit == digit) {
        _hits += 1;
      } else {
        _errors += 1;
      }
      _stim = _keymap[(_rng() * _keymap.length).floor()].sym;
    });
  }

  Future<void> _finish() async {
    _tick?.cancel();
    final total = _hits + _errors;
    final accuracy = total > 0 ? _hits / total : 0.0;
    final passed =
        _hits >= _params.targetHits && accuracy >= sdmtAccuracyToPass;
    if (passed) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (!mounted) return;
    setState(() {
      _won = passed;
      _phase = _Phase.result;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final size = MediaQuery.sizeOf(context);
    final layout = sdmtLayout(size.width, size.height);
    return GameShell(
      title: L.t('sdmt'),
      hud: [
        HudItem(
          label: L.t('level'),
          value: '${_ladder.level}',
          icon: Icons.flag_outlined,
        ),
        HudItem(
          label: L.t('personalBest'),
          value: '${_ladder.best}',
          icon: Icons.emoji_events_outlined,
        ),
        HudItem(
          label: L.t('time'),
          value: '${_left.ceil()}',
          icon: Icons.timer_outlined,
        ),
        HudItem(
          label: L.t('hud_correct'),
          value: '$_hits/${_params.targetHits}',
          icon: Icons.check_circle_outline,
        ),
        HudItem(label: L.t('hud_errors'), value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) => _Field(
        keymap: _keymap,
        stim: _stim,
        layout: layout,
        playing: _phase == _Phase.playing,
        height: h,
      ),
      auxRow: AuxBar(
        children: [
          AuxAction(
            icon: Icons.refresh,
            label: L.t('restart'),
            onPressed: () => setState(_reset),
          ),
        ],
      ),
      toolbar: _toolbar(context, layout),
      pauseActions: [
        PauseAction(
          label: L.t('restart'),
          icon: Icons.refresh,
          onPressed: () => setState(_reset),
        ),
      ],
    );
  }

  Widget _toolbar(BuildContext context, SdmtLayout layout) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.ready) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$_duration · ${L.t('sdmtDesc')}',
              style: text.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('начать'),
              onPressed: _start,
              icon: const Icon(Icons.play_arrow),
              label: Text(L.t('start')),
            ),
          ],
        ),
      );
    }
    if (_phase == _Phase.result) {
      final total = _hits + _errors;
      final accuracy = total > 0 ? (_hits / total * 100).round() : 0;
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _won
                  ? '${L.t('nextLabel')} · $_hits/${_params.targetHits} · $accuracy%'
                  : '${L.t('retry')} · $_hits/${_params.targetHits} · $accuracy% < ${(sdmtAccuracyToPass * 100).round()}%',
              key: const Key('итог'),
              textAlign: TextAlign.center,
              style: text.titleMedium,
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('дальше'),
              onPressed: () => setState(_reset),
              icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
              label: Text(_won ? L.t('nextLabel') : L.t('retry')),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      // ⚠️ CENTER ОБЯЗАТЕЛЕН. Каркас отдаёт полосе ЖЁСТКУЮ ширину, и SizedBox внутри
      // неё её не сужает — пад получал всю полосу и укладывал ЧЕТЫРЕ клавиши в ряд
      // вместо трёх. Поймано пробой раскладки; ровно этот же дефект чинили в вебе.
      child: Center(
        child: SizedBox(
          key: const Key('пад'),
          width: layout.pad * 3 + 16 + 2,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final d in [1, 2, 3, 4, 5, 6, 7, 8, 9])
                SizedBox(
                  width: layout.pad,
                  height: layout.pad,
                  child: FilledButton(
                    key: Key('цифра$d'),
                    style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                    onPressed: () => _press(d),
                    child: Text(
                      '$d',
                      style: TextStyle(fontSize: layout.pad * 0.38),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Поле: легенда во всю ширину и крупный значок-стимул под ней.
class _Field extends StatelessWidget {
  const _Field({
    required this.keymap,
    required this.stim,
    required this.layout,
    required this.playing,
    required this.height,
  });

  final List<KeyMap> keymap;
  final String stim;
  final SdmtLayout layout;
  final bool playing;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Легенда ВИДНА всё время: прятать её — мерить память, а не скорость.
          Container(
            key: const Key('легенда'),
            width: layout.fieldW,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                for (var i = 0; i < keymap.length; i += 1)
                  Expanded(
                    child: Container(
                      key: Key('легенда$i'),
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(
                        border: Border(
                          right: BorderSide(color: scheme.outlineVariant),
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _icons[keymap[i].sym],
                            size: math.min(layout.fieldW / 18, 22),
                          ),
                          Text(
                            '${keymap[i].digit}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(height: math.min(24, height * 0.08)),
          Container(
            key: const Key('стимул'),
            width: layout.stim,
            height: layout.stim,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: scheme.primary, width: 2),
            ),
            child: Icon(
              _icons[stim],
              size: layout.stim * 0.55,
              color: scheme.primary,
            ),
          ),
          if (!playing) ...[
            const SizedBox(height: 8),
            Text(
              L.t('sdmtDesc'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}
