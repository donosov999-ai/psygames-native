import 'dart:async';
import 'dart:math' as math;

// ⚠️ У каркаса Flutter свой `Axis` (горизонталь/вертикаль), у геометрии — свой (X, Y, Z).
// Чужой прячется и берётся по имени: молчаливое совпадение имён здесь стоило бы часа.
import 'package:flutter/material.dart' hide Axis;
import 'package:flutter/material.dart' as ui show Axis;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'formation.dart';
import 'geometry.dart';
import 'memory.dart';
import 'net.dart';
import 'oblique.dart';
import 'painters.dart';
import 'pieces.dart';
import 'projection.dart';
import 'replay.dart';
import 'rng.dart';
import 'rotation.dart';
import 'same.dart';
import 'section.dart';
import 'session.dart';
import 'surface.dart';
import 'task.dart';
import 'viewpoint.dart';
import 'words.dart';

/// «МЫСЛЕННОЕ ВРАЩЕНИЕ» — экран на общем каркасе.
///
/// Одиннадцать видов заданий на одном поле: у каждого свой рисунок эталона и свои варианты, но
/// порядок экрана один — вопрос, эталон, ряд вариантов внизу, служебные значки под полем.
///
/// 🔴 ПОЛЕ БЕРЁТ ВЫСОТУ У КАРКАСА ЧИСЛОМ. Размер эталона и вариантов считается от неё, а не от
/// окна: окно не знает про шапку, счётчики, ряд значков и липкий низ. В веб-версии на этом
/// обожглись дважды — рисунок вылезал за экран, а ряд вариантов уходил под кнопки.
///
/// 🔴 РАЗБОР ПОСЛЕ ПРОМАХА — ЧАСТЬ УПРАЖНЕНИЯ, А НЕ УКРАШЕНИЕ. Эталон поворачивается шаг за шагом
/// к правильному ответу: человек, ошибившийся с поворотом, иначе уходит, не узнав ПОЧЕМУ.
enum Phase { config, playing, result }

/// Случайность живой игры. Проба подставляет свою, семенную: иначе верный ответ ей неизвестен,
/// и она может проверить только то, что экран сам про себя говорит.
final math.Random _systemRandom = math.Random();
double systemRng() => _systemRandom.nextDouble();

class MentalRotationScreen extends StatefulWidget {
  const MentalRotationScreen({super.key, required this.state, this.rng = systemRng});

  final SharedState state;

  /// Источник случайности: партия строится ИМ и только им, в порядке «план партии → задание
  /// каждого раунда». Проба повторяет тот же порядок и знает верный ответ заранее.
  final Rng rng;

  @override
  State<MentalRotationScreen> createState() => _MentalRotationScreenState();
}

class _MentalRotationScreenState extends State<MentalRotationScreen> {
  late LevelLadder _ladder;
  bool _ready = false;

  Phase _phase = Phase.config;
  int _trials = 10;

  /// Отработка одного вида; `null` — вперемешку, как в обычной партии.
  TaskKind? _chosenKind;
  TaskKind? _practice;
  bool _kindListOpen = false;

  List<TaskKind> _plan = const [];
  int _level = 1;
  int _round = 0;
  MentalRotationTask? _task;
  final List<TrialRecord> _records = [];
  ({int idx, bool ok})? _feedback;
  int _reviewStep = 0;
  bool _memoryHidden = false;
  bool _passed = false;

