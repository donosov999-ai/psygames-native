import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Собери сумму» на общем каркасе: сетка чисел, сверху цель.
///
/// 🔴 ЗАЧЁТ ИДЁТ ПО СУММЕ, А НЕ ПО ЗАДУМАННЫМ КЛЕТКАМ. Цель строится сложением
/// двух (или трёх) клеток, но принимается ЛЮБОЙ набор с нужной суммой — иначе
/// игрок, нашедший другую верную пару, получил бы «неверно» за правильный ответ.
///
/// 🔴 ПЕРЕБОР — ОШИБКА С ЗАДЕРЖКОЙ СБРОСА (300 мс), а не мгновенная очистка:
/// в вебе на этом обожглись — нажатие, попавшее в окно сброса, терялось.
class CounterScreen extends StatefulWidget {
  const CounterScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<CounterScreen> createState() => _CounterScreenState();
}

enum _Phase { playing, success, timeout, result }

class _CounterScreenState extends State<CounterScreen> {
  /// Задержки веб-версии: успех показывается дольше промаха.
  static const _successDelay = Duration(milliseconds: 800);
  static const _timeoutDelay = Duration(milliseconds: 700);
  static const _resetDelay = Duration(milliseconds: 300);
  static const _tickMs = 100;

  late LevelLadder _ladder;
  late Rng _rng;
  late CounterCfg _cfg;

  List<int> _numbers = const [];
  final Set<int> _picked = {};
  int _target = 0;
  int _round = 1;
  int _hits = 0;
  int _errors = 0;
  int _timeouts = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.playing;
  int _leftMs = 0;
  Timer? _tick;
  Timer? _next;
  Timer? _clear;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(
      gameId: 'counter',
      store: SharedLevelStore(widget.state),
      maxLevel: 999,
    );
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    _clear?.cancel();
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

  void _reset() {
    _tick?.cancel();
    _next?.cancel();
    _clear?.cancel();
    _cfg = counterLevelParams(_ladder.level);
    _round = 1;
    _hits = 0;
    _errors = 0;
    _timeouts = 0;
    _won = false;
    _phase = _Phase.playing;
    _beginRound();
  }

  void _beginRound() {
    _tick?.cancel();
    _clear?.cancel();
    _picked.clear();
    final deal = makeCounterRound(
      _cfg.gridSize,
      _cfg.cellMax,
      _cfg.tripleShare,
      _rng,
    );
    _numbers = deal.numbers;
    _target = deal.target;
    _leftMs = _cfg.roundLimitMs;
    // Окно раунда: не собрал сумму до нуля — раунд провален, как в вебе.
    _tick = Timer.periodic(const Duration(milliseconds: _tickMs), (_) {
      if (!mounted) return;
      setState(() => _leftMs = math.max(0, _leftMs - _tickMs));
      if (_leftMs <= 0) _onTimeout();
    });
  }

  int get _sum => _picked.fold(0, (s, i) => s + _numbers[i]);

  void _tap(int index) {
    if (_phase != _Phase.playing) return;
    setState(() {
      if (!_picked.remove(index)) _picked.add(index);
    });
    if (_sum == _target) {
      _hit();
    } else if (_sum > _target) {
      _overshoot();
    }
  }

  void _hit() {
    _tick?.cancel();
    setState(() {
      _hits += 1;
      _phase = _Phase.success;
    });
    _next?.cancel();
    _next = Timer(_successDelay, _advance);
  }

  /// Перебор: ошибка сразу, а выбор гаснет через 300 мс — нажатие, попавшее в
  /// это окно, обязано сработать (правило веб-версии).
  void _overshoot() {
    setState(() => _errors += 1);
    _clear?.cancel();
    _clear = Timer(_resetDelay, () {
      if (!mounted) return;
      setState(_picked.clear);
    });
  }

  void _onTimeout() {
    _tick?.cancel();
    setState(() {
      _timeouts += 1;
      _errors += 1;
      _phase = _Phase.timeout;
    });
    _next?.cancel();
    _next = Timer(_timeoutDelay, _advance);
  }

  Future<void> _advance() async {
    if (!mounted) return;
    if (_round >= _cfg.rounds) {
      final passed = _hits / _cfg.rounds >= counterPassAccuracy;
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
      return;
    }
    setState(() {
      _round += 1;
      _phase = _Phase.playing;
      _beginRound();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('counter'),
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
          label: L.t('round'),
          value: '$_round/${_cfg.rounds}',
          icon: Icons.repeat,
        ),
        HudItem(
          label: L.t('timeLeftLabel'),
          value: '${(_leftMs / 1000).ceil()}${L.t('secShort')}',
          icon: Icons.timer_outlined,
        ),
        HudItem(
          label: L.t('hud_correct'),
          value: '$_hits',
          icon: Icons.check_circle_outline,
        ),
        HudItem(
          label: L.t('errors'),
          value: '$_errors',
          icon: Icons.error_outline,
        ),
      ],
      field: (context, h) => _Field(
        numbers: _numbers,
        picked: _picked,
        gridSize: _cfg.gridSize,
        target: _target,
        sum: _sum,
        phase: _phase,
        height: h,
        onTap: _tap,
      ),
      auxRow: AuxBar(
        children: [
          AuxAction(
            icon: Icons.backspace_outlined,
            label: L.t('a11yErase'),
            onPressed: _phase == _Phase.playing && _picked.isNotEmpty
                ? () => setState(_picked.clear)
                : null,
          ),
          AuxAction(
            icon: Icons.refresh,
            label: L.t('restart'),
            onPressed: () => setState(_reset),
          ),
        ],
      ),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(
          label: L.t('restart'),
          icon: Icons.refresh,
          onPressed: () => setState(_reset),
        ),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.result) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              // Просрочки показываются отдельно от переборов: это разные промахи —
              // «не успел искать» и «сложил лишнего», и лечатся они по-разному.
              '$_hits/${_cfg.rounds} · ${L.t('errors')} $_errors · ${L.t('hud_missed')} $_timeouts',
              key: const Key('result'),
              textAlign: TextAlign.center,
              style: text.titleMedium,
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('next'),
              onPressed: () => setState(_reset),
              icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
              label: Text(_won ? L.t('nextLabel') : L.t('retry')),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        L.t('counterHint'),
        key: const Key('hint'),
        textAlign: TextAlign.center,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: text.bodySmall,
      ),
    );
  }
}

