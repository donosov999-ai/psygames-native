import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/app_haptics.dart';
import '../../shell/game_preset.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/preset_cap.dart';
import '../../shell/resume_store.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Парные картинки» на общем каркасе.
///
/// Партия уровня: карты показываются лицом вверх на время показа, закрываются, и
/// человек открывает их группами — пары, с L10 тройки, с L13 четвёрки. С L22 после
/// каждой ошибки закрытые карты меняются местами, пара за парой, и пара подсвечена
/// до обмена. Секундомер идёт только в самой партии: показ и обмены навязаны игрой.
///
/// СВОБОДНАЯ ПАРТИЯ (веб: режим `single`) — пары, число пар 6/8/10/12 и фото-показ
/// 0,5/1,5/3 с выбирает человек; лестница не двигается. Ею же играется шаг зарядки — как
/// в вебе. НЕЗАКОНЧЕННАЯ ПАРТИЯ пишется снимком в форме веб-сессии ([pairsSnapshot]) и
/// поднимается при входе: свернул приложение посреди расклада — расклад на месте.
enum Phase { ready, preview, play, won, revealed }

/// Отложенная запись партии — как в вебе и у «Дворца памяти»: подряд идущие касания дают
/// ОДНУ запись, и пишется последнее состояние.
const pairsResumeDebounce = Duration(milliseconds: 400);

class PicturePairsScreen extends StatefulWidget {
  const PicturePairsScreen({super.key, required this.state, this.rnd, this.theme});

  final SharedState state;

  /// Только для проб: предсказуемая колода и броски обменов.
  final Random? rnd;

  /// Только для проб: набор картинок готовым, без чтения ассетов. Чтение через
  /// rootBundle — настоящая асинхронность, и в пробе её пришлось бы крутить
  /// `runAsync`, а он вешал прогон на картинках предыдущего теста (замер 30.09).
  final PairsTheme? theme;

  @override
  State<PicturePairsScreen> createState() => _PicturePairsScreenState();
}

/// Набор картинок и рубашка под профиль — из `assets/pairs/themes.json`, который
/// собирает `tools/embed-pairs.mjs` из веб-таблицы наборов.
class PairsTheme {
  const PairsTheme({required this.sprites, required this.back, required this.icon});
  final List<String> sprites;
  final Color back;
  final IconData icon;

  /// Значки рубашек веба (Ionicons) → ближайшие значки Material.
  static const _icons = <String, IconData>{
    'paw': Icons.pets,
    'trophy': Icons.emoji_events,
    'pulse': Icons.monitor_heart_outlined,
    'briefcase': Icons.work_outline,
    'car-sport': Icons.directions_car,
    'school': Icons.school_outlined,
    'earth': Icons.public,
    'flower': Icons.local_florist_outlined,
    'bulb': Icons.lightbulb_outline,
  };

  static Future<PairsTheme> load(String profile, {AssetBundle? bundle}) async {
    final raw = await (bundle ?? rootBundle).loadString('assets/pairs/themes.json');
    return fromJson(jsonDecode(raw) as Map<String, dynamic>, profile);
  }

  /// Набор по профилю из уже прочитанного `themes.json`.
  static PairsTheme fromJson(Map<String, dynamic> d, String profile) {
    final theme = (d['profiles'] as Map<String, dynamic>)[profile] as String? ?? d['fallback'] as String;
    final back = (d['backs'] as Map<String, dynamic>)[theme] as Map<String, dynamic>;
    final hex = (back['color'] as String).replaceFirst('#', '');
    return PairsTheme(
      sprites: ((d['sprites'] as Map<String, dynamic>)[theme] as List).cast<String>(),
      back: Color(int.parse('ff$hex', radix: 16)),
      icon: _icons[back['icon']] ?? Icons.help_outline,
    );
  }
}

class _PicturePairsScreenState extends State<PicturePairsScreen> with WidgetsBindingObserver {
  late LevelLadder _ladder;
  late final ResumeStore _resume = ResumeStore(widget.state, pairsGameId, pairsResumeVersion);
  GameTimer? _saveTimer;

  /// Свободная партия и её настройки (веб: `mode === 'single'`, `pairsCount`,
  /// `photoMemoryMode`, `previewMs`).
  bool _free = false;
  int _freePairs = 6;
  bool _photo = true;
  int _previewMs = 500;

