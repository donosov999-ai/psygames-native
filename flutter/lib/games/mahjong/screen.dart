import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// МАДЖОНГ на общем каркасе — вторая перенесённая тап-игра раздела.
///
/// 🔴 ПОЛЕ БЕРЁТ ВЫСОТУ У КАРКАСА ЧИСЛОМ. Доска здесь считается дважды: по сетке
/// (свобода плитки) и в пикселях (показ). Если пиксельный размер брать от окна,
/// две арифметики разъезжаются — ровно та жалоба, с которой начался переезд:
/// «слои криво доступны и скачут».
///
/// ⚠️ Раскладки — чужие данные (ffalt/mah, MIT), лежат ресурсом; уведомление об
/// авторстве в самом ресурсе и в шапке `model.dart`.
class MahjongScreen extends StatefulWidget {
  const MahjongScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Зерно раздачи. В приложении не задаётся (каждая партия своя), в пробах
  /// задаётся, чтобы проба знала, какая доска перед ней, и играла по ней НАЖАТИЯМИ.
  final Random? rnd;

  @override
  State<MahjongScreen> createState() => _MahjongScreenState();
}

class _MahjongScreenState extends State<MahjongScreen> {
  /// Сколько держать подсветку тех, кто держит плитку.
  static const _blockersFor = Duration(milliseconds: 900);

  /// Рисунков в наборе: 36 — классика, по 4 плитки на рисунок при полном наборе.
  static const _symbolCount = 36;

  late LevelLadder _ladder;
  MahjongLayouts? _layouts;
  LevelLayout? _picked;

  List<Tile> _tiles = const [];
  List<bool> _alive = const [];
  List<List<bool>> _history = [];   // снимки маски для отмены
  List<int> _blockers = const [];

