import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

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
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import '../languages/fresh_pool.dart';
import '../languages/json_asset.dart';
import 'model.dart';

/// «ОБЪЁМ НА СЛУХ» на общем каркасе — перенос `app/games/listening-span.tsx`.
///
/// Слова целевого языка звучат по одному, экран их не показывает; затем сетка из
/// услышанных и отвлекающих — нажать услышанные в том же порядке. Раздача раунда —
/// [lspanDealRound], сверенная с эталоном живого TS до слова.
///
/// 🔴 ЧТО ПЕРЕНОС ДЕЛАЕТ ИНАЧЕ, ЧЕМ ВЕБ, И ПОЧЕМУ:
///   · выбор языка — выпадающим списком, а не одиннадцатью плашками в три ряда
///     (задача 622d7e81: «Начать» уезжало вниз);
///   · паузы между словами и удержание — по игровым часам каркаса ([gameTimeout]):
///     пауза приложения останавливает и их, а не только экран;
///   · «Показать решение» и разбор до партии — их у веб-экрана не было (8d9be1b7, 45bb6f2a).
enum LspanPhase { ready, listen, recall, done, revealed }

/// Синий градиента веб-экрана (`#4776E6`): им отмечены нажатые слова.
const _accent = Color(0xFF4776E6);
const _wrong = Color(0xFFF43F5E);

/// Хранилище выбранного языка — тот же ключ, что у веб-экрана: выбор один на обе половины.
const lspanTargetLangKey = 'psygames_listening_span_targetlang';

/// Запас «невиданного» — общий с веб-половиной (`readSeen('listening_span')`).
const _seenPool = 'listening_span';

/// Вступление перед первым словом партии: экран «Слушай…» успевает встать, и первое слово
/// не теряется на переходе (шаг зарядки открывает экран и стартует сам). Паузы МЕЖДУ
/// словами — мера пробы — им не затронуты. ⚠️ Побочно: в пробах без звукового плагина
/// первое слово не звучит за окно сторожа зарядки (warmup_step_starts_itself_test) — там
/// активация плеера just_audio бросает необработанную ошибку (разбор в канале 01.10).
const lspanLeadInMs = 1000;

class ListeningSpanScreen extends StatefulWidget {
  const ListeningSpanScreen({super.key, required this.state, this.voice, this.vocab, this.langNames, this.rng});

  final SharedState state;

  /// Голос. `null` — общий слой приложения ([AudioHost.voice]).
  final VoiceLayer? voice;

  /// Словарь переводов и названия языков. `null` — из ассетов.
  final List<Map<String, Object?>>? vocab;
  final Map<String, String>? langNames;

  /// Случайность раздачи; пробы подставляют семенную.
  final double Function()? rng;

  @override
  State<ListeningSpanScreen> createState() => _ListeningSpanScreenState();
}

class _ListeningSpanScreenState extends State<ListeningSpanScreen> {
  /// Вибрация — через общий выключатель «Вибрация» (веб `psygames_haptic_enabled`).
  late final AppHaptics _haptics = AppHaptics(widget.state);

  late LevelLadder _ladder;
  late final double Function() _rng = widget.rng ?? Random().nextDouble;
  VoiceLayer? _voice;
  List<Map<String, Object?>> _vocab = const [];
  Map<String, String> _names = const {};
  List<String> _langs = const [];

  /// Язык, который учим. Не может совпасть с языком приложения.
  String _target = 'en';
  VoiceBlock? _block;
  List<String> _pool = const [];

  ListeningSpanGame? _game;
  LspanPhase _phase = LspanPhase.ready;
  int _spokenIdx = 0;
  bool _holding = false;

