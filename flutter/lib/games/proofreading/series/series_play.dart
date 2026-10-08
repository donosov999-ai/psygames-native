/// Серия «Корректуры» на экране — перенос веба (`proofreading.tsx`: `beginSeries`, блоки, врезка,
/// итог; задача f4bb47dc).
///
/// 🔴 ТРИ ЗАДАНИЯ НА ОДНОМ ПОЛЕ БУКВ, И В ЭТОМ ВЕСЬ ЗАМЕР (аддитивный метод Стернберга):
///   знак  → T₁ зрительный поиск;
///   слово → T₂ − T₁ цена сегментации (границы слова в буквенном шуме);
///   смысл → T₃ − T₂ цена семантической классификации.
/// Поле собирается ОДИН раз на серию; часы каждого блока стартуют после врезки с правилом —
/// секунды чтения правила в замер не попадают. Неполная серия пишется как есть
/// (`series_complete: false`), но БЕЗ разностей: вычитать в ней нечего.
///
/// ⚠️ Серия — отдельная партия (`proofreading_series`): лестницу «Корректуры» она не двигает,
/// у неё свой прогресс — сторона поля по блокам (`psygames_proofreading_series_<профиль>`).
library;

import 'dart:math';

import 'package:flutter/material.dart';

import '../../../shell/aux_action.dart';
import '../../../shell/game_clock.dart';
import '../../../shell/game_shell.dart';
import '../../../shell/hud_time.dart';
import '../../../shell/l10n.dart';
import '../../../shell/series_core.dart';
import '../../../shell/session_report.dart';
import '../../../shell/shared_state.dart';
import '../../fillwords/core/fillwords.dart';
import '../fillwords_field.dart';
import 'series_blocks.dart';
import 'series_data.dart';
import 'series_field.dart';

/// Врезка между блоками, мс — веба (`INTERLUDE_MS`).
const int proofInterludeMs = 2500;

/// Ключ прогресса серии — веба: по профилю.
String proofSeriesKey(SharedState state) => '${SharedState.prefix}proofreading_series_${state.activeProfile}';

enum SeriesPhase { block, interlude, result }

class ProofSeriesPlay extends StatefulWidget {
  const ProofSeriesPlay({
    super.key,
    required this.state,
    required this.data,
    required this.words,
    required this.ladderLevel,
    required this.seed,
    required this.onExit,
    this.clock,
  });

  final SharedState state;
  final ProofSeriesData data;
  final FillwordsPool words;

  /// Уровень одиночной «Корректуры»: от него поле блока «Слово» и число подсказок.
  final int ladderLevel;
  final int seed;
  final VoidCallback onExit;
  final int Function()? clock;

  @override
  State<ProofSeriesPlay> createState() => ProofSeriesPlayState();
}

class ProofSeriesPlayState extends State<ProofSeriesPlay> {
  late ProofSeriesProgress _progress;
  late int _seed;
  ProofSeriesState? _ser;
  SeriesRun? _run;
  SeriesRun? _finished;
  ProofSeriesOutcome? _outcome;
  SeriesPhase _phase = SeriesPhase.block;
  int _blockStart = 0;
  bool _blockOpen = false;
  double _elapsed = 0;
  GameTimer? _tick;
  GameTimer? _interlude;
  List<int> _trace = const [];
  bool _dragged = false;
  FillwordsHint? _hint;
  int? _wrongFlash;
  GameTimer? _flash;

  int _now() => (widget.clock ?? gameNow)();
  String get _locale => widget.words.locale;
  ProofSeriesStrings get _s => widget.data.strings(L.locale);
  int get _ladderSize => fillwordsLevel(widget.ladderLevel).rows;
  int get _hintsAllowed => fillwordsLevel(widget.ladderLevel).hints;

  /// Сыгранные блоки — для проб и для итога.
  SeriesRun? get finishedRun => _finished;

  @override
  void initState() {
    super.initState();
    _seed = widget.seed;
    _progress = parseProofProgress(widget.state.get(proofSeriesKey(widget.state)));
    _begin();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _interlude?.cancel();
    _flash?.cancel();
    // Уход мимо кнопок (назад, «Заново» в паузе) серию не теряет: блоки сыграны — это время
    // человека. Пишем как при выходе кнопкой: неполная, без разностей.
    final run = _run;
    if (run != null) {
      final partial = _blockOpen && _ser != null ? recordBlock(run, _blockOf(_ser!, done: false)) : run;
      _run = null;
      if (partial.blocks.isNotEmpty) _report(partial);
    }
    super.dispose();
  }

