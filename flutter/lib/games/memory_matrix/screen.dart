import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Матрица памяти» на общем каркасе — перенос `app/games/memory-matrix.tsx` ЦЕЛИКОМ.
///
/// Уровень — десять раундов. В раунде клетки вспыхивают и гаснут, человек отмечает их
/// касанием или протяжкой пальца по полю. С L11 (режим «картинкой») серий две — фиолетовая,
/// затем красная, и вводятся они в том же порядке; в режиме «по порядку» клетки загораются по
/// одной и вводятся в порядке загорания. С L16 часть вспышек — ложные, с крестом: их не
/// запоминают. Перед первой вспышкой — пауза на чтение подписи (жалоба 7be44621), выше потолка
/// объёма — задержка перед вводом. Все паузы — на игровых часах каркаса.
///
/// 🔴 ПОЛЕ: сторона — от меньшего из высоты каркаса и ширины, как и в первом переносе; над полем
/// — строка подписи (веб: то же, `availH = fieldH - 44`). Игра стоит в двух развилках
/// («Объём памяти» и «Зрительная память») — размеры клетки меняются только этой строкой.
enum MmPhase { ready, showing, hold, input, feedback, done, revealed }

/// Цвета серий — как у веб-экрана: фиолетовая (как градиент) и красная.
const mmSeries1Color = Color(0xFF8E2DE2);
const mmSeries2Color = Color(0xFFEF4444);
const _correctColor = Color(0xFF22C55E);
const _wrongColor = Color(0xFFDC2626);

/// Рекорд серии подряд — тот же ключ, что у веб-половины (`services/streak.ts`). Мост возит
/// веб-пространство `psygames.` (`SharedState.extraPrefixes`, выпуск 2.56.5): рекорд общий с вебом
/// и переживает выход с экрана.
const mmBestStreakKey = 'psygames.bestStreak.memory_matrix';

/// Высота строки подписи над полем.
const _captionH = 34.0;

/// Протяжка пальцем начинается после этого смещения: короче — это касание клетки.
const _dragSlop = 6.0;

class MemoryMatrixScreen extends StatefulWidget {
  const MemoryMatrixScreen({super.key, required this.state, this.rng});

  final SharedState state;

  /// Случайность раздачи; пробы подставляют семенную.
  final double Function()? rng;

  @override
  State<MemoryMatrixScreen> createState() => _MemoryMatrixScreenState();
}

class _MemoryMatrixScreenState extends State<MemoryMatrixScreen> {
  late LevelLadder _ladder;
  late double Function() _rng;

  /// Вибрация — через общий выключатель «Вибрация» (веб `psygames_haptic_enabled`).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  bool _loaded = false;

  /// Режим партии — «картинкой» (static) или «по порядку» (sequential); в шаге — из шага.
  String _mode = 'static';
  MatrixLevel? _level;
  MmPhase _phase = MmPhase.ready;

  /// Какая серия горит в показе: 0 — ни одна (пауза на чтение), 1 — фиолетовая, 2 — красная.
  int _showingSeries = 0;

  /// Клетка, горящая сейчас в режиме «по порядку»; -1 — ни одна.
  int _active = -1;

  /// Горящая сейчас клетка «по порядку» — ложная (с крестом).
  bool _activeDecoy = false;

  /// Подпись, которую человек уже прочёл: тот же текст второй раз паузы не получает.
  String _prevCaption = '';
  bool _lastRoundWon = false;
  int _bestStreak = 0;
  bool _beatBest = false;
  int? _startedAt;
  final List<GameTimer> _timers = [];

  @override
  void initState() {
    super.initState();
    _rng = widget.rng ?? Random().nextDouble;
    _ladder = LevelLadder(gameId: 'memory_matrix', store: SharedLevelStore(widget.state));
    _bestStreak = int.tryParse(widget.state.get(mmBestStreakKey) ?? '') ?? 0;
    _boot();
  }

  @override
  void dispose() {
    _cancelTimers();
    super.dispose();
  }

  void _cancelTimers() {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
  }

