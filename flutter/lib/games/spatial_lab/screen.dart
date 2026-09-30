import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'deal.dart';
import 'net.dart';
import 'netslide.dart';
import 'sixteen.dart';
import 'twiddle.dart';

/// «ЛАБОРАТОРИЯ ПРОСТРАНСТВА» — ЧЕТЫРЕ УПРАЖНЕНИЯ НА ОДНОМ ЭКРАНЕ.
///
/// Поворот чисел, сеть труб, сдвиг чисел, сеть со сдвигом. Поле и ход у них общие (`board.dart`),
/// различаются только правило победы и то, ЧЕМ ходят: плиткой, блоком 2×2 или целой линией.
///
/// 🔴 ЛЕСТНИЦА ОДНОСТОРОННЯЯ. Головоломка без проигрыша: понижать не за что, и `fail()` здесь не
/// зовётся НИКОГДА. Ровно это правило стоит и в веб-версии — иначе человек терял бы ступень за
/// то, что вышел с экрана.
///
/// ⚠️ У КАЖДОГО УПРАЖНЕНИЯ СВОЯ ЛЕСТНИЦА, и ключи те же, что у веба
/// (`psygames_spatial_lab_<упражнение>_level_<профиль>`): иначе прогресс разъедется молча.
enum LabPhase { config, playing }

class SpatialLabScreen extends StatefulWidget {
  const SpatialLabScreen({super.key, required this.state, this.seed, this.banks});

  final SharedState state;

  /// Семя раздачи. Проба задаёт своё и получает то же поле, что построит ядро.
  final int? seed;

  /// Банки точных позиций 3×3; в приложении грузятся из ассетов.
  final LabBanks? banks;

  @override
  State<SpatialLabScreen> createState() => _SpatialLabScreenState();
}

class _SpatialLabScreenState extends State<SpatialLabScreen> {
  final Map<LabMode, LevelLadder> _ladders = {};
  LabBanks _banks = LabBanks.empty;
  bool _ready = false;

  LabMode _mode = LabMode.twiddle;
  LabPhase _phase = LabPhase.config;
  int _chosenLevel = 1;
  Deal? _deal;
  int _selection = 0;
  bool _won = false;

  final math.Random _random = math.Random();

  @override
  void initState() {
    super.initState();
    for (final m in LabMode.values) {
      _ladders[m] = LevelLadder(
        gameId: 'spatial_lab_${m.name}',
        store: SharedLevelStore(widget.state),
        maxLevel: 50,
      );
    }
    _boot();
  }

  Future<void> _boot() async {
    for (final l in _ladders.values) {
      await l.load();
    }
    final banks =
        widget.banks ??
        LabBanks(
          twiddle: BankEntry.parse(
            jsonDecode(await rootBundle.loadString('assets/spatial/twiddle-bank.json')) as List,
          ),
          sixteen: BankEntry.parse(
            jsonDecode(await rootBundle.loadString('assets/spatial/sixteen-bank.json')) as List,
          ),
        );
    if (!mounted) return;
    setState(() {
      _banks = banks;
      _chosenLevel = _ladder.level;
      _ready = true;
    });
  }

  LevelLadder get _ladder => _ladders[_mode]!;

  /// Новая раздача. `level == 0` — свободная игра: лестницу она не двигает.
  void _request(int level) {
    final seed = widget.seed ?? _random.nextInt(0xffffffff);
    final deal = createDeal(_mode, seed, level: level, banks: _banks);
    setState(() {
      _deal = deal;
      _selection = deal.selection;
      _phase = LabPhase.playing;
      _won = false;
    });
  }