  SeriesBlock _blockOf(ProofSeriesState s, {required bool done}) =>
      SeriesBlock(key: blockKeyAt(s.blockIndex), timeMs: _now() - _blockStart, errors: s.errors, done: done);

  void _report(SeriesRun run) {
    final s = seriesSession(run);
    SessionReport.send(
      gameType: proofSeriesGameType,
      score: s.score,
      timeSeconds: s.timeSeconds.round(),
      errors: s.errors,
      mode: s.mode,
      difficulty: '${run.level}x${run.level}',
      details: s.details,
    );
  }

  /// Старт серии: поле — ОДНО на три блока, по самому слабому блоку.
  void _begin() {
    final entry = proofSeriesEntry(_progress, _ladderSize);
    final field = buildProofField(widget.data, widget.words, _locale, entry.level, _seed);
    _seed += 1;
    _run = startSeries(proofSeriesGameType, entry.level, proofSeriesPlan, _now());
    _outcome = null;
    _finished = null;
    _trace = const [];
    _hint = null;
    _ser = openBlock(field, 0);
    _phase = SeriesPhase.block;
    _startClock();
  }

  void _startClock() {
    _tick?.cancel();
    _blockStart = _now();
    _blockOpen = true;
    _elapsed = 0;
    _tick = gameInterval(const Duration(milliseconds: 250), () {
      if (!mounted) return;
      setState(() => _elapsed = (_now() - _blockStart) / 1000);
    });
  }

  void _setSer(ProofSeriesState next) {
    final prev = _ser;
    // Подсказка гаснет, когда её слово собрано или начался другой блок.
    if (prev == null || next.blockIndex != prev.blockIndex || next.session.found.length != prev.session.found.length) {
      _hint = null;
    }
    _ser = next;
  }

  /// Блок доигран (или оборван): дописать в прогон и решить, что дальше.
  void _closeBlock(ProofSeriesState s, {required bool done}) {
    final run = _run;
    if (run == null || !_blockOpen) return;
    _tick?.cancel();
    _blockOpen = false;
    final updated = recordBlock(run, _blockOf(s, done: done));
    _run = updated;
    final isLast = s.blockIndex >= proofSeriesPlan.length - 1;
    if (done && !isLast) {
      setState(() => _phase = SeriesPhase.interlude);
      // Врезка сама уводит в следующий блок — по ТОМУ ЖЕ полю; часы стартуют после неё.
      _interlude = gameTimeout(const Duration(milliseconds: proofInterludeMs), () {
        if (!mounted || _ser == null) return;
        setState(() {
          _setSer(nextBlock(_ser!));
          _trace = const [];
          _phase = SeriesPhase.block;
        });
        _startClock();
      });
      return;
    }
    _finish(updated);
  }

  void _finish(SeriesRun run) {
    _tick?.cancel();
    _blockOpen = false;
    final outcome = afterProofSeries(_progress, run, _ladderSize);
    _progress = outcome.progress;
    widget.state.set(proofSeriesKey(widget.state), outcome.progress.encode());
    _run = null;
    setState(() {
      _outcome = outcome;
      _finished = run;
      _phase = SeriesPhase.result;
    });
    _report(run);
  }

  /// Уход из серии посреди неё: блоки как есть, `series_complete: false`, без разностей.
  void _leave() {
    final run = _run;
    if (run == null) {
      widget.onExit();
      return;
    }
    final s = _ser;
    if (_blockOpen && s != null) {
      _tick?.cancel();
      _blockOpen = false;
      _finish(recordBlock(run, _blockOf(s, done: false)));
      return;
    }
    _finish(run);
  }

  // ── Ввод ──────────────────────────────────────────────────────────────────────

