/// БОЙ С БОССОМ — общий для всех игр раунд на вехе лестницы.
///
/// Перенос `frontend/src/components/BossRound.tsx` (экран) и `bossTask.ts` (раздача).
/// Каждый третий пройденный уровень игра прерывается коротким раундом с РЕЗКО другим
/// правилом — тренировка переключения. Итог мягкий: проиграл — идёшь дальше, уровень уже
/// засчитан; выиграл — строка «Босс повержен» в итоге партии.
///
/// 🔴 ПОЧЕМУ ЭТОТ ФАЙЛ ПОЯВИЛСЯ ТОЛЬКО 30.09.2026. В вебе босс стоял в 26 экранах, нативными
/// к этому дню стали 24 из них — и ни в одном босса не было. Слой пропал при переносе молча:
/// гейт доски (п. 5б) ищет `from '@/src/services/'`, а босс живёт в `components/`. Правила
/// игр перенесены и сверены, пробы зелёные — просто после 3-го, 6-го, 9-го уровня ничего не
/// происходило. В пяти перенесённых model.dart осталась константа `…BossEvery = 3`, которую
/// никто не звал.
///
/// 🔴 РАЗДАЧА — ПЕРЕНОС, А НЕ ПЕРЕПИСЫВАНИЕ. [makeBossTask] сверяется с
/// `test/fixtures/boss-round-reference.json`, снятым прогоном живого `bossTask.ts`
/// (`frontend/src/components/tools/record-boss-reference.gen.ts`): 6 типов × 40 зёрен,
/// совпадают сетка, подсветка, варианты с их порядком, ответ и ЧИСЛО бросков.
///
/// КАК ПОДКЛЮЧИТЬ К ИГРЕ — победа и веха ОДНИМ вызовом, итог строкой:
/// ```dart
/// if (passed) {
///   _boss = await BossRound.winThenBoss(context, _ladder,
///       type: BossType.counting, color: const Color(0xFF667EEA)); // null — боя не было
/// } else {
///   await _ladder.fail();
/// }
/// ...
/// BossOutcomeLine(_boss)                               // в итоге: «Босс повержен» / «устоял»
/// ```
/// Сыгранный уровень и признак «победа засчитана» экран НЕ передаёт: их берёт этот вызов
/// у лестницы. Когда их передавал экран, мутация «засчитано всегда» в одном из экранов
/// выжила — пресет зарядки открыл бы бой, а проба этого не видела. Тип задания и цвет —
/// те же, что у веб-экрана игры (`config.type`, `GRADIENT[0]`).
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'js_compat.dart';
import 'l10n.dart';
import 'level_ladder.dart';

/// Шесть заданий босса — ровно те, что знает веб (`BossType` в `bossTask.ts`).
enum BossType { counting, lightning, completeline, finderror, oddletter, gonogo }

/// Ключи словаря, которые бой зовёт ПЕРЕМЕННОЙ (`L.t(_task.introKey)`), а не литералом.
/// Сборщик словаря (`flutter/tools/embed-l10n.mjs`) видит такие ключи только объявленными
/// списком (его «дверь 1в»). Без списка первый прогон собрал три ключа из пятнадцати, и
/// экран показал бы `bossIntroCounting` вместо правила: подстановка молча возвращает ключ.
const bossTaskKeys = <String>[
  'bossIntroCounting', 'bossHudCounting',
  'bossIntroLightning', 'bossHudLightning',
  'bossIntroCompleteline', 'bossHudCompleteline',
  'bossIntroFinderror', 'bossHudFinderror',
  'bossIntroOddletter', 'bossHudOddletter',
  'bossIntroGonogo', 'bossHudGonogo',
];

/// Клетка подсказки в задании «выбери вариант». `hl == null` — у веба поля нет вовсе
/// (задание «дополни ряд»), и эталон это различает.
class BossCell {
  const BossCell(this.value, {this.hl});
  final Object value; // число или знак «?»
  final bool? hl;

  Map<String, Object?> toJson() => {'value': value, if (hl != null) 'hl': hl};
}

/// Задание босса: либо «выбери вариант» (`choose`), либо «тапни клетку» (`tapcell`).
class BossTask {
  const BossTask.choose({
    required this.introKey,
    required this.hudKey,
    required List<BossCell> this.cells,
    required int this.cols,
    required List<int> this.options,
    required int this.answer,
  })  : tapcell = false,
        grid = null,
        gridCols = null,
        badCells = null;

