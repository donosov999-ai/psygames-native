/// «Корректура» — восемнадцатый, последний экран раздела «Конфликт внимания».
///
/// 🔴 ПОЛЕ ДОЛЖНО ВЛЕЗАТЬ ЦЕЛИКОМ. На верхних уровнях это 16×12 = 192 клетки, и
/// прокрутка тут не годится: корректурная проба меряет ОБХОД поля глазами, а
/// прокручиваемое поле превращает её в другую задачу — «успеть пролистать».
/// Поэтому размер клетки считается от высоты, которую дал каркас, и от ширины
/// экрана, а не задан числом.
///
/// ⚠️ Перенесено задание «буквы/цифры». Филворды — другая проба под тем же
/// game_type, со своим генератором и своей лестницей; она переносится отдельно.
///
/// 07.10.2026 — сверка с вебом по живому пути: письменность по языку и из адреса (`mode`) и
/// выбор её на настройке; шаг зарядки — размер из шага и без лимита времени; подсказка
/// (3 на партию); поля партии в `details`. До этого английский игрок видел кириллицу.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/hud_time.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum ProofPhase { ready, playing, done }

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool proofAutostart = bool.fromEnvironment('AUTOSTART');

/// Сколько держится вспышка ошибки, мс. Из веб-версии.
const int proofWrongFlashMs = 350;

/// Подпись письменности на выборе — словом веба (`SCRIPTS[id].labelKey`, `scriptDigits`).
/// Ключи написаны целиком: составленный из кусков ключ сборщик словаря не находит.
String proofScriptLabel(String id) => switch (id) {
      'latin' => L.t('scriptLatin'),
      'cyrillic' => L.t('scriptCyrillic'),
      'greek' => L.t('scriptGreek'),
      'devanagari' => L.t('scriptDevanagari'),
      'hiragana' => L.t('scriptHiragana'),
      'hanzi' => L.t('scriptHanzi'),
      proofDigits => L.t('scriptDigits'),
      _ => id,
    };

class ProofreadingScreen extends StatefulWidget {
  const ProofreadingScreen({
    super.key,
    required this.state,
    this.script,
    this.digits = false,
    this.clock,
    this.rnd,
  });

  final SharedState state;

  /// Письменность поля. Не задана — из адреса (`mode`), а без него — по языку, как у веба.
  final String? script;

  /// Цифровое поле вместо письменности.
  final bool digits;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<ProofreadingScreen> createState() => _ProofreadingScreenState();
}

class _ProofreadingScreenState extends State<ProofreadingScreen> {
  late LevelLadder _ladder;
  ProofGame? _game;
  ProofPhase _phase = ProofPhase.ready;
  int? _wrongFlash;
  Timer? _tick;
  Timer? _flash;

  /// Письменность партии или [proofDigits]; выбирается на настройке.
  String _script = 'latin';