  /// Номер прогона озвучки: сброс, уход с экрана и «Показать решение» его меняют, и
  /// оставшийся цикл озвучки тихо выходит, а не открывает ввод в чужую партию.
  int _runId = 0;
  GameTimer? _timer;
  int? _startedAt;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'listening_span', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _runId++;
    _timer?.cancel();
    _voice?.cancel();
    super.dispose();
  }

  String get _appLang => L.locale;
  String get _defaultTarget => _appLang == 'en' ? 'es' : 'en';

  Future<void> _boot() async {
    await _ladder.load();
    final voice = widget.voice ?? await AudioHost.voice(widget.state);
    final vocab = widget.vocab ??
        [for (final e in await loadJsonAsset('assets/vocab/translation-vocab.json') as List) (e as Map).cast<String, Object?>()];
    final names = widget.langNames ??
        ((await loadJsonAsset('assets/vocab/lang-names.json') as Map)['languages'] as Map).cast<String, String>();
    if (!mounted) return;
    _voice = voice;
    _vocab = vocab;
    _names = names;
    final have = lspanVocabLangs(vocab).toSet();
    // Порядок — как в выборе языка веб-экрана (LANGUAGES); язык приложения не учат.
    _langs = [for (final code in names.keys) if (code != _appLang && have.contains(code)) code];
    // Шаг зарядки задаёт язык сам; вне шага — сохранённый выбор, если на нём есть словарь.
    final saved = GamePreset.isPreset ? null : widget.state.get(lspanTargetLangKey);
    final wanted = GamePreset.isPreset ? GamePreset.str('targetLang', _defaultTarget) : (saved ?? _defaultTarget);
    _target = _langs.contains(wanted) ? wanted : (_langs.contains(_defaultTarget) ? _defaultTarget : _langs.first);
    await _chooseTarget(_target, remember: false);
    if (!mounted) return;
    setState(_reset);
    if (GamePreset.autostart) _start();
  }

  Future<void> _chooseTarget(String code, {bool remember = true}) async {
    _target = code;
    _pool = lspanWordPool(_vocab, code, (w) => _voice!.sampleUrl(w, code) != null);
    if (remember) unawaited(widget.state.set(lspanTargetLangKey, code));
    final block = await _voice!.blockedReason(code);
    if (mounted) setState(() => _block = block);
  }

  void _reset() {
    _runId++;
    _timer?.cancel();
    _voice?.cancel();
    final level = _ladder.level;
    _game = ListeningSpanGame(level: level, params: LspanLevelParams.of(level));
    _phase = LspanPhase.ready;
    _spokenIdx = 0;
    _holding = false;
    _startedAt = null;
  }

  Future<void> _start() async {
    if (_phase != LspanPhase.ready || _game == null || _voice == null) return;
    // Нечем говорить — партии нет: упражнение, которое молчит, мерило бы не память.
    final block = await _voice!.blockedReason(_target);
    if (!mounted) return;
    if (block != null) {
      setState(() => _block = block);
      return;
    }
    _startedAt = gameNow();
    _beginRound();
  }

  /// Ждать по игровым часам: пауза приложения останавливает и паузы между словами.
  Future<void> _wait(int ms) {
    final done = Completer<void>();
    _timer = gameTimeout(Duration(milliseconds: ms), done.complete);
    return done.future;
  }

  bool _alive(int run) => mounted && run == _runId;

  Future<void> _beginRound() async {
    final g = _game!;
    final run = ++_runId;
    // Ось 7 — доля похожих отвлекающих; в шаге зарядки её нет, как в вебе.
    final share = GamePreset.isPreset ? 0.0 : g.params.similarShare;
    final deal = lspanDealRound(_pool, readSeen(widget.state, _seenPool), g.params.span, share, _rng);
    await writeSeen(widget.state, _seenPool, deal.seen);
    if (!_alive(run)) return;
    g.deal(deal.spoken, deal.grid);
    setState(() {
      _phase = LspanPhase.listen;
      _spokenIdx = 0;
      _holding = false;
    });
    if (g.round == 1) {
      await _wait(lspanLeadInMs);
      if (!_alive(run)) return;
    }
    for (var i = 0; i < g.spoken.length; i++) {
      if (!_alive(run)) return;
      setState(() => _spokenIdx = i + 1);
      await _voice!.speak(g.spoken[i], _target);
      if (!_alive(run)) return;
      // Пауза ПОСЛЕ каждого слова, и после последнего тоже: так её ставит веб (`speakSequence`).
      await _wait(g.params.gapMs);
    }
    if (!_alive(run)) return;
    // Ось 3 — удержание: ввод открывается не сразу, ряд надо додержать в уме.
    if (g.params.holdMs > 0) {
      setState(() => _holding = true);
      await _wait(g.params.holdMs);
      if (!_alive(run)) return;
    }
    setState(() {
      _holding = false;
      _phase = LspanPhase.recall;
    });
  }

  void _tap(int i) {
    final g = _game!;
    if (_phase != LspanPhase.recall) return;
    final r = g.tap(i);
    if (r == LspanTap.ignored) return;
    _haptics.selection();
    setState(() {});
    if (r == LspanTap.progress) return;
    _timer = gameTimeout(Duration(milliseconds: r == LspanTap.roundWon ? lspanAfterWinMs : lspanAfterMissMs), () {
      if (!mounted || _phase != LspanPhase.recall) return;
      if (g.lastRound) {
        _finish();
      } else {
        g.round += 1;
        _beginRound();
      }
    });
  }

  Future<void> _finish() async {
    final g = _game!;
    final seconds = ((gameNow() - (_startedAt ?? gameNow())) / 1000).round();
    _runId++;
    // Метки и details — как пишет веб-экран (`saveSession` в listening-span.tsx).
    final difficulty = 'L${g.level}';
    final mode = '${g.params.span}-span · $_target';
    final details = <String, Object?>{'level': g.level, 'span': g.params.span, 'errors': g.errors, 'target_lang': _target};
    if (g.passed) {
      await _ladder.win(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    } else {
      await _ladder.fail(
          score: g.score, timeSeconds: seconds, errors: g.errors, mode: mode, difficulty: difficulty, details: details);
    }
    if (mounted) setState(() => _phase = LspanPhase.done);
  }

  /// «Показать решение»: озвучка обрывается, сетка показывает порядок услышанных;
  /// партия кончается без зачёта — ни победой, ни провалом.
  void _reveal() {
    _runId++;
    _timer?.cancel();
    _voice?.cancel();
    setState(() => _phase = LspanPhase.revealed);
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final calm = _phase == LspanPhase.ready || _phase == LspanPhase.done || _phase == LspanPhase.revealed;
    return GameShell(
      levelRule: LevelRuleSpot(gameId: 'listening_span', level: _ladder.level, state: widget.state, calm: calm),
      title: L.t('listeningSpan'),
      onLesson: () => openDemoLesson(context, title: L.t('listeningSpan'), trials: listeningSpanLessonTrials(_pool)),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/$lspanRounds', icon: Icons.repeat),
      ],
      field: (context, h) => switch (_phase) {
        LspanPhase.ready => _Ready(
            game: g,
            langs: _langs,
            names: _names,
            target: _target,
            block: _block,
            onTarget: (code) => _chooseTarget(code),
            onStart: _start,
          ),
        LspanPhase.listen => _Listen(game: g, spokenIdx: _spokenIdx, holding: _holding),
        LspanPhase.recall => _Recall(game: g, onTap: _tap),
        LspanPhase.done => _Done(game: g),
        LspanPhase.revealed => _Recall(game: g, onTap: (_) {}, revealed: true),
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: (_phase == LspanPhase.listen || _phase == LspanPhase.recall) && !g.locked ? _reveal : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == LspanPhase.done || _phase == LspanPhase.revealed
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const Key('lspan-again'),
                onPressed: () => setState(_reset),
                icon: const Icon(Icons.arrow_forward),
                label: Text(_phase == LspanPhase.done && g.passed ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

class _Ready extends StatelessWidget {
  const _Ready({
    required this.game,
    required this.langs,
    required this.names,
    required this.target,
    required this.block,
    required this.onTarget,
    required this.onStart,
  });

  final ListeningSpanGame game;
  final List<String> langs;
  final Map<String, String> names;
  final String target;
  final VoiceBlock? block;
  final ValueChanged<String> onTarget;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(L.t('lspanConfigDesc'), textAlign: TextAlign.center, style: text.bodyMedium),
          const SizedBox(height: 12),
          Text(
            L.t('lspanLvlAuto').replaceAll('{n}', '${game.level}').replaceAll('{s}', '${game.params.span}'),
            key: const Key('lspan-level-params'),
            textAlign: TextAlign.center,
            style: text.bodySmall,
          ),
          const SizedBox(height: 16),
          Text(L.t('langToTrain'), style: text.titleSmall),
          const SizedBox(height: 6),
          // Выпадающий список, а не одиннадцать плашек в три ряда (622d7e81): список
          // выводится ИЗ СЛОВАРЯ — язык без словаря в выбор не попадает.
          DropdownButtonFormField<String>(
            key: const Key('lspan-lang'),
            initialValue: langs.contains(target) ? target : null,
            decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
            items: [for (final l in langs) DropdownMenuItem(value: l, child: Text(names[l] ?? l))],
            onChanged: (v) => v == null ? null : onTarget(v),
          ),
          if (block != null) ...[
            const SizedBox(height: 10),
            Container(
              key: const Key('lspan-voice-block'),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
              child: Row(children: [
                const Icon(Icons.volume_off_outlined, size: 18, color: Color(0xFFB45309)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    // Каждый ключ — своим L.t('…'): ключ внутри тернарника сборщик словаря не видит.
                    block == VoiceBlock.soundOff ? L.t('voiceSoundOff') : L.t('voiceMissing'),
                    style: text.bodySmall?.copyWith(color: const Color(0xFFB45309), fontWeight: FontWeight.w600),
                  ),
                ),
              ]),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(key: const Key('lspan-start'), onPressed: onStart, child: Text(L.t('start'))),
        ],
      ),
    );
  }
}

class _Listen extends StatelessWidget {
  const _Listen({required this.game, required this.spokenIdx, required this.holding});

  final ListeningSpanGame game;
  final int spokenIdx;
  final bool holding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final span = game.spoken.length;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 200,
            height: 200,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: _accent, width: 3),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(holding ? Icons.psychology_outlined : Icons.volume_up_outlined, size: 56, color: _accent),
                const SizedBox(height: 8),
                Text(holding ? L.t('memorize') : L.t('lspanListening'),
                    key: const Key('lspan-listen-title'), style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('${L.t('lspanWord')} ${max(1, spokenIdx)} / $span',
                    key: const Key('lspan-word-counter'), style: text.bodyMedium),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < span; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < spokenIdx ? _accent : scheme.outlineVariant,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(L.t('lspanMemorizeHint'), textAlign: TextAlign.center, style: text.bodySmall),
          ),
        ],
      ),
    );
  }
}

