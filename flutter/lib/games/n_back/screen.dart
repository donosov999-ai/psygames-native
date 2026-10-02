import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/app_haptics.dart';
import '../../shell/audio_host.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
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

/// N-BACK на общем каркасе — перенос `app/games/n-back.tsx`.
///
/// Проба за пробой загорается клетка (с L9 ещё и звучит буква); человек жмёт
/// «совпадение», когда стимул равен тому, что был N шагов назад. Блок готовится
/// целиком до первого стимула ([NbackGame]), поэтому доля целей и приманок точная.
///
/// 🔴 ЧТО ЧИНИТ ПЕРЕНОС ПОПУТНО (задачи раздела):
///   · 039822b3 — веб писал время партии отметкой Unix (1 789 617 778 с): старт брался
///     из устаревшего замыкания. Здесь длительность — по игровым часам каркаса ([gameNow]),
///     они же стоят на паузе и под разбором; таймеры проб — [gameTimeout];
///   · 177a13df — шаг «Оценки» опознаёт партию по меткам шага дословно и берёт d′ из
///     details: метки и details пишутся ровно как в вебе (`saveSession` n-back.tsx).
enum NbPhase { ready, playing, done, revealed }

/// Подписи разбора партии (точность, d′, потоки) — словарь модуля на 12 языков
/// `assets/l10n/n_back.json`, выгрузка `core/i18n.ts` экспортёром эталона.
class NbStrings {
  const NbStrings._(this._map);

  final Map<String, String> _map;

  static const empty = NbStrings._({});

  String t(String key) => _map[key] ?? key;

  /// Для проб: словарь с диска, без rootBundle (ассет, дочитанный в теле пробы, вешает её).
  static NbStrings fromJson(Map<String, dynamic> all, String locale) {
    final one = (all[locale] ?? all['en']) as Map<String, dynamic>?;
    return NbStrings._((one ?? const {}).map((k, v) => MapEntry(k, '$v')));
  }

  static Future<NbStrings> load({AssetBundle? bundle}) async {
    try {
      // Байты, а не loadString: от 50 КБ тот уходит в изолят, и в пробах висит.
      final data = await (bundle ?? rootBundle).load('assets/l10n/n_back.json');
      final all = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
          as Map<String, dynamic>;
      return fromJson(all, L.resolve(L.locale));
    } catch (_) {
      return empty;
    }
  }
}

/// Что видно после партии: точность и d′, в двойном режиме — по каждому потоку порознь.
class NbReadout {
  const NbReadout({required this.accuracy, required this.dPrime, this.audioAccuracy, this.audioDPrime});
  final int accuracy;
  final double dPrime;
  final int? audioAccuracy;
  final double? audioDPrime;
}

/// Синий градиента веб-экрана (`#5b86e5`): им горит клетка и подсвечен босс.
const _accent = Color(0xFF5B86E5);

/// Личный рекорд серии попаданий — ключ веба (`frontend/src/services/streak.ts`), общий
/// для обеих половин гибрида: `psygames.` хранилище возит (SharedState.extraPrefixes).
const nbBestStreakKey = 'psygames.bestStreak.n_back';

class NBackScreen extends StatefulWidget {
  const NBackScreen({super.key, required this.state, this.voice, this.strings, this.rng});

  final SharedState state;

  /// Голос второго потока. `null` — общий слой приложения ([AudioHost.voice]).
  final VoiceLayer? voice;

  /// Подписи разбора партии. `null` — из ассета.
  final NbStrings? strings;

  /// Случайность блока и разброса пауз; пробы подставляют семенную.
  final NbRng? rng;

  @override
  State<NBackScreen> createState() => _NBackScreenState();
}

class _NBackScreenState extends State<NBackScreen> {
  /// Вибрация — через общий выключатель «Вибрация» (веб `psygames_haptic_enabled`).
  late final AppHaptics _haptics = AppHaptics(widget.state);

  late LevelLadder _ladder;
  late final NbRng _rng = widget.rng ?? Random().nextDouble;
  VoiceLayer? _voice;
  bool _canSpeak = false;
  NbStrings _strings = NbStrings.empty;

  NbackGame? _game;
  NbPhase _phase = NbPhase.ready;
  int _trials = nbDefaultTrials;
  int _playedLevel = 1;
  int _showMs = 700;
  int _gapMs = 1100;
  bool _lit = false;
  GameTimer? _timer;