  /// Секунды, набежавшие до подъёма партии из снимка: секундомер идёт поверх них.
  double _elapsedBase = 0;
  late Random _rnd;
  PairsTheme? _theme;
  PairsGame? _game;
  Phase _phase = Phase.ready;

  /// Поле заперто: идёт показ промаха, снятие группы или обмены.
  bool _locked = false;

  /// Пара, которая сейчас меняется местами.
  List<int>? _swapPair;
  GameTimer? _timer;

  /// Время партии — на игровых часах (`gameNow`), как у веба: пауза, разбор и уход в фон в
  /// партию не входят (был `Stopwatch` — минуты в меню паузы шли в time_seconds и снимали
  /// очки, сверка веб → натив 02.10.2026). Идущий отрезок — с [_clockFrom], набежавшее до
  /// него — в [_clockDone]; обмены после ошибки часы останавливают.
  int? _clockFrom;
  double _clockDone = 0;
  GameTimer? _tick;

  /// Вибрация хода — через общий выключатель «Вибрация», как у веба (FlipCard, haptics.ts):
  /// открыл карту — лёгкая, собрал группу — средняя, промах — сильная.
  late final AppHaptics _haptics = AppHaptics(widget.state);

  @override
  void initState() {
    super.initState();
    _rnd = widget.rnd ?? Random();
    _ladder = LevelLadder(gameId: 'picture_pairs', store: SharedLevelStore(widget.state));
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _flush(); // экран сносят — дописать партию сразу, а не через задержку
    _timer?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  /// Приложение свернули — ровно тот случай, ради которого запись и существует.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _flush();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final theme = widget.theme ?? await PairsTheme.load(widget.state.activeProfile);
    // Шаг зарядки старую партию не поднимает: он сам начинает свежий раунд (как в вебе).
    final saved = GamePreset.autostart ? null : await _resume.load();
    if (!mounted) return;
    final live = pairsRestore(saved, rnd: _rnd);
    setState(() {
      _theme = theme;
      _reset();
      if (live != null) {
        _game = live.game;
        _free = live.free;
        if (live.free) _freePairs = live.game.groups;
        _elapsedBase = live.elapsed;
        _phase = Phase.play;
      }
    });
    if (live != null) {
      _startClock();
      return;
    }
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (GamePreset.autostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _tick?.cancel();
    _tick = null;
    _clockFrom = null;
    _clockDone = 0;
    _elapsedBase = 0;
    // Новая раздача — партия снова зачётная: отметку разбора снимает новая раздача, как у
    // «Корси» и соседних экранов. Без этого разбор, открытый в свободной партии, молча
    // делал незачётной следующую партию уровня.
    LessonUsed.reset();
    if (GamePreset.isPreset) {
      // Шаг зарядки — свободная партия по шагу (веб: режим single). Число пар — желание шага,
      // но не больше освоенного + 1 (`capPresetByLevel`); показ — из шага, по умолчанию 3 с.
      final level = _ladder.level;
      _free = true;
      _photo = true;
      _freePairs = capPresetByLevel(
        want: GamePreset.num('pairsCount', 6),
        atLevel: LevelCfg.of(level).pairs,
        atTop: level >= 9,
      );
      _previewMs = GamePreset.num('previewMs', 3000);
    }
    _game = _free
        ? PairsGame(
            level: _ladder.level,
            cfg: pairsFreeCfg(pairs: _freePairs, photo: _photo, previewMs: _previewMs),
            rnd: _rnd,
          )
        : PairsGame(level: _ladder.level, rnd: _rnd);
    _phase = Phase.ready;
    _locked = false;
    _swapPair = null;
  }

  /// Секунды партии: набежавшие до подъёма из снимка плюс игровые часы.
  double get _elapsed => _elapsedBase + _clockDone + (_clockFrom == null ? 0 : (gameNow() - _clockFrom!) / 1000);

  /// «Заново»: новая партия, недоигранная запись стирается (веб: startGame → clearResume).
  void _restart() {
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(_reset);
  }

  /// Партия изменилась — отложенная запись перезаводится. На игровых часах: на паузе
  /// запись ждёт, а уход в фон и снос экрана дописывают партию сразу.
  void _changed() {
    _saveTimer?.cancel();
    _saveTimer = gameTimeout(pairsResumeDebounce, _flush);
  }

  /// Записать живую партию. Не пишется: фото-показ (снимок поля лицом вверх был бы
  /// сохранённой шпаргалкой), итог, раскрытое решение и партия, где ещё ничего не сделано.
  void _flush() {
    _saveTimer?.cancel();
    _saveTimer = null;
    final g = _game;
    if (g == null || _phase != Phase.play) return;
    if (g.moves == 0 && g.matchedGroups == 0 && g.errors == 0) return;
    // Счёт цепочки уровней копит веб; нативная партия считает уровень сама — 0.
    unawaited(_resume.save(pairsSnapshot(g, free: _free, score: 0, elapsed: _elapsed)));
  }

  void _startClock() {
    _clockFrom ??= gameNow();
    _tick ??= gameInterval(const Duration(milliseconds: 250), () {
      if (mounted) setState(() {});
    });
  }

  /// Остановить часы, не гася перерисовку: отрезок уходит в набежавшее.
  void _holdClock() {
    final from = _clockFrom;
    if (from == null) return;
    _clockDone += (gameNow() - from) / 1000;
    _clockFrom = null;
  }

  void _stopClock() {
    _holdClock();
    _tick?.cancel();
    _tick = null;
  }

  /// Показ: все карты лицом вверх `previewMs`, потом партия. Без фото-показа (свободная
  /// партия с выключенным флажком) — сразу партия.
  void _start() {
    final g = _game!;
    // Новая партия заменяет незаконченную: прежний расклад продолжать уже нечем.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    if (!g.cfg.photo || g.cfg.previewMs <= 0) {
      setState(() => _phase = Phase.play);
      _startClock();
      return;
    }
    setState(() => _phase = Phase.preview);
    _timer = gameTimeout(Duration(milliseconds: g.cfg.previewMs), () {
      if (!mounted) return;
      setState(() => _phase = Phase.play);
      _startClock();
    });
  }