  const BossTask.tapcell({
    required this.introKey,
    required this.hudKey,
    required List<Object> this.grid,
    required int this.gridCols,
    required List<int> this.badCells,
  })  : tapcell = true,
        cells = null,
        cols = null,
        options = null,
        answer = null;

  final bool tapcell;
  final String introKey; // ключ словаря: объяснение перед раундом
  final String hudKey; // ключ словаря: задание над полем
  final List<BossCell>? cells;
  final int? cols;
  final List<int>? options;
  final int? answer;
  final List<Object>? grid; // числа, буквы или кружки
  final int? gridCols;
  final List<int>? badCells; // верное нажатие — по любой из них

  /// Та же форма, что объект задания в вебе, — по ней идёт сверка с эталоном.
  Map<String, Object?> toJson() => tapcell
      ? {
          'kind': 'tapcell',
          'introKey': introKey,
          'hudKey': hudKey,
          'grid': grid,
          'gridCols': gridCols,
          'badCells': badCells,
        }
      : {
          'kind': 'choose',
          'introKey': introKey,
          'hudKey': hudKey,
          'cells': [for (final c in cells!) c.toJson()],
          'cols': cols,
          'options': options,
          'answer': answer,
        };
}

/// Раздача задания — строка в строку с `makeTask` из `bossTask.ts`, тем же порядком бросков.
BossTask makeBossTask(BossType type, Rng rng) {
  int rnd(int n) => (rng() * n).floor();

  List<int> mkOptions(int answer) {
    final o = <int>{answer};
    while (o.length < 4) {
      // Порядок бросков как в JS: сперва знак, потом величина.
      final sign = rng() < 0.5 ? -1 : 1;
      final d = answer + sign * (1 + rnd(6));
      if (d > 0) o.add(d);
    }
    return shuffle(rng, o.toList());
  }

  List<int> mkOptionsFrom(int answer, int max) {
    final o = <int>{answer};
    final pool = [for (var v = 1; v <= max; v += 1) if (v != answer) v];
    for (final v in shuffle(rng, pool)) {
      if (o.length >= 4) break;
      o.add(v);
    }
    return shuffle(rng, o.toList());
  }

  switch (type) {
    case BossType.lightning:
      const n = 5;
      final miss = 1 + rnd(n);
      return BossTask.choose(
        introKey: 'bossIntroLightning',
        hudKey: 'bossHudLightning',
        cells: [
          for (var i = 0; i < n; i += 1)
            BossCell(i + 1 == miss ? '?' : i + 1, hl: i + 1 == miss),
        ],
        cols: n,
        options: mkOptionsFrom(miss, n),
        answer: miss,
      );
    case BossType.completeline:
      final miss = 1 + rnd(9);
      final shown = shuffle(rng, [for (var v = 1; v <= 9; v += 1) if (v != miss) v]);
      return BossTask.choose(
        introKey: 'bossIntroCompleteline',
        hudKey: 'bossHudCompleteline',
        cells: [for (final v in shown) BossCell(v)],
        cols: 9,
        options: mkOptionsFrom(miss, 9),
        answer: miss,
      );
    case BossType.finderror:
      const n = 4;
      final grid = <Object>[];
      for (var r = 0; r < n; r += 1) {
        grid.addAll(shuffle(rng, [1, 2, 3, 4]));
      }
      final er = rnd(n), base = er * n, a = rnd(n);
      var b = rnd(n);
      while (b == a) {
        b = rnd(n);
      }
      grid[base + b] = grid[base + a]; // в строке er теперь повтор (клетки a и b)
      return BossTask.tapcell(
        introKey: 'bossIntroFinderror',
        hudKey: 'bossHudFinderror',
        grid: grid,
        gridCols: n,
        badCells: [base + a, base + b],
      );
    case BossType.oddletter:
      // 5 согласных + 1 гласная (латиница, одинаково на всех языках) — тапни лишнюю гласную.
      const cons = 'BCDFGHJKLMNPQRSTVWXZ', vow = 'AEIOU';
      final letters = <Object>[for (var i = 0; i < 5; i += 1) cons[rnd(cons.length)]];
      final vIdx = rnd(6);
      letters.insert(vIdx, vow[rnd(vow.length)]);
      return BossTask.tapcell(
        introKey: 'bossIntroOddletter',
        hudKey: 'bossHudOddletter',
        grid: letters,
        gridCols: 3,
        badCells: [vIdx],
      );
    case BossType.gonogo:
      // 6 цветных кружков, ровно один зелёный — тапни только его, остальные подави.
      const others = ['🔴', '🔵', '🟡', '🟣', '🟠'];
      final grid = <Object>[for (var i = 0; i < 6; i += 1) others[rnd(others.length)]];
      final gIdx = rnd(6);
      grid[gIdx] = '🟢';
      return BossTask.tapcell(
        introKey: 'bossIntroGonogo',
        hudKey: 'bossHudGonogo',
        grid: grid,
        gridCols: 3,
        badCells: [gIdx],
      );
    case BossType.counting:
      // Шульте и соседи: сложи три подсвеченных числа из шести.
      final nums = [for (var i = 0; i < 6; i += 1) 1 + rnd(12)];
      final hl = shuffle(rng, [0, 1, 2, 3, 4, 5]).sublist(0, 3);
      final answer = hl.fold<int>(0, (s, i) => s + nums[i]);
      return BossTask.choose(
        introKey: 'bossIntroCounting',
        hudKey: 'bossHudCounting',
        cells: [for (var i = 0; i < 6; i += 1) BossCell(nums[i], hl: hl.contains(i))],
        cols: 3,
        options: mkOptions(answer),
        answer: answer,
      );
  }
}