  /// Начало партии по игровым часам. Длительность — отсюда, а не из отметки старта
  /// в замыкании (039822b3): пауза и разбор в неё не входят.
  int? _startedAt;
  NbPress _lastVisual = NbPress.ignored;
  NbPress _lastAudio = NbPress.ignored;
  NbReadout? _readout;
  bool? _boss;

  /// Серия попаданий подряд в зрительном потоке и её рекорд — как у веба: попадание +1,
  /// ложная тревога обнуляет, новая партия начинает с нуля, рекорд пишется сразу, а не в
  /// конце партии («побил себя» видно в тот момент, когда это случилось).
  int _streak = 0;
  int? _bestStreak;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'n_back', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _voice?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    // Буквы — английские имена; нечем говорить — двойной режим нечестен: итог берётся
    // по худшему потоку, и немой слуховой поток валил бы уровень ни за что.
    final canSpeak = await voice.hasVoice('en');
    final strings = widget.strings ?? await NbStrings.load();
    if (!mounted) return;
    _voice = voice;
    _canSpeak = canSpeak;
    _strings = strings;
    _bestStreak = int.tryParse(widget.state.get(nbBestStreakKey) ?? '');
    if (GamePreset.isPreset) _trials = GamePreset.num('trials', nbDefaultTrials);
    setState(_reset);
    if (GamePreset.autostart) _start();
  }

  /// Правила партии: по уровню, а в шаге зарядки и «Оценки» — по шагу.
  void _reset() {
    _timer?.cancel();
    final level = _ladder.level;
    _playedLevel = level;
    final p = NbLevelParams.of(level);
    late final int n;
    late final NbModality modality;
    double? lure;
    int? switchEvery;
    if (GamePreset.isPreset) {
      // Шаг объявляет глубину режимом ('2-back'); пресет — потолок желания: больше
      // освоенного + 1 не даём (presetCap, веб `capPresetByLevel`).
      final want = nFromModeParam(GamePreset.str('mode', '')) ?? GamePreset.num('nLevel', 1);
      n = capPresetByLevel(want: want, atLevel: p.n, atTop: level >= 14);
      final wantDual = GamePreset.str('modality', 'single') == 'dual';
      modality = wantDual && _canSpeak ? NbModality.dual : NbModality.single;
      _showMs = 700;
      _gapMs = 1100;
    } else {
      n = p.n;
      modality = p.modality == NbModality.dual && _canSpeak ? NbModality.dual : NbModality.single;
      _showMs = p.showMs;
      _gapMs = p.gapMs;
      lure = p.lureRate;
      // Ось 9: глубина меняется внутри партии (с L27). Шаг зарядки играет постоянную N.
      switchEvery = p.switchEvery;
    }
    _game = NbackGame(n: n, trials: _trials, modality: modality, lureRate: lure, switchEvery: switchEvery, rng: _rng);
    _phase = NbPhase.ready;
    _lit = false;
    _lastVisual = NbPress.ignored;
    _lastAudio = NbPress.ignored;
    _readout = null;
    _boss = null;
    _startedAt = null;
  }

  void _start() {
    if (_phase != NbPhase.ready || _game == null) return;
    setState(() => _phase = NbPhase.playing);
    _startedAt = gameNow();
    _streak = 0;
    _timer = gameTimeout(const Duration(milliseconds: 600), _nextTrial);
  }

  void _nextTrial() {
    final g = _game!;
    if (!mounted || _phase != NbPhase.playing) return;
    if (!g.next()) {
      _finish();
      return;
    }
    setState(() {
      _lit = true;
      _lastVisual = NbPress.ignored;
      _lastAudio = NbPress.ignored;
    });
    if (g.dual) _say(g.letter!);
    _timer = gameTimeout(Duration(milliseconds: _showMs), () {
      if (!mounted || _phase != NbPhase.playing) return;
      setState(() => _lit = false);
      // Окно ответа — весь показ и пауза после него; кончилось — проба закрывается.
      _timer = gameTimeout(Duration(milliseconds: jitteredGapMs(_gapMs, _rng)), () {
        if (!mounted || _phase != NbPhase.playing) return;
        g.closeTrial();
        _nextTrial();
      });
    });
  }

  /// Буква — записью имени буквы; записи нет — системным голосом, как в вебе
  /// (`speakLetterName` падает на синтез). Молчащая буква сделала бы второй поток немым.
  Future<void> _say(String letter) async {
    final v = _voice;
    if (v == null) return;
    // Скорости — как у веба (tts.ts, speakLetterName): запись имени буквы — 1, синтез без
    // записи — 1,2. Записи подбирались по длительности под окно пробы при скорости 1.
    if (!await v.speakLetter(letter, rate: 1.0)) await v.speak(letter, 'en', rate: 1.2);
  }

  void _press({required bool audio}) {
    final g = _game;
    if (g == null || _phase != NbPhase.playing) return;
    final r = audio ? g.pressAudio() : g.pressVisual();
    if (r == NbPress.ignored) return;
    if (!audio) _countStreak(r);
    _haptics.selection();
    setState(() => audio ? _lastAudio = r : _lastVisual = r);
  }

  void _countStreak(NbPress r) {
    if (r == NbPress.falseAlarm) {
      _streak = 0;
      return;
    }
    _streak += 1;
    if (_streak > (_bestStreak ?? 0)) {
      _bestStreak = _streak;
      unawaited(widget.state.set(nbBestStreakKey, '$_streak'));
    }
  }

  Future<void> _finish() async {
    _timer?.cancel();
    final g = _game!;
    final seconds = ((gameNow() - (_startedAt ?? gameNow())) / 1000).round();
    final v = nbSignalDetection(g.visualCounts);
    final a = g.dual ? nbSignalDetection(g.audioCounts) : null;
    setState(() {
      _phase = NbPhase.done;
      _lit = false;
      _readout = NbReadout(
        accuracy: g.accuracy,
        dPrime: v.dPrime,
        audioAccuracy: a == null ? null : g.audioAccuracy,
        audioDPrime: a?.dPrime,
      );
    });
    /*
     * 🔴 МЕТКИ И DETAILS — КАК В ВЕБЕ (n-back.tsx, saveSession). В шаге «Оценки» партию
     * опознают дословно по difficulty (diff шага) и mode ('2-back'), а метрику домена
     * берут из details.d_prime; вне шага — свои метки игры.
     */
    final preset = GamePreset.isPreset;
    final difficulty = preset ? GamePreset.str('diff', 'medium') : '${g.n}-back';
    final mode = preset ? '${g.n}-back' : '${g.trials}t-${g.modality.name}';
    final details = <String, Object?>{
      'level': _playedLevel,
      'n': g.n,
      'n_trials': g.trials,
      'hits': g.hits,
      'misses': g.misses,
      'falseAlarms': g.falseAlarms,
      'correctRejections': g.correctRejections,
      'accuracy': g.accuracy,
      'd_prime': v.dPrime,
      'hit_rate': double.parse(v.hitRate.toStringAsFixed(3)),
      'false_alarm_rate': double.parse(v.falseAlarmRate.toStringAsFixed(3)),
      'modality': g.modality.name,
      if (a != null) ...{
        'audio_hits': g.aHits,
        'audio_misses': g.aMisses,
        'audio_falseAlarms': g.aFalseAlarms,
        'audio_correctRejections': g.aCorrectRejections,
        'audio_d_prime': a.dPrime,
        'audio_accuracy': g.audioAccuracy,
        'combined_accuracy': g.combinedAccuracy,
      },
    };
    Future<bool> win() => _ladder.win(
        score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    if (g.passed) {
      final boss = await BossRound.winThenBoss(context, _ladder, type: BossType.counting, color: _accent, win: win);
      if (mounted) setState(() => _boss = boss);
    } else {
      await _ladder.fail(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
      if (mounted) setState(() {});
    }
  }

  /// «Показать решение»: партия кончается без зачёта, весь блок раскрыт — где было
  /// совпадение n назад, где приманка.
  void _reveal() {
    _timer?.cancel();
    _voice?.cancel();
    setState(() {
      _phase = NbPhase.revealed;
      _lit = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final calm = _phase == NbPhase.ready || _phase == NbPhase.done || _phase == NbPhase.revealed;
    final shown = g.index < 0 ? 0 : min(g.index + 1, g.trials);
    return GameShell(
      levelRule: LevelRuleSpot(gameId: 'n_back', level: _ladder.level, state: widget.state, calm: calm),
      title: L.t('nBack'),
      onLesson: () => openDemoLesson(context, title: L.t('nBack'), trials: nBackLessonTrials()),
      hud: [
        // Глубина ТЕКУЩЕЙ пробы: с L27 она меняется внутри партии (ось 9).
        HudItem(label: 'N', value: '${g.nHere}', icon: Icons.layers_outlined),
        HudItem(label: L.t('round'), value: '$shown/${g.trials}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits + g.aHits}', icon: Icons.check_circle_outline),
        if ((_bestStreak ?? 0) > 0)
          HudItem(label: L.t('hud_best'), value: '$_bestStreak', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
      ],
      field: (context, h) => switch (_phase) {
        NbPhase.ready => _Ready(
            game: g,
            preset: GamePreset.isPreset,
            trials: _trials,
            onTrials: (t) => setState(() {
              _trials = t;
              _reset();
            }),
            onStart: _start,
          ),
        NbPhase.playing => _Playing(game: g, lit: _lit, height: h),
        NbPhase.done => _Done(readout: _readout!, strings: _strings, boss: _boss, onAgain: () => setState(_reset)),
        NbPhase.revealed => NbSolution(game: g, onAgain: () => setState(_reset)),
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
          onPressed: _phase == NbPhase.playing ? _reveal : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == NbPhase.playing
          ? _Buttons(
              game: g,
              lastVisual: _lastVisual,
              lastAudio: _lastAudio,
              onVisual: () => _press(audio: false),
              onAudio: () => _press(audio: true),
            )
          : null,
    );
  }
}

class _Ready extends StatelessWidget {
  const _Ready({
    required this.game,
    required this.preset,
    required this.trials,
    required this.onTrials,
    required this.onStart,
  });

  final NbackGame game;
  final bool preset;
  final int trials;
  final ValueChanged<int> onTrials;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${game.n}-back', style: text.headlineMedium),
            const SizedBox(height: 8),
            Text(
              game.dual ? L.t('nBackDualHint').replaceAll('{n}', '${game.n}') : L.t('nBackHint'),
              textAlign: TextAlign.center,
            ),
            if (!preset) ...[
              const SizedBox(height: 16),
              Text(L.t('trialsLabel'), style: text.labelLarge),
              const SizedBox(height: 8),
              SegmentedButton<int>(
                key: const Key('nb-trials'),
                segments: [for (final t in const [15, 20, 30]) ButtonSegment(value: t, label: Text('$t'))],
                selected: {trials},
                onSelectionChanged: (s) => onTrials(s.first),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        ),
      ),
    );
  }
}

class _Playing extends StatelessWidget {
  const _Playing({required this.game, required this.lit, required this.height});

  final NbackGame game;
  final bool lit;
  final double height;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      // Поле — от МЕНЬШЕЙ стороны того, что дал каркас; под буквой и подсказкой — запас.
      final reserve = game.dual ? 120.0 : 64.0;
      final side = max(120.0, min(c.maxWidth - 32, min(height, c.maxHeight) - reserve));
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          NbGrid(side: side, lit: lit ? game.cell : null),
          if (game.dual)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SizedBox(
                height: 48,
                // Букву видно и глазами — для тех, у кого звук приглушён.
                child: lit && game.letter != null
                    ? Text(game.letter!, key: const Key('nb-letter'), style: Theme.of(context).textTheme.headlineMedium)
                    : null,
              ),
            ),
          // Смена глубины объявляется на той пробе, где случилась (ось 9): иначе человек
          // сравнивал бы по прежнему N, не зная, что правило поменялось. Объявление встаёт НА
          // МЕСТО подсказки, а не лишней строкой: поле ниже не должно прыгать посреди партии.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: game.switchedHere
                ? Text(
                    L.t('nBackSwitchNow').replaceAll('{n}', '${game.nHere}'),
                    key: const Key('nb-switch-note'),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  )
                : Text(
                    game.dual ? L.t('nBackDualHint').replaceAll('{n}', '${game.nHere}') : L.t('nBackHint'),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
          ),
        ],
      );
    });
  }
}

