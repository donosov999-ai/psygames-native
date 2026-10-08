/// «МНЕМОНИКА» НА ОБЩЕМ КАРКАСЕ.
///
/// Три режима на одной лестнице `mnemonics`, как в вебе (`frontend/app/games/mnemonics.tsx`):
/// · СЛОВА и ЧИСЛА — показ ряда → окно удержания (пауза, с 9-го уровня — примеры-помехи) →
///   восстановление порядка касаниями; ошибка стоит 15 секунд, уровень растёт только за
///   ЧИСТОЕ воспроизведение;
/// · ОПОРЫ — тренировка самого кода 00–99: число → слово, с 4-го уровня и обратно, с 12-го —
///   время на ответ. Только там, где код есть (русский, английский).
///
/// 🔴 ОДИН ПУТЬ ЗАПУСКА, И ОН ПО УРОВНЮ (вариант A, решение Дениса 30.09.2026). Свободная
/// тренировка свёрнута в свой блок и прямо пишет «уровень не меняется»; её партия уходит в
/// статистику, но лестницу не трогает.
///
/// 🔴 ЧАСЫ ТИКАЮТ, ТОЛЬКО ПОКА ИГРА НА ПЕРЕДНЕМ ПЛАНЕ. Пауза каркаса и разбор — страницы поверх
/// игры, а таймер под ними шёл бы дальше: окно удержания кончалось бы, пока человек читает
/// паузу, и время на ответ в «Опорах» сгорало бы. Поэтому время здесь — сумма тиков, в которых
/// экран был текущим (веб держит то же правило своими игровыми часами, `gameNow`).
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/preset_cap.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'lesson.dart';
import 'model.dart';

enum MnemoPhase { setup, memorize, gap, check, pegs, result }

/// Штраф за ошибку в порядке, секунд (как в вебе).
const mnemoPenaltySeconds = 15;

/// Тик игровых часов.
const _tick = Duration(milliseconds: 100);

class MnemonicsScreen extends StatefulWidget {
  const MnemonicsScreen({super.key, required this.state, this.content, this.random});

  final SharedState state;

  /// Подставляется пробой: она не ходит в ассеты.
  final MnemonicsContent? content;

  /// Подставляется пробой: зерно раздачи.
  final Random? random;

  @override
  State<MnemonicsScreen> createState() => MnemonicsScreenState();
}