  /// Время сыгранной партии — замирает на итоге, а не растёт дальше в шапке.
  double _doneSec = 0;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'proofreading', store: SharedLevelStore(widget.state), maxLevel: proofMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _flash?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    // Алфавиты — материал пробы, лежат ассетом: грузим до первой партии.
    await ProofScripts.load();
    await _ladder.load();
    if (!mounted) return;
    _script = widget.digits
        ? proofDigits
        : (widget.script ??
            proofScriptFor(param: GamePreset.str('mode'), locale: L.locale, known: ProofScripts.current.byId.keys));
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (proofAutostart || GamePreset.autostart) _start();
  }

  void _reset() {
    _tick?.cancel();
    _flash?.cancel();
    final preset = GamePreset.isPreset;
    _game = ProofGame(
      level: _ladder.level,
      script: _script == proofDigits ? 'latin' : _script,
      digits: _script == proofDigits,
      preset: preset,
      params: preset
          ? ProofLevel.preset(_ladder.level,
              wantRows: GamePreset.num('rows', 14), wantCols: GamePreset.num('cols', 12))
          : null,
      rnd: widget.rnd,
      nowMs: widget.clock,
    );
    _phase = ProofPhase.ready;
    _wrongFlash = null;
    _doneSec = 0;
  }

  /// Выбор письменности — только до начала партии.
  void _pickScript(String s) {
    if (_phase != ProofPhase.ready || s == _script) return;
    setState(() {
      _script = s;
      _reset();
    });
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = ProofPhase.playing;
      _wrongFlash = null;
    });
    // Часы партии тикают раз в секунду: на экране остаток времени (или прошедшее — у шага).
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _phase != ProofPhase.playing) return;
      final g = _game!;
      if (g.timeUp) {
        g.stopByTime();
        _finish();
        return;
      }
      setState(() {});
    });
  }

  void _tap(int index) {
    if (_phase != ProofPhase.playing) return;
    final g = _game!;
    final out = g.tap(index);
    if (out == ProofTap.ignored) return;
    setState(() {
      // Вспышка на ошибке — оформление, а не партия: гасится обычным таймером.
      _wrongFlash = out == ProofTap.wrong ? index : null;
    });
    if (out == ProofTap.wrong) {
      _flash?.cancel();
      _flash = Timer(const Duration(milliseconds: proofWrongFlashMs), () {
        if (!mounted) return;
        setState(() => _wrongFlash = null);
      });
    }
    if (g.finished) _finish();
  }

  void _hint() {
    if (_phase != ProofPhase.playing) return;
    if (_game!.takeHint() != null) setState(() {});
  }

  void _finish() {
    final g = _game!;
    _tick?.cancel();
    _flash?.cancel();
    _doneSec = g.finalSec;
    setState(() => _phase = ProofPhase.done);
    // Метки партии — как у веба: размер поля и уровень (у шага зарядки уровня нет).
    final difficulty = '${g.params.rows}x${g.params.cols}';
    final mode = g.preset ? null : 'lvl${g.level}';
    final details = proofSessionDetails(g);
    if (g.passed) {
      _ladder.win(
          score: g.found.length,
          timeSeconds: _doneSec.round(),
          errors: g.errors,
          difficulty: difficulty,
          mode: mode,
          details: details);
    } else {
      _ladder.fail(
          score: g.found.length,
          timeSeconds: _doneSec.round(),
          errors: g.errors,
          difficulty: difficulty,
          mode: mode,
          details: details);
    }
  }

  /// Примеры разбора: клетка С искомой буквой и клетка без неё.
  ///
  /// ⚠️ Буквы берутся из ЭТОЙ партии (`grid.targets` и её же алфавит), а не
  /// придуманные: на высоких уровнях целей две, и разбор с одной показывал бы
  /// задачу легче настоящей.
  List<DemoTrial> _demoTrials() {
    final g = _game;
    if (g == null) return const [];
    // 🔴 ДО НАЧАЛА ПАРТИИ ПОЛЯ ЕЩЁ НЕТ: `grid` заполняется в `begin()`, а разбор
    // нужен ИМЕННО ДО — объяснять правило после старта поздно, время уже идёт.
    // Поэтому, если поля нет, оно собирается тем же `buildGrid` и теми же
    // параметрами уровня: буквы будут настоящие, а не придуманные.
    final grid = g.grid.targets.isNotEmpty
        ? g.grid
        : buildGrid(
            rows: g.params.rows,
            cols: g.params.cols,
            alphabet: g.alphabet,
            rnd: Random(_ladder.level).nextDouble,
          );
    final targets = grid.targets;
    if (targets.isEmpty) return const [];
    final other = grid.letters.firstWhere(
      (l) => !targets.contains(l),
      orElse: () => '·',
    );
    final rule = '${L.t('proofreadingDesc')}: ${targets.join(', ')}';
    return [
      for (final t in targets)
        DemoTrial(text: t, answer: L.t('demoPress'), rule: rule),
      DemoTrial(text: other, answer: L.t('demoHold'), rule: rule),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    // До начала часы не идут, на итоге — замирают: `elapsedSec` до `begin()` и после конца
    // считал бы от нуля эпохи или дальше.
    final elapsed = switch (_phase) {
      ProofPhase.ready => 0.0,
      ProofPhase.playing => g.elapsedSec,
      ProofPhase.done => _doneSec,
    };
    final limited = g.params.timeLimitSec > 0;
    final left = (g.params.timeLimitSec - elapsed).clamp(0, g.params.timeLimitSec.toDouble());
    return GameShell(
      title: L.t('proofreading'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        // Шаг зарядки идёт без лимита — в шапке прошедшее время, как у веба.
        limited
            ? HudItem(label: L.t('timeLeftLabel'), value: '${left.round()}', icon: Icons.timer_outlined)
            : HudItem(label: L.t('time'), value: hudTime(elapsed, L.t('secShort')), icon: Icons.timer_outlined),
        HudItem(label: L.t('label_found'), value: '${g.found.length}/${g.grid.total}', icon: Icons.check),
        HudItem(label: L.t('hud_errors'), value: '${g.errors}', icon: Icons.close),
      ],
      onLesson: _demoTrials().isEmpty
          ? null
          : () => openDemoLesson(context, title: L.t('proofreading'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        wrongFlash: _wrongFlash,
        height: h,
        script: _script,
        onScript: _pickScript,
        onStart: _start,
        onAgain: () => setState(_reset),
        onTap: _tap,
      ),
      // Подсказка — служебное действие, значком под полем (у веба — в шапке, `GameAuxBar`).
      auxRow: _phase == ProofPhase.playing
          ? AuxBar(children: [
              AuxAction(
                key: const Key('proof-hint'),
                icon: Icons.lightbulb_outline,
                label: L.t('btn_hint'),
                tint: const Color(0xFFB45309),
                count: ProofGame.maxHints - g.hints,
                onPressed: g.hints < ProofGame.maxHints && g.found.length < g.grid.total ? _hint : null,
              ),
            ])
          : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.wrongFlash,
    required this.height,
    required this.script,
    required this.onScript,
    required this.onStart,
    required this.onAgain,
    required this.onTap,
  });

  final ProofGame game;
  final ProofPhase phase;
  final int? wrongFlash;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final String script;
  final ValueChanged<String> onScript;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case ProofPhase.ready:
        final p = game.params;
        final text = Theme.of(context).textTheme;
        // Настройки прокручиваются, «Начать» прибита снизу — как у «Объёма цифр»: с выбором
        // письменности настройка на малых экранах выше поля.
        return SizedBox(
          height: height,
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${L.t('level')} ${game.level}', style: text.titleLarge),
                        const SizedBox(height: 8),
                        Text(L.t('proofreadingDesc'), textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        // Письменность — выпадающим списком, как у веба (задача 6552ffb5: семь
                        // плашек вставали в четыре ряда).
                        Text(L.t('scriptLabel'), style: text.labelLarge),
                        DropdownButton<String>(
                          key: const Key('proof-script'),
                          value: script,
                          items: [
                            for (final s in [...ProofScripts.current.byId.keys, proofDigits])
                              DropdownMenuItem(value: s, key: Key('proof-script-$s'), child: Text(proofScriptLabel(s))),
                          ],
                          onChanged: (v) {
                            if (v != null) onScript(v);
                          },
                        ),
                        const SizedBox(height: 8),
                        Text(
                          // У шага зарядки лимита нет — строка без него, а не «лимит 0 с».
                          p.timeLimitSec > 0
                              ? L.t('proofLvlParams')
                                  .replaceAll('{r}', '${p.rows}')
                                  .replaceAll('{c}', '${p.cols}')
                                  .replaceAll('{w}', '${p.timeLimitSec}')
                              : '${p.rows}×${p.cols}',
                          key: const Key('proof-params'),
                          style: text.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                        if (!game.preset) ...[
                          const SizedBox(height: 6),
                          Text(L.t('proofPass').replaceAll('{p}', '${(p.minFoundPct * 100).round()}'),
                              style: text.bodySmall, textAlign: TextAlign.center),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
                child: FilledButton(onPressed: onStart, child: Text(L.t('start'))),
              ),
            ],
          ),
        );
      case ProofPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(
              game.preset
                  ? L.t('done')
                  : (game.passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry')),
              key: const Key('proof-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('label_found')}: ${game.found.length}/${game.grid.total} · '
                '${L.t('hud_errors')}: ${game.errors}'),
            // Доля пропусков — мера раздела, показывается числом.
            Text('${L.t('hud_missed')}: ${game.omissionPct}%', key: const Key('proof-omission')),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case ProofPhase.playing:
        final g = game;
        // Две цели — над полем: их надо держать в голове всю партию.
        final targets = g.grid.targets.join('  ');
        return SizedBox(
          height: height,
          child: LayoutBuilder(
            builder: (context, box) {
              const headerH = 44.0;
              // 🔴 Клетка считается от МЕНЬШЕГО из двух: по ширине и по высоте.
              // Возьми только ширину — на верхних уровнях поле уедет за нижний
              // край, а прокрутка превратила бы пробу в «успеть пролистать».
              final byWidth = (box.maxWidth - 8) / g.params.cols;
              final byHeight = (box.maxHeight - headerH - 8) / g.params.rows;
              final cell = min(byWidth, byHeight).floorToDouble();
              return Column(
                children: [
                  SizedBox(
                    height: headerH,
                    child: Center(
                      child: Text(
                        '${L.t('find')}: $targets',
                        key: const Key('proof-targets'),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: cell * g.params.cols,
                    height: cell * g.params.rows,
                    child: GridView.builder(
                      physics: const NeverScrollableScrollPhysics(),
                      padding: EdgeInsets.zero,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: g.params.cols),
                      itemCount: g.grid.letters.length,
                      itemBuilder: (context, i) => _Cell(
                        letter: g.grid.letters[i],
                        index: i,
                        found: g.found.contains(i),
                        wrong: wrongFlash == i,
                        hinted: g.hintCell == i && !g.found.contains(i),
                        size: cell,
                        onTap: () => onTap(i),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        );
    }
  }
}

/// Цвет подсказанной клетки — веба (`#fbbf24`): тот же, что у плиток задания в шапке.
const Color proofHintColor = Color(0xFFFBBF24);

class _Cell extends StatelessWidget {
  const _Cell({
    required this.letter,
    required this.index,
    required this.found,
    required this.wrong,
    required this.hinted,
    required this.size,
    required this.onTap,
  });

  final String letter;
  final int index;
  final bool found;
  final bool wrong;
  final bool hinted;
  final double size;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TapLatency(
        where: 'Flutter/Proofreading',
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            key: Key('proof-cell-$index'),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: found
                  ? const Color(0x3322C55E)
                  : (hinted ? proofHintColor : (wrong ? const Color(0x33EF4444) : Colors.transparent)),
              border: Border.all(width: 0.5, color: Theme.of(context).dividerColor),
            ),
            child: FittedBox(
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Text(
                  letter,
                  style: TextStyle(
                    fontWeight: found ? FontWeight.w900 : FontWeight.w500,
                    color: found ? const Color(0xFF22C55E) : (hinted ? Colors.black : null),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Centered extends StatelessWidget {
  const _Centered({required this.height, required this.children});
  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      );
}