  void _after(int ms, VoidCallback fn) => _timers.add(gameTimeout(Duration(milliseconds: ms), () {
        if (mounted) fn();
      }));

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    if (GamePreset.isPreset) _mode = GamePreset.str('mode', 'static') == 'sequential' ? 'sequential' : 'static';
    setState(() {
      _loaded = true;
      _reset();
    });
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady`.
    if (GamePreset.autostart) _start();
  }

  /// Сторона поля: по уровню, а в шаге — желание шага под потолком уровня (веб `capPresetByLevel`).
  int get _gridSize {
    final p = LevelParams.of(_ladder.level);
    if (!GamePreset.isPreset) return p.gridSize;
    return capPresetByLevel(want: GamePreset.num('size', 3), atLevel: p.gridSize, atTop: p.gridSize >= 6);
  }

  void _reset() {
    _cancelTimers();
    _level = MatrixLevel(level: _ladder.level, mode: _mode, gridSize: _gridSize, preset: GamePreset.isPreset);
    _phase = MmPhase.ready;
    _showingSeries = 0;
    _active = -1;
    _beatBest = false;
    _startedAt = null;
    // Новая раздача — партия снова зачётная (договор lesson.dart, как у «Корси» и ospan). Без
    // этого разбор, открытый посреди партии или на её итоге, молча делал незачётной и следующую
    // партию после «Заново» / «Далее». Разбор на экране старта по-прежнему снимает зачёт своей
    // партии: это правило каркаса, не экрана (сверка веб → натив 02.10).
    LessonUsed.reset();
  }

  void _start() {
    if (_phase != MmPhase.ready || _level == null) return;
    _startedAt = gameNow();
    _newRound();
  }

  /// Подпись показа — ОДНА функция на экран и на паузу чтения (веб `подписьПоказа`).
  String _showCaption(int series, int decoys) {
    final g = _level!;
    final core = g.two ? (series == 2 ? L.t('mmMemorizeRed') : L.t('mmMemorizePurple')) : L.t('matrixMemorize');
    return decoys > 0 ? '$core · ${L.t('mmIgnoreCrossed')}' : core;
  }

  void _newRound() {
    final g = _level!;
    final r = g.nextRound(_rng);
    final caption = _showCaption(1, r.decoys.length);
    final pause = mmReadPauseMs(caption, _prevCaption);
    if (pause > 0) _prevCaption = caption;
    setState(() {
      _phase = MmPhase.showing;
      _showingSeries = 0;
      _active = -1;
    });
    if (g.mode == 'static') {
      if (g.two) {
        _after(pause, () => setState(() => _showingSeries = 1));
        _after(pause + g.flashMs, () => setState(() => _showingSeries = 2));
        _after(pause + g.flashMs * 2, _openInput);
      } else {
        _after(pause, () => setState(() => _showingSeries = 1));
        _after(pause + g.singleShowMs, _openInput);
      }
    } else {
      // По одной, ложные (с L16) — вперемешку с серией и с крестом, как в показе «картинкой».
      final flash = g.seqFlashMs;
      final show = mmSeqShowOrder(r.seq, r.decoys);
      for (var i = 0; i < show.length; i++) {
        final s = show[i];
        _after(
            pause + i * (flash + mmSeqGapMs),
            () => setState(() {
                  _active = s.cell;
                  _activeDecoy = s.decoy;
                }));
        _after(pause + i * (flash + mmSeqGapMs) + flash, () => setState(() => _active = -1));
      }
      _after(pause + show.length * (flash + mmSeqGapMs) + mmSeqTailMs, _openInput);
    }
  }

  /// Ввод открывается В ОДНОМ МЕСТЕ на все три ветки показа (веб `openInput`): выше потолка
  /// объёма — сперва удержание.
  void _openInput() {
    final g = _level!;
    setState(() {
      _showingSeries = 0;
      _active = -1;
    });
    if (g.holdMs > 0) {
      setState(() => _phase = MmPhase.hold);
      _after(g.holdMs, () => setState(() => _phase = MmPhase.input));
      return;
    }
    setState(() => _phase = MmPhase.input);
  }

  void _tap(int cell) {
    final g = _level;
    if (g == null || _phase != MmPhase.input) return;
    final res = g.tap(cell);
    if (res == MmPress.ignored) return;
    if (res == MmPress.roundLost) {
      _haptics.heavy();
    } else {
      // Клетка — лёгкий щелчок, собранный раунд — отклик сильнее (у веба успех — двойной импульс).
      res == MmPress.roundWon ? _haptics.medium() : _haptics.selection();
      if (g.streak > _bestStreak) {
        // Рекорд празднуем, когда он побит, а не в конце партии (веб: bumpBestStreak).
        if (_bestStreak > 0) _beatBest = true;
        _bestStreak = g.streak;
        widget.state.set(mmBestStreakKey, '$_bestStreak');
      }
    }
    if (res == MmPress.roundWon || res == MmPress.roundLost) {
      setState(() {
        _phase = MmPhase.feedback;
        _lastRoundWon = res == MmPress.roundWon;
      });
      _after(mmFeedbackMs, () => g.lastRound ? _finish() : _newRound());
      return;
    }
    setState(() {});
  }

  Future<void> _finish() async {
    final g = _level!;
    final seconds = ((gameNow() - (_startedAt ?? gameNow())) / 1000).round();
    setState(() => _phase = MmPhase.done);
    // Метки и details — как пишет веб-экран (`saveSession` в memory-matrix.tsx).
    final difficulty = '${g.gridSize}x${g.gridSize}';
    final mode = '${mmTotalRounds}r';
    final details = <String, Object?>{'level': g.level, 'hits': g.hits, 'finalRound': g.round};
    if (g.passed) {
      await _ladder.win(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    } else {
      await _ladder.fail(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    }
    if (mounted) setState(() {});
  }

  /// «Показать решение»: раунд раскрыт, партия кончается без зачёта.
  void _reveal() {
    _cancelTimers();
    setState(() => _phase = MmPhase.revealed);
  }

  String _caption() {
    final g = _level!;
    final r = g.current;
    switch (_phase) {
      case MmPhase.ready:
        return '';
      case MmPhase.showing:
        return _showCaption(_showingSeries, r?.decoys.length ?? 0);
      case MmPhase.hold:
        return L.t('memorize');
      case MmPhase.input:
        if (g.two) return (r?.inputSeries ?? 0) == 1 ? L.t('mmNowRed') : L.t('mmPurpleFirst');
        return L.t('matrixRecall');
      case MmPhase.feedback:
        return _lastRoundWon ? L.t('matrixGood') : L.t('matrixMissed');
      case MmPhase.done:
        // Шаг зарядки идёт мимо лестницы и зачёта не имеет (`passed` в нём всегда false): «Промах»
        // выходил и при нуле ошибок (сверка веб → натив 02.10).
        if (g.preset) return L.t('done');
        return g.passed ? L.t('matrixGood') : L.t('matrixMissed');
      case MmPhase.revealed:
        return L.t('puzzleShowSolution');
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _level;
    if (!_loaded || g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final calm = _phase == MmPhase.ready || _phase == MmPhase.done || _phase == MmPhase.revealed;
    final playing = _phase == MmPhase.showing || _phase == MmPhase.hold || _phase == MmPhase.input;
    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх показа (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'memory_matrix', level: _ladder.level, state: widget.state, calm: calm),
      title: L.t('memoryMatrix'),
      onLesson: () => openDemoLesson(context, title: L.t('memoryMatrix'), trials: memoryMatrixLessonTrials()),
      hud: [
        // В шаге зарядки играется пресет, а не личный уровень — номер уровня там неправда (как «Корси»).
        if (!GamePreset.isPreset) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/$mmTotalRounds', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check_circle_outline),
        HudItem(label: L.t('hud_streak'), value: '${g.streak}', icon: Icons.local_fire_department_outlined),
        HudItem(
          label: L.t('hud_best'),
          value: _bestStreak > 0 ? '$_bestStreak' : '—',
          icon: _beatBest ? Icons.emoji_events : Icons.emoji_events_outlined,
        ),
      ],
      field: (context, h) => _phase == MmPhase.ready
          ? _Ready(
              level: _ladder.level,
              gridSize: g.gridSize,
              mode: _mode,
              preset: GamePreset.isPreset,
              onMode: (m) => setState(() {
                _mode = m;
                _reset();
              }),
              onStart: _start,
            )
          : Column(
              children: [
                SizedBox(
                  height: _captionH,
                  child: Center(
                    child: Text(_caption(),
                        key: const Key('mm-caption'),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                  ),
                ),
                Expanded(
                  child: LayoutBuilder(builder: (context, c) {
                    // 🔴 Сторона — от МЕНЬШЕГО из высоты каркаса и ширины. На этом ошибалась
                    // веб-версия: считала от окна, и нижний ряд уезжал за экран.
                    final side = (c.maxHeight < c.maxWidth ? c.maxHeight : c.maxWidth) - 16;
                    return Center(
                      child: MatrixGridView(
                        gridSize: g.gridSize,
                        side: side,
                        stateOf: (i) => _cellState(g, i),
                        orderOf: _phase == MmPhase.revealed && g.mode == 'sequential'
                            ? (i) {
                                final k = g.current?.seq.indexOf(i) ?? -1;
                                return k >= 0 ? k + 1 : null;
                              }
                            : null,
                        onTap: _phase == MmPhase.input ? _tap : null,
                      ),
                    );
                  }),
                ),
              ],
            ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.visibility_outlined,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: playing ? _reveal : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == MmPhase.done || _phase == MmPhase.revealed
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const Key('mm-again'),
                onPressed: () => setState(_reset),
                icon: const Icon(Icons.arrow_forward),
                label: Text(_phase == MmPhase.done && g.passed ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  /// Состояние клетки — одно слово, как у веб-`FlashCell`.
  MmCellState _cellState(MatrixLevel g, int i) {
    final r = g.current;
    if (r == null) return MmCellState.idle;
    final in1 = r.set1.contains(i);
    final in2 = r.set2.contains(i);
    switch (_phase) {
      case MmPhase.showing:
        if (g.mode == 'static') {
          if (_showingSeries == 1 && in1) return MmCellState.lit;
          if (_showingSeries == 2 && in2) return MmCellState.lit2;
          if (_showingSeries > 0 && r.decoys.contains(i)) return MmCellState.wrong;   // ложная: не запоминать
          return MmCellState.idle;
        }
        if (_active != i) return MmCellState.idle;
        return _activeDecoy ? MmCellState.wrong : MmCellState.lit;
      case MmPhase.input:
        if (!r.picked.contains(i)) return MmCellState.idle;
        return r.target.contains(i) ? MmCellState.correct : MmCellState.wrong;
      case MmPhase.feedback:
      case MmPhase.done:
        final inAny = in1 || in2;
        final picked = r.pickedAll.contains(i);
        if (i == r.lostOn) return MmCellState.wrong;
        if (inAny && !picked) return MmCellState.missed;
        if (inAny && picked) return MmCellState.correct;
        if (!inAny && picked) return MmCellState.wrong;
        return MmCellState.idle;
      case MmPhase.revealed:
        if (in1) return MmCellState.lit;
        if (in2) return MmCellState.lit2;
        if (r.decoys.contains(i)) return MmCellState.wrong;
        return MmCellState.idle;
      case MmPhase.hold:
      case MmPhase.ready:
        return MmCellState.idle;
    }
  }
}

class _Ready extends StatelessWidget {
  const _Ready({
    required this.level,
    required this.gridSize,
    required this.mode,
    required this.preset,
    required this.onMode,
    required this.onStart,
  });

  final int level;
  final int gridSize;
  final String mode;
  final bool preset;
  final ValueChanged<String> onMode;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.grid_view_rounded, size: 48, color: mmSeries1Color),
                  const SizedBox(height: 8),
                  Text(L.t('memoryMatrixDesc'), textAlign: TextAlign.center, style: text.titleMedium),
                  const SizedBox(height: 8),
                  Text('${L.t('gridSize')}: $gridSize×$gridSize',
                      key: const Key('mm-grid-size'), textAlign: TextAlign.center, style: text.bodySmall),
                  const SizedBox(height: 16),
                  Text(L.t('mode'), style: text.titleSmall),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    key: const Key('mm-mode'),
                    segments: [
                      ButtonSegment(value: 'static', label: Text(L.t('label_mode_static'))),
                      ButtonSegment(value: 'sequential', label: Text(L.t('label_mode_sequential'))),
                    ],
                    selected: {mode},
                    showSelectedIcon: false,
                    onSelectionChanged: preset ? null : (v) => onMode(v.first),
                  ),
                ],
              ),
            ),
          ),
        ),
        // «Начать» прибита под настройками и видна без прокрутки (веб: GameSetupBar).
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
          child: FilledButton(key: const Key('mm-start'), onPressed: onStart, child: Text(L.t('start'))),
        ),
      ],
    );
  }
}

/// Состояние клетки поля — как у веб-`FlashCell` (общей у пяти игр семейства).
enum MmCellState { idle, lit, lit2, wrong, correct, missed }

/// Поле — ОДНО для партии и разбора. Касание отмечает клетку; протяжка пальцем по полю отмечает
/// клетки под ним, каждую — один раз за жест (веб: свайп-выбор как выделение фото в галерее).
class MatrixGridView extends StatefulWidget {
  const MatrixGridView({
    super.key,
    required this.gridSize,
    required this.side,
    required this.stateOf,
    this.orderOf,
    this.onTap,
    this.keyPrefix = 'mm-cell-',
  });

  final int gridSize;
  final double side;
  final MmCellState Function(int index) stateOf;

  /// Номер клетки в порядке загорания (решение режима «по порядку»); `null` — без номера.
  final int? Function(int index)? orderOf;
  final ValueChanged<int>? onTap;
  final String keyPrefix;

  @override
  State<MatrixGridView> createState() => _MatrixGridViewState();
}

class _MatrixGridViewState extends State<MatrixGridView> {
  Offset? _down;
  bool _dragging = false;
  final Set<int> _swiped = {};

  double get _cell => widget.side / widget.gridSize;

  int _cellAt(Offset p) {
    if (p.dx < 0 || p.dy < 0) return -1;
    final col = (p.dx / _cell).floor();
    final row = (p.dy / _cell).floor();
    if (col >= widget.gridSize || row >= widget.gridSize) return -1;
    return row * widget.gridSize + col;
  }

  void _swipeAt(Offset p) {
    final i = _cellAt(p);
    if (i < 0 || _swiped.contains(i)) return;
    _swiped.add(i);
    widget.onTap?.call(i);
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.gridSize;
    final cell = _cell;
    final grid = SizedBox(
      width: widget.side,
      height: widget.side,
      child: Column(
        children: [
          for (var row = 0; row < n; row++)
            SizedBox(
              height: cell,
              child: Row(
                children: [
                  for (var col = 0; col < n; col++)
                    MatrixCellView(
                      index: row * n + col,
                      gridSize: n,
                      size: cell,
                      state: widget.stateOf(row * n + col),
                      order: widget.orderOf?.call(row * n + col),
                      keyPrefix: widget.keyPrefix,
                      onTap: widget.onTap,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
    if (widget.onTap == null) return grid;
    // Сырые события указателя: протяжка не спорит с касанием клетки за жест, а начинается
    // после смещения _dragSlop (у веба — DRAG_SLOP 6 px). Коротким касанием правит InkWell.
    return Listener(
      onPointerDown: (e) {
        _down = e.localPosition;
        _dragging = false;
        _swiped.clear();
      },
      onPointerMove: (e) {
        final start = _down;
        if (start == null) return;
        if (!_dragging && (e.localPosition - start).distance > _dragSlop) {
          _dragging = true;
          _swipeAt(start);
        }
        if (_dragging) _swipeAt(e.localPosition);
      },
      onPointerUp: (_) => _down = null,
      onPointerCancel: (_) => _down = null,
      child: grid,
    );
  }
}

/// Клетка поля. Скринридер слышит место и состояние словами, как у веба (`cellLabel`):
/// «Строка 2, колонка 3, горит». До 02.10.2026 подпись была отладочной — «mm-cell-7-lit»,
/// без строки и столбца и не переведённая; пробы теперь читают [state] самой клетки.
class MatrixCellView extends StatelessWidget {
  const MatrixCellView({
    super.key,
    required this.index,
    required this.gridSize,
    required this.size,
    required this.state,
    required this.order,
    required this.keyPrefix,
    required this.onTap,
  });

  final int index;
  final int gridSize;
  final double size;
  final MmCellState state;
  final int? order;
  final String keyPrefix;
  final ValueChanged<int>? onTap;

  /// Подпись для скринридера — те же ключи словаря, что у веб-экрана.
  String get a11yLabel {
    final what = switch (state) {
      MmCellState.lit || MmCellState.lit2 => L.t('a11yLit'),
      MmCellState.correct => L.t('a11yCorrect'),
      MmCellState.wrong => L.t('a11yWrong'),
      MmCellState.missed => L.t('a11yMissed'),
      MmCellState.idle => L.t('a11yEmpty'),
    };
    return '${L.t('a11yRow')} ${index ~/ gridSize + 1}, ${L.t('a11yCol')} ${index % gridSize + 1}, $what';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (Color fill, IconData? icon) = switch (state) {
      MmCellState.idle => (scheme.surfaceContainerHighest, null),
      MmCellState.lit => (mmSeries1Color, null),
      MmCellState.lit2 => (mmSeries2Color, null),
      // Крест — форма, а не только цвет: ложную вспышку и промах различает и дальтоник.
      MmCellState.wrong => (_wrongColor, Icons.close),
      MmCellState.correct => (_correctColor, Icons.check),
      MmCellState.missed => (mmSeries1Color.withValues(alpha: 0.35), Icons.radio_button_unchecked),
    };
    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Semantics(
          label: a11yLabel,
          child: Material(
            color: fill,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              key: Key('$keyPrefix$index'),
              borderRadius: BorderRadius.circular(8),
              onTap: onTap == null ? null : () => onTap!(index),
              child: Center(
                child: order != null
                    ? Text('$order', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))
                    : icon == null
                        ? const SizedBox.expand()
                        : Icon(icon, color: Colors.white, size: size * 0.45),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// РАЗБОР ДО ПАРТИИ — три примера на поле самой игры: приём «форма вместо клеток», две серии
/// (L11) и ложные с крестом (L16). Тексты второго и третьего — правила уровня из словаря, их
/// же человек увидит в карточке правила, когда механика придёт.
List<DemoTrial> memoryMatrixLessonTrials() {
  MmCellState Function(int) states(Set<int> one, [Set<int> two = const {}, Set<int> crossed = const {}]) =>
      (i) => one.contains(i)
          ? MmCellState.lit
          : two.contains(i)
              ? MmCellState.lit2
              : crossed.contains(i)
                  ? MmCellState.wrong
                  : MmCellState.idle;
  Widget art(MmCellState Function(int) of) =>
      MatrixGridView(gridSize: 4, side: 176, stateOf: of, keyPrefix: 'lesson-mm-');
  return [
    // «Уголок»: четыре клетки читаются одной фигурой.
    DemoTrial(text: '', rule: L.t('teachMatrixShape'), art: art(states({0, 4, 8, 9}))),
    DemoTrial(text: '', rule: L.t('lr_memory_matrix_two_series_rule'), art: art(states({1, 5, 6}, {10, 14, 15}))),
    DemoTrial(text: '', rule: L.t('lr_memory_matrix_decoys_rule'), art: art(states({2, 6, 7}, const {}, {9, 12}))),
  ];
}