/// Сетка 3×3 самой игры — она же в разборе и в решении.
class NbGrid extends StatelessWidget {
  const NbGrid({super.key, required this.side, this.lit, this.keyPrefix = '', this.mark});

  final double side;

  /// Какая клетка горит (0–8); `null` — ни одна.
  final int? lit;

  /// У сетки разбора свои ключи: разбор открывается поверх партии.
  final String keyPrefix;

  /// Обвести клетку (в разборе — та, с которой сравнивают).
  final int? mark;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const gap = 6.0;
    final cellSide = (side - 2 * gap) / 3;
    return SizedBox(
      width: side,
      height: side,
      child: Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (var i = 0; i < nbCells; i++)
            Container(
              key: Key('${keyPrefix}nb-cell-$i'),
              width: cellSide,
              height: cellSide,
              decoration: BoxDecoration(
                color: lit == i ? _accent : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(cellSide * 0.12),
                border: mark == i ? Border.all(color: scheme.primary, width: 3) : null,
              ),
            ),
        ],
      ),
    );
  }
}

class _Buttons extends StatelessWidget {
  const _Buttons({
    required this.game,
    required this.lastVisual,
    required this.lastAudio,
    required this.onVisual,
    required this.onAudio,
  });

  final NbackGame game;
  final NbPress lastVisual;
  final NbPress lastAudio;
  final VoidCallback onVisual;
  final VoidCallback onAudio;

