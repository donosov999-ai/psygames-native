import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/module_strings.dart';
import '../../shell/restart_scope.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart' show LevelParams;
import 'series.dart';

/// СЕРИЯ БЛОКОВ «ТАБЛИЦЫ ШУЛЬТЕ» НА FLUTTER — перенос веб-экрана (задача 1b6338c1, 07.10.2026).
///
/// 📍 ПОВОД. Шаг зарядки «серия блоков» (`schulte-blocks`, `/games/schulte?auto=1&series=1`) в
/// приложении молча становился обычной партией: серии в нативе не было вовсе, а перехват
/// откатывался к `/games/schulte` (замер раздела «Слова», 07.10, main 7679684ac).
///
/// Ход как у веба (`frontend/app/games/schulte.tsx`: `beginSeries`, `closeBlock`, `finishSeries`,
/// врезка `INTERLUDE_MS`): три блока по ОДНОМУ полю, часы каждого блока отдельно, между блоками —
/// врезка 2,5 с со сменой правила (её время в замер не входит), в конце — разбор с разностями.
/// Ядро — `series.dart` (перенос `core/blocks.ts`, `core/progress.ts`, `services/series.ts`),
/// текст — словарь модуля `assets/l10n/schulte-series.json` (выгрузчик в `frontend/…/schulte/tools/`).
///
/// 🔴 «ЗАНОВО» ВНУТРИ СЕРИИ НАЧИНАЕТ СЕРИЮ, а не одиночную партию: пункт в паузе свой (каркас тогда
/// своего не добавляет), прерванная серия пишется как есть — без разностей, уровень не двигает.
/// ⚠️ ЧАСЫ — ИГРОВЫЕ (`game_clock.dart`): пауза и разбор не съедают время блока.
const int seriesInterludeMs = 2500;

/// Имя словаря модуля: `assets/l10n/schulte-series.json`.
const String schulteSeriesStrings = 'schulte-series';

class SchulteSeriesScreen extends StatefulWidget {
  const SchulteSeriesScreen({super.key, required this.state, this.random, this.text});

  final SharedState state;

  /// Только для проб: поле по известному ряду.
  final SeriesRandom? random;

  /// Только для проб: словарь без загрузки ассета.
  final ModuleStrings? text;

  @override
  State<SchulteSeriesScreen> createState() => _SchulteSeriesScreenState();
}

enum _Stage { loading, block, interlude, result }

class _SchulteSeriesScreenState extends State<SchulteSeriesScreen> {
  ModuleStrings? _t;
  late final SeriesRandom _random = widget.random ?? math.Random().nextDouble;
  SchulteSeriesProgress _progress = SchulteSeriesProgress.empty;
  int _ladderSize = seriesMinSize;
  _Stage _stage = _Stage.loading;

  SchulteSeriesState? _series;
  SeriesRun? _run;
  bool _blockOpen = false;
  int _blockStart = 0;
  int _elapsedMs = 0;
  GameTimer? _ticker;
  GameTimer? _interlude;

  SeriesRun? _finished;
  SeriesOutcome? _outcome;