  void _tap(int i) {
    final g = _game!;
    if (_phase != Phase.play || _locked) return;
    final r = g.tap(i);
    if (r == TapResult.ignored) return;
    switch (r) {
      case TapResult.opened:
        _haptics.selection();
      case TapResult.groupMatched:
        _haptics.medium();
      case TapResult.groupMissed:
        _haptics.heavy();
      case TapResult.ignored:
        break;
    }
    setState(() {});
    _changed();
    if (r == TapResult.groupMatched) {
      _locked = true;
      _timer = gameTimeout(const Duration(milliseconds: 400), () {
        if (!mounted) return;
        setState(() {
          g.settleMatch();
          _locked = false;
        });
        if (g.isWon) {
          _win();
        } else {
          _changed();
        }
      });
    } else if (r == TapResult.groupMissed) {
      _locked = true;
      _timer = gameTimeout(const Duration(milliseconds: 800), () {
        if (!mounted) return;
        setState(g.settleMiss);
        final swaps = swapsAfterMiss(g.cfg.swapsPerMiss, _rnd.nextDouble);
        if (swaps > 0) {
          _runSwaps(swaps);
        } else {
          setState(() => _locked = false);
        }
      });
    }
  }

  /// Обмены после ошибки: пара закрытых карт подсвечена `swapLitMs`, потом меняется
  /// местами, пауза `swapGapMs` — следующая. Поле заперто, секундомер стоит: это
  /// время навязано игрой и в счёт не идёт.
  void _runSwaps(int count) {
    final g = _game!;
    _holdClock();
    void step(int left) {
      if (!mounted) return;
      final closed = g.closed;
      if (left <= 0 || closed.length < 2) {
        setState(() {
          _swapPair = null;
          _locked = false;
        });
        _clockFrom ??= gameNow();
        return;
      }
      final a = closed[_rnd.nextInt(closed.length)];
      final rest = closed.where((c) => c != a).toList();
      final b = rest[_rnd.nextInt(rest.length)];
      setState(() => _swapPair = [a, b]);
      _timer = gameTimeout(const Duration(milliseconds: swapLitMs), () {
        if (!mounted) return;
        setState(() {
          g.swap(a, b);
          _swapPair = null;
        });
        _changed();
        _timer = gameTimeout(const Duration(milliseconds: swapGapMs), () => step(left - 1));
      });
    }

    _timer = gameTimeout(const Duration(milliseconds: swapGapMs), () => step(count));
  }

