import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Парные картинки» на общем каркасе.
///
/// Партия уровня: карты показываются лицом вверх на время показа, закрываются, и
/// человек открывает их группами — пары, с L10 тройки, с L13 четвёрки. С L22 после
/// каждой ошибки закрытые карты меняются местами, пара за парой, и пара подсвечена
/// до обмена. Секундомер идёт только в самой партии: показ и обмены навязаны игрой.
enum Phase { ready, preview, play, won, revealed }

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

class _PicturePairsScreenState extends State<PicturePairsScreen> {
  late LevelLadder _ladder;
  late Random _rnd;
  PairsTheme? _theme;
  PairsGame? _game;
  Phase _phase = Phase.ready;

  /// Поле заперто: идёт показ промаха, снятие группы или обмены.
  bool _locked = false;

  /// Пара, которая сейчас меняется местами.
  List<int>? _swapPair;
  Timer? _timer;
  final Stopwatch _clock = Stopwatch();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _rnd = widget.rnd ?? Random();
    _ladder = LevelLadder(gameId: 'picture_pairs', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final theme = widget.theme ?? await PairsTheme.load(widget.state.activeProfile);
    if (!mounted) return;
    setState(() {
      _theme = theme;
      _reset();
    });
  }

  void _reset() {
    _timer?.cancel();
    _tick?.cancel();
    _clock
      ..stop()
      ..reset();
    _game = PairsGame(level: _ladder.level, rnd: _rnd);
    _phase = Phase.ready;
    _locked = false;
    _swapPair = null;
  }

  void _startClock() {
    _clock.start();
    _tick ??= Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() {});
    });
  }

  void _stopClock() {
    _clock.stop();
    _tick?.cancel();
    _tick = null;
  }

  /// Показ: все карты лицом вверх `previewMs`, потом партия.
  void _start() {
    final g = _game!;
    setState(() => _phase = Phase.preview);
    _timer = Timer(Duration(milliseconds: g.cfg.previewMs), () {
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
    setState(() {});
    if (r == TapResult.groupMatched) {
      _locked = true;
      _timer = Timer(const Duration(milliseconds: 400), () {
        if (!mounted) return;
        setState(() {
          g.settleMatch();
          _locked = false;
        });
        if (g.isWon) _win();
      });
    } else if (r == TapResult.groupMissed) {
      _locked = true;
      _timer = Timer(const Duration(milliseconds: 800), () {
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
    _clock.stop();
    void step(int left) {
      if (!mounted) return;
      final closed = g.closed;
      if (left <= 0 || closed.length < 2) {
        setState(() {
          _swapPair = null;
          _locked = false;
        });
        _clock.start();
        return;
      }
      final a = closed[_rnd.nextInt(closed.length)];
      final rest = closed.where((c) => c != a).toList();
      final b = rest[_rnd.nextInt(rest.length)];
      setState(() => _swapPair = [a, b]);
      _timer = Timer(const Duration(milliseconds: swapLitMs), () {
        if (!mounted) return;
        setState(() {
          g.swap(a, b);
          _swapPair = null;
        });
        _timer = Timer(const Duration(milliseconds: swapGapMs), () => step(left - 1));
      });
    }

    _timer = Timer(const Duration(milliseconds: swapGapMs), () => step(count));
  }

  void _win() {
    final g = _game!;
    _stopClock();
    final seconds = _clock.elapsed.inSeconds;
    setState(() => _phase = Phase.won);
    _ladder.win(score: g.score(seconds), timeSeconds: seconds, errors: g.errors, mode: 'game');
  }

  /// Показать решение: все карты лицом вверх, партия кончается без зачёта —
  /// подсмотренный расклад не поднимает уровень и не опускает его.
  void _reveal() {
    _timer?.cancel();
    _stopClock();
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
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('hud_correct'), value: '${g.matchedGroups}/${g.groups}', icon: Icons.done_all),
        HudItem(label: L.t('hud_moves'), value: '${g.moves}', icon: Icons.swap_horiz),
        HudItem(label: L.t('time'), value: '${_clock.elapsed.inSeconds}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => _phase == Phase.ready
          ? _Ready(level: _ladder.level, onStart: _start)
          : _Field(
              game: g,
              theme: theme,
              phase: _phase,
              swapPair: _swapPair,
              height: h,
              onTap: _tap,
            ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
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
                onPressed: () => setState(_reset),
                icon: const Icon(Icons.arrow_forward),
                label: Text(_phase == Phase.won ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Экран перед партией: уровень, правило уровня (если оно здесь меняется) и старт.
///
/// ⚠️ Пока у каркаса нет общей карточки правил (задача e371fd3a), правило уровня
/// объявляется здесь, до показа карт — иначе тройки, четвёрки и обмены включались бы
/// молча. Ключи написаны целиком, а не собраны из имени: `embed-l10n` вырезает из
/// словаря только ключи, которые видит в исходнике.
class _Ready extends StatelessWidget {
  const _Ready({required this.level, required this.onStart});
  final int level;
  final VoidCallback onStart;

  static (String, String)? _rule(int level) => switch (LevelCfg.ruleAt(level)) {
        'triple' => (L.t('lr_picture_pairs_triple_title'), L.t('lr_picture_pairs_triple_rule')),
        'quad' => (L.t('lr_picture_pairs_quad_title'), L.t('lr_picture_pairs_quad_rule')),
        'swap' => (L.t('lr_picture_pairs_swap_title'), L.t('lr_picture_pairs_swap_rule')),
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final rule = _rule(level);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (rule != null) ...[
              Text(rule.$1,
                  key: const Key('правило'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(rule.$2, textAlign: TextAlign.center),
              const SizedBox(height: 16),
            ],
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        ),
      ),
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
  /// различать, чью карту она читает.
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
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(key: Key('$keyPrefixкарта$index'), onTap: onTap, child: face),
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
              keyPrefix: 'урок-',
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