  int? _selected;
  int _matched = 0;
  int _errors = 0;
  int _shufflesUsed = 0;
  int _undosUsed = 0;
  bool _won = false;
  Timer? _blockersTimer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'mahjong', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _blockersTimer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final raw = await rootBundle.loadString('assets/levels/mahjong_layouts.json');
    if (!mounted) return;
    _layouts = MahjongLayouts.fromJson(raw);
    setState(_deal);
  }

  MahjongLevelCfg get _cfg => mahjongLevel(_ladder.level);
  bool get _hidden => mahjongHidden(_ladder.level);
  int get _pairsTotal => _tiles.length ~/ 2;

  void _deal() {
    _blockersTimer?.cancel();
    _picked = _layouts?.forLevel(_ladder.level);
    final places = _picked?.places ?? const <Place>[];
    final deal = dealSolvable(places, _symbolCount, rnd: widget.rnd?.nextDouble);
    _tiles = deal.tiles;
    _alive = List<bool>.filled(_tiles.length, true);
    _history = [];
    _blockers = const [];
    _selected = null;
    _matched = 0;
    _errors = 0;
    _shufflesUsed = 0;
    _undosUsed = 0;
    _won = false;
  }

  int get _openPairs => availablePairs(_tiles, _alive);

  /// Даст ли перетасовка разбираемую доску — спрашиваем раздатчика, а не бюджет.
  /// «Бюджет не пуст» ещё не значит, что тасовать есть смысл.
  bool get _shuffleDeals {
    if (!canShuffle(_cfg.shuffles, _shufflesUsed)) return false;
    final places = [
      for (var i = 0; i < _tiles.length; i += 1)
        if (_alive[i]) Place(x: _tiles[i].x, y: _tiles[i].y, layer: _tiles[i].layer),
    ];
    return places.length >= 2;
  }

  StuckInput get _stuck => StuckInput(
        openPairs: _openPairs,
        shufflesLeft: shufflesLeft(_cfg.shuffles, _shufflesUsed),
        shuffleDeals: _shuffleDeals,
        canUndo: _history.isNotEmpty && _undosUsed < undosPerLevel,
      );

  void _tap(int i) {
    if (_won || !_alive[i]) return;
    if (!isFree(_tiles, _alive, i)) {
      // Отказ без объяснения читается как «не нажалось», а не как «правило не пускает»:
      // показываем тех, кто держит.
      setState(() => _blockers = blockersOf(_tiles, _alive, i));
      _blockersTimer?.cancel();
      _blockersTimer = Timer(_blockersFor, () {
        if (mounted) setState(() => _blockers = const []);
      });
      return;
    }
    if (_selected == null) {
      setState(() => _selected = i);
      return;
    }
    if (_selected == i) {
      setState(() => _selected = null);
      return;
    }
    if (_tiles[_selected!].symbol == _tiles[i].symbol) {
      final a = _selected!;
      setState(() {
        _history.add(List<bool>.from(_alive));
        _alive[a] = false;
        _alive[i] = false;
        _selected = null;
        _matched += 1;
      });
      if (_matched >= _pairsTotal) {
        setState(() {
          _won = true;
          _history = [];   // уровень собран — отменять уже нечего
        });
        _ladder.win();
      }
      return;
    }
    // Не совпали — ошибка и перевыбор на новую плитку, как в вебе.
    setState(() {
      _errors += 1;
      _selected = i;
    });
  }

  void _shuffle() {
    if (!canShuffle(_cfg.shuffles, _shufflesUsed)) return;
    final idx = [for (var i = 0; i < _tiles.length; i += 1) if (_alive[i]) i];
    final places = [for (final i in idx) Place(x: _tiles[i].x, y: _tiles[i].y, layer: _tiles[i].layer)];
    final deal = dealSolvable(places, _symbolCount);
    if (deal.isEmpty) return;
    setState(() {
      for (var k = 0; k < idx.length && k < deal.tiles.length; k += 1) {
        _tiles[idx[k]].symbol = deal.tiles[k].symbol;
      }
      _selected = null;
      _shufflesUsed += 1;
      _history = [];   // доска стала другой: старые снимки к ней не относятся
    });
  }

  void _undo() {
    if (_history.isEmpty || _undosUsed >= undosPerLevel) return;
    setState(() {
      _alive = _history.removeLast();
      _undosUsed += 1;
      _matched = max(0, _matched - 1);
      _selected = null;
    });
  }

  String get _stuckLine {
    switch (mahjongStuckKey(_stuck)) {
      case 'mahjongNoPairs':
        return 'Ходов нет. Перетасуй доску или отмени ход';
      case 'mahjongStuckShuffle':
        return 'Ходов нет. Осталась перетасовка';
      case 'mahjongStuckUndo':
        return 'Ходов нет. Отмени последний ход';
      case 'mahjongStuckRestart':
        return 'Ходов нет и выходов не осталось — уровень придётся начать заново';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_layouts == null || _tiles.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final left = shufflesLeft(_cfg.shuffles, _shufflesUsed);
    return GameShell(
      title: 'Маджонг',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Пары', value: '$_matched/$_pairsTotal', icon: Icons.layers_outlined),
        HudItem(label: 'Ходов', value: '$_openPairs', icon: Icons.touch_app_outlined),
        HudItem(
          label: 'Перетасовки',
          value: left < 0 ? '∞' : '$left',
          icon: Icons.shuffle,
        ),
      ],
      field: (context, h) => _Board(
        tiles: _tiles,
        alive: _alive,
        selected: _selected,
        blockers: _blockers,
        hidden: _hidden,
        won: _won,
        height: h,
        onTap: _tap,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.shuffle,
          label: 'Перетасовать',
          onPressed: !_won && _shuffleDeals ? _shuffle : null,
        ),
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить (${undosPerLevel - _undosUsed})',
          onPressed: !_won && _history.isNotEmpty && _undosUsed < undosPerLevel ? _undo : null,
        ),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: () => setState(_deal)),
      ]),
      toolbar: _won || _openPairs == 0
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  _won ? 'Доска разобрана, ошибок $_errors' : _stuckLine,
                  key: const Key('итог'),
                  textAlign: TextAlign.center,
                ),
                if (_won) ...[
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: () => setState(_deal),
                    icon: const Icon(Icons.arrow_forward),
                    label: const Text('Следующий уровень'),
                  ),
                ],
              ]),
            )
          : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: () => setState(_deal)),
      ],
    );
  }
}

/// Доска: плитки лежат стопками, поэтому рисуются слоями снизу вверх.
class _Board extends StatelessWidget {
  const _Board({
    required this.tiles,
    required this.alive,
    required this.selected,
    required this.blockers,
    required this.hidden,
    required this.won,
    required this.height,
    required this.onTap,
  });