/// Сетка ввода — та же в партии, в «Показать решение» и в разборе.
class LspanWordGrid extends StatelessWidget {
  const LspanWordGrid({
    super.key,
    required this.grid,
    required this.order,
    this.wrongIdx,
    this.onTap,
    this.keyPrefix = 'lspan-word-',
  });

  final List<String> grid;

  /// Номер слова в ответе (1, 2, …) для отмеченных клеток; клеток без номера нет в карте.
  final Map<int, int> order;
  final int? wrongIdx;
  final ValueChanged<int>? onTap;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 10,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: [
        for (var i = 0; i < grid.length; i++)
          Semantics(
            label: '$keyPrefix$i${order.containsKey(i) ? '-${order[i]}' : ''}${wrongIdx == i ? '-wrong' : ''}',
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Material(
                  color: wrongIdx == i
                      ? _wrong
                      : order.containsKey(i)
                          ? _accent
                          : scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    key: Key('$keyPrefix$i'),
                    borderRadius: BorderRadius.circular(16),
                    onTap: onTap == null ? null : () => onTap!(i),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 96, minHeight: 48),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                        child: Center(
                          widthFactor: 1,
                          child: Text(
                            grid[i],
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: wrongIdx == i || order.containsKey(i) ? Colors.white : scheme.onSurface,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (order.containsKey(i))
                  Positioned(
                    top: -8,
                    right: -8,
                    child: Container(
                      width: 22,
                      height: 22,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle),
                      child: Text('${order[i]}',
                          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Recall extends StatelessWidget {
  const _Recall({required this.game, required this.onTap, this.revealed = false});

  final ListeningSpanGame game;
  final ValueChanged<int> onTap;
  final bool revealed;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    // Показанное решение нумерует услышанные в порядке звучания; в партии — нажатые.
    final order = revealed
        ? {for (var k = 0; k < game.spoken.length; k++) game.grid.indexOf(game.spoken[k]): k + 1}
        : {for (var k = 0; k < game.picked.length; k++) game.picked[k]: k + 1};
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          Text(revealed ? L.t('puzzleShowSolution') : L.t('lspanRecallTitle'),
              style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          if (!revealed)
            Text(
              L.t('lspanRecallHint')
                  .replaceAll('{i}', '${min(game.picked.length + 1, game.spoken.length)}')
                  .replaceAll('{n}', '${game.spoken.length}'),
              textAlign: TextAlign.center,
              style: text.bodySmall,
            ),
          const SizedBox(height: 16),
          LspanWordGrid(
            key: Key(revealed ? 'lspan-solution' : 'lspan-grid'),
            grid: game.grid,
            order: order,
            wrongIdx: revealed ? null : game.wrongIdx,
            onTap: revealed ? null : onTap,
          ),
        ],
      ),
    );
  }
}

class _Done extends StatelessWidget {
  const _Done({required this.game});

  final ListeningSpanGame game;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(game.passed ? Icons.check_circle_outline : Icons.replay,
              key: Key(game.passed ? 'lspan-passed' : 'lspan-failed'),
              size: 56,
              color: game.passed ? const Color(0xFF22C55E) : _wrong),
          const SizedBox(height: 12),
          Text('${L.t('hud_span')}: ${game.params.span}', style: text.titleMedium),
          Text('${L.t('hud_errors')}: ${game.errors}', key: const Key('lspan-errors'), style: text.titleMedium),
          if (!game.passed) ...[
            const SizedBox(height: 8),
            Text(L.t('sameLevelRetry'), style: text.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// РАЗБОР ДО ПАРТИИ — три примера на сетке самой игры, по её правилу засчёта.
///
/// 1) услышали три слова — нажимаем их в том же порядке; 2) верные слова в другом
/// порядке — это ошибка раунда; 3) с 10-го уровня рядом стоят ПОХОЖИЕ слова — выбирают
/// услышанное, а не созвучное. Слова — из мешка того языка, который человек учит; похожее
/// подбирает тот же [lspanPickDistractors], что раздаёт партию.
List<DemoTrial> listeningSpanLessonTrials(List<String> pool) {
  final words = pool.length >= 8 ? pool : const ['casa', 'agua', 'fuego', 'libro', 'tiempo', 'perro', 'cama', 'mesa'];
  // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и выдаёт почти одно и то же (01.10.2026).
  var st = 4242;
  double rng() {
    st = (st * 9301 + 49297) % 233280;
    return st / 233280;
  }
  final heard = words.take(3).toList();
  final others = lspanPickDistractors(words, heard, 3, 0, rng);
  final grid = [others[0], heard[1], heard[0], others[1], heard[2], others[2]];
  final similar = lspanPickDistractors(words, heard, 1, 1, rng).first;
  final trapGrid = [heard[0], similar, heard[1], heard[2]];
  return [
    DemoTrial(
      text: heard.join(' · '),
      rule: L.t('teachLspanOrder'),
      art: LspanLessonArt(grid: grid, heard: heard, order: {for (var k = 0; k < 3; k++) grid.indexOf(heard[k]): k + 1}),
    ),
    DemoTrial(
      text: heard.join(' · '),
      rule: L.t('teachLspanOrderMiss'),
      art: LspanLessonArt(grid: grid, heard: heard, order: const {}, wrongIdx: grid.indexOf(heard[1])),
    ),
    DemoTrial(
      text: heard.join(' · '),
      rule: L.t('teachLspanSimilar'),
      art: LspanLessonArt(
        grid: trapGrid,
        heard: heard,
        order: {for (var k = 0; k < 3; k++) trapGrid.indexOf(heard[k]): k + 1},
        trap: similar,
      ),
    ),
  ];
}

/// Пример разбора: сетка ввода игры с разметкой — какие слова и в каком порядке нажать.
class LspanLessonArt extends StatelessWidget {
  const LspanLessonArt({
    super.key,
    required this.grid,
    required this.heard,
    required this.order,
    this.wrongIdx,
    this.trap,
  });

  final List<String> grid;
  final List<String> heard;
  final Map<int, int> order;
  final int? wrongIdx;

  /// Созвучное слово-ловушка (третий пример).
  final String? trap;

  /// Верен ли разобранный ответ по правилу игры: нажатые идут ровно в порядке звучания.
  bool get answerFollowsTheRule {
    final pressed = order.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
    final words = [for (final e in pressed) grid[e.key]];
    final game = ListeningSpanGame(level: 1, params: LspanLevelParams.of(1))..deal(heard, grid);
    for (final w in words) {
      if (game.tap(grid.indexOf(w)) == LspanTap.roundLost) return false;
    }
    return words.length == heard.length;
  }

  @override
  Widget build(BuildContext context) =>
      LspanWordGrid(grid: grid, order: order, wrongIdx: wrongIdx, keyPrefix: 'lesson-word-');
}