/// Открыть бой поверх игры. Возвращает `true` — босс повержен, `false` — устоял
/// (время вышло, промах или выход назад). Уровень от итога не зависит: он засчитан до боя.
Future<bool> openBossRound(
  BuildContext context, {
  required BossType type,
  required Color color,
  int durationSec = BossRound.roundSeconds,
  Rng? rng,
}) async {
  final won = await Navigator.of(context).push<bool>(MaterialPageRoute<bool>(
    builder: (_) => BossRound(
      type: type,
      color: color,
      durationSec: durationSec,
      rng: rng,
    ),
  ));
  return won ?? false;
}

class BossRound extends StatefulWidget {
  const BossRound({
    super.key,
    required this.type,
    required this.color,
    this.durationSec = roundSeconds,
    this.rng,
  });

  /// Время на задание — `durationSec ?? 15` в вебе. Одно число на весь файл: второе такое же
  /// в значении по умолчанию расходилось бы с первым молча (так и нашлось — мутация
  /// «14 с» в конструкторе выжила, потому что открытие боя передаёт своё число).
  static const int roundSeconds = 15;

  /// Веха — каждые столько уровней, как `BOSS_EVERY` во всех 26 веб-экранах.
  static const int every = 3;

  /// Пора ли босса после ЗАСЧИТАННОЙ победы на уровне [playedLevel].
  static bool due(int playedLevel) => playedLevel > 0 && playedLevel % every == 0;

  /// Победа и веха одним вызовом. Уровень берётся ДО победы — в вебе веха считается от
  /// сыгранного `levelRef.current`, а `reach(+1)` к этому моменту уже прошёл; засчитана ли
  /// победа, знает только лестница (отметку разбора снимает тот же `win()`). [win] — если
  /// экрану нужно передать лестнице счёт и время; по умолчанию `ladder.win()`.
  static Future<bool?> winThenBoss(
    BuildContext context,
    LevelLadder ladder, {
    required BossType type,
    required Color color,
    Future<bool> Function()? win,
  }) async {
    final played = ladder.level;
    final counted = await (win ?? ladder.win)();
    if (!context.mounted) return null;
    return afterWin(context, counted: counted, playedLevel: played, type: type, color: color);
  }

  /// Развилка после победы — одна на все игры. Бой, только если победу засчитала лестница
  /// (не пресет зарядки и не партия с разбором) и сыгранный уровень кратен [every] — ровно
  /// условие веба `passed && level % BOSS_EVERY === 0`, где `passed` уже включает `!isPreset`.
  /// Возвращает итог боя или `null`, если боя не было.
  static Future<bool?> afterWin(
    BuildContext context, {
    required bool counted,
    required int playedLevel,
    required BossType type,
    required Color color,
  }) async {
    if (!counted || !due(playedLevel) || !context.mounted) return null;
    return openBossRound(context, type: type, color: color);
  }