  void _win() {
    final g = _game!;
    _stopClock();
    final elapsed = _elapsed;
    final seconds = elapsed.round();
    // Партия доиграна — незаконченной больше нет, иначе «Продолжить» звало бы на разобранный расклад.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(() => _phase = Phase.won);
    if (_free) {
      // Свободная партия лестницу не двигает — отчёт идёт сам, метками веба (`saveSession`, single).
      unawaited(
        SessionReport.send(
          gameType: 'picture_pairs',
          score: g.freeScore(elapsed),
          timeSeconds: seconds,
          difficulty: '${g.groups} pairs',
          mode: g.cfg.photo ? 'photo-${g.cfg.previewMs}ms' : 'classic',
          errors: g.errors,
          details: {
            'moves': g.moves,
            'optimal': g.groups,
            'photo_memory_mode': g.cfg.photo,
            'preview_ms': g.cfg.photo ? g.cfg.previewMs : 0,
            'extra_moves': g.extraMoves,
            // Партия с открытым разбором — с той же меткой, что пишет лестница уровней.
            if (LessonUsed.inRound) 'lesson': true,
          },
        ),
      );
      return;
    }
    // Метки уровня — как веб `advanceLevel`: lvl<N>, game и details уровня.
    _ladder.win(
      score: g.score(seconds),
      timeSeconds: seconds,
      errors: g.errors,
      mode: 'game',
      difficulty: 'lvl${g.level}',
      details: {'level': g.level, 'moves': g.moves, 'pairs': g.groups, 'photo_memory_mode': g.cfg.photo},
    );
  }