  Color? _tint(NbPress p) => switch (p) {
        NbPress.hit => const Color(0xFF2E9E5B),
        NbPress.falseAlarm => const Color(0xFFD9534F),
        NbPress.ignored => null,
      };

  @override
  Widget build(BuildContext context) {
    final open = game.canMatch;
    Widget button(Key key, String label, IconData icon, bool answered, NbPress last, VoidCallback onTap) {
      final tint = _tint(last);
      return Expanded(
        child: SizedBox(
          height: 56,
          child: FilledButton.icon(
            key: key,
            // Нажатие сразу запирает кнопку — одно нажатие на пробу. Цвет «верно / мимо» нужен
            // именно запертой кнопке: без disabled-цветов она брала серый цвет темы, и ответ на
            // нажатие не был виден никогда (сверка веб → натив 02.10.2026).
            style: FilledButton.styleFrom(
              backgroundColor: tint,
              disabledBackgroundColor: tint,
              disabledForegroundColor: tint == null ? null : Colors.white,
              disabledIconColor: tint == null ? null : Colors.white,
            ),
            onPressed: open && !answered ? onTap : null,
            icon: Icon(icon),
            label: Text(open ? label : L.t('warmup'), maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: game.dual
            ? [
                // Подписи — на языке интерфейса (приёмка 6596a00d, 01.10.2026): английское слово в
                // русском экране — тот же класс дефекта, что зашитый текст. Ключи уже есть в словаре
                // с нужным переводом на 12 языках (suiteModeSimon «Позиция», label_sound «Звук»);
                // подсказка nBackDualHint называет кнопки теми же словами.
                button(const Key('nb-position'), L.t('suiteModeSimon'), Icons.grid_view, game.visualAnswered, lastVisual, onVisual),
                const SizedBox(width: 12),
                button(const Key('nb-sound'), L.t('label_sound'), Icons.volume_up_outlined, game.audioAnswered, lastAudio, onAudio),
              ]
            : [button(const Key('nb-match'), L.t('match'), Icons.check, game.visualAnswered, lastVisual, onVisual)],
      ),
    );
  }
}

class _Done extends StatelessWidget {
  const _Done({required this.readout, required this.strings, required this.boss, required this.onAgain});

  final NbReadout readout;
  final NbStrings strings;
  final bool? boss;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final dual = readout.audioAccuracy != null;
    Widget metric(Key key, String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('$label: ', style: text.bodyLarge),
              Text(value, key: key, style: text.titleMedium),
            ],
          ),
        );
    String ch(String metricKey, String channelKey) =>
        dual ? '${strings.t(metricKey)} · ${strings.t(channelKey)}' : strings.t(metricKey);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            metric(const Key('nb-accuracy'), ch('accuracy', 'channelVisual'), '${readout.accuracy}%'),
            metric(const Key('nb-dprime'), ch('dPrime', 'channelVisual'), readout.dPrime.toStringAsFixed(2)),
            if (dual) ...[
              metric(const Key('nb-audio-accuracy'), ch('accuracy', 'channelAudio'), '${readout.audioAccuracy}%'),
              metric(const Key('nb-audio-dprime'), ch('dPrime', 'channelAudio'), readout.audioDPrime!.toStringAsFixed(2)),
            ],
            const SizedBox(height: 8),
            Text(strings.t('dPrimeHint'), textAlign: TextAlign.center, style: text.bodySmall),
            Text(strings.t('dPrimeWhy'), textAlign: TextAlign.center, style: text.bodySmall),
            BossOutcomeLine(boss),
            const SizedBox(height: 12),
            FilledButton(onPressed: onAgain, child: Text(L.t('restart'))),
          ],
        ),
      ),
    );
  }
}