  void _move(Command command) {
    final deal = _deal;
    if (deal == null || _won) return;
    if (deal.task?.locked.contains(_selection) ?? false) return;
    setState(() {
      deal.state.commit(command);
      _won = labWon(_mode, deal.state.present);
    });
    // Победа поднимает ступень — но только в партии по уровню, не в свободной игре.
    if (_won && (deal.task?.level ?? 0) > 0) {
      _ladder.win().then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  void _turn(int amount) {
    final n = _deal!.state.present.width;
    _move(
      _mode == LabMode.net
          ? Command.tile(_selection, amount: amount)
          : Command.block(row: _selection ~/ n, col: _selection % n, amount: amount),
    );
  }

  void _shift(CommandKind kind, int amount) {
    final n = _deal!.state.present.width;
    final index = kind == CommandKind.row ? _selection ~/ n : _selection % n;
    _move(Command.line(kind, index, amount: amount));
  }

  /// Тычок по клетке: у сети и сдвигов выбирается сама клетка, у поворота чисел — блок 2×2,
  /// поэтому выбор прижимается к полю: блок не может начаться в последней строке или столбце.
  void _pick(int index) {
    final n = _deal!.state.present.width;
    var next = index;
    if (_mode == LabMode.twiddle) {
      final r = math.min(index ~/ n, n - 2), c = math.min(index % n, n - 2);
      next = r * n + c;
    }
    if (_deal!.task?.locked.contains(next) ?? false) return;
    setState(() => _selection = next);
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => 'Лаборатория: ${labModeWord(_mode)}';

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachRotationAnchor')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final deal = _deal;
    final playing = _phase == LabPhase.playing && deal != null;
    final level = deal?.task?.level ?? 0;

    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      onRules: () => _showRules(context),
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        if (playing)
          HudItem(
            label: 'Ходов',
            value: '${deal.state.past.length}',
            icon: Icons.swap_horiz,
          ),
        if (playing && level == 0)
          const HudItem(label: 'Режим', value: 'свободно', icon: Icons.all_inclusive),
      ],
      field: (context, h) => playing
          ? _PlayField(
              mode: _mode,
              deal: deal,
              selection: _selection,
              won: _won,
              height: h,
              onPick: _pick,
            )
          : _config(context),
      auxRow: playing
          ? AuxBar(
              children: [
                AuxAction(
                  icon: Icons.undo,
                  label: 'Отменить',
                  onPressed: deal.state.past.isEmpty
                      ? null
                      : () => setState(() {
                          deal.state.undo();
                          _won = labWon(_mode, deal.state.present);
                        }),
                ),
                AuxAction(
                  icon: Icons.redo,
                  label: 'Повторить',
                  onPressed: deal.state.future.isEmpty
                      ? null
                      : () => setState(() {
                          deal.state.redo();
                          _won = labWon(_mode, deal.state.present);
                        }),
                ),
                AuxAction(
                  icon: Icons.shuffle,
                  label: 'Новая раздача',
                  onPressed: () => _request(level),
                ),
                AuxAction(
                  icon: Icons.tune,
                  label: 'Настройка',
                  onPressed: () => setState(() => _phase = LabPhase.config),
                ),
              ],
            )
          : null,
      toolbar: playing ? _controls(context, deal) : _configToolbar(context),
      pauseActions: [
        PauseAction(
          label: 'Настройка',
          icon: Icons.tune,
          onPressed: () => setState(() => _phase = LabPhase.config),
        ),
      ],
    );
  }