  /// Показать решение: все карты лицом вверх, партия кончается без зачёта —
  /// подсмотренный расклад не поднимает уровень и не опускает его.
  void _reveal() {
    _timer?.cancel();
    _stopClock();
    // Раскрытая партия кончилась без зачёта — продолжать в ней нечего.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(() {
      _phase = Phase.revealed;
      _swapPair = null;
      _locked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    final theme = _theme;
    if (g == null || theme == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('picturePairs'),
      onLesson: () => openDemoLesson(context, title: L.t('picturePairs'), trials: pairsLessonTrials(theme)),
      hud: [
        // В свободной партии уровня нет — тропинку и рекорд уровня не показываем (как веб).
        if (!_free) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        if (!_free) HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('hud_correct'), value: '${g.matchedGroups}/${g.groups}', icon: Icons.done_all),
        HudItem(label: L.t('hud_moves'), value: '${g.moves}', icon: Icons.swap_horiz),
        HudItem(label: L.t('time'), value: '${_elapsed.floor()}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => _phase == Phase.ready
          ? _Ready(
              level: _ladder.level,
              free: _free,
              pairs: _freePairs,
              photo: _photo,
              previewMs: _previewMs,
              onFree: (v) => setState(() {
                _free = v;
                _reset();
              }),
              onPairs: (n) => setState(() {
                _freePairs = n;
                _reset();
              }),
              onPhoto: (v) => setState(() {
                _photo = v;
                _reset();
              }),
              onPreview: (ms) => setState(() {
                _previewMs = ms;
                _reset();
              }),
              onStart: _start,
            )
          : _Field(
              game: g,
              theme: theme,
              phase: _phase,
              swapPair: _swapPair,
              height: h,
              onTap: _tap,
            ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
        AuxAction(
          icon: Icons.visibility_outlined,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: _phase == Phase.play && !_locked ? _reveal : null,
        ),
      ]),
      toolbar: _phase == Phase.won || _phase == Phase.revealed
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _restart,
                icon: const Icon(Icons.arrow_forward),
                label: Text(_phase == Phase.won ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Экран перед партией: выбор «уровни / свободно», затем уровень с его правилом или
/// настройки свободной партии, и старт.
///
/// ⚠️ Пока у каркаса нет общей карточки правил (задача e371fd3a), правило уровня
/// объявляется здесь, до показа карт — иначе тройки, четвёрки и обмены включались бы
/// молча. Ключи написаны целиком, а не собраны из имени: `embed-l10n` вырезает из
/// словаря только ключи, которые видит в исходнике.
class _Ready extends StatelessWidget {
  const _Ready({
    required this.level,
    required this.free,
    required this.pairs,
    required this.photo,
    required this.previewMs,
    required this.onFree,
    required this.onPairs,
    required this.onPhoto,
    required this.onPreview,
    required this.onStart,
  });
  final int level;
  final bool free;
  final int pairs;
  final bool photo;
  final int previewMs;
  final ValueChanged<bool> onFree;
  final ValueChanged<int> onPairs;
  final ValueChanged<bool> onPhoto;
  final ValueChanged<int> onPreview;
  final VoidCallback onStart;

  static (String, String)? _rule(int level) => switch (LevelCfg.ruleAt(level)) {
        'triple' => (L.t('lr_picture_pairs_triple_title'), L.t('lr_picture_pairs_triple_rule')),
        'quad' => (L.t('lr_picture_pairs_quad_title'), L.t('lr_picture_pairs_quad_rule')),
        'swap' => (L.t('lr_picture_pairs_swap_title'), L.t('lr_picture_pairs_swap_rule')),
        _ => null,
      };

  /// Секунды показа, как в вебе: «0.5», «1.5», «3» — без хвоста «.0».
  static String _secs(int ms) => ms % 1000 == 0 ? '${ms ~/ 1000}' : '${ms / 1000}';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final rule = _rule(level);
    final cfg = LevelCfg.of(level);
    // «Начать» прибита под настройками и видна без прокрутки — как полоса старта в вебе
    // (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»); прокручиваются только
    // настройки. На 360×640 с правилом уровня кнопка иначе уезжала за край.
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Выбор режима — те же подписи, что у общего веб-переключателя (GameModeSwitch).
                  SegmentedButton<bool>(
                    key: const Key('pp-mode'),
                    segments: [
                      ButtonSegment(value: false, label: Text(L.t('sudokuModeLevels'))),
                      ButtonSegment(value: true, label: Text(L.t('sudokuModeFree'))),
                    ],
                    selected: {free},
                    showSelectedIcon: false,
                    onSelectionChanged: (v) => onFree(v.first),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    // Ключ — литералом в L.t('…'): ключ внутри тернарника сборщик словаря
                    // (embed-l10n) и гейт словаря не видят, и экран показывал сам ключ.
                    free ? L.t('pairsModeFreeHint') : L.t('pairsModeLevelsHint'),
                    textAlign: TextAlign.center,
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  if (!free) ...[
                    Text(
                      '${L.t('pairsLvlPairs').replaceAll('{n}', '${cfg.pairs}')} · '
                      '${L.t('pairsLvlFlash').replaceAll('{s}', (cfg.previewMs / 1000).toStringAsFixed(1))}',
                      key: const Key('pp-level-params'),
                      textAlign: TextAlign.center,
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    if (rule != null) ...[
                      Text(rule.$1, key: const Key('правило'), textAlign: TextAlign.center, style: text.titleMedium),
                      const SizedBox(height: 6),
                      Text(rule.$2, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                    ],
                  ] else ...[
                    Text(L.t('pairsCount'), style: text.titleSmall),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      alignment: WrapAlignment.center,
                      children: [
                        for (final n in pairsFreeCounts)
                          ChoiceChip(
                            key: Key('pp-pairs-$n'),
                            label: Text('$n'),
                            selected: n == pairs,
                            onSelected: (_) => onPairs(n),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      key: const Key('pp-photo'),
                      contentPadding: EdgeInsets.zero,
                      value: photo,
                      onChanged: (v) => onPhoto(v ?? true),
                      title: Text(L.t('label_photo_memory')),
                      subtitle: Text(L.t('desc_photo_memory'), style: text.bodySmall),
                    ),
                    if (photo)
                      Wrap(
                        spacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          for (final ms in pairsFreePreviewMs)
                            ChoiceChip(
                              key: Key('pp-preview-$ms'),
                              // Секунды + готовая тройка «Легко/Средне/Сложно» из словаря, как в вебе.
                              label: Text(
                                '${_secs(ms)}${L.t('secShort')} '
                                '(${ms == 500
                                    ? L.t('hard')
                                    : ms == 1500
                                    ? L.t('medium')
                                    : L.t('easy')})',
                              ),
                              selected: ms == previewMs,
                              onSelected: (_) => onPreview(ms),
                            ),
                        ],
                      ),
                    const SizedBox(height: 16),
                  ],
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
          child: FilledButton(key: const Key('pp-start'), onPressed: onStart, child: Text(L.t('start'))),
        ),
      ],
    );
  }
}

/// Поле: сетка карт, размер — от поля каркаса (см. [pairsGrid]).
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.theme,
    required this.phase,
    required this.swapPair,
    required this.height,
    required this.onTap,
  });

  final PairsGame game;
  final PairsTheme theme;
  final Phase phase;
  final List<int>? swapPair;
  final double height;
  final void Function(int) onTap;

  static const _hint = 40.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final grid = pairsGrid(
        groups: game.groups,
        cards: game.cards.length,
        containerWidth: min(c.maxWidth - 32, 480),
        fieldHeight: height,
        bottomReserve: 8,
        hint: _hint,
      );
      final board = SizedBox(
        width: grid.width,
        child: Wrap(
          spacing: pairsCardGap,
          runSpacing: pairsCardGap,
          children: [
            for (var i = 0; i < game.cards.length; i++)
              PairCardView(
                index: i,
                card: game.cards[i],
                size: grid.card,
                theme: theme,
                faceUp: phase == Phase.preview || phase == Phase.revealed || game.cards[i].flipped || game.cards[i].matched,
                lit: swapPair?.contains(i) ?? false,
                onTap: phase == Phase.play ? () => onTap(i) : null,
              ),
          ],
        ),
      );
      final caption = phase == Phase.preview ? L.t('label_memorize') : L.t('picturePairsHint');
      final column = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          board,
          SizedBox(
            height: _hint,
            child: Center(child: Text(caption, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall)),
          ),
        ],
      );
      // На малых окнах при пальце 48 карты выше поля не помещаются — поле прокручивается,
      // а не сжимает карты мельче пальца.
      return Center(
        child: grid.fits ? column : SingleChildScrollView(key: const Key('поле-прокрутка'), child: column),
      );
    });
  }
}

