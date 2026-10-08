import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/app_haptics.dart';
import '../../shell/audio_host.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import 'model.dart';

/// «Цифровой ряд» на общем каркасе — перенос `app/games/digit-span.tsx` ЦЕЛИКОМ.
///
/// Уровень — лесенка длин: ряд показан (по одной цифре, голосом или весь разом), набран своими
/// клавишами под полем и проверен на последней цифре; верно — следующий ряд длиннее, две ошибки
/// на одной длине — партия кончена. Выше потолка объёма — удержание перед вводом и направление,
/// объявленное ПОСЛЕ показа. Все паузы — на игровых часах каркаса.
enum DsPhase { ready, showing, input, done, revealed }

/// Подписи модуля (`core/i18n.ts`) — словарь на 12 языков `assets/l10n/digit_span.json`,
/// выгрузка экспортёром эталона.
class DsStrings {
  const DsStrings._(this._map);

  final Map<String, String> _map;

  static const empty = DsStrings._({});

  String t(String key) => _map[key] ?? key;

  /// Для проб: словарь с диска, без rootBundle (ассет, дочитанный в теле пробы, вешает её).
  static DsStrings fromJson(Map<String, dynamic> all, String locale) {
    final one = (all[locale] ?? all['en']) as Map<String, dynamic>?;
    return DsStrings._((one ?? const {}).map((k, v) => MapEntry(k, '$v')));
  }

  static Future<DsStrings> load({AssetBundle? bundle}) async {
    try {
      // Байты, а не loadString: от 50 КБ тот уходит в изолят, и в пробах висит.
      final data = await (bundle ?? rootBundle).load('assets/l10n/digit_span.json');
      final all = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
          as Map<String, dynamic>;
      return fromJson(all, L.resolve(L.locale));
    } catch (_) {
      return empty;
    }
  }
}

/// Личный рекорд — тот же ключ, что у веб-таблицы лидеров (`leaderboard.ts`, `rememberPersonalBest`):
/// префикс `psygames_`, мост возит его в обе половины.
const dsPersonalBestKey = 'psygames_leaderboard_personal_best_digit_span';

/// Цвет градиента веб-экрана (`#11998e`).
const _accent = Color(0xFF11998E);

class DigitSpanScreen extends StatefulWidget {
  const DigitSpanScreen({super.key, required this.state, this.voice, this.strings, this.rng});

  final SharedState state;

  /// Голосовой слой; пробы подставляют свой.
  final VoiceLayer? voice;

  /// Словарь модуля; пробы подставляют прочитанный с диска.
  final DsStrings? strings;

  /// Случайность рядов и розыгрыша направления; пробы подставляют семенную.
  final double Function()? rng;

  @override
  State<DigitSpanScreen> createState() => _DigitSpanScreenState();
}