  final List<Tile> tiles;
  final List<bool> alive;
  final int? selected;
  final List<int> blockers;
  final bool hidden;
  final bool won;
  final double height;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    var halfX = 0;
    var halfY = 0;
    var maxLayer = 0;
    for (final t in tiles) {
      if (t.x + 2 > halfX) halfX = t.x + 2;
      if (t.y + 2 > halfY) halfY = t.y + 2;
      if (t.layer > maxLayer) maxLayer = t.layer;
    }
    final offset = layerOffsetFor(maxLayer);

    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Размер полуклетки — от МЕНЬШЕГО из «что дал каркас» и ширины, с запасом
        // под подъём слоёв. Доска не знает про окно: окно не знает про шапку и ряд значков.
        final byWidth = (c.maxWidth - 8) / halfX;
        final byHeight = (height - 8 - (maxLayer + 1) * offset) / halfY;
        final half = max(6.0, min(byWidth, byHeight));
        final tileW = half * 2;
        final tileH = half * 2;
        final boardW = halfX * half + maxLayer * offset;
        final boardH = halfY * half + (maxLayer + 1) * offset;

        // Порядок отрисовки: нижние слои первыми, иначе верхние окажутся под ними.
        final order = [for (var i = 0; i < tiles.length; i += 1) i]
          ..sort((a, b) {
            final byLayer = tiles[a].layer.compareTo(tiles[b].layer);
            if (byLayer != 0) return byLayer;
            final byY = tiles[a].y.compareTo(tiles[b].y);
            return byY != 0 ? byY : tiles[a].x.compareTo(tiles[b].x);
          });

        return Center(
          child: SizedBox(
            width: boardW,
            height: boardH,
            child: Stack(
              children: [
                for (final i in order)
                  if (alive[i])
                    _TileView(
                      key: Key('плитка$i'),
                      index: i,
                      tile: tiles[i],
                      maxLayer: maxLayer,
                      half: half,
                      offset: offset,
                      width: tileW,
                      height: tileH,
                      free: isFree(tiles, alive, i),
                      selected: selected == i,
                      blocking: blockers.contains(i),
                      // Скрытая информация: лицо видно, только когда сверху никто не лежит.
                      faceUp: !hidden || !coveredFromAbove(tiles, alive, i),
                      onTap: won ? null : () => onTap(i),
                    ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TileView extends StatelessWidget {
  const _TileView({
    super.key,
    required this.index,
    required this.tile,
    required this.maxLayer,
    required this.half,
    required this.offset,
    required this.width,
    required this.height,
    required this.free,
    required this.selected,
    required this.blocking,
    required this.faceUp,
    required this.onTap,
  });

  final int index;
  final Tile tile;
  final int maxLayer;
  final double half;
  final int offset;
  final double width;
  final double height;
  final bool free;
  final bool selected;
  final bool blocking;
  final bool faceUp;
  final VoidCallback? onTap;

  /// Рисунки набора: 36 знаков. Картинок в пилоте нет, поэтому знак — символ.
  ///
  /// ⚠️ По РУНАМ, а не по кодовым единицам: знаки маджонга лежат за пределами
  /// базовой плоскости, и `строка[i]` отдал бы половину суррогатной пары —
  /// «string is not well-formed UTF-16» прямо при отрисовке.
  static final List<String> _faces =
      '🀇🀈🀉🀊🀋🀌🀍🀎🀏🀐🀑🀒🀓🀔🀕🀖🀗🀘🀙🀚🀛🀜🀝🀞🀟🀠🀡🀀🀁🀂🀃🀄🀅🀆🀫🀪'
          .runes
          .map(String.fromCharCode)
          .toList();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pos = tilePlacement(tile.x, tile.y, tile.layer, maxLayer, half.round(), offset);
    final shade = tileShadeFor(tile.layer, maxLayer, free);
    final face = faceUp
        ? _faces[tile.symbol.abs() % _faces.length]
        : '?';
    return Positioned(
      left: tile.x * half + tile.layer * offset.toDouble(),
      top: tile.y * half + (maxLayer - tile.layer) * offset.toDouble(),
      width: width,
      height: height,
      child: Semantics(
        label: 'плитка ${faceUp ? face : 'скрыта'}${free ? ', свободна' : ''}',
        value: '${pos.left},${pos.top}',
        child: Material(
          color: Color.lerp(const Color(0xFFFFFDF7), const Color(0xFF262A34), shade),
          elevation: free ? 2 : 0,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(6),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: selected
                      ? scheme.primary
                      : blocking
                          ? scheme.error
                          : const Color(0x22000000),
                  width: selected || blocking ? 2.5 : 1,
                ),
              ),
              child: Center(
                child: Text(
                  face,
                  style: TextStyle(
                    fontSize: width * 0.52,
                    color: free ? const Color(0xFF1F2937) : const Color(0xFF6B7280),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