/// Карта поля — ОДНА для партии и для разбора. Разбор, нарисованный «похоже», учил
/// бы не той игре: здесь и картинка, и рубашка, и подсветка обмена — те же.
class PairCardView extends StatelessWidget {
  const PairCardView({
    super.key,
    required this.index,
    required this.card,
    required this.size,
    required this.theme,
    required this.faceUp,
    required this.lit,
    required this.onTap,
    this.marked = false,
    this.keyPrefix = '',
  });

  final int index;
  final PairCard card;
  final double size;
  final PairsTheme theme;
  final bool faceUp;
  final bool lit;
  final VoidCallback? onTap;

  /// Разбор выделяет карты ответа рамкой.
  final bool marked;

  /// У карт разбора свои ключи: разбор открывается поверх партии, и пробе нужно
  /// различать, чью карту она читает. Префикс латиницей: русский литерал вне Key('…')
  /// гейт ui_text_debt считает зашитым текстом интерфейса.
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget face = faceUp
        ? Container(
            key: Key('$keyPrefixлицо$index'),
            decoration: BoxDecoration(
              color: card.matched ? const Color(0xFF22C55E) : scheme.surface,
              border: marked ? Border.all(color: scheme.primary, width: 4) : null,
              borderRadius: BorderRadius.circular(10),
            ),
            padding: EdgeInsets.all(size * 0.09),
            child: Image.asset(theme.sprites[card.symbol], fit: BoxFit.contain),
          )
        : Container(
            key: lit ? Key('$keyPrefixобмен$index') : null,
            decoration: BoxDecoration(
              color: theme.back,
              borderRadius: BorderRadius.circular(10),
              // Подсвеченная пара: толстая рамка и значок обмена — одной рамки на
              // девяти цветах рубашек мало.
              border: Border.all(color: lit ? const Color(0xFFFDE047) : Colors.white24, width: lit ? 4 : 1),
            ),
            child: Icon(lit ? Icons.swap_horiz : theme.icon, color: Colors.white70, size: size * (lit ? 0.42 : 0.32)),
          );
    // Карта для скринридера — как у веба (picture-pairs.tsx, a11yLabel): закрытую называем
    // только номером, иначе игра теряет смысл; открытую — номером и картинкой, собранную — ещё
    // и «найдена». Ключи — каждый своим L.t: сборщик словаря видит только литералы.
    final open = card.flipped || card.matched;
    final label = open
        ? '${L.t('a11yCard')} ${index + 1}, ${card.symbol + 1}${card.matched ? ', ${L.t('a11yFound')}' : ''}'
        : '${L.t('a11yCard')} ${index + 1}';
    return Semantics(
      label: label,
      button: true,
      enabled: onTap != null,
      // Подпись своя, поэтому дочерние узлы не читаются, — и тогда нажатие отдаём сами.
      onTap: onTap,
      excludeSemantics: true,
      child: SizedBox(
        width: size,
        height: size,
        child: Material(
          borderRadius: BorderRadius.circular(10),
          clipBehavior: Clip.antiAlias,
          child: InkWell(key: Key('$keyPrefixкарта$index'), onTap: onTap, child: face),
        ),
      ),
    );
  }
}