class _DigitSpanScreenState extends State<DigitSpanScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late double Function() _rng;
  final Map<String, LevelLadder> _ladders = {};
  LevelLadder? _ladder;
  VoiceLayer? _voice;
  VoiceBlock? _block;
  DsStrings _ds = DsStrings.empty;
  bool _loaded = false;

  /// Выбор на экране настроек: способ подачи; в шаге зарядки — ещё темп, направление и длина.
  Delivery _delivery = Delivery.screen;
  Pace _pace = Pace.normal;
  Direction _presetDir = Direction.forward;
  int _presetLen = 4;

  /// Что решено на старте партии (веб — рефы startGame).
  DigitSpanSession? _s;
  Delivery _playDelivery = Delivery.screen;
  bool _surprise = false;
  int _holdMs = 0;
  int _showMs = 700;
  int _gapMs = 1100;
  bool _counts = false;
  int? _storedBest;
  int? _startedAt;

  DsPhase _phase = DsPhase.ready;

  /// Что на поле показа: цифра ряда, `-3` — весь ряд, `-2` — пусто между цифрами.
  int _showIdx = -2;
  bool _holding = false;

  /// Итог набранного ряда: null — ещё набирается.
  bool? _feedback;
  bool _submitting = false;
  int _runId = 0;
  final List<GameTimer> _timers = [];

  @override
  void initState() {
    super.initState();
    _rng = widget.rng ?? Random().nextDouble;
    _boot();
  }

  @override
  void dispose() {
    _runId++;
    _cancelTimers();
    _voice?.cancel();
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

  /// Ждать по игровым часам: пауза приложения останавливает и паузы между цифрами голоса.
  Future<void> _wait(int ms) {
    final done = Completer<void>();
    _timers.add(gameTimeout(Duration(milliseconds: ms), done.complete));
    return done.future;
  }

  bool _alive(int run) => mounted && run == _runId;

  Future<void> _boot() async {
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final ds = widget.strings ?? await DsStrings.load();
    // Как веб `useGamePreset().str/num`: параметры адреса шага; вне шага — значения по умолчанию.
    _delivery = Delivery.values.asNameMap()[GamePreset.str('delivery', 'screen')] ?? Delivery.screen;
    _pace = Pace.values.asNameMap()[GamePreset.str('pace', 'normal')] ?? Pace.normal;
    _presetDir = Direction.values.asNameMap()[GamePreset.str('mode', 'forward')] ?? Direction.forward;
    _presetLen = GamePreset.num('startLen', 4);
    _voice = voice;
    _ds = ds;
    _block = await voice.blockedReason(L.locale);
    _storedBest = int.tryParse(widget.state.get(dsPersonalBestKey) ?? '');
    await _useLadder();
    if (!mounted) return;
    setState(() {
      _loaded = true;
      _reset();
    });
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady`.
    if (GamePreset.autostart) unawaited(_start());
  }

  /// Лестница по ЭФФЕКТИВНОЙ подаче: голос без голоса играет экраном и двигает экранную.
  Future<void> _useLadder() async {
    final id = ladderIdFor(_delivery, _block);
    final ladder = _ladders.putIfAbsent(
        id, () => LevelLadder(gameId: id, sessionType: 'digit_span', store: SharedLevelStore(widget.state)));
    if (!identical(ladder, _ladder)) await ladder.load();
    _ladder = ladder;
  }

  Future<void> _chooseDelivery(Delivery d) async {
    _delivery = d;
    await _useLadder();
    if (mounted) setState(_reset);
  }

  void _reset() {
    _runId++;
    _cancelTimers();
    _voice?.cancel();
    _s = null;
    _phase = DsPhase.ready;
    _showIdx = -2;
    _holding = false;
    _feedback = null;
    _submitting = false;
    _startedAt = null;
  }

  Future<void> _start() async {
    if (_phase != DsPhase.ready || !_loaded) return;
    // Голос мог пропасть с экрана настроек (выключили звук) — причина пересчитывается на старте.
    _block = await _voice!.blockedReason(L.locale);
    await _useLadder();
    if (!mounted || _phase != DsPhase.ready) return;
    final isPreset = GamePreset.isPreset;
    final effLevel = isPreset ? 1 : _ladder!.level;
    final p = LevelParams.of(effLevel);
    final timing = showTiming(isPreset: isPreset, level: effLevel, pace: _pace);
    _showMs = timing.showMs;
    _gapMs = timing.gapMs;
    _holdMs = isPreset ? 0 : p.holdMs;   // шаг зарядки идёт мимо лестницы
    // Ось 9: выше порога направление разыгрывается и объявляется только на вводе.
    _surprise = !isPreset && p.surpriseDir;
    final dir = _surprise
        ? drawDirection(_rng)
        : (isPreset ? _presetDir : (p.reverse ? Direction.backward : Direction.forward));
    _playDelivery = effectiveDelivery(_delivery, _block);
    // Рекорд — только личная партия первого уровня экраном (веб `countsForRecord` + подача).
    _counts = !isPreset && effLevel == 1 && _playDelivery == Delivery.screen;
    // ⚠️ Шаг — потолок желания: стартовая длина шага не выше освоенного + 1 (веб `capPresetByLevel`).
    final startLen = isPreset
        ? capPresetByLevel(want: _presetLen, atLevel: p.startLen, atTop: p.startLen >= 9)
        : p.startLen;
    _s = DigitSpanSession(level: effLevel, isPreset: isPreset, direction: dir, startLen: startLen);
    _startedAt = gameNow();
    _showRow();
  }

  void _showRow() {
    final s = _s!;
    s.deal(_rng);
    final run = ++_runId;
    _submitting = false;
    setState(() {
      _phase = DsPhase.showing;
      _feedback = null;
      _holding = false;
      _showIdx = switch (_playDelivery) { Delivery.screen => 0, Delivery.all => -3, Delivery.voice => -2 };
    });
    switch (_playDelivery) {
      case Delivery.voice:
        unawaited(_speakRow(run));
      case Delivery.all:
        // Весь ряд держится столько же, сколько шёл бы показ по одной цифре.
        _after(allAtOnceMs(s.seqLen, _gapMs), () {
          setState(() => _showIdx = -2);
          _after(dsAfterShowMs, () => _openInput(run));
        });
      case Delivery.screen:
        // Цифра i — в i·пауза, гаснет через «показ»; как веб-интервал с первой цифрой сразу.
        _after(_showMs, () => setState(() => _showIdx = -2));
        for (var i = 1; i < s.seqLen; i++) {
          _after(i * _gapMs, () => setState(() => _showIdx = i));
          _after(i * _gapMs + _showMs, () => setState(() => _showIdx = -2));
        }
        _after(s.seqLen * _gapMs, () {
          setState(() => _showIdx = -2);
          _after(dsAfterShowMs, () => _openInput(run));
        });
    }
  }

  /// Голосом: цифры по одной, после каждой — пауза ряда (веб `speakSequence` по одной цифре).
  Future<void> _speakRow(int run) async {
    final s = _s!;
    for (final d in s.sequence) {
      if (!_alive(run)) return;
      await _voice!.speak('$d', L.locale);
      if (!_alive(run)) return;
      await _wait(_gapMs);
    }
    if (_alive(run)) _openInput(run);
  }

  /// Ввод открывается В ОДНОМ МЕСТЕ на все три способа подачи; выше потолка — сперва удержание.
  void _openInput(int run) {
    if (!_alive(run)) return;
    void go() {
      if (!_alive(run)) return;
      setState(() {
        _holding = false;
        _phase = DsPhase.input;
      });
    }

    if (_holdMs > 0) {
      setState(() => _holding = true);
      _after(_holdMs, go);
      return;
    }
    go();
  }

  bool get _canType => _phase == DsPhase.input && _feedback == null && !_submitting;

  void _press(int d) {
    final s = _s;
    if (s == null || !_canType || !s.enter(d)) return;
    setState(() {});
    if (s.full) {
      // Ответ проверяется сам на последней цифре — чуть позже, чтобы она успела показаться.
      _submitting = true;
      final run = _runId;
      _after(dsSubmitDelayMs, () => _submit(run));
    }
  }

  void _erase() {
    final s = _s;
    if (s == null || !_canType) return;
    setState(s.undo);
  }

  void _submit(int run) {
    if (!_alive(run)) return;
    final s = _s!;
    final correct = s.rowCorrect;
    final over = s.submit();
    // Клавиши — не вердикт; отзывается проверка ряда: собран — сильнее, ошибка — тяжело.
    correct ? _haptics.win() : _haptics.miss();
    setState(() => _feedback = correct);
    if (over) {
      unawaited(_finish());
      return;
    }
    _after(dsNextRowMs, () {
      if (_alive(run)) _showRow();
    });
  }

  Future<void> _finish() async {
    final s = _s!;
    final ladder = _ladder!;
    final seconds = ((gameNow() - (_startedAt ?? gameNow())) / 1000).round();
    setState(() => _phase = DsPhase.done);
    // Метки и details — как пишет веб-экран (`saveSession` в digit-span.tsx).
    final labels = sessionLabels(
        isPreset: s.isPreset, diff: GamePreset.str('diff', 'medium'), direction: s.direction, finalLength: s.seqLen);
    final details = <String, Object?>{
      'level': s.level,
      'maxSpan': s.maxSpan,
      'correctRounds': s.correctRounds,
      'finalLength': s.seqLen,
      'direction': s.direction.name,
      'delivery': _playDelivery.name,
    };
    if (s.passed) {
      await ladder.win(
          score: s.score, timeSeconds: seconds, errors: s.errors, mode: labels.mode, difficulty: labels.difficulty, details: details);
    } else {
      await ladder.fail(
          score: s.score, timeSeconds: seconds, errors: s.errors, mode: labels.mode, difficulty: labels.difficulty, details: details);
    }
    // Рекорд пишется локально тем же ключом, что у веба; отправка в общую таблицу — общий слой.
    if (_counts) {
      final best = int.tryParse(widget.state.get(dsPersonalBestKey) ?? '');
      if (best == null || s.maxSpan > best) {
        await widget.state.set(dsPersonalBestKey, '${s.maxSpan}');
        _storedBest = s.maxSpan;
      }
    }
    if (mounted) setState(() {});
  }

  /// «Показать решение»: ряд раскрыт, партия кончается без зачёта и без записи.
  void _reveal() {
    _runId++;
    _cancelTimers();
    _voice?.cancel();
    setState(() => _phase = DsPhase.revealed);
  }

  String _dirName(Direction d) => switch (d) {
        Direction.forward => L.t('directionForward'),
        Direction.backward => L.t('directionBackward'),
        Direction.ascending => _ds.t('directionAscending'),
      };

  String _typePrompt(Direction d) => switch (d) {
        Direction.forward => L.t('typeAsShown'),
        Direction.backward => L.t('typeReversed'),
        Direction.ascending => _ds.t('typeAscending'),
      };

  @override
  Widget build(BuildContext context) {
    final ladder = _ladder;
    if (!_loaded || ladder == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final s = _s;
    final p = LevelParams.of(ladder.level);
    final record = hudRecord(_storedBest, s?.maxSpan ?? 0, s != null && _counts);
    final calm = _phase == DsPhase.ready || _phase == DsPhase.done || _phase == DsPhase.revealed;
    final playing = _phase == DsPhase.showing || _phase == DsPhase.input;
    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх показа.
      levelRule: LevelRuleSpot(gameId: 'digit_span', level: ladder.level, state: widget.state, calm: calm),
      title: L.t('digitSpan'),
      onLesson: () => openDemoLesson(context, title: L.t('digitSpan'), trials: digitSpanLessonTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${ladder.level}', icon: Icons.flag_outlined),
        _phase == DsPhase.showing
            ? HudItem(label: L.t('memorize'), value: '${s?.seqLen ?? 0}', icon: Icons.visibility_outlined)
            : HudItem(label: L.t('lengthLabel'), value: '${s?.seqLen ?? p.startLen}', icon: Icons.pin_outlined),
        HudItem(label: L.t('round'), value: s == null ? '—' : '${s.round}', icon: Icons.repeat),
        HudItem(label: L.t('hud_span'), value: '${s?.maxSpan ?? 0}', icon: Icons.trending_up),
        HudItem(label: L.t('personalBest'), value: record == null ? '—' : '$record', icon: Icons.emoji_events_outlined),
      ],
      field: (context, h) => switch (_phase) {
        DsPhase.ready => _Ready(
            ds: _ds,
            level: ladder.level,
            params: p,
            delivery: _delivery,
            block: _block,
            preset: GamePreset.isPreset,
            pace: _pace,
            presetDir: _presetDir,
            presetLen: _presetLen,
            dirName: _dirName,
            onDelivery: (d) => unawaited(_chooseDelivery(d)),
            onPace: (v) => setState(() => _pace = v),
            onDir: (v) => setState(() => _presetDir = v),
            onLen: (v) => setState(() => _presetLen = v),
            onStart: () => unawaited(_start()),
          ),
        DsPhase.showing => _Showing(
            height: h,
            holding: _holding,
            voice: _playDelivery == Delivery.voice,
            text: _showIdx == -3 ? s!.sequence.join(' ') : (_showIdx >= 0 ? '${s!.sequence[_showIdx]}' : ' '),
            listening: _ds.t('listening'),
          ),
        _ => _Answer(
            height: h,
            session: s!,
            phase: _phase,
            feedback: _feedback,
            prompt: _typePrompt(s.direction),
            reveal: _surprise && _phase == DsPhase.input ? _dirName(s.direction) : null,
          ),
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.visibility_outlined,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: _phase == DsPhase.input ? _reveal : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      // Низ — ОТВЕТ: ряд клавиш стоит всю партию и гаснет вне ввода (веб `bottom="answer"`).
      toolbar: playing
          ? _Keypad(on: _canType, onDigit: _press, onErase: _erase)
          : (_phase == DsPhase.done || _phase == DsPhase.revealed)
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton.icon(
                    key: const Key('ds-again'),
                    onPressed: () => setState(_reset),
                    icon: const Icon(Icons.arrow_forward),
                    label: Text(_phase == DsPhase.done && s!.passed ? L.t('nextLabel') : L.t('retry')),
                  ),
                )
              : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Экран настроек: что за уровень, способ подачи; в шаге зарядки — темп, направление, длина.
class _Ready extends StatelessWidget {
  const _Ready({
    required this.ds,
    required this.level,
    required this.params,
    required this.delivery,
    required this.block,
    required this.preset,
    required this.pace,
    required this.presetDir,
    required this.presetLen,
    required this.dirName,
    required this.onDelivery,
    required this.onPace,
    required this.onDir,
    required this.onLen,
    required this.onStart,
  });

  final DsStrings ds;
  final int level;
  final LevelParams params;
  final Delivery delivery;
  final VoiceBlock? block;
  final bool preset;
  final Pace pace;
  final Direction presetDir;
  final int presetLen;
  final String Function(Direction) dirName;
  final ValueChanged<Delivery> onDelivery;
  final ValueChanged<Pace> onPace;
  final ValueChanged<Direction> onDir;
  final ValueChanged<int> onLen;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final voiceOff = block != null;
    // Что за ряд ждёт в личной игре: направление задаёт уровень, выше потолка — объявят после показа.
    final what = params.surpriseDir
        ? L.t('lr_digit_span_surprise_dir_rule')
        : (params.reverse ? L.t('typeReversed') : L.t('typeAsShown'));
    Widget label(String s) => Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 6),
          child: Text(s, style: text.titleSmall),
        );
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.dialpad, size: 44, color: _accent),
                  const SizedBox(height: 8),
                  Text(L.t('digitSpanDesc'), textAlign: TextAlign.center, style: text.titleMedium),
                  if (!preset) ...[
                    const SizedBox(height: 8),
                    Text(what, key: const Key('ds-level-what'), textAlign: TextAlign.center, style: text.bodySmall),
                  ],
                  label(ds.t('deliveryLabel')),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final d in Delivery.values)
                        ChoiceChip(
                          key: Key('ds-delivery-${d.name}'),
                          label: Text(switch (d) {
                            Delivery.screen => ds.t('deliveryScreen'),
                            Delivery.voice => ds.t('deliveryVoice'),
                            Delivery.all => ds.t('deliveryAll'),
                          }),
                          selected: delivery == d && !(d == Delivery.voice && voiceOff),
                          onSelected: d == Delivery.voice && voiceOff ? null : (_) => onDelivery(d),
                        ),
                    ],
                  ),
                  // ⚠️ Заглушка честная, а не беззвучное молчание: две причины лечатся по-разному.
                  if (voiceOff)
                    Container(
                      key: const Key('ds-voice-warning'),
                      margin: const EdgeInsets.only(top: 10),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
                      child: Row(
                        children: [
                          const Icon(Icons.volume_off, size: 18, color: Color(0xFFB45309)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              block == VoiceBlock.soundOff ? ds.t('voiceSoundOff') : ds.t('voiceNoVoice'),
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFB45309)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  // Темп, направление и стартовая длина — рычаги ТОЛЬКО шага зарядки: в личной игре их
                  // задаёт уровень (веб показывает выбор и там, но партия его не читает).
                  if (preset) ...[
                    label(ds.t('paceLabel')),
                    Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
                      for (final v in Pace.values)
                        ChoiceChip(
                          key: Key('ds-pace-${v.name}'),
                          label: Text(switch (v) {
                            Pace.slow => ds.t('paceSlow'),
                            Pace.normal => ds.t('paceNormal'),
                            Pace.fast => ds.t('paceFast'),
                          }),
                          selected: pace == v,
                          onSelected: (_) => onPace(v),
                        ),
                    ]),
                    label(L.t('directionLabel')),
                    Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
                      for (final v in Direction.values)
                        ChoiceChip(
                          key: Key('ds-mode-${v.name}'),
                          label: Text(dirName(v)),
                          selected: presetDir == v,
                          onSelected: (_) => onDir(v),
                        ),
                    ]),
                    label(L.t('startLengthLabel')),
                    Wrap(spacing: 8, children: [
                      for (final n in const [3, 4, 5])
                        ChoiceChip(
                          key: Key('ds-len-$n'),
                          label: Text('$n'),
                          selected: presetLen == n,
                          onSelected: (_) => onLen(n),
                        ),
                    ]),
                  ],
                ],
              ),
            ),
          ),
        ),
        // «Начать» прибита под настройками и видна без прокрутки (веб: GameSetupBar).
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
          child: FilledButton(key: const Key('ds-start'), onPressed: onStart, child: Text(L.t('start'))),
        ),
      ],
    );
  }
}

/// Поле показа: цифра, весь ряд, «слушайте» или удержание.
class _Showing extends StatelessWidget {
  const _Showing({
    required this.height,
    required this.holding,
    required this.voice,
    required this.text,
    required this.listening,
  });

  final double height;
  final bool holding;
  final bool voice;
  final String text;
  final String listening;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700);
    if (holding) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.psychology_outlined, size: 72, color: _accent),
          const SizedBox(height: 8),
          Text(L.t('memorize'), key: const Key('ds-holding'), style: style),
        ]),
      );
    }
    if (voice) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.volume_up, size: 64, color: _accent),
          const SizedBox(height: 8),
          Text(listening, key: const Key('ds-listening'), style: style),
        ]),
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        // Весь ряд разом — до двенадцати цифр: ужимается в ширину, а не уезжает за край.
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: DsRowView(text, textKey: const Key('ds-digit'), fontSize: height * 0.32),
        ),
      ),
    );
  }
}

/// Поле ответа: что делать, набранное, итог ряда.
class _Answer extends StatelessWidget {
  const _Answer({
    required this.height,
    required this.session,
    required this.phase,
    required this.feedback,
    required this.prompt,
    required this.reveal,
  });

  final double height;
  final DigitSpanSession session;
  final DsPhase phase;
  final bool? feedback;
  final String prompt;

  /// Ось 9: направление, объявленное только сейчас.
  final String? reveal;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = session;
    final typed = s.entered.join() + '•' * max(0, s.seqLen - s.entered.length);
    final status = switch ((phase, feedback)) {
      (DsPhase.revealed, _) => (text: '${L.t('label_was')}: ${s.expected.join()}', color: scheme.primary),
      (_, null) => (text: '${s.entered.length}/${s.seqLen} — ${L.t('hint_autocheck')}', color: scheme.onSurfaceVariant),
      (_, true) => (text: L.t('msg_correct_level_up'), color: const Color(0xFF22C55E)),
      (_, false) => (text: '${L.t('label_was')}: ${s.expected.join()}', color: const Color(0xFFF43F5E)),
    };
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        children: [
          Text(prompt, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          if (reveal != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(reveal!,
                  key: const Key('ds-dir-reveal'),
                  style: const TextStyle(color: _accent, fontWeight: FontWeight.w800, fontSize: 18)),
            ),
          const SizedBox(height: 14),
          Container(
            constraints: const BoxConstraints(minWidth: 200),
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: feedback == true
                    ? const Color(0xFF22C55E)
                    : feedback == false
                        ? const Color(0xFFF43F5E)
                        : scheme.outlineVariant,
                width: feedback == null ? 1 : 3,
              ),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(typed,
                  key: const Key('ds-typed'),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: 6)),
            ),
          ),
          const SizedBox(height: 12),
          Text(status.text,
              key: const Key('ds-result'),
              textAlign: TextAlign.center,
              style: TextStyle(color: status.color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Ряд клавиш как на телефоне: 1-2-3 / 4-5-6 / 7-8-9 / ·-0-«Стереть». Клавиша 64×52 — веб замерял
/// ширину 360 pt (3·64 + 2·10 = 212 ≤ 228). «Готово» нет: ответ проверяется сам на последней цифре.
class _Keypad extends StatelessWidget {
  const _Keypad({required this.on, required this.onDigit, required this.onErase});

  final bool on;
  final ValueChanged<int> onDigit;
  final VoidCallback onErase;

  Widget _key(BuildContext context, String id, Widget child, VoidCallback onTap, String a11y) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5),
        child: SizedBox(
          width: 64,
          height: 52,
          child: Semantics(
            label: a11y,
            button: true,
            child: OutlinedButton(
              key: Key(id),
              style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
              onPressed: on ? onTap : null,
              child: child,
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    Widget digit(int d) => _key(context, 'ds-key-$d', Text('$d', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        () => onDigit(d), '$d');
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final row in const [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(mainAxisSize: MainAxisSize.min, children: [for (final d in row) digit(d)]),
            ),
          Row(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(width: 74),
            digit(0),
            _key(context, 'ds-key-erase', const Icon(Icons.backspace_outlined, size: 20), onErase, L.t('a11yErase')),
          ]),
        ],
      ),
    );
  }
}

/// Поле показа ряда — ОДНО для партии и разбора: цифра или весь ряд крупно. Разбор рисует ряд тем же
/// виджетом, а не «похоже» (общая карточка ужимает его по месту, текстовый стимул переносился и вылезал).
class DsRowView extends StatelessWidget {
  const DsRowView(this.text, {super.key, this.textKey, this.fontSize = 56});

  final String text;
  final Key? textKey;
  final double fontSize;

  @override
  Widget build(BuildContext context) =>
      Text(text, key: textKey, style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w800));
}

/// Ряд, разбитый на куски по три: «729 · 418 · 3» — одинокая цифра в хвосте прилипает к последнему
/// куску («729 · 4183»): кусок из одной цифры приём не держит.
String dsChunked(List<int> seq) {
  final groups = <String>[];
  for (var i = 0; i < seq.length; i += 3) {
    groups.add(seq.sublist(i, min(i + 3, seq.length)).join());
  }
  if (groups.length > 1 && groups.last.length == 1) {
    final tail = groups.removeLast();
    groups[groups.length - 1] += tail;
  }
  return groups.join(' · ');
}

/// РАЗБОР ДО ПАРТИИ — приём на рядах из ГЕНЕРАТОРА самой игры (`generateSeq`), а не на придуманных:
/// что показано (ряд, как его рисует «весь ряд разом»), как его держать (куски), что набрать
/// (`expectedDigits` — тем же правилом, которым игра засчитывает ответ). Без ряда разбор был
/// только словами: имя приёма есть, а увидеть его не на чем.
List<DemoTrial> digitSpanLessonTrials({double Function()? rng}) {
  // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22, и ряд разбора был бы «2 2 2 2 …» —
  // «прямо» и «наоборот» на нём одинаковы, и пример обратного ввода ничего бы не показал.
  var st = 4242;
  final r = rng ??
      () {
        st = (st * 9301 + 49297) % 233280;
        return st / 233280;
      };
  final forward = generateSeq(7, r);
  final backward = generateSeq(6, r);
  return [
    DemoTrial(
      text: '',
      art: DsRowView(forward.join(' ')),
      sub: dsChunked(forward),
      answer: expectedDigits(forward, Direction.forward).join(),
      rule: L.t('teachSpanChunks'),
    ),
    DemoTrial(
      text: '',
      art: DsRowView(backward.join(' ')),
      sub: dsChunked(backward),
      answer: expectedDigits(backward, Direction.backward).join(),
      rule: L.t('teachSpanBackward'),
    ),
  ];
}