  /// Сколько длится показ правила перед раундом и итог после — как в вебе.
  static const Duration introTime = Duration(milliseconds: 1800);
  static const Duration doneTime = Duration(milliseconds: 1400);

  final BossType type;
  final Color color; // цвет кнопок-вариантов: первый цвет градиента игры
  final int durationSec;
  final Rng? rng; // пробы подают зерно; в игре — обычная случайность

  @override
  State<BossRound> createState() => _BossRoundState();
}

enum _Stage { intro, task, done }

class _BossRoundState extends State<BossRound> {
  late final BossTask _task;
  _Stage _stage = _Stage.intro;
  int? _picked; // вариант (choose) или индекс клетки (tapcell)
  bool _won = false;
  late int _left;
  Timer? _intro, _tick, _done;
  bool _finished = false;

  @override
  void initState() {
    super.initState();
    final random = math.Random();
    _task = makeBossTask(widget.type, widget.rng ?? random.nextDouble);
    _left = widget.durationSec;
    _intro = Timer(BossRound.introTime, _startTask);
  }

  void _startTask() {
    if (!mounted) return;
    setState(() => _stage = _Stage.task);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_left <= 1) {
        setState(() => _left = 0);
        _finish(false);
      } else {
        setState(() => _left -= 1);
      }
    });
  }

  void _finish(bool win) {
    if (_finished) return;
    _finished = true;
    _tick?.cancel();
    setState(() {
      _won = win;
      _stage = _Stage.done;
    });
    _done = Timer(BossRound.doneTime, () {
      if (mounted) Navigator.of(context).pop(win);
    });
  }

  void _pickOption(int v) {
    if (_picked != null || _stage != _Stage.task) return;
    _picked = v;
    _finish(v == _task.answer);
  }

  void _pickCell(int i) {
    if (_picked != null || _stage != _Stage.task) return;
    _picked = i;
    _finish(_task.badCells!.contains(i));
  }

  @override
  void dispose() {
    _intro?.cancel();
    _tick?.cancel();
    _done?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PopScope(
      // Назад во время боя — это «устоял», а не потерянный результат.
      canPop: _stage == _Stage.done,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_finished) {
          _finished = true;
          _intro?.cancel();
          _tick?.cancel();
          Navigator.of(context).pop(false);
        }
      },
      child: Scaffold(
        key: const Key('boss-round'),
        backgroundColor: scheme.surface,
        body: SafeArea(
          child: _stage == _Stage.intro ? _introView(scheme) : _taskView(scheme),
        ),
      ),
    );
  }

  Widget _introView(ColorScheme scheme) {
    final text = Theme.of(context).textTheme;
    return Center(
      key: const Key('boss-intro'),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('⚔️', style: TextStyle(fontSize: 72)),
            const SizedBox(height: 12),
            Text(
              L.t('bossTitle'),
              textAlign: TextAlign.center,
              style: text.headlineMedium?.copyWith(fontWeight: FontWeight.w900, letterSpacing: 2),
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Text(
                L.t(_task.introKey),
                textAlign: TextAlign.center,
                style: text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _taskView(ColorScheme scheme) {
    final text = Theme.of(context).textTheme;
    final done = _stage == _Stage.done;
    return Stack(
      children: [
        LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: math.max(0, box.maxHeight - 40)),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '⚔️ ${L.t(_task.hudKey)}',
                          key: const Key('boss-hud'),
                          style: text.titleSmall?.copyWith(
                            color: const Color(0xFFF59E0B),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        '⏱ $_left',
                        key: const Key('boss-timer'),
                        style: text.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: _left <= 5 ? const Color(0xFFEF4444) : scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  if (!_task.tapcell) _hintGrid(scheme),
                  if (_task.tapcell) _tapGrid(scheme, done),
                  if (!_task.tapcell) _optionRow(done),
                ],
              ),
            ),
          ),
        ),
        if (done)
          Align(
            alignment: const Alignment(0, -0.16), // ≈ 42 % сверху, как в вебе
            child: IgnorePointer(
              child: Container(
                key: const Key('boss-banner'),
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                decoration: BoxDecoration(
                  color: const Color(0xF7F59E0B),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  _won ? L.t('bossDefeated') : L.t('bossSurvived'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF3F2B00),
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// Ширина сетки: не шире `колонки × 64 + 40`, как `maxWidth` в вебе, и не шире экрана.
  Widget _grid({required int cols, required List<Widget> children}) => ConstrainedBox(
        constraints: BoxConstraints(maxWidth: cols * 64.0 + 40),
        child: Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: children,
        ),
      );

  Widget _hintGrid(ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(bottom: 28),
        child: _grid(
          cols: _task.cols!,
          children: [
            for (final c in _task.cells!)
              _cell(
                label: '${c.value}',
                fill: c.hl == true ? const Color(0xFFFDE68A) : scheme.surfaceContainerHighest,
                border: c.hl == true ? const Color(0xFFF59E0B) : scheme.outlineVariant,
                borderWidth: c.hl == true ? 3 : 1,
                ink: c.hl == true ? const Color(0xFF92600A) : scheme.onSurface,
              ),
          ],
        ),
      );

  Widget _tapGrid(ColorScheme scheme, bool done) => _grid(
        cols: _task.gridCols!,
        children: [
          for (var i = 0; i < _task.grid!.length; i += 1)
            Builder(builder: (_) {
              final correct = done && _task.badCells!.contains(i);
              final wrong = done && _picked == i && !_task.badCells!.contains(i);
              return Semantics(
                button: true,
                label: '${_task.grid![i]}',
                child: GestureDetector(
                  key: Key('boss-cell-$i'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _pickCell(i),
                  child: _cell(
                    label: '${_task.grid![i]}',
                    fill: correct
                        ? const Color(0xFF22C55E)
                        : wrong
                            ? const Color(0xFFEF4444)
                            : scheme.surfaceContainerHighest,
                    border: scheme.outlineVariant,
                    borderWidth: 1,
                    ink: correct || wrong ? Colors.white : scheme.onSurface,
                  ),
                ),
              );
            }),
        ],
      );

  /// Цвет цифры на кнопке. В вебе всегда белый, но у половины игр первый цвет градиента
  /// светлый (#34e89e, #f7971e, #43cea2…), и белое по нему читается хуже 2:1. Цвет кнопки
  /// оставлен игровым, цифра выбирается по его яркости.
  Color get _ink => ThemeData.estimateBrightnessForColor(widget.color) == Brightness.dark
      ? Colors.white
      : const Color(0xFF1F2937);

  Widget _optionRow(bool done) => Wrap(
        alignment: WrapAlignment.center,
        spacing: 12,
        runSpacing: 12,
        children: [
          for (var i = 0; i < _task.options!.length; i += 1)
            Builder(builder: (_) {
              final o = _task.options![i];
              final correct = done && o == _task.answer;
              final wrong = done && _picked == o && o != _task.answer;
              return Semantics(
                button: true,
                label: '$o',
                child: GestureDetector(
                  key: Key('boss-option-$i'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _pickOption(o),
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 70),
                    padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
                    decoration: BoxDecoration(
                      color: correct
                          ? const Color(0xFF22C55E)
                          : wrong
                              ? const Color(0xFFEF4444)
                              : widget.color,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      '$o',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: correct || wrong ? Colors.white : _ink,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              );
            }),
        ],
      );

  Widget _cell({
    required String label,
    required Color fill,
    required Color border,
    required double borderWidth,
    required Color ink,
  }) =>
      Container(
        width: 56,
        height: 56,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: fill,
          border: Border.all(color: border, width: borderWidth),
          borderRadius: BorderRadius.circular(12),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(label, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: ink)),
        ),
      );
}

/// Строка итога боя в итоге партии: «Босс повержен» / «Босс устоял — идём дальше». Боя не
/// было — не рисуется вовсе. В вебе итог боя ставил три звезды на баннере уровня; звёзд у
/// нативных итогов нет, поэтому итог говорится словами, теми же ключами словаря.
class BossOutcomeLine extends StatelessWidget {
  const BossOutcomeLine(this.won, {super.key});
  final bool? won;

  @override
  Widget build(BuildContext context) {
    final won = this.won;
    if (won == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        won ? L.t('bossDefeated') : L.t('bossSurvived'),
        key: const Key('boss-outcome'),
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: won ? const Color(0xFFB45309) : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}