  Timer? _tick;
  Timer? _expose;
  Timer? _advance;
  Timer? _replay;
  int _runStartMs = 0;
  int _trialStartMs = 0;
  double _elapsed = 0;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(
      gameId: 'mental_rotation',
      store: SharedLevelStore(widget.state),
      maxLevel: 50,
    );
    _boot();
  }

  @override
  void dispose() {
    // ⚠️ Четыре таймера обязаны умереть вместе с экраном: показ «Памяти», секундомер, переход к
    // следующей пробе и прокрутка разбора. Любой из них, оставшись, дёргает setState на трупе.
    _tick?.cancel();
    _expose?.cancel();
    _advance?.cancel();
    _replay?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() => _ready = true);
  }

  // ─── партия ─────────────────────────────────────────────────────────────

  bool get _studying =>
      _phase == Phase.playing && _task is MemoryTask && !_memoryHidden && _feedback == null;

  /// Разбор показывается ПОСЛЕ ПРОМАХА: верный ответ объяснять нечего, а лишняя задержка ломает
  /// темп партии и портит замер времени.
  bool get _reviewing => _feedback != null && !_feedback!.ok;

  RotationTask? get _rotationOf {
    final t = _task;
    if (t is RotationTask) return t;
    if (t is MemoryTask) return t.rotation;
    return null;
  }

  List<ReplayFrame> get _frames {
    final r = _rotationOf;
    return r == null ? const [] : rotationReplay(r);
  }

  void _startRun() {
    final practice = _chosenKind;
    final level = practice != null ? practiceLevel(practice, _ladder.level) : _ladder.level;
    setState(() {
      _practice = practice;
      _level = level;
      _plan = practice != null
          ? planPractice(practice, _trials)
          : planTaskKinds(level, _trials, widget.rng);
      _records.clear();
      _round = 0;
      _phase = Phase.playing;
      _elapsed = 0;
    });
    _runStartMs = DateTime.now().millisecondsSinceEpoch;
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      setState(() => _elapsed = (DateTime.now().millisecondsSinceEpoch - _runStartMs) / 1000);
    });
    _nextTrial();
  }

  void _nextTrial() {
    _advance?.cancel();
    _replay?.cancel();
    if (_records.length >= _trials) {
      _finish();
      return;
    }
    final kind = _plan.length > _records.length ? _plan[_records.length] : TaskKind.rotation;
    final task = buildTask(kind, _level, widget.rng);
    setState(() {
      _task = task;
      _round = _records.length + 1;
      _feedback = null;
      _reviewStep = 0;
      _memoryHidden = task is! MemoryTask;
    });
    _trialStartMs = DateTime.now().millisecondsSinceEpoch;
    if (task is MemoryTask) {
      _expose?.cancel();
      _expose = Timer(Duration(milliseconds: task.exposureMs), () {
        if (!mounted) return;
        setState(() => _memoryHidden = true);
        // Время ответа считается с появления вариантов, а не с показа фигуры.
        _trialStartMs = DateTime.now().millisecondsSinceEpoch;
      });
    }
  }

  /// Угол пробы. У проекции, развёртки и прочих его нет — 0, и в регрессию они не попадают.
  int _angleOf(MentalRotationTask task) => switch (task) {
    RotationTask t => t.angleSum,
    MemoryTask t => t.rotation.angleSum,
    _ => 0,
  };

  void _pick(int idx) {
    final task = _task;
    if (task == null || _feedback != null || _studying) return;
    final ok = _optionIsMatch(task, idx);
    _records.add(
      TrialRecord(
        kind: task.kind,
        angle: _angleOf(task),
        rt: DateTime.now().millisecondsSinceEpoch - _trialStartMs,
        correct: ok,
      ),
    );
    setState(() => _feedback = (idx: idx, ok: ok));
    if (ok) {
      _advance = Timer(const Duration(milliseconds: 650), () {
        if (mounted) _nextTrial();
      });
      return;
    }
    // Промах: разбор крутится сам, шаг крупный — поворот надо успеть увидеть, а не проводить
    // глазами смазанное движение.
    if (_frames.length > 1) {
      _replay = Timer.periodic(const Duration(milliseconds: 850), (t) {
        if (!mounted) return;
        if (_reviewStep + 1 >= _frames.length) {
          t.cancel();
          return;
        }
        setState(() => _reviewStep += 1);
      });
    }
  }

  Future<void> _finish() async {
    _tick?.cancel();
    final hits = _records.where((r) => r.correct).length;
    final passed = hits / _trials >= 0.7;
    setState(() {
      _phase = Phase.result;
      _passed = passed;
      _elapsed = (DateTime.now().millisecondsSinceEpoch - _runStartMs) / 1000;
    });
    // ⚠️ Отработка одного вида уровень НЕ двигает: доля поворотных проб — правило смеси, у
    // отработки её нет, и «Проекция» ×10 не сравнивается со смесью того же уровня.
    if (_practice != null) return;
    if (passed) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (mounted) setState(() {});
  }

  bool _optionIsMatch(MentalRotationTask task, int i) => switch (task) {
    RotationTask t => t.options[i].isMatch,
    MemoryTask t => t.rotation.options[i].isMatch,
    ProjectionTask t => t.options[i].isMatch,
    NetTask t => t.options[i].isMatch,
    ViewpointTask t => t.options[i].isMatch,
    SameTask t => t.options[i].isMatch,
    MissingTask t => t.options[i].isMatch,
    AssemblyTask t => t.options[i].isMatch,
    FormationTask t => t.options[i].isMatch,
    SectionTask t => t.options[i].isMatch,
    ObliqueTask t => t.options[i].isMatch,
    _ => false,
  };

  List<Object> _optionsOf(MentalRotationTask task) => switch (task) {
    RotationTask t => t.options,
    MemoryTask t => t.rotation.options,
    ProjectionTask t => t.options,
    NetTask t => t.options,
    ViewpointTask t => t.options,
    SameTask t => t.options,
    MissingTask t => t.options,
    AssemblyTask t => t.options,
    FormationTask t => t.options,
    SectionTask t => t.options,
    ObliqueTask t => t.options,
    _ => const [],
  };

  // ─── экран ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final hits = _records.where((r) => r.correct).length;
    final task = _task;

    return GameShell(
      title: 'Мысленное вращение',
      onRules: () => _showRules(context),
      hud: _phase == Phase.playing
          ? [
              HudItem(label: 'Раунд', value: '$_round/$_trials', icon: Icons.tag),
              HudItem(label: 'Верно', value: '$hits', icon: Icons.check),
              HudItem(label: 'Ошибки', value: '${_records.length - hits}', icon: Icons.close),
              HudItem(
                label: 'Время',
                value: '${_elapsed.toStringAsFixed(1)} с',
                icon: Icons.timer_outlined,
              ),
            ]
          : [
              HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
              HudItem(
                label: 'Достигнуто',
                value: '${_ladder.best}',
                icon: Icons.emoji_events_outlined,
              ),
            ],
      field: (context, h) => switch (_phase) {
        Phase.config => _config(context, h),
        Phase.playing =>
          task == null
              ? const SizedBox.shrink()
              : _TaskField(
                  task: task,
                  height: h,
                  studying: _studying,
                  reviewing: _reviewing,
                  reviewStep: _reviewStep,
                  frames: _frames,
                ),
        Phase.result => _result(context, h),
      },
      auxRow: _phase == Phase.playing
          ? AuxBar(
              children: [
                AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _startRun),
                AuxAction(
                  icon: Icons.rotate_right,
                  label: 'Крутить самому',
                  onPressed: _reviewing && _frames.length > 1 && _reviewStep + 1 < _frames.length
                      ? () {
                          _replay?.cancel();
                          setState(() => _reviewStep += 1);
                        }
                      : null,
                ),
              ],
            )
          : null,
      toolbar: switch (_phase) {
        Phase.config => Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            key: const Key('начать'),
            onPressed: _startRun,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Начать'),
          ),
        ),
        Phase.playing => task == null ? null : _options(context, task),
        Phase.result => Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            key: const Key('ещё-раз'),
            onPressed: () => setState(() => _phase = Phase.config),
            icon: const Icon(Icons.arrow_forward),
            label: Text(
              _practice != null
                  ? 'К настройке'
                  : _passed
                  ? 'Следующий уровень'
                  : 'Ещё раз',
            ),
          ),
        ),
      },
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _startRun),
        PauseAction(
          label: 'К настройке',
          icon: Icons.tune,
          onPressed: () => setState(() => _phase = Phase.config),
        ),
      ],
    );
  }

  void _showRules(BuildContext context) {
    final kind = _task?.kind ?? TaskKind.rotation;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Задание: ${kindWord(kind)}'),
        content: Text(reviewHint(kind)),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Понятно')),
        ],
      ),
    );
  }

  // ─── настройка ──────────────────────────────────────────────────────────

  Widget _config(BuildContext context, double height) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      children: [
        Text('Уровень ${_ladder.level}', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(levelSummary(_ladder.level), style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 16),

        // 🔴 ВЫБОР ВИДА — ВЫПАДАЮЩИМ СПИСКОМ (решение Дениса 17.09.2026, отчёт 1263dc58:
        // «в настройках нельзя запустить отработку одного вида заданий»). Одиннадцать видов
        // рядами занимали пол-экрана, и до кнопки «Начать» приходилось прокручивать.
        Text('Вид заданий', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        OutlinedButton(
          key: const Key('вид-заданий'),
          onPressed: () => setState(() => _kindListOpen = !_kindListOpen),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_chosenKind == null ? 'Вперемешку' : kindWord(_chosenKind!)),
              Icon(_kindListOpen ? Icons.expand_less : Icons.expand_more),
            ],
          ),
        ),
        if (_kindListOpen)
          Container(
            margin: const EdgeInsets.only(top: 6),
            // ⚠️ Список прокручивается ВНУТРИ СЕБЯ и не выше половины поля. Двенадцать строк,
            // выложенных в столбец страницы, уводили последний вид («Сечение») на 210 px ниже
            // нижнего края окна 390×844 — проба нашла это тычком, а не чтением вёрстки.
            constraints: BoxConstraints(maxHeight: height * 0.5),
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ListView(
              key: const Key('список-видов'),
              shrinkWrap: true,
              children: [
                _kindRow(null, 'Вперемешку', null),
                for (final k in kindUnlock.keys) _kindRow(k, kindWord(k), kindUnlock[k]!),
              ],
            ),
          ),
        if (_chosenKind != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Только этот вид, задания уровня ${practiceLevel(_chosenKind!, _ladder.level)}. '
              'Твой уровень от такой партии не меняется.',
              key: const Key('про-отработку'),
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
          ),

        const SizedBox(height: 16),
        Text('Заданий в партии', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final n in const [5, 10, 15])
              ChoiceChip(
                key: Key('заданий$n'),
                label: Text('$n'),
                selected: _trials == n,
                onSelected: (_) => setState(() => _trials = n),
              ),
          ],
        ),
      ],
    );
  }

  Widget _kindRow(TaskKind? kind, String label, int? from) {
    final selected = _chosenKind == kind;
    return ListTile(
      key: Key('вид-${kind?.name ?? 'смесь'}'),
      dense: true,
      selected: selected,
      leading: Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 18),
      title: Text(label),
      // Уровень открытия — подпись, а не запрет: выбрать можно ЛЮБОЙ вид, задания при этом
      // строятся не ниже его порога (решение Дениса 17.09.2026).
      subtitle: from == null || from <= _ladder.level
          ? null
          : Text('открывается с $from-го уровня'),
      onTap: () => setState(() {
        _chosenKind = kind;
        _kindListOpen = false;
      }),
    );
  }

  // ─── итог ───────────────────────────────────────────────────────────────

  Widget _result(BuildContext context, double height) {
    final scheme = Theme.of(context).colorScheme;
    final hits = _records.where((r) => r.correct).length;
    final slope = angleResponseSlope(_records);
    final samples = slopeSamples(_records).length;
    final counts = taskKindCounts(_records);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      children: [
        Text(
          _practice != null
              ? 'Отработка: ${kindWord(_practice!)}'
              : _passed
              ? 'Уровень пройден'
              : 'Уровень не пройден',
          key: const Key('итог-партии'),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: _practice != null ? null : (_passed ? scheme.primary : scheme.error),
          ),
        ),
        const SizedBox(height: 8),
        _line('Верно', '$hits из $_trials'),
        _line('Время', '${_elapsed.toStringAsFixed(1)} с'),
        // 🔴 НАКЛОН СЧИТАЕТСЯ ТОЛЬКО ПО ПОВОРОТНЫМ ПРОБАМ. Рядом с ним — на скольких пробах он
        // посчитан: иначе «наклон 0, потому что человек ровный» не отличить от «точек было мало».
        _line(
          'Наклон RT по углу',
          samples >= 2 ? '${slope.toStringAsFixed(2)} мс/град (проб: $samples)' : 'проб мало',
        ),
        _line('Среднее время поворотных', samples > 0 ? '${meanSlopeRt(_records)} мс' : '—'),
        const SizedBox(height: 12),
        Text('Задания партии', style: Theme.of(context).textTheme.titleMedium),
        for (final e in counts.entries)
          if (e.value > 0) _line(kindWord(e.key), '${e.value}'),
      ],
    );
  }

  /// Строка итога. Подпись занимает остаток ширины: «Среднее время поворотных» на 360 px
  /// распирало ряд на 13 px — проба это и поймала.
  Widget _line(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Expanded(child: Text(label)),
        const SizedBox(width: 8),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    ),
  );

  // ─── ряд вариантов (липкий низ) ─────────────────────────────────────────

  Widget _options(BuildContext context, MentalRotationTask task) {
    final scheme = Theme.of(context).colorScheme;
    final options = _optionsOf(task);
    final correct = task.correctIdx;
    final feedback = _feedback;
    // 🔴 ШИРИНА КАРТОЧКИ — ОТ КАРКАСА, А НЕ ОТ ОКНА, и с вычтенными полями самой карточки
    // (отступ 4×2 и рамка, которая в разборе толще). Первый вариант считал от ширины окна и
    // забыл про эти 14 px: на 360×640 ряд из четырёх вариантов вылезал на 30 px вправо.
    return LayoutBuilder(
      builder: (context, c) {
        const chrome = 4 * 2 + 3 * 2;
        final side = ((c.maxWidth - 24 - (options.length - 1) * 8) / options.length - chrome)
            .clamp(44.0, 132.0)
            .toDouble();
        // Неподвижные варианты рисуются ОДНИМ масштабом на всё задание: свой масштаб у каждого выдавал
        // бы пару «фигура + зеркало» одинаковым габаритом.
        final unit = _stillUnitFor(task, side);

        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < options.length; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      _OptionCard(
                        index: i,
                        side: side,
                        border: feedback == null
                            ? scheme.outlineVariant
                            : i == correct
                            ? const Color(0xFF2E7D32)
                            : feedback.idx == i
                            ? scheme.error
                            : scheme.outlineVariant,
                        width: feedback == null ? 1 : 3,
                        note: feedback == null
                            ? null
                            : flawNote(options[i], oblique: task is ObliqueTask),
                        onTap: () => _pick(i),
                        child: _optionArt(task, options[i], side, unit),
                      ),
                    ],
                  ],
                ),
                if (_reviewing)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        key: const Key('следующий-раунд'),
                        onPressed: _nextTrial,
                        child: Text(
                          _records.length < _trials ? 'Следующий раунд' : 'Завершить уровень',
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  double? _stillUnitFor(MentalRotationTask task, double side) {
    final shapes = switch (task) {
      RotationTask t => [for (final o in t.options) o.shape],
      MemoryTask t => [for (final o in t.rotation.options) o.shape],
      MissingTask t => [for (final o in t.options) o.shape],
      AssemblyTask t => [for (final o in t.options) o.shape],
      FormationTask t => [for (final o in t.options) o.shape],
      _ => const <Shape>[],
    };
    return shapes.isEmpty ? null : stillUnit(shapes, side);
  }

  Widget _optionArt(MentalRotationTask task, Object option, double side, double? unit) {
    // «Память»: пока эталон виден, в карточке пустое место РАЗМЕРОМ С РИСУНОК. Без него карточка
    // схлопывалась бы в полоску и ряд прыгал ровно тогда, когда человек переводит на него взгляд.
    if (_studying) return SizedBox(width: side, height: side, key: const Key('пусто-память'));
    if (option is SameOption) {
      return SizedBox(
        width: side,
        height: side,
        child: Center(
          child: Text(
            option.answer ? 'Да' : 'Нет',
            style: TextStyle(
              fontSize: math.max(16, math.min(26, side / 3)),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }
    final painter = switch (option) {
      RotationOption o => ShapePainter(o.shape, unit: unit),
      PieceOption o => ShapePainter(o.shape, unit: unit),
      ProjectionOption o => GridPainter(
        o.cells,
        fill: const Color(0xFFB39DDB),
        edge: const Color(0xFF6D5587),
      ),
      SectionOption o => GridPainter(
        o.cells,
        fill: const Color(0xFFB39DDB),
        edge: const Color(0xFF6D5587),
      ),
      NetOption o => MarkedCubePainter(o.faces),
      ObliqueOption o => PolygonPainter(
        o.points,
        fill: const Color(0xFFCDBBE9),
        edge: const Color(0xFF4C1D95),
      ),
      ViewpointOption o when task is ViewpointTask => ShapePainter(
        task.shape,
        axis: task.axis,
        degrees: o.degrees,
      ),
      _ => null,
    };
    return SizedBox(
      width: side,
      height: side,
      child: painter == null ? null : CustomPaint(painter: painter),
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({
    required this.index,
    required this.side,
    required this.border,
    required this.width,
    required this.note,
    required this.onTap,
    required this.child,
  });

  final int index;
  final double side;
  final Color border;
  final double width;
  final String? note;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Вариант ${index + 1}',
    child: InkWell(
      key: Key('вариант$index'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          border: Border.all(color: border, width: width),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            child,
            if (note != null)
              SizedBox(
                width: side,
                child: Text(
                  note!,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

/// Поле: вид задания, вопрос, эталон и — после промаха — разбор. Всё внутри высоты от каркаса.
class _TaskField extends StatelessWidget {
  const _TaskField({
    required this.task,
    required this.height,
    required this.studying,
    required this.reviewing,
    required this.reviewStep,
    required this.frames,
  });

  final MentalRotationTask task;
  final double height;
  final bool studying;
  final bool reviewing;
  final int reviewStep;
  final List<ReplayFrame> frames;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Эталон занимает большую часть поля; в разборе часть высоты уходит на объяснение.
    final base = (height * (reviewing ? 0.42 : 0.62)).clamp(120.0, 320.0).toDouble();
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      children: [
        // Вид задания подписан в поле, а не в шапке: шапка — про счётчики, а смена задания
        // посреди партии должна быть видна рядом с вопросом.
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'Задание: ${kindWord(task.kind)}',
              key: const Key('вид-задания'),
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          promptOf(
            task.kind,
            view: switch (task) {
              ProjectionTask t => t.view,
              SectionTask t => t.view,
              _ => null,
            },
            studying: studying,
            exposureMs: task is MemoryTask ? (task as MemoryTask).exposureMs : 0,
          ),
          key: const Key('вопрос'),
          textAlign: TextAlign.center,
          style: TextStyle(color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        Center(child: _reference(context, base)),
        if (reviewing) ...[
          const SizedBox(height: 10),
          Text('Разбор', style: Theme.of(context).textTheme.titleMedium),
          Text(
            reviewHint(task.kind),
            key: const Key('разбор'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
          ),
          if (frames.length > 1)
            SizedBox(
              height: 56,
              child: ListView(
                scrollDirection: ui.Axis.horizontal,
                children: [
                  for (var i = 0; i < frames.length; i++)
                    Opacity(
                      opacity: i <= reviewStep ? 1 : 0.3,
                      child: Container(
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: i == reviewStep
                                ? const Color(0xFF2E7D32)
                                : scheme.outlineVariant,
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: CustomPaint(painter: ShapePainter(frames[i].shape)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          if (frames.length > 1 && reviewStep > 0 && frames[reviewStep].axis != null)
            Text(
              'Шаг $reviewStep: ${axisWord(frames[reviewStep].axis!)}',
              key: const Key('шаг-разбора'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
        ],
      ],
    );
  }

  /// Эталон задания. У каждого вида он свой — и это единственное место, где виды расходятся.
  Widget _reference(BuildContext context, double size) {
    final scheme = Theme.of(context).colorScheme;
    final t = task;

    Widget card(Widget child, {String? label, Key? key}) => Container(
      key: key,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF6D5587)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          child,
          if (label != null)
            Text(label, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
        ],
      ),
    );

    Widget art(CustomPainter painter, [double? s]) => SizedBox(
      width: s ?? size,
      height: s ?? size,
      child: CustomPaint(painter: painter),
    );

    // В разборе поворотного задания эталон сам доворачивается к правильному ответу.
    final replayShape = frames.isEmpty
        ? null
        : frames[reviewStep.clamp(0, frames.length - 1)].shape;

    return switch (t) {
      NetTask n => card(
        art(
          NetPainter(
            n.net,
            n.markOfCell,
            paper: const Color(0xFFF3F0FF),
            edge: const Color(0xFF6D5587),
          ),
        ),
        label: 'Развёртка',
        key: const Key('эталон-развёртка'),
      ),
      MemoryTask m =>
        studying || reviewing
            ? card(
                art(ShapePainter(replayShape ?? m.rotation.base)),
                label: 'Эталон',
                key: const Key('эталон-память'),
              )
            : card(
                SizedBox(
                  width: size,
                  height: size,
                  child: Center(
                    child: Text(
                      '?',
                      style: TextStyle(
                        fontSize: size * 0.4,
                        fontWeight: FontWeight.w800,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
                key: const Key('эталон-спрятан'),
              ),
      RotationTask r => card(
        art(ShapePainter(replayShape ?? r.base)),
        label: 'Эталон',
        key: const Key('эталон-поворот'),
      ),
      ObliqueTask o => card(
        art(ObliqueBodyPainter(o.dims, o.section)),
        key: const Key('эталон-сечение'),
      ),
      ViewpointTask v => card(
        art(ShapePainter(v.shape)),
        label: 'Эталон',
        key: const Key('эталон-ракурс'),
      ),
      // «Недостающая часть» и «Срез»: пустые кубики нарисованы контуром прямо на фигуре —
      // что заполнять и какой слой смотреть, видно на месте, а не угадывается.
      MissingTask m => card(
        art(ShapePainter(m.whole, ghost: m.hole)),
        label: 'Эталон',
        key: const Key('эталон-пустота'),
      ),
      SectionTask s => card(
        art(ShapePainter(s.shape, ghost: s.rest)),
        label: 'Эталон',
        key: const Key('эталон-слой'),
      ),
      FormationTask f => card(
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final v in [
              (f.views.top, 'сверху'),
              (f.views.front, 'спереди'),
              (f.views.side, 'справа'),
            ])
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    art(
                      GridPainter(
                        v.$1,
                        fill: const Color(0xFFB39DDB),
                        edge: const Color(0xFF6D5587),
                      ),
                      size * 0.28,
                    ),
                    Text(v.$2, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
          ],
        ),
        key: const Key('эталон-три-вида'),
      ),
      AssemblyTask a => card(
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            art(ShapePainter(a.parts[0]), size * 0.44),
            const Text('+', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            art(ShapePainter(a.parts[1]), size * 0.44),
          ],
        ),
        key: const Key('эталон-куски'),
      ),
      SameTask s => card(
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            art(ShapePainter(s.left), size * 0.44),
            const Text('?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            art(ShapePainter(s.right), size * 0.44),
          ],
        ),
        key: const Key('эталон-пара'),
      ),
      ProjectionTask p => card(
        art(ShapePainter(p.shape)),
        label: 'Эталон',
        key: const Key('эталон-проекция'),
      ),
      _ => const SizedBox.shrink(),
    };
  }
}