  String get _key => SchulteSeriesProgress.keyFor(widget.state.activeProfile);

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final text = widget.text ?? await ModuleStrings.load(schulteSeriesStrings);
    final ladder = LevelLadder(gameId: 'schulte_table', store: SharedLevelStore(widget.state));
    await ladder.load();
    if (!mounted) return;
    _t = text;
    // «Поиск» человек уже растил в одиночной игре — стартовый размер блока берёт и его.
    _ladderSize = LevelParams.of(ladder.level).gridSize;
    _progress = SchulteSeriesProgress.parse(widget.state.get(_key));
    _begin();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _interlude?.cancel();
    // 🔴 УХОД МИМО КНОПОК серию не теряет: сыгранные блоки — время человека. Пишем как при выходе
    // кнопкой — без разностей и без движения уровня (веб: обработчик размонтажа экрана).
    final run = _run;
    if (run != null) {
      final s = _series;
      final partial = _blockOpen && s != null ? recordBlock(run, _record(s, done: false)) : run;
      if (partial.blocks.isNotEmpty) _report(partial);
    }
    super.dispose();
  }

  /// Старт серии. Поле собирается ОДИН раз на все три блока — в этом весь замер.
  void _begin() {
    _ticker?.cancel();
    _interlude?.cancel();
    final entry = seriesEntry(_progress, _ladderSize);
    final field = buildSchulteField(entry.level, _random);
    setState(() {
      _run = startSeries(schulteSeriesGameType, entry.level, schulteSeriesPlan);
      _series = openBlock(field, 0);
      _finished = null;
      _outcome = null;
      _stage = _Stage.block;
    });
    _startClock();
  }

  /// Часы блока. Каждый блок мерится отдельно — из этих времён и берутся разности.
  void _startClock() {
    _ticker?.cancel();
    final start = gameNow();
    _blockStart = start;
    _blockOpen = true;
    _elapsedMs = 0;
    _ticker = gameInterval(const Duration(milliseconds: 100), () {
      if (mounted) setState(() => _elapsedMs = gameNow() - start);
    });
  }

  SeriesBlock _record(SchulteSeriesState s, {required bool done}) =>
      SeriesBlock(key: blockKeyAt(s.blockIndex), timeMs: gameNow() - _blockStart, errors: s.errors, done: done);

  void _tap(int index) {
    final s = _series;
    if (s == null || _stage != _Stage.block || !_blockOpen) return;
    final r = pressSeriesCell(s, index);
    setState(() => _series = r.state);
    if (r.result == SeriesPress.hit && blockDone(r.state)) _closeBlock(r.state, done: true);
  }

  /// Блок доигран (или оборван): дописываем его в прогон и решаем, что дальше.
  void _closeBlock(SchulteSeriesState s, {required bool done}) {
    final run = _run;
    if (run == null || !_blockOpen) return;
    _ticker?.cancel();
    _blockOpen = false;
    final updated = recordBlock(run, _record(s, done: done));
    _run = updated;
    final last = s.blockIndex >= schulteSeriesPlan.length - 1;
    if (done && !last) {
      setState(() => _stage = _Stage.interlude);
      // Врезка сама уводит в следующий блок — по ТОМУ ЖЕ полю. Часы блока стартуют после неё.
      _interlude = gameTimeout(const Duration(milliseconds: seriesInterludeMs), () {
        if (!mounted) return;
        setState(() {
          _series = nextBlock(_series!);
          _stage = _Stage.block;
        });
        _startClock();
      });
      return;
    }
    _finish(updated);
  }

  /// Конец серии: одна сессия с массивом блоков внутри, разности — только у полной.
  void _finish(SeriesRun run) {
    _ticker?.cancel();
    _interlude?.cancel();
    _blockOpen = false;
    final outcome = afterSeriesRun(_progress, run, _ladderSize);
    _progress = outcome.progress;
    widget.state.set(_key, outcome.progress.encode());
    setState(() {
      _outcome = outcome;
      _finished = run;
      _run = null;
      _stage = _Stage.result;
    });
    _report(run);
  }

  void _report(SeriesRun run) {
    final s = seriesSession(run);
    SessionReport.send(
      gameType: s.gameType,
      score: s.score,
      timeSeconds: s.timeSeconds.round(),
      errors: s.errors,
      mode: s.mode,
      difficulty: '${run.level}x${run.level}',
      details: s.details,
    );
  }

  /// Выход из серии посреди неё: блоки пишем как есть, но без разностей — и показываем разбор.
  void _leave() {
    final run = _run;
    if (run == null) return;
    final s = _series;
    if (_blockOpen && s != null) {
      _ticker?.cancel();
      _blockOpen = false;
      _finish(recordBlock(run, _record(s, done: false)));
      return;
    }
    _finish(run);
  }

  /// «Заново» — новая СЕРИЯ. Прерванная пишется как есть (без разностей), уровень не двигается.
  void _restart() {
    final run = _run;
    if (run != null) {
      final s = _series;
      final partial = _blockOpen && s != null ? recordBlock(run, _record(s, done: false)) : run;
      _run = null;
      _blockOpen = false;
      if (partial.blocks.isNotEmpty) _report(partial);
    }
    _begin();
  }

  String _label(ModuleStrings t, String key) =>
      t.t(key == 'order' ? 'blockOrder' : key == 'alternate' ? 'blockAlternate' : 'blockSum');

  String _rule(ModuleStrings t, String key, int total) => t.fill(
        key == 'order' ? 'ruleOrder' : key == 'alternate' ? 'ruleAlternate' : 'ruleSum',
        {'last': total, 'sum': pairSum(total)},
      );

  @override
  Widget build(BuildContext context) {
    final t = _t;
    final s = _series;
    if (t == null || s == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final key = blockKeyAt(s.blockIndex);
    final total = s.field.cells.length;
    final playing = _stage == _Stage.block || _stage == _Stage.interlude;
    return GameShell(
      title: L.t('schulteTable'),
      hud: [
        if (playing) ...[
          HudItem(
            label: key == 'sum' ? L.t('label_find_sum') : L.t('find'),
            value: '${blockTarget(s)}',
            icon: Icons.my_location,
          ),
          HudItem(
            label: L.t('time'),
            value: '${(_elapsedMs / 1000).toStringAsFixed(1)} ${L.t('secShort')}',
            icon: Icons.timer_outlined,
          ),
          HudItem(label: L.t('errors'), value: '${s.errors}', icon: Icons.close),
        ],
      ],
      pauseActions: [
        if (playing) ...[
          PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
          PauseAction(label: L.t('exitConfirmLeave'), icon: Icons.flag_outlined, onPressed: _leave),
        ],
      ],
      field: (context, h) => switch (_stage) {
        _Stage.block => _BlockField(
            series: s,
            line: '${t.fill('blockOf', {'n': s.blockIndex + 1, 'total': schulteSeriesPlan.length})} · ${_label(t, key)}',
            rule: _rule(t, key, total),
            height: h,
            onTap: _tap,
          ),
        _Stage.interlude => _Interlude(
            title: t.t('ruleChanges'),
            block: _label(t, blockKeyAt(s.blockIndex + 1)),
            rule: _rule(t, blockKeyAt(s.blockIndex + 1), total),
            same: t.t('sameField'),
          ),
        _Stage.result => _Result(t: t, run: _finished!, outcome: _outcome!, label: (k) => _label(t, k)),
        _Stage.loading => const SizedBox.shrink(),
      },
      toolbar: _stage == _Stage.result
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(alignment: WrapAlignment.center, spacing: 12, runSpacing: 8, children: [
                FilledButton.icon(
                  key: const Key('series-again'),
                  onPressed: _begin,
                  icon: const Icon(Icons.refresh),
                  label: Text(t.t('again')),
                ),
                OutlinedButton(
                  key: const Key('series-leave'),
                  onPressed: () => Navigator.of(context).maybePop(),
                  child: Text(t.t('leave')),
                ),
              ]),
            )
          : null,
    );
  }
}