class MnemonicsScreenState extends State<MnemonicsScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late LevelLadder _ladder;
  late Random _random;
  MnemonicsContent? _content;
  bool _booting = true;

  String _mode = 'words';
  int _freeCount = 5;
  bool _freeOpen = false;
  bool _aidVisible = true;
  bool _aidTouched = false;

  MnemoPhase _phase = MnemoPhase.setup;
  bool _levelRun = false;
  int _runLevel = 1;
  List<String> _items = const [];
  List<String> _shuffled = const [];
  final List<String> _picked = [];
  int _errors = 0;
  int _elapsedMs = 0;
  GameTimer? _clock;

  int _gapLeftMs = 0;
  int _examples = 0;
  int _solved = 0;
  ({int a, int b, int answer, List<int> options})? _example;

  PegQuestion? _question;
  int _pegTotal = 0;
  final List<int> _asked = [];
  ({bool right, String answer})? _feedback;
  int _questionMs = 0;
  GameTimer? _feedbackTimer;

  bool _passed = false;
  int _score = 0;

  /// Открыто для пробы: ей нужно знать ряд, вопрос и фазу, чтобы играть нажатиями.
  MnemoPhase get phase => _phase;
  List<String> get items => _items;
  PegQuestion? get question => _question;
  ({int a, int b, int answer, List<int> options})? get example => _example;
  int get errors => _errors;

  String get _locale => L.locale;
  PegTable? get _pegs => _content?.pegsFor(_locale);
  double _rnd() => _random.nextDouble();
  int get _pegLevel => _levelRun ? _runLevel : 1;

  @override
  void initState() {
    super.initState();
    _random = widget.random ?? Random();
    _ladder = LevelLadder(gameId: 'mnemonics', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _clock?.cancel();
    _feedbackTimer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    final content = widget.content ?? MnemonicsContent.fromJsonString(await rootBundle.loadString('assets/mnemonics.json'));
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _content = content;
      _booting = false;
      // Шаг зарядки задаёт режим и длину ряда (`profiles.ts`); «Опоры» без кода — это «Слова».
      final wanted = GamePreset.str('mode', 'words');
      _mode = wanted == 'pegs' && !hasPegTable(_locale)
          ? 'words'
          : const ['words', 'numbers', 'pegs'].contains(wanted)
              ? wanted
              : 'words';
      _freeCount = GamePreset.num('itemCount', levelParams(1).itemCount);
      // Переключатель опоры сразу в том положении, в каком её покажет партия: с 7-го уровня
      // лестница снимает опору. В вебе настройка до старта показывала «Показывать» на любом
      // уровне, а при старте опора молча исчезала — здесь настройка не обещает лишнего.
      _aidVisible = _ladder.level <= 6;
    });
    // Шаг зарядки стартует сам и НЕ по уровню — как в вебе (`useAutostartWhenReady` → startGame()).
    if (mounted && GamePreset.autostart) _start(byLevel: false);
  }

  void _runClock() {
    _clock?.cancel();
    // Игровые часы: под паузой каркаса и под разбором удержание и ответ не тают (задача 430d1299).
    _clock = gameInterval(_tick, _onTick);
  }

  void _onTick() {
    if (!mounted) return;
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) return;   // пауза или разбор поверх игры — время стоит
    final ms = _tick.inMilliseconds;
    switch (_phase) {
      case MnemoPhase.memorize:
        setState(() => _elapsedMs += ms);
      case MnemoPhase.gap:
        setState(() {
          _elapsedMs += ms;
          if (_examples == 0) _gapLeftMs -= ms;
        });
        if (_examples == 0 && _gapLeftMs <= 0) _beginCheck();
      case MnemoPhase.pegs:
        setState(() {
          _elapsedMs += ms;
          if (_feedback == null) _questionMs += ms;
        });
        final limit = pegQuizParams(_pegLevel).limitMs;
        if (limit > 0 && _feedback == null && _questionMs >= limit) _answerPeg('\u0000');
      case MnemoPhase.setup || MnemoPhase.check || MnemoPhase.result:
        break;
    }
  }

  void _start({required bool byLevel, int? count}) {
    final c = _content;
    if (c == null) return;
    _feedbackTimer?.cancel();
    final level = _ladder.level;
    final preset = GamePreset.isPreset;
    setState(() {
      _levelRun = byLevel && !preset;
      _runLevel = level;
      _errors = 0;
      _elapsedMs = 0;
      _picked.clear();
      _feedback = null;
      _passed = false;
      _score = 0;
      final pegs = _pegs;
      if (_mode == 'pegs' && pegs != null) {
        _pegTotal = pegQuizParams(_pegLevel).count;
        _asked.clear();
        _questionMs = 0;
        _question = makePegQuestion(_pegLevel, pegs, _rnd);
        _items = const [];
        _phase = MnemoPhase.pegs;
        return;
      }
      var want = _levelRun ? levelParams(level).itemCount : (count ?? _freeCount);
      if (preset) {
        // Шаг зарядки не даёт больше, чем человек освоил: не дальше уровня + 2 (как в вебе).
        want = capPresetByLevel(want: want, atLevel: levelParams(level).itemCount, step: 2, atTop: level >= 11);
      }
      if (!_aidTouched) _aidVisible = level <= 6;
      _items = dealRow(_mode == 'words' ? 'words' : 'numbers', want, c.wordsFor(_locale), _rnd);
      _question = null;
      _phase = MnemoPhase.memorize;
    });
    _runClock();
  }

  void _startCheck() {
    final p = levelParams(_ladder.level);
    if (p.gapMs > 0 || p.mathTrials > 0) {
      setState(() {
        _examples = p.mathTrials;
        _solved = 0;
        _example = newExample(_rnd);
        _gapLeftMs = (p.gapMs / 1000).ceil() * 1000;
        _phase = MnemoPhase.gap;
      });
      return;
    }
    _beginCheck();
  }

  void _answerExample(int v) {
    final e = _example;
    if (e == null) return;
    v == e.answer ? _haptics.hit() : _haptics.miss();
    setState(() {
      if (v != e.answer) {
        _example = newExample(_rnd);
        return;
      }
      _solved += 1;
      if (_solved < _examples) _example = newExample(_rnd);
    });
    if (_solved >= _examples) _beginCheck();
  }

  void _beginCheck() {
    setState(() {
      _shuffled = [..._items]..shuffle(_random);
      _phase = MnemoPhase.check;
    });
  }

  Future<void> _pick(String item) async {
    if (_phase != MnemoPhase.check || _picked.contains(item)) return;
    final expected = _items[_picked.length];
    if (item != expected) {
      _haptics.miss();
      setState(() => _errors += 1);
      return;
    }
    _haptics.hit();
    setState(() => _picked.add(item));
    if (_picked.length < _items.length) return;
    final passed = _errors == 0;
    final score = _items.length - _errors;
    final seconds = (_elapsedMs / 1000).round() + _errors * mnemoPenaltySeconds;
    await _finish(passed: passed, score: score, seconds: seconds, difficulty: '${_items.length} $_mode', total: _items.length);
  }

  void _answerPeg(String option) {
    final q = _question;
    final pegs = _pegs;
    if (q == null || pegs == null || _feedback != null) return;
    final right = option == q.answer;
    right ? _haptics.hit() : _haptics.miss();
    setState(() {
      if (!right) _errors += 1;
      _feedback = (right: right, answer: q.answer);
      _asked.add(q.n);
    });
    _feedbackTimer?.cancel();
    _feedbackTimer = gameTimeout(Duration(milliseconds: right ? 550 : 1600), () {
      if (!mounted) return;
      if (_asked.length >= _pegTotal) {
        // Допуск — одна ошибка на десять вопросов (как в вебе).
        final passed = _errors <= _pegTotal ~/ 10;
        setState(() {
          _feedback = null;
          _question = null;
        });
        _finish(
          passed: passed,
          score: _pegTotal - _errors,
          seconds: (_elapsedMs / 1000).round(),
          difficulty: '$_pegTotal pegs',
          total: _pegTotal,
        );
        return;
      }
      setState(() {
        _feedback = null;
        _questionMs = 0;
        _question = makePegQuestion(_pegLevel, pegs, _rnd, [..._asked]);
      });
    });
  }

  Future<void> _finish({
    required bool passed,
    required int score,
    required int seconds,
    required String difficulty,
    required int total,
  }) async {
    _clock?.cancel();
    setState(() {
      _passed = passed;
      _score = score;
      _phase = MnemoPhase.result;
    });
    final details = {'level': _runLevel, 'hits': score, 'errors': _errors, 'item_count': total};
    if (_levelRun || GamePreset.isPreset) {
      // Пресет и партия с разбором лестницу не двигают — это решает сама лестница.
      if (passed) {
        await _ladder.win(
            score: score, timeSeconds: seconds, errors: _errors, mode: _mode, difficulty: difficulty, details: details);
      } else {
        await _ladder.fail(score: score, timeSeconds: seconds, errors: _errors, mode: _mode);
      }
    } else {
      // Свободная тренировка: в статистику — да, в лестницу — нет.
      LessonUsed.reset();
      await SessionReport.send(
        gameType: 'mnemonics',
        score: score,
        timeSeconds: seconds,
        errors: _errors,
        mode: _mode,
        difficulty: difficulty,
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  /// Тексты разбора — из словаря, теми же ключами, что зовёт веб-учитель.
  String _teach(String key, Map<String, String> args) {
    final text = switch (key) {
      'teachMnemoIntroWords' => L.t('teachMnemoIntroWords'),
      'teachMnemoIntroNumbers' => L.t('teachMnemoIntroNumbers'),
      'teachMnemoIntroNumbersNoPegs' => L.t('teachMnemoIntroNumbersNoPegs'),
      'teachMnemoWordFirst' => L.t('teachMnemoWordFirst'),
      'teachMnemoChainWords' => L.t('teachMnemoChainWords'),
      'teachMnemoPegFirst' => L.t('teachMnemoPegFirst'),
      'teachMnemoPeg' => L.t('teachMnemoPeg'),
      'teachMnemoChain' => L.t('teachMnemoChain'),
      'teachMnemoOrder' => L.t('teachMnemoOrder'),
      _ => L.t('teachMnemoDone'),
    };
    var out = text;
    args.forEach((k, v) => out = out.replaceAll('{$k}', v));
    return out;
  }

  /// Разбор — на уровнях 1–3, в «Словах» и «Числах». До партии он показывает приём на ряду
  /// того же уровня; во время запоминания — на ТЕКУЩЕМ ряду, и тогда партия не засчитывается.
  bool get _lessonAvailable =>
      _mode != 'pegs' &&
      _ladder.level <= 3 &&
      (_phase == MnemoPhase.setup || _phase == MnemoPhase.memorize) &&
      _content != null;

  Future<void> _openLesson() async {
    final c = _content;
    if (c == null) return;
    final inRound = _phase == MnemoPhase.memorize;
    final mode = _mode == 'words' ? 'words' : 'numbers';
    final items = inRound ? _items : dealRow(mode, levelParams(_ladder.level).itemCount, c.wordsFor(_locale), _rnd);
    final steps = mnemonicsLessonSteps(say: _teach, items: items, mode: mode, locale: _locale, content: c);
    if (steps.isEmpty) return;
    if (inRound) LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('mnemonics'),
        steps: steps,
        board: (context, side, i) =>
            _lessonBoard(context, c, items, mode, side, steps[i.clamp(0, steps.length - 1)].payload as MnemoCard),
      ),
    ));
  }

  Widget _lessonBoard(BuildContext context, MnemonicsContent c, List<String> items, String mode, double side, MnemoCard card) {
    final scheme = Theme.of(context).colorScheme;
    final shown = items.take(mnemoShown).toList();
    final pegs = mode == 'numbers' ? c.pegsFor(_locale) : null;
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: SizedBox(
        width: side,
        child: Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
          for (var k = 0; k < shown.length; k += 1)
            Container(
              key: ValueKey('mnemonics-lesson-item-$k'),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: card.item == k ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(shown[k],
                    style: TextStyle(
                        fontSize: 20, fontWeight: card.item == k ? FontWeight.w800 : FontWeight.w600)),
                if (pegs != null && int.tryParse(shown[k]) != null)
                  Text(pegs.words[int.parse(shown[k])], style: TextStyle(color: scheme.onSurfaceVariant)),
              ]),
            ),
        ]),
      ),
    );
  }

  List<HudItem> _hud() {
    String secs(int ms) => '${(ms / 1000).toStringAsFixed(1)}${L.t('secShort')}';
    switch (_phase) {
      case MnemoPhase.memorize || MnemoPhase.gap:
        return [HudItem(label: L.t('time'), value: secs(_elapsedMs), icon: Icons.schedule)];
      case MnemoPhase.check:
        return [
          HudItem(label: L.t('time'), value: secs(_elapsedMs), icon: Icons.schedule),
          HudItem(
            label: L.t('errors'),
            value: _errors > 0 ? '$_errors (+${_errors * mnemoPenaltySeconds}${L.t('secShort')})' : '0',
            icon: Icons.cancel_outlined,
          ),
          HudItem(label: L.t('label_selected'), value: '${_picked.length}/${_items.length}', icon: Icons.list),
        ];
      case MnemoPhase.pegs:
        final pegs = _pegs;
        final limit = pegQuizParams(_pegLevel).limitMs;
        return [
          HudItem(
            label: pegs?.text['left'] ?? '',
            value: '${(_pegTotal - _asked.length).clamp(0, _pegTotal)}',
            icon: Icons.help_outline,
          ),
          if (limit > 0 && _feedback == null)
            HudItem(
              label: L.t('timeLeftLabel'),
              value: '${((limit - _questionMs) / 1000).ceil().clamp(0, limit ~/ 1000)}${L.t('secShort')}',
              icon: Icons.hourglass_bottom,
            ),
        ];
      case MnemoPhase.setup || MnemoPhase.result:
        return const [];
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _content;
    if (_booting || c == null) {
      return GameShell(
        title: L.t('mnemonics'),
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final running = _phase != MnemoPhase.setup && _phase != MnemoPhase.result;
    return GameShell(
      title: L.t('mnemonics'),
      onLesson: _lessonAvailable ? _openLesson : null,
      hud: _hud(),
      field: (context, h) => _Pad(height: h, child: _field(context, c)),
      auxRow: running
          ? AuxBar(children: [
              AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => _start(byLevel: _levelRun)),
            ])
          : null,
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => _start(byLevel: _levelRun)),
      ],
    );
  }

  Widget _field(BuildContext context, MnemonicsContent c) {
    switch (_phase) {
      case MnemoPhase.setup:
        return _setup(context, c);
      case MnemoPhase.memorize:
        return _memorize(context);
      case MnemoPhase.gap:
        return _gap(context);
      case MnemoPhase.check:
        return _check(context);
      case MnemoPhase.pegs:
        return _pegsField(context);
      case MnemoPhase.result:
        return _result(context);
    }
  }

  Widget _chip(String key, String label, bool on, VoidCallback onTap, {IconData? icon}) => ChoiceChip(
        key: ValueKey(key),
        avatar: icon == null ? null : Icon(icon, size: 18),
        label: Text(label),
        selected: on,
        onSelected: (_) => onTap(),
      );

  Widget _setup(BuildContext context, MnemonicsContent c) {
    final scheme = Theme.of(context).colorScheme;
    final pegs = _pegs;
    final level = _ladder.level;
    final preset = GamePreset.isPreset;
    return SingleChildScrollView(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!preset)
          Text(
            _mode == 'pegs'
                ? L.f('mnemLevelLinePegs', {'level': '$level'})
                : L.f('mnemLevelLine', {'level': '$level', 'n': '${levelParams(level).itemCount}'}),
            key: const ValueKey('mnemonics-level-line'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        // Правило уровня (веб: MNEMONICS_RULES, `method` с 7-го): с семи-восьми элементов
        // проговаривание ряд не держит — нужен приём. Показываем на настройке, как «Вероятностный
        // выбор» (prl): правило — до партии, а не после провала.
        if (_mode != 'pegs' && level >= 7) ...[
          const SizedBox(height: 10),
          Container(
            key: const ValueKey('mnemonics-level-rule'),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(L.t('lr_mnemonics_method_title'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(L.t('lr_mnemonics_method_rule')),
              const SizedBox(height: 4),
              Text(L.t('lr_mnemonics_method_example'), style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
            ]),
          ),
        ],
        const SizedBox(height: 12),
        Text(L.t('mode'), style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _chip('mnemonics-mode-words', L.t('label_words'), _mode == 'words', () => setState(() => _mode = 'words'),
              icon: Icons.notes),
          _chip('mnemonics-mode-numbers', L.t('catVocab_numbers'), _mode == 'numbers',
              () => setState(() => _mode = 'numbers'),
              icon: Icons.pin_outlined),
          // Третий режим — только там, где код есть: переключатель без таблицы за ним — обман.
          if (pegs != null)
            _chip('mnemonics-mode-pegs', pegs.text['mode'] ?? '', _mode == 'pegs', () => setState(() => _mode = 'pegs'),
                icon: Icons.grid_view),
        ]),
        if ((_mode == 'numbers' || _mode == 'pegs') && pegs != null) ...[
          const SizedBox(height: 14),
          if (_mode == 'numbers')
            Row(children: [
              Expanded(child: Text(pegs.text['aid'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600))),
              _chip('mnemonics-aid', (_aidVisible ? pegs.text['show'] : pegs.text['hide']) ?? '', _aidVisible, () {
                setState(() {
                  _aidTouched = true;
                  _aidVisible = !_aidVisible;
                });
              }, icon: _aidVisible ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            ]),
          const SizedBox(height: 8),
          Text(pegs.text['codeTitle'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
          for (final r in pegs.rule)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                    width: 22,
                    child: Text('${r.digit}', style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w800))),
                SizedBox(width: 64, child: Text(r.letters, style: const TextStyle(fontWeight: FontWeight.w600))),
                Expanded(child: Text(r.why, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13))),
              ]),
            ),
          Text(pegs.text['codeTail'] ?? '', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
        ],
        if (!preset && _mode != 'pegs') ...[
          const SizedBox(height: 14),
          InkWell(
            key: const ValueKey('mnemonics-free-toggle'),
            onTap: () => setState(() => _freeOpen = !_freeOpen),
            child: Row(children: [
              Expanded(child: Text(L.t('mnemFreeTraining'), style: const TextStyle(fontWeight: FontWeight.w600))),
              Icon(_freeOpen ? Icons.expand_less : Icons.expand_more),
            ]),
          ),
          if (_freeOpen) ...[
            Text(L.t('mnemFreeTrainingNote'), style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, children: [
              for (final n in const [5, 8, 12, 20])
                _chip('mnemonics-free-$n', '$n', _freeCount == n, () => setState(() => _freeCount = n)),
            ]),
            const SizedBox(height: 6),
            OutlinedButton(
              key: const ValueKey('mnemonics-free-start'),
              onPressed: () => _start(byLevel: false, count: _freeCount),
              child: Text(L.f('mnemFreeTrainingStart', {'n': '$_freeCount'})),
            ),
          ],
        ],
      ]),
    );
  }

  Widget _memorize(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pegs = _mode == 'numbers' && _aidVisible ? _pegs : null;
    return SingleChildScrollView(
      child: Column(children: [
        Text(
          // Ключ буквально в вызове: сборщик словаря (embed-l10n) ищет `L.f('ключ'`, выбор мимо него.
          _mode == 'words'
              ? L.f('mnemMemorizeWords', {'n': '${_items.length}'})
              : L.f('mnemMemorizeNumbers', {'n': '${_items.length}'}),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
          for (var i = 0; i < _items.length; i += 1)
            Container(
              key: ValueKey('mnemonics-item-$i'),
              constraints: const BoxConstraints(minWidth: 96),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('${i + 1}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                Text(_items[i], style: TextStyle(fontSize: _mode == 'numbers' ? 28 : 20, fontWeight: FontWeight.w700)),
                // Опора под числом: слово и разбор по согласным («мёд м=3 + д=1»).
                if (pegs != null && int.tryParse(_items[i]) != null) ...[
                  Text(pegs.words[int.parse(_items[i])], key: ValueKey('mnemonics-peg-word-$i')),
                  Text(pegs.why(int.parse(_items[i])), style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                ],
              ]),
            ),
        ]),
      ]),
    );
  }

  Widget _gap(BuildContext context) {
    final e = _example;
    final scheme = Theme.of(context).colorScheme;
    if (_examples > 0 && e != null) {
      return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Text('${_solved + 1} / $_examples', style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        Text('${e.a} + ${e.b}', key: const ValueKey('mnemonics-gap-example'), style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w800)),
      ]);
    }
    return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.hourglass_empty, size: 40, color: scheme.onSurfaceVariant),
      Text('${(_gapLeftMs / 1000).ceil().clamp(0, 99)}', key: const ValueKey('mnemonics-gap-left'), style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w800)),
    ]);
  }

  Widget _check(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      child: Column(children: [
        Text(L.t('label_restore_order'), style: Theme.of(context).textTheme.titleMedium),
        Text(L.t('hint_top_to_bottom'), style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
          for (final item in _shuffled)
            _PickButton(
              key: ValueKey('mnemonics-pick-$item'),
              label: item,
              order: _picked.contains(item) ? _picked.indexOf(item) + 1 : null,
              big: _mode == 'numbers',
              onTap: () => _pick(item),
            ),
        ]),
      ]),
    );
  }

  Widget _pegsField(BuildContext context) {
    final q = _question;
    final pegs = _pegs;
    final scheme = Theme.of(context).colorScheme;
    if (q == null || pegs == null) return const SizedBox.shrink();
    final f = _feedback;
    return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Text(q.direction == PegDirection.toWord ? (pegs.text['askWord'] ?? '') : (pegs.text['askNumber'] ?? ''),
          style: TextStyle(color: scheme.onSurfaceVariant)),
      const SizedBox(height: 8),
      Text(q.prompt, key: const ValueKey('mnemonics-peg-prompt'), style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w800)),
      if (f != null) ...[
        const SizedBox(height: 10),
        Text(
          f.right ? (pegs.text['right'] ?? '') : '${pegs.text['wrong'] ?? ''} ${f.answer}',
          key: const ValueKey('mnemonics-peg-feedback'),
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: f.right ? scheme.primary : scheme.error),
        ),
      ],
    ]);
  }

  Widget _result(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final total = _mode == 'pegs' ? _pegTotal : _items.length;
    return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(_passed ? Icons.emoji_events_outlined : Icons.replay_outlined,
          key: const ValueKey('mnemonics-result'), size: 44, color: _passed ? scheme.primary : scheme.onSurfaceVariant),
      const SizedBox(height: 10),
      Text('$_score/$total', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 6),
      Text('${(_elapsedMs / 1000).toStringAsFixed(1)}${L.t('secShort')}'),
      if (_errors > 0)
        Text('${L.t('errors')}: $_errors', style: TextStyle(color: scheme.error)),
    ]);
  }

  Widget? _toolbar(BuildContext context) {
    Widget bar(List<Widget> children) => Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: children),
        );
    switch (_phase) {
      case MnemoPhase.setup || MnemoPhase.result:
        return bar([
          FilledButton.icon(
            key: const ValueKey('mnemonics-start'),
            onPressed: () => _start(byLevel: true),
            icon: const Icon(Icons.play_arrow),
            label: Text(L.t('start')),
          ),
          if (_phase == MnemoPhase.result)
            OutlinedButton(
              key: const ValueKey('mnemonics-setup'),
              onPressed: () => setState(() => _phase = MnemoPhase.setup),
              child: Text(L.t('mode')),
            ),
        ]);
      case MnemoPhase.memorize:
        return bar([
          FilledButton.icon(
            key: const ValueKey('mnemonics-check'),
            onPressed: _startCheck,
            icon: const Icon(Icons.check),
            label: Text(L.t('check')),
          ),
        ]);
      case MnemoPhase.gap:
        final e = _example;
        if (_examples == 0 || e == null) return null;
        return bar([
          for (final v in e.options)
            OutlinedButton(
              key: ValueKey('mnemonics-gap-$v'),
              onPressed: () => _answerExample(v),
              child: Text('$v', style: const TextStyle(fontSize: 22)),
            ),
        ]);
      case MnemoPhase.check:
        return null;
      case MnemoPhase.pegs:
        final q = _question;
        if (q == null) return null;
        return bar([
          for (var i = 0; i < q.options.length; i += 1)
            FilledButton.tonal(
              key: ValueKey('mnemonics-peg-option-$i'),
              onPressed: _feedback == null ? () => _answerPeg(q.options[i]) : null,
              child: Text(q.options[i], style: const TextStyle(fontSize: 18)),
            ),
        ]);
    }
  }
}

class _PickButton extends StatelessWidget {
  const _PickButton({super.key, required this.label, required this.order, required this.big, required this.onTap});

  final String label;
  final int? order;
  final bool big;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final done = order != null;
    return Material(
      color: done ? scheme.primary : scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: done ? null : onTap,
        child: Container(
          constraints: const BoxConstraints(minWidth: 96, minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (done) Text('$order', style: TextStyle(color: scheme.onPrimary, fontSize: 12)),
            Text(label,
                style: TextStyle(
                    fontSize: big ? 28 : 20, fontWeight: FontWeight.w700, color: done ? scheme.onPrimary : scheme.onSurface)),
          ]),
        ),
      ),
    );
  }
}

class _Pad extends StatelessWidget {
  const _Pad({required this.height, required this.child});

  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height.isFinite ? height : null,
        child: Padding(padding: const EdgeInsets.all(12), child: child),
      );
}