  void _showRules(BuildContext context) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(labModeWord(_mode)),
      content: Text(switch (_mode) {
        LabMode.twiddle =>
          'Выбери блок 2×2 и поворачивай его, пока числа не встанут по порядку. Сами числа при '
              'повороте остаются вертикальными.',
        LabMode.net =>
          'Поворачивай трубы, пока вода от источника не дойдёт до каждой из них и нигде не '
              'останется открытого конца.',
        LabMode.sixteen =>
          'Строка или столбец сдвигаются по кругу на одну клетку. Расставь числа по порядку.',
        LabMode.netslide =>
          'Трубы не поворачиваются, а ездят целыми строками и столбцами. Источник едет вместе со '
              'своей строкой.',
      }),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Понятно')),
      ],
    ),
  );

  // ─── настройка ──────────────────────────────────────────────────────────

  Widget _config(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      children: [
        Text('Упражнение', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in LabMode.values)
              ChoiceChip(
                key: Key('упражнение-${m.name}'),
                label: Text(labModeWord(m)),
                selected: _mode == m,
                onSelected: (_) => setState(() {
                  _mode = m;
                  _chosenLevel = _ladders[m]!.level;
                  _deal = null;
                }),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text('Ступень', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Row(
          children: [
            IconButton.outlined(
              key: const Key('проще'),
              onPressed: _chosenLevel > 1 ? () => setState(() => _chosenLevel -= 1) : null,
              icon: const Icon(Icons.remove),
              tooltip: 'Проще',
            ),
            const SizedBox(width: 12),
            Text('$_chosenLevel', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(width: 12),
            IconButton.outlined(
              key: const Key('сложнее'),
              // Выше достигнутого не прыгаем: ступени идут по порядку, как в веб-версии.
              onPressed: _chosenLevel < _ladder.best
                  ? () => setState(() => _chosenLevel += 1)
                  : null,
              icon: const Icon(Icons.add),
              tooltip: 'Сложнее',
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          _levelNote(),
          key: const Key('про-ступень'),
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
        ),
      ],
    );
  }

  String _levelNote() => switch (_mode) {
    LabMode.twiddle => () {
      final s = twiddleLevels[_chosenLevel - 1];
      return s.distance != null
          ? 'Поле ${s.width}×${s.width}, точный минимум — ${s.distance} поворотов'
          : 'Поле ${s.width}×${s.width}, смещение ${s.displacement}, оценка снизу '
                '${(s.displacement! / 4).ceil()} поворотов';
    }(),
    LabMode.net => () {
      final s = netLevels[_chosenLevel - 1];
      return 'Поле ${s.width}×${s.width}'
          '${s.affected > 0 ? ', участок из ${s.affected} труб' : ''}'
          '${s.cycles > 0 ? ', циклов ${s.cycles}' : ''}'
          '${s.liveColour ? ', с подсветкой связности' : ', без подсветки связности'}';
    }(),
    LabMode.sixteen => () {
      final s = sixteenLevels[_chosenLevel - 1];
      return s.distance != null
          ? 'Поле ${s.width}×${s.width}, точный минимум — ${s.distance} сдвигов'
          : 'Поле ${s.width}×${s.width}, суммарный сдвиг ${s.displacement}';
    }(),
    LabMode.netslide => () {
      final s = netslideLevels[_chosenLevel - 1];
      return 'Поле ${s.width}×${s.width}, перемешано ${s.shifts} сдвигами';
    }(),
  };

  Widget _configToolbar(BuildContext context) => Padding(
    padding: const EdgeInsets.all(12),
    child: Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            key: const Key('начать-ступень'),
            onPressed: () => _request(_chosenLevel),
            icon: const Icon(Icons.play_arrow),
            label: Text('Ступень $_chosenLevel'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            key: const Key('свободная-игра'),
            onPressed: () => _request(0),
            icon: const Icon(Icons.all_inclusive),
            label: const Text('Свободная игра'),
          ),
        ),
      ],
    ),
  );

  // ─── органы управления ──────────────────────────────────────────────────

  Widget _controls(BuildContext context, Deal deal) {
    final level = deal.task?.level ?? 0;
    if (_won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('дальше'),
          onPressed: () => _request(level == 0 ? 0 : math.min(50, level + 1)),
          icon: const Icon(Icons.arrow_forward),
          label: Text(level == 0 ? 'Ещё раздачу' : 'Следующая ступень'),
        ),
      );
    }
    final locked = deal.task?.locked.contains(_selection) ?? false;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
      child: isShift(_mode)
          ? Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final a in const [
                  (CommandKind.row, -1, '←', 'Строку влево', 'строка-влево'),
                  (CommandKind.row, 1, '→', 'Строку вправо', 'строка-вправо'),
                  (CommandKind.column, -1, '↑', 'Столбец вверх', 'столбец-вверх'),
                  (CommandKind.column, 1, '↓', 'Столбец вниз', 'столбец-вниз'),
                ]) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: FilledButton(
                      key: Key(a.$5),
                      onPressed: () => _shift(a.$1, a.$2),
                      child: Semantics(label: a.$4, child: Text(a.$3, style: const TextStyle(fontSize: 20))),
                    ),
                  ),
                ],
              ],
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton(
                  key: const Key('влево'),
                  onPressed: locked ? null : () => _turn(-1),
                  child: const Text('↶ влево'),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  key: const Key('вправо'),
                  onPressed: locked ? null : () => _turn(1),
                  child: const Text('вправо ↷'),
                ),
              ],
            ),
    );
  }
}

/// Поле партии: доска и строка состояния. Доска считается от МЕНЬШЕЙ стороны поля.
class _PlayField extends StatelessWidget {
  const _PlayField({
    required this.mode,
    required this.deal,
    required this.selection,
    required this.won,
    required this.height,
    required this.onPick,
  });

  final LabMode mode;
  final Deal deal;
  final int selection;
  final bool won;
  final double height;
  final void Function(int) onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final b = deal.state.present;
    final n = b.width;
    final info = isNetwork(mode)
        ? network(b, mode == LabMode.netslide ? b.cells.indexWhere((c) => c.id == 0) : 0)
        : null;