/// РЕШЕНИЕ: весь блок по пробам — какая клетка горела, где было совпадение n назад
/// (зелёным) и где приманка (янтарным). Данные — из самой партии, не копия.
class NbSolution extends StatelessWidget {
  const NbSolution({super.key, required this.game, required this.onAgain});

  final NbackGame game;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    final items = game.visual.items;
    // Глубина — по плану партии: с L27 она у каждой пробы своя (ось 9).
    final plan = game.plan;
    final scheme = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (var i = 0; i < items.length; i++)
                _solutionChip(context, scheme, i, items, plan[i]),
            ],
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: onAgain, child: Text(L.t('restart'))),
        ],
      ),
    );
  }

  Widget _solutionChip(BuildContext context, ColorScheme scheme, int i, List<int> items, int n) {
    final match = i >= n && items[i] == items[i - n];
    final lure = !match && [n - 1, n + 1].any((lag) => lag > 0 && i - lag >= 0 && items[i] == items[i - lag]);
    final color = match ? const Color(0xFF2E9E5B) : (lure ? const Color(0xFFE0A030) : scheme.surfaceContainerHighest);
    final kind = match ? 'match' : (lure ? 'lure' : 'plain');
    return Semantics(
      label: 'nb-sol-$i-$kind',
      child: Container(
        key: Key('nb-sol-$i'),
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        // Номер клетки 1–9 слева направо, сверху вниз.
        child: Text('${items[i] + 1}', style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

/// Пример разбора: короткий отрезок ряда на сетке игры и клетка, с которой сравнивают.
class NbLessonArt extends StatelessWidget {
  const NbLessonArt({super.key, required this.cells, required this.n});

  /// Отрезок ряда; последняя клетка — та, на которой решают «жать или нет».
  final List<int> cells;
  final int n;

  /// Совпадение ли последняя клетка с той, что n назад, — по правилу самой игры.
  bool get isMatch => cells.length > n && cells.last == cells[cells.length - 1 - n];

  @override
  Widget build(BuildContext context) {
    final compareAt = cells.length - 1 - n;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.center,
      children: [
        for (var i = 0; i < cells.length; i++)
          NbGrid(
            key: Key('nb-lesson-step-$i'),
            side: 72,
            lit: cells[i],
            keyPrefix: 'lesson-$i-',
            mark: i == compareAt || i == cells.length - 1 ? cells[i] : null,
          ),
      ],
    );
  }
}

/// Отрезок блока длиной `n + 2`, кончающийся на позиции, где генератор игры поставил
/// [want] — совпадение или приманку. Примеры берутся из того же генератора, что партия.
List<int> _windowFor(int n, bool Function(List<int> items, int i) want, int seed) {
  for (var s = seed; s < seed + 50; s++) {
    // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и выдаёт почти одно и то же (01.10.2026).
    var st = s;
    double rng() {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    }
    final seq = buildNbackSequence(20, n, nbCells, rng, n > 1 ? 0.3 : null);
    for (var i = n + 1; i < seq.items.length; i++) {
      if (want(seq.items, i)) return seq.items.sublist(i - n - 1, i + 1);
    }
  }
  throw StateError('n-back: generator gave no example for the lesson');
}

/// РАЗБОР ПО ШАГАМ: три приёма n-back на сетке самой игры.
///   · совпадение на 1-back — та же клетка, что прошлая: жми;
///   · глубина 2-back — держи две последние, сравнивай с той, что две назад;
///   · приманка — повтор на лаге n−1: похоже, но это не совпадение, не жми.
/// Ответ каждого примера — по правилу партии (`NbLessonArt.isMatch`), примеры — из генератора.
List<DemoTrial> nBackLessonTrials() {
  final one = _windowFor(1, (it, i) => it[i] == it[i - 1], 11);
  final two = _windowFor(2, (it, i) => it[i] == it[i - 2], 23);
  final lure = _windowFor(2, (it, i) => it[i] == it[i - 1] && it[i] != it[i - 2], 37);
  return [
    DemoTrial(text: '', sub: L.t('match'), rule: L.t('teachNbackMatch'), art: NbLessonArt(cells: one, n: 1)),
    DemoTrial(text: '', sub: L.t('match'), rule: L.t('teachNbackDepth'), art: NbLessonArt(cells: two, n: 2)),
    DemoTrial(text: '', rule: L.t('teachNbackLure'), art: NbLessonArt(cells: lure, n: 2)),
  ];
}