  void _onSign(int index) {
    final s = _ser;
    if (s == null || _phase != SeriesPhase.block) return;
    final step = pressSignCell(s, index);
    if (step.result == ProofPress.ignored) return;
    setState(() {
      _setSer(step.state);
      _wrongFlash = step.result == ProofPress.miss ? index : null;
    });
    if (step.result == ProofPress.miss) {
      _flash?.cancel();
      _flash = gameTimeout(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _wrongFlash = null);
      });
    }
    if (step.result == ProofPress.hit && blockDone(step.state)) _closeBlock(step.state, done: true);
  }

  /// Слово засчитано в миг, когда линия его накрыла; промах — только на отпускании.
  void _commit(List<int> next) {
    final s = _ser!;
    final step = pressWordTrace(s, next);
    if (step.result != ProofPress.hit) {
      setState(() => _trace = next);
      return;
    }
    setState(() {
      _setSer(step.state);
      _trace = const [];
    });
    if (blockDone(step.state)) _closeBlock(step.state, done: true);
  }

  void _step(int cell) {
    final s = _ser;
    if (s == null || _phase != SeriesPhase.block || blockKeyAt(s.blockIndex) == 'sign') return;
    final next = stepTrace(s.session, _trace, cell);
    if (next.length == _trace.length) return;
    if (next.length < _trace.length) {
      setState(() => _trace = next);
      return;
    }
    _commit(next);
  }

  void _touch(int cell) {
    _dragged = false;
    final s = _ser;
    if (s == null || _phase != SeriesPhase.block || blockKeyAt(s.blockIndex) == 'sign') return;
    if (_trace.isNotEmpty && stepTrace(s.session, _trace, cell).length != _trace.length) {
      _step(cell);
      return;
    }
    setState(() => _trace = s.session.owner[cell] == -1 ? [cell] : const []);
  }

  void _drag(int cell) {
    _dragged = true;
    _step(cell);
  }

  void _release() {
    final dragged = _dragged;
    _dragged = false;
    // Линия, набранная ТАПАМИ, при отпускании не сдаётся: человек ещё набирает.
    if (!dragged) return;
    final s = _ser;
    final path = _trace;
    setState(() => _trace = const []);
    if (s == null || path.length < 2) return;
    final step = pressWordTrace(s, path);
    // Попадание засчитано по ходу ведения — сюда доходит промах.
    if (step.result == ProofPress.miss) setState(() => _setSer(step.state));
  }

  int get _hintsLeft {
    final s = _ser;
    final left = _hintsAllowed - (s?.session.hints ?? 0);
    return left < 0 ? 0 : left;
  }

  void _takeHint() {
    final s = _ser;
    if (s == null || _hintsLeft == 0) return;
    final taken = takeHint(s.session);
    if (taken.hint == null) return;
    setState(() {
      _ser = s.copyWith(session: taken.session);
      _hint = taken.hint;
    });
  }

  // ── Вид ─────────────────────────────────────────────────────────────────────

  String _label(String key) => switch (key) {
        'sign' => _s.blockSign,
        'word' => _s.blockWord,
        _ => _s.blockSense,
      };

  String _rule(String key, ProofField f) => interpolate(
        switch (key) {
          'sign' => _s.ruleSign,
          'word' => _s.ruleWord,
          _ => _s.ruleSense,
        },
        {'sign': f.signs.join(' · '), 'cat': widget.data.sense(_locale)?.categoryNames[f.category] ?? f.category},
      );

  @override
  Widget build(BuildContext context) {
    final s = _ser!;
    final key = blockKeyAt(s.blockIndex);
    final isSign = key == 'sign';
    return GameShell(
      title: L.t('proofreading'),
      onBack: _phase == SeriesPhase.result ? widget.onExit : _leave,
      hud: [
        HudItem(label: L.t('label_found'), value: '${blockStep(s)}/${blockStepsTotal(s.field, key)}', icon: Icons.check),
        HudItem(label: L.t('time'), value: hudTime(_elapsed, L.t('secShort')), icon: Icons.timer_outlined),
        HudItem(label: L.t('hud_errors'), value: '${s.errors}', icon: Icons.close),
      ],
      // Подсказка — служебное действие; в «Знаке» её нет: знаки названы прямо.
      auxRow: _phase == SeriesPhase.block && !isSign
          ? AuxBar(children: [
              AuxAction(
                key: const Key('ser-hint'),
                icon: Icons.lightbulb_outline,
                label: L.t('btn_hint'),
                tint: const Color(0xFF0D9488),
                count: _hintsLeft,
                onPressed: _hintsLeft > 0 ? _takeHint : null,
              ),
            ])
          : null,
      field: (context, h) => switch (_phase) {
        SeriesPhase.block => _blockView(context, h, s, key),
        SeriesPhase.interlude => _interludeView(context, h, s),
        SeriesPhase.result => _resultView(context, h),
      },
    );
  }

  Widget _blockView(BuildContext context, double h, ProofSeriesState s, String key) {
    final f = s.field;
    final isSign = key == 'sign';
    final text = Theme.of(context).textTheme;
    return SizedBox(
      height: h,
      child: LayoutBuilder(builder: (context, box) {
        const above = 76.0;
        const below = 44.0;
        // Правило веба (`сеткаКорректуры`, пол 24): max(24, min(по ширине, по высоте, 72)).
        final byWidth = ((box.maxWidth - 24).clamp(0.0, 760.0) / f.size).floorToDouble();
        final byHeight = ((box.maxHeight - above - below) / f.size).floorToDouble();
        final cell = max(24.0, min(min(byWidth, byHeight), 72.0));
        return Column(children: [
          SizedBox(
            height: 28,
            child: Center(
              child: Text(
                '${interpolate(_s.blockOf, {'n': s.blockIndex + 1, 'total': proofSeriesPlan.length})} · ${_label(key)}',
                key: const Key('ser-block'),
                style: text.bodySmall,
              ),
            ),
          ),
          SizedBox(
            height: 48,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(_label(key), style: text.titleMedium),
              if (isSign)
                for (var i = 0; i < f.signs.length; i++)
                  Container(
                    key: Key('ser-sign-$i'),
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: i == 0 ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(f.signs[i],
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF333333))),
                  ),
            ]),
          ),
          FwGrid(
            keyPrefix: 'ser',
            rows: f.size,
            cols: f.size,
            cell: cell,
            letters: f.puzzle.letters,
            look: (i) => isSign ? _signLook(s, i) : fwLook(s.session, _trace, _hint, i),
            onTapCell: isSign ? _onSign : null,
            onTouch: isSign ? null : _touch,
            onDrag: isSign ? null : _drag,
            onRelease: isSign ? null : _release,
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text(_rule(key, f), key: const Key('ser-rule'), textAlign: TextAlign.center, style: text.bodySmall),
          ),
        ]);
      }),
    );
  }

  FwCellLook _signLook(ProofSeriesState s, int i) {
    if (s.taken[i]) return (bg: fwTraceColor, ink: const Color(0xFF333333), bold: true);
    if (_wrongFlash == i) return (bg: const Color(0xFFF43F5E), ink: Colors.white, bold: false);
    return (bg: null, ink: null, bold: false);
  }

  Widget _interludeView(BuildContext context, double h, ProofSeriesState s) {
    final next = blockKeyAt(s.blockIndex + 1);
    final text = Theme.of(context).textTheme;
    return SizedBox(
      height: h,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(key: const Key('ser-interlude'), mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.swap_horiz, size: 44, color: fwTraceColor),
            const SizedBox(height: 8),
            Text(_s.ruleChanges, style: text.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(_label(next), style: text.titleMedium),
            const SizedBox(height: 8),
            Text(_rule(next, s.field), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(_s.sameField, style: text.bodySmall, textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }

  Widget _resultView(BuildContext context, double h) {
    final run = _finished!;
    final text = Theme.of(context).textTheme;
    final diffs = seriesDiffs(run);
    final out = _outcome;
    String signed(int ms) => '${ms > 0 ? '+' : ''}${(ms / 1000).toStringAsFixed(1)} ${L.t('seconds')}';
    return SizedBox(
      height: h,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(key: const Key('ser-result'), children: [
          const Icon(Icons.layers_outlined, size: 44),
          Text(_s.seriesDone, style: text.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          if (diffs == null)
            Text(_s.notFinished,
                key: const Key('ser-not-finished'), style: const TextStyle(color: Color(0xFFF43F5E)), textAlign: TextAlign.center)
          else ...[
            Text('${_s.signSpeed}: ${(run.blocks.first.timeMs / 1000).toStringAsFixed(1)} ${L.t('seconds')}',
                key: const Key('ser-sign-speed')),
            Text('${_s.segmentCost}: ${signed(diffs['word_minus_sign']!)}', key: const Key('ser-segment')),
            // Цена смысла — из разностей: (T₃−T₁) − (T₂−T₁); у неполной серии её нет вовсе.
            Text('${_s.senseCost}: ${signed(diffs['sense_minus_sign']! - diffs['word_minus_sign']!)}',
                key: const Key('ser-sense')),
          ],
          if (out != null) ...[
            const SizedBox(height: 12),
            Text(
              out.raised
                  ? interpolate(_s.levelUp, {'size': out.nextLevel})
                  : interpolate(_s.heldBy, {'block': _label(out.weakest), 'runs': out.runsLeft < 1 ? 1 : out.runsLeft}),
              key: const Key('ser-outcome'),
              style: text.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            key: const Key('ser-again'),
            onPressed: () => setState(_begin),
            icon: const Icon(Icons.refresh),
            label: Text(_s.again),
          ),
          TextButton(key: const Key('ser-leave'), onPressed: widget.onExit, child: Text(_s.leave)),
        ]),
      ),
    );
  }
}