    return LayoutBuilder(
      builder: (context, c) {
        final side = math.min(c.maxWidth - 24, height - 56).clamp(120.0, 520.0).toDouble();
        final cell = (side - (n - 1) * 4) / n;
        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              won
                  ? 'Собрано!'
                  : info != null
                  ? 'Открытых концов: ${info.leaks}'
                  : 'Блок: строка ${selection ~/ n + 1}, столбец ${selection % n + 1}',
              key: const Key('состояние'),
              style: TextStyle(
                color: won ? scheme.primary : scheme.onSurfaceVariant,
                fontWeight: won ? FontWeight.w700 : FontWeight.normal,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: side,
              height: side,
              child: Column(
                children: [
                  for (var r = 0; r < n; r++) ...[
                    if (r > 0) const SizedBox(height: 4),
                    Row(
                      children: [
                        for (var col = 0; col < n; col++) ...[
                          if (col > 0) const SizedBox(width: 4),
                          _CellView(
                            index: r * n + col,
                            cell: b.cells[r * n + col],
                            mode: mode,
                            size: cell,
                            selected: _isSelected(r, col, n),
                            locked: deal.task?.locked.contains(r * n + col) ?? false,
                            highlighted: deal.task?.highlighted.contains(r * n + col) ?? false,
                            connected: info?.connected.contains(r * n + col) ?? false,
                            onTap: onPick,
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  /// У поворота чисел выбран БЛОК 2×2, у остальных — одна клетка.
  bool _isSelected(int r, int c, int n) {
    if (mode != LabMode.twiddle) return selection == r * n + c;
    final sr = selection ~/ n, sc = selection % n;
    return r >= sr && r < sr + 2 && c >= sc && c < sc + 2;
  }
}

class _CellView extends StatelessWidget {
  const _CellView({
    required this.index,
    required this.cell,
    required this.mode,
    required this.size,
    required this.selected,
    required this.locked,
    required this.highlighted,
    required this.connected,
    required this.onTap,
  });

  final int index;
  final Cell cell;
  final LabMode mode;
  final double size;
  final bool selected;
  final bool locked;
  final bool highlighted;
  final bool connected;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pipes = isNetwork(mode);
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        key: Key('клетка$index'),
        color: locked
            ? scheme.surfaceContainerHigh
            : highlighted
            ? scheme.tertiaryContainer
            : selected
            ? scheme.secondaryContainer
            : scheme.surfaceContainerHighest,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(
            color: selected ? scheme.primary : scheme.outlineVariant,
            width: selected ? 2.5 : 1,
          ),
        ),
        child: InkWell(
          onTap: locked ? null : () => onTap(index),
          borderRadius: BorderRadius.circular(8),
          child: pipes
              ? CustomPaint(
                  painter: PipePainter(
                    maskAt(cell),
                    source: cell.id == 0,
                    connected: connected,
                    colour: connected ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                )
              : Center(
                  child: Text(
                    '${cell.id + 1}',
                    style: TextStyle(
                      fontSize: math.max(12, size * 0.4),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}

/// Труба: отрезки от центра клетки в стороны, куда открыт её конец.
class PipePainter extends CustomPainter {
  const PipePainter(
    this.mask, {
    required this.source,
    required this.connected,
    required this.colour,
  });

  final int mask;

  /// Источник — плитка с номером 0; его видно кружком.
  final bool source;
  final bool connected;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..color = colour
      ..strokeWidth = size.shortestSide * 0.16
      ..strokeCap = StrokeCap.round;
    // Биты: 1 — север, 2 — восток, 4 — юг, 8 — запад.
    if (mask & 1 != 0) canvas.drawLine(centre, Offset(centre.dx, 0), paint);
    if (mask & 2 != 0) canvas.drawLine(centre, Offset(size.width, centre.dy), paint);
    if (mask & 4 != 0) canvas.drawLine(centre, Offset(centre.dx, size.height), paint);
    if (mask & 8 != 0) canvas.drawLine(centre, Offset(0, centre.dy), paint);
    canvas.drawCircle(
      centre,
      size.shortestSide * (source ? 0.2 : 0.1),
      Paint()..color = colour,
    );
  }

  @override
  bool shouldRepaint(PipePainter old) =>
      old.mask != mask || old.connected != connected || old.colour != colour;
}