/// Доска разбора: карты той же игры, в той же раскладке.
class PairsLessonArt extends StatelessWidget {
  const PairsLessonArt({
    super.key,
    required this.game,
    required this.theme,
    this.marked = const [],
    this.swapPair,
  });

  /// Партия, из которой взят пример: её колода и уровень.
  final PairsGame game;
  final PairsTheme theme;

  /// Карты ответа — места одной группы.
  final List<int> marked;

  /// Пара, которая меняется местами: тогда карты лежат рубашкой вверх.
  final List<int>? swapPair;

  @override
  Widget build(BuildContext context) {
    const cols = 4;
    const side = 52.0;
    return SizedBox(
      width: cols * side + (cols - 1) * pairsCardGap,
      child: Wrap(
        spacing: pairsCardGap,
        runSpacing: pairsCardGap,
        children: [
          for (var i = 0; i < game.cards.length; i++)
            PairCardView(
              index: i,
              card: game.cards[i],
              size: side,
              theme: theme,
              faceUp: swapPair == null,
              lit: swapPair?.contains(i) ?? false,
              marked: marked.contains(i),
              onTap: null,
              keyPrefix: 'lesson-',
            ),
        ],
      ),
    );
  }
}

/// Примеры разбора — ИЗ ГЕНЕРАТОРА САМОЙ ИГРЫ: колоды тянет `PairsGame`, уровень задаёт
/// размер группы, обмены — ось с L22 (`pairsVolumeTop`).
///
/// Три приёма, и каждый про то, на чём здесь ошибаются:
/// · места, а не картинки — на показе картинка привязывается к месту (L1, пары);
/// · группа целиком — у троек и четвёрок держать ВСЕ места одной картинки (L10);
/// · обмен — подсвеченная пара переехала, перенести картинку в памяти (с L22).
List<DemoTrial> pairsLessonTrials(PairsTheme theme, {Random? rnd}) {
  final r = rnd ?? Random(930);
  final pairs = PairsGame(level: 1, rnd: r);
  final triples = PairsGame(level: 10, rnd: r);
  List<int> placesOf(PairsGame g, int symbol) =>
      [for (var i = 0; i < g.cards.length; i++) if (g.cards[i].symbol == symbol) i];
  final closed = [for (var i = 0; i < pairs.cards.length; i++) i];
  final a = closed[r.nextInt(closed.length)];
  final rest = closed.where((c) => c != a).toList();
  final b = rest[r.nextInt(rest.length)];
  return [
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsPlaces'),
      art: PairsLessonArt(game: pairs, theme: theme, marked: placesOf(pairs, pairs.cards.first.symbol)),
    ),
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsGroup'),
      art: PairsLessonArt(game: triples, theme: theme, marked: placesOf(triples, triples.cards.first.symbol)),
    ),
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsSwap'),
      art: PairsLessonArt(game: pairs, theme: theme, swapPair: [a, b]),
    ),
  ];
}