/// Поле: цель, набранная сумма и сетка. Размер клетки считает `counterCellSize`
/// от высоты, которую отдал каркас, — та же формула, что в вебе.
class _Field extends StatelessWidget {
  const _Field({
    required this.numbers,
    required this.picked,
    required this.gridSize,
    required this.target,
    required this.sum,
    required this.phase,
    required this.height,
    required this.onTap,
  });

  final List<int> numbers;
  final Set<int> picked;
  final int gridSize;
  final int target;
  final int sum;
  final _Phase phase;
  final double height;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 ШАПКА ПОЛЯ СЧИТАЕТСЯ ИЗ МЕСТА, А НЕ УГАДЫВАЕТСЯ. Цель и набранная
        // сумма стоят НАД сеткой, поэтому их высота вычитается из того, что
        // досталось сетке: иначе нижний ряд уезжает под ряд значков (тот самый
        // дефект, из-за которого в вебе 16.09.2026 три клетки стали ненажимаемыми).
        const headH = 64.0;
        // ⚠️ У СТРОКИ ОТКЛИКА («ВЕРНО!» / «Время вышло») ТОЖЕ ДОЛЖЕН БЫТЬ БЮДЖЕТ.
        // Без него строка появлялась поверх сверстанного и роняла колонку на 4 px
        // ровно в момент ответа — то есть каждый второй кадр партии. Место под неё
        // держится всегда, поэтому сетка не дёргается, когда отклик приходит.
        const footH = 22.0;
        final place = math.max(60.0, height - headH - footH);
        final cell = counterCellSize(
          gridSize: gridSize,
          width: c.maxWidth,
          height: height,
          placeW: c.maxWidth,
          placeH: place,
        );
        final board = cell * gridSize + (gridSize - 1) * 8;
        return Column(
          children: [
            SizedBox(
              height: headH,
              // Шапка ужимается в свой бюджет: на другом языке или при крупном шрифте
              // системы строки выше, и без этого колонка роняла кадр на несколько
              // точек — ровно тем же переполнением, что ловила проба.
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(L.t('label_find_sum'), style: text.labelSmall),
                    Text(
                      '$target',
                      key: const Key('target'),
                      style: text.headlineSmall,
                    ),
                    Text(
                      '${L.t('label_your_sum')} $sum',
                      key: const Key('sum'),
                      style: text.bodyMedium?.copyWith(
                        color: phase == _Phase.success
                            ? scheme.primary
                            : scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              // ⚠️ У КЛЕТКИ ЕСТЬ ПОЛ 28 px (порог нажатия), и на тесном экране сетка
              // 9×9 в поле физически не помещается. Тогда поле ПРОКРУЧИВАЕТСЯ: лучше
              // домотать, чем иметь клетки, по которым нельзя попасть. Когда доска
              // влезает, прокрутки нет — список короче окна.
              child: SingleChildScrollView(
                child: Center(
                  child: SizedBox(
                    width: board,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (var i = 0; i < numbers.length; i += 1)
                          _Cell(
                            key: Key('cell$i'),
                            value: numbers[i],
                            size: cell,
                            selected: picked.contains(i),
                            onTap: () => onTap(i),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SizedBox(
              height: footH,
              child: phase == _Phase.success || phase == _Phase.timeout
                  ? Center(
                      child: Text(
                        phase == _Phase.success
                            ? L.t('label_correct_excl')
                            : L.t('timeIsUp'),
                        key: const Key('feedback'),
                        style: text.titleSmall?.copyWith(
                          color: phase == _Phase.success
                              ? scheme.primary
                              : scheme.error,
                        ),
                      ),
                    )
                  : null,
            ),
          ],
        );
      },
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    super.key,
    required this.value,
    required this.size,
    required this.selected,
    required this.onTap,
  });

  final int value;
  final double size;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected
              ? scheme.primaryContainer
              : scheme.surfaceContainerHighest,
          border: Border.all(
            color: selected ? scheme.primary : scheme.outlineVariant,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: FittedBox(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              '$value',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected ? scheme.onPrimaryContainer : scheme.onSurface,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