/// Поле блока: строка «Блок n из 3 · правило», подсказка правила и сетка ТОГО ЖЕ поля.
class _BlockField extends StatelessWidget {
  const _BlockField({
    required this.series,
    required this.line,
    required this.rule,
    required this.height,
    required this.onTap,
  });

  final SchulteSeriesState series;
  final String line, rule;
  final double height;
  final void Function(int index) onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final side = series.field.size;
    return LayoutBuilder(builder: (context, c) {
      const gap = 4.0;
      const header = 64.0;
      final board = math.max(0.0, math.min(c.maxWidth - 16, height - header));
      final cell = math.max(0.0, (board - gap * (side - 1)) / side);
      return Column(children: [
        Text(line, key: const Key('series-block'), style: text.bodySmall, textAlign: TextAlign.center),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(rule, key: const Key('series-rule'), style: text.bodyMedium, textAlign: TextAlign.center),
        ),
        Expanded(
          child: Center(
            child: SizedBox(
              key: const Key('series-board'),
              width: cell * side + gap * (side - 1),
              child: Wrap(spacing: gap, runSpacing: gap, children: [
                for (var i = 0; i < series.field.cells.length; i += 1)
                  _Cell(
                    key: Key('series-cell$i'),
                    value: series.field.cells[i],
                    size: cell,
                    taken: series.taken[i],
                    // Первая клетка пары подсвечена: без этого человек не видит, что уже выбрал.
                    pending: series.pending == i,
                    onTap: () => onTap(i),
                    scheme: scheme,
                  ),
              ]),
            ),
          ),
        ),
      ]);
    });
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    super.key,
    required this.value,
    required this.size,
    required this.taken,
    required this.pending,
    required this.onTap,
    required this.scheme,
  });

  final int value;
  final double size;
  final bool taken, pending;
  final VoidCallback onTap;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: taken ? 0.3 : 1,
        child: Material(
          color: pending ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: taken ? null : onTap,
            child: SizedBox(
              width: size,
              height: size,
              child: Center(
                child: Text(
                  '$value',
                  style: TextStyle(
                    fontSize: size * 0.4,
                    fontWeight: FontWeight.w600,
                    color: pending ? scheme.onPrimary : scheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

/// Врезка между блоками: назвать новое правило и главное — поле НЕ менялось.
class _Interlude extends StatelessWidget {
  const _Interlude({required this.title, required this.block, required this.rule, required this.same});
  final String title, block, rule, same;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      key: const Key('series-interlude'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.swap_horiz, size: 44, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 8),
          Text(title, style: text.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(block, style: text.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(rule, style: text.bodyMedium, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          Text(same, style: text.bodySmall, textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

/// Разбор серии: главное — две разности, T₂ − T₁ и T₃ − T₁. У неполной их нет вовсе.
class _Result extends StatelessWidget {
  const _Result({required this.t, required this.run, required this.outcome, required this.label});
  final ModuleStrings t;
  final SeriesRun run;
  final SeriesOutcome outcome;
  final String Function(String key) label;

  String _seconds(int ms) => '${(ms / 1000).toStringAsFixed(1)} ${L.t('seconds')}';
  String _signed(int ms) => '${ms > 0 ? '+' : ''}${_seconds(ms)}';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final diffs = seriesDiffs(run);
    final base = schulteSeriesPlan.first;
    return SingleChildScrollView(
      key: const Key('series-result'),
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        Icon(Icons.layers_outlined, size: 44, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 8),
        Text(t.t('seriesDone'), style: text.titleLarge, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        if (diffs == null)
          Text(t.t('notFinished'),
              key: const Key('series-not-finished'),
              style: text.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.error),
              textAlign: TextAlign.center)
        else
          Column(key: const Key('series-diffs'), children: [
            Text('${t.t('speed')}: ${_seconds(run.blocks.first.timeMs)}', style: text.bodyLarge),
            Text('${t.t('switchCost')}: ${_signed(diffs['${schulteSeriesPlan[1]}_minus_$base']!)}', style: text.bodyLarge),
            Text('${t.t('holdCost')}: ${_signed(diffs['${schulteSeriesPlan[2]}_minus_$base']!)}', style: text.bodyLarge),
          ]),
        const SizedBox(height: 12),
        Text(
          outcome.raised
              ? t.fill('levelUp', {'size': outcome.nextLevel})
              : t.fill('heldBy', {'block': label(outcome.weakest), 'runs': math.max(1, outcome.runsLeft)}),
          key: const Key('series-outcome'),
          style: text.bodyMedium,
          textAlign: TextAlign.center,
        ),
      ]),
    );
  }
}

/// ДВЕРЬ СЕРИИ на экране «до партии» обычной таблицы (веб: кнопка под «Начать», `schulte.tsx:888`).
/// Под кнопкой — с какого поля начнётся серия и какие поля у блоков сейчас: иначе старт с минимума
/// читается как откат. Открывает экран серии в [RestartScope] — «Заново» каркаса работает и там.
class SchulteSeriesDoor extends StatefulWidget {
  const SchulteSeriesDoor({super.key, required this.state, required this.ladderSize, this.text});
  final SharedState state;
  final int ladderSize;

  /// Только для проб: словарь без загрузки ассета.
  final ModuleStrings? text;

  @override
  State<SchulteSeriesDoor> createState() => _SchulteSeriesDoorState();
}

class _SchulteSeriesDoorState extends State<SchulteSeriesDoor> {
  ModuleStrings? _t;

  @override
  void initState() {
    super.initState();
    final given = widget.text;
    if (given != null) {
      _t = given;
    } else {
      ModuleStrings.load(schulteSeriesStrings).then((t) {
        if (mounted) setState(() => _t = t);
      });
    }
  }

  Future<void> _open() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => RestartScope(builder: (_) => SchulteSeriesScreen(state: widget.state, text: widget.text)),
    ));
    // Серия могла поднять поле — подпись под кнопкой обязана это показать.
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final t = _t;
    if (t == null) return const SizedBox.shrink();
    final progress = SchulteSeriesProgress.parse(widget.state.get(SchulteSeriesProgress.keyFor(widget.state.activeProfile)));
    final entry = seriesEntry(progress, widget.ladderSize);
    String grid(int n) => '$n×$n';
    final text = Theme.of(context).textTheme;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      OutlinedButton.icon(
        key: const Key('schulte-series-door'),
        onPressed: _open,
        icon: const Icon(Icons.layers_outlined),
        label: Text(t.t('entry')),
      ),
      const SizedBox(height: 4),
      Text(t.fill('startsAt', {'size': entry.level}), style: text.bodySmall, textAlign: TextAlign.center),
      Text(
        t.fill('yourLevels', {
          'order': grid(entry.perBlock['order']!),
          'alternate': grid(entry.perBlock['alternate']!),
          'sum': grid(entry.perBlock['sum']!),
        }),
        style: text.bodySmall,
        textAlign: TextAlign.center,
      ),
    ]);
  }
}
