import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/game_rules.dart';
import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_state.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../sudoku/lesson.dart';
import '../fractal/rules.dart' show conflictsInChild;
import 'portals.dart';
import 'tree.dart';

/// «БЕЗДНА» — фрактальная судоку с деревом до трёх слоёв, на общем каркасе.
///
/// 🔴 ЭТО МАРАФОН, А НЕ ПАРТИЯ НА ДЕСЯТЬ МИНУТ. Поэтому главное здесь не доска, а две
/// вещи: ПРОДОЛЖЕНИЕ (партия живёт неделями и обязана пережить выход) и ПОДЪЁМ НАВЕРХ
/// (провалился вниз — вернись). Обе сделаны явно.
///
/// Снимок партии пишется в ТОТ ЖЕ ключ и в том же виде, что у веб-версии
/// (`psygames_resume_sudoku_fractal_deep_<профиль>`, конверт `{v, savedAt, state}`),
/// поэтому начатое в вебе продолжается здесь и наоборот.
///
/// ⚠️ ЧЕГО НЕТ: приправы листьев (термометры и суммы) — в вебе это переключатель,
/// выключенный по умолчанию; и карандашных пометок. Снимок их поля сохраняет как есть,
/// чтобы не затереть то, что записала веб-версия.
class DeepScreen extends StatefulWidget {
  const DeepScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<DeepScreen> createState() => _DeepScreenState();
}

/// Пресеты веб-версии: глубина, сколько клеток кормится снизу, доля для порога.
/// `title` — ключ словаря: имена пресетов те же, что у веба (`deepPreset_*`).
const _presets = <String, ({int depth, int? feedCount, double unlockShare, String title})>{
  'scout': (depth: 2, feedCount: 9, unlockShare: 0.24, title: 'deepPreset_scout'),
  'trek': (depth: 3, feedCount: 12, unlockShare: 0.24, title: 'deepPreset_trek'),
  'abyss': (depth: 3, feedCount: null, unlockShare: 0.24, title: 'deepPreset_abyss'),
};

/// Имена объёма и ступени — ключи веб-словаря (`LanguageContext.tsx`: deepPreset_*, имена
/// ступеней DEEP_BANDS из `fractal-deep.ts`). Списком — чтобы `tools/embed-l10n.mjs` их собрал.
const deepPresetKeys = <String>[
  'deepPreset_scout', 'deepPreset_trek', 'deepPreset_abyss',
  'deepPresetDesc_scout', 'deepPresetDesc_trek', 'deepPresetDesc_abyss',
];
/// Справка «?» — ключ веба (`frontend/src/constants/helpMap.ts`, `/games/sudoku-fractal-deep`
/// → introKey). Списком — чтобы `tools/embed-l10n.mjs` его собрал.
const deepRuleKeys = <String>['sudokuFractalDeepIntroDesc'];
const deepBandKeys = <String>[
  'sudokuTierBeginner', 'sudokuTierEasy', 'sudokuTierMedium',
  'sudokuTierHard', 'sudokuTierExpert', 'sudokuTierExtreme',
];

class _DeepScreenState extends State<DeepScreen> {
  static const resumeVersion = 1;
  static const gameId = 'sudoku_fractal_deep';

  DeepBank? _bank;
  final Map<String, DeepNode> _cache = {};
  /// План порталов по пути родителя предпоследнего слоя — считается один раз на партию.
  final Map<String, List<DeepPortal>> _portals = {};

  /// Ошибки партии — только доказуемые, как у веба: цифра уже стоит в строке/столбце/блоке
  /// или расходится с рукой в клетке-партнёре портала. Пишутся в снимок и в отчёт.
  int _errors = 0;
  late final AppHaptics _haptics = AppHaptics(widget.state);

  String _preset = 'scout';
  int _band = 0;
  String _seed = '';
  String _path = '';
  final DeepPlayed _grids = {};
  final List<({String path, int r, int c, int prev})> _past = [];
  final List<({String path, int r, int c, int prev})> _future = [];
  Map<String, Object?> _otherFields = {};   // поля снимка, которых мы не трогаем

  ({int r, int c})? _selected;
  bool _won = false;

  /// Когда началась партия в ЭТОМ заходе. ⚠️ Продолжение партии из снимка считает
  /// время с открытия экрана: снимок веба длительности не хранит, и выдумывать её
  /// нельзя — отчёт честно покажет время последнего захода.
  /// Начало партии по ИГРОВЫМ часам (мс) — гейт game_clock_discipline_test (#74).
  int _startedAt = gameNow();

  /// Отчёт уходит ОДИН раз на победу: сборка корня — событие, а не состояние.
  bool _reported = false;
  String? _failure;

  DeepCfg get _cfg {
    final p = _presets[_preset]!;
    return DeepCfg(
      depth: p.depth,
      rating: deepBands[_band.clamp(0, deepBands.length - 1)],
      feedCount: p.feedCount,
      unlockShare: p.unlockShare,
    );
  }

  String get _resumeKey =>
      '${SharedState.prefix}resume_${gameId}_${widget.state.activeProfile}';

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final bank = await DeepBank.load();
    if (!mounted) return;
    setState(() => _bank = bank);
    if (!_restore()) _firstEntry();
  }

  /// 🔴 ПЕРВЫЙ ВХОД — СНАЧАЛА «КАК ИГРАТЬ», ПОТОМ ДОСКА (сверка 138f7818, строка 393).
  ///
  /// Веб без снимка открывает экран настройки: описание, карточка `deepHowTo`, объём и
  /// ступень, «Начать». Натив раздавал «Разведку» первой ступени молча — правило
  /// «проваливайся в пунктирные клетки» с доски не угадывается, а «Поход» и «Бездна»
  /// оставались за кнопкой «Новая партия». Теперь то же окно, что у «Новой партии»:
  /// «Начать» — партия по выбору; «Отмена» — уйти, как «назад» с экрана настройки веба.
  Future<void> _firstEntry() async {
    final ok = await _chooseAndStart();
    if (ok || !mounted) return;
    final left = await Navigator.of(context).maybePop();
    // Уйти некуда (экран открыт корнем) — пустое поле хуже партии по умолчанию.
    if (!left && mounted && _seed.isEmpty) _newGame();
  }

  /// Поднять незаконченную партию — ту же, что писала веб-версия.
  bool _restore() {
    try {
      final raw = widget.state.get(_resumeKey);
      if (raw == null) return false;
      final env = jsonDecode(raw) as Map<String, Object?>;
      if ((env['v'] as num?)?.toInt() != resumeVersion) return false;
      final s = (env['state'] as Map).cast<String, Object?>();
      final preset = s['preset'] as String?;
      if (preset == null || !_presets.containsKey(preset)) return false;
      // 🔴 Приправа листьев (термометры и суммы) у натива не перенесена: дерево такой
      // партии здесь собралось бы другим, и рука встала бы не на те клетки (сверка,
      // строка 33). Честнее начать заново, чем продолжить чужую доску.
      if (s['spice'] == true) return false;

      setState(() {
        _preset = preset;
        _band = (s['band'] as num?)?.toInt() ?? 0;
        _seed = s['seed'] as String? ?? '';
        _path = s['path'] as String? ?? '';
        _grids.clear();
        final grids = (s['grids'] as Map?)?.cast<String, Object?>() ?? {};
        for (final e in grids.entries) {
          _grids[e.key] = [
            for (final row in (e.value as List)) [for (final v in row as List) (v as num).toInt()],
          ];
        }
        _past.clear();
        _future.clear();
        final hist = (s['history'] as Map?)?.cast<String, Object?>();
        for (final m in (hist?['past'] as List? ?? [])) {
          final mm = (m as Map).cast<String, Object?>();
          _past.add((
            path: mm['path'] as String,
            r: (mm['r'] as num).toInt(),
            c: (mm['c'] as num).toInt(),
            prev: (mm['prev'] as num).toInt(),
          ));
        }
        _errors = (s['errors'] as num?)?.toInt() ?? 0;
        // Поля, которых мы не умеем (пометки, время), переносим как есть.
        _otherFields = {
          for (final e in s.entries)
            if (!const {'preset', 'band', 'seed', 'path', 'grids', 'history', 'errors'}.contains(e.key))
              e.key: e.value,
        };
        _cache.clear();
        _portals.clear();
        _won = false;
        _reported = false;
        _startedAt = gameNow();
      });
      return _seed.isNotEmpty;
    } catch (_) {
      return false;   // снимок битый — начинаем заново, а не падаем
    }
  }

  void _save() {
    final state = <String, Object?>{
      ..._otherFields,
      'preset': _preset,
      'band': _band,
      'rating': _cfg.rating,
      'seed': _seed,
      'path': _path,
      'grids': _grids,
      'errors': _errors,
      // ⚠️ Лента ходов пишется в том же виде, что у веб-версии (`MoveStackData`),
      // иначе после возврата в веб отмена потеряла бы историю.
      'history': {
        'past': [for (final m in _past) {'path': m.path, 'r': m.r, 'c': m.c, 'prev': m.prev}],
        'future': [for (final m in _future) {'path': m.path, 'r': m.r, 'c': m.c, 'prev': m.prev}],
      },
    };
    widget.state.set(_resumeKey, jsonEncode({
      'v': resumeVersion,
      'savedAt': DateTime.now().millisecondsSinceEpoch, // wall-clock: отметка сохранения
      'state': state,
    }));
  }

  /// 🔴 ВЫБОР ОБЪЁМА И СТУПЕНИ — как экран настройки веба (сверка 138f7818: в нативе `_preset`
  /// всегда был 'scout', `_band` — 0, «Экспедиция» и «Бездна» были недостижимы). Окно же —
  /// и подтверждение: партия здесь идёт неделями, а «Новая партия» одним касанием затирала
  /// снимок. «Отмена» оставляет текущую партию как есть.
  ///
  /// Возвращает, началась ли новая партия: на первом входе «Отмена» решает вызывающий.
  Future<bool> _chooseAndStart() async {
    var preset = _preset;
    var band = _band;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          key: const Key('deep-new'),
          title: Text(L.t('deepTitle')),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              // Карточка «как играть» — та же, что на экране настройки веба.
              Text(L.t('deepHowTo'), key: const Key('deep-howto'), style: const TextStyle(fontSize: 15, height: 1.35)),
              const Divider(),
              RadioGroup<String>(
                groupValue: preset,
                onChanged: (v) => setLocal(() => preset = v ?? preset),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  for (final k in _presets.keys)
                    RadioListTile<String>(
                      key: Key('deep-preset-$k'),
                      value: k,
                      title: Text(L.t('deepPreset_$k')),
                      subtitle: Text(L.t('deepPresetDesc_$k')),
                    ),
                ]),
              ),
              const Divider(),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (var i = 0; i < deepBands.length; i++)
                  ChoiceChip(
                    key: Key('deep-band-$i'),
                    label: Text(L.t(deepBandKeys[i])),
                    selected: band == i,
                    onSelected: (_) => setLocal(() => band = i),
                  ),
              ]),
            ]),
          ),
          actions: [
            TextButton(key: const Key('deep-cancel'), onPressed: () => Navigator.pop(ctx, false), child: Text(L.t('btn_cancel'))),
            FilledButton(key: const Key('deep-start'), onPressed: () => Navigator.pop(ctx, true), child: Text(L.t('start'))),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return false;
    setState(() {
      _preset = preset;
      _band = band;
    });
    _newGame();
    return true;
  }

  void _newGame() {
    final rnd = Random();
    setState(() {
      _seed = 'бездна-${DateTime.now().millisecondsSinceEpoch}-${rnd.nextInt(9999)}'; // wall-clock: зерно раздачи
      _path = '';
      _grids.clear();
      _past.clear();
      _future.clear();
      _cache.clear();
      _portals.clear();
      _errors = 0;
      // Новая партия не наследует пометки и время старой (сверка, строка 7).
      _otherFields = {};
      _selected = null;
      _won = false;
      _reported = false;
      _startedAt = gameNow();
      _failure = null;
    });
    _save();
  }

  /// Узел — через кэш и цепочку кормящих цифр. Листу применяется его сторона портала, как
  /// `nodeAt` веба: подсказка снята, дырок на одну больше, порог пересчитан — вся остальная
  /// арифметика дерева видит уже снятую доску.
  DeepNode _nodeAt(String path) {
    final hit = _cache[path];
    if (hit != null) return hit;
    final par = parentOf(path);
    final parentNode = par == null ? null : _nodeAt(par.parent);
    final digit = par == null ? 0 : parentNode!.solution[par.cell[0]][par.cell[1]];
    var node = materializeNode(_bank!, _seed, path, _cfg, digit);
    if (par != null && depthOf(path) == _cfg.depth - 1) {
      final plan = _portals.putIfAbsent(
        par.parent,
        () => deepPortalsFor(_bank!, _seed, par.parent, _cfg, parentNode!.solution),
      );
      final side = portalOfLeaf(plan, path);
      if (side != null) node = withPortalSide(node, side, _cfg);
    }
    return _cache[path] = node;
  }

  List<List<int>> _gridFor(String path) =>
      _grids.putIfAbsent(path, () => [for (var r = 0; r < deepN; r++) List<int>.filled(deepN, 0)]);

  bool _isFeed(DeepNode node, int r, int c) => node.feedCells.any((f) => f[0] == r && f[1] == c);

  void _tap(int r, int c) {
    if (_won) return;
    final node = _nodeAt(_path);
    // Тычок в кормимую клетку — это ВХОД ВНИЗ, а не выбор: там живёт целая судоку.
    if (_isFeed(node, r, c)) {
      setState(() {
        _path = childPath(_path, r, c);
        _selected = null;
      });
      _save();
      return;
    }
    if (node.puzzle[r][c] != 0) return;   // подсказку задания не трогают
    setState(() => _selected = (r: r, c: c));
  }

  /// Подъём на слой выше — та самая дверь, без которой марафон превращается в ловушку.
  void _up() {
    final p = parentOf(_path);
    if (p == null) return;
    setState(() {
      _path = p.parent;
      _selected = null;
    });
    _save();
  }

  void _place(int v) {
    final sel = _selected;
    if (sel == null || _won) return;
    final node = _nodeAt(_path);
    if (node.puzzle[sel.r][sel.c] != 0 || _isFeed(node, sel.r, sel.c)) return;
    final grid = _gridFor(_path);
    final prev = grid[sel.r][sel.c];
    if (prev == v) return;
    if (v != 0 && _provablyWrong(node, sel.r, sel.c, v)) {
      _errors++;
      unawaited(_haptics.medium());   // веб — звук ошибки (sndWrong)
    }
    setState(() {
      grid[sel.r][sel.c] = v;
      _past.add((path: _path, r: sel.r, c: sel.c, prev: prev));
      _future.clear();
      _won = deepRootComplete(_nodeAt, _grids);
    });
    _save();
    if (_won) _reportWin();
  }

  void _erase() => _place(0);

  /// Ошибка — только доказуемая (`placeDigit` веба): цифра уже видна в строке, столбце или
  /// блоке, либо клетка — портал, а в клетке-партнёре соседнего листа рука стоит другая.
  /// Строка под доской — как у веба: на клетке-портале — где её партнёр; иначе — что делать
  /// на этом слое (кормимые клетки — проваливайся; дно — решай до порога).
  String _hintFor(DeepNode node) {
    final sel = _selected, pt = node.portal;
    if (sel != null && pt != null && pt.cell[0] == sel.r && pt.cell[1] == sel.c) {
      return L.f('deepPortalHint', {'cell': '(${pt.partnerCell[0] + 1}·${pt.partnerCell[1] + 1})'});
    }
    return node.feedCells.isNotEmpty ? L.t('deepDiveHint') : L.t('deepLeafHint');
  }

  bool _provablyWrong(DeepNode node, int r, int c, int v) {
    final visible = [
      for (var rr = 0; rr < deepN; rr++)
        [for (var cc = 0; cc < deepN; cc++) deepValueAt(_nodeAt, _grids, _path, rr, cc)],
    ];
    final pt = node.portal;
    final partner = pt == null ? 0 : (_grids[pt.partnerPath]?[pt.partnerCell[0]][pt.partnerCell[1]] ?? 0);
    final portalClash = pt != null && pt.cell[0] == r && pt.cell[1] == c && partner != 0 && partner != v;
    return conflictsInChild(visible, r, c, v) || portalClash;
  }

  /// 🔴 ОТЧЁТ ПАРТИИ «БЕЗДНЫ» — задача 24cecc5c. Первая редакция экрана при сборке
  /// корня только ставила `_won`: партия не уходила в psygames_sessions, в статистике
  /// её не было, шаг зарядки на ней не засчитывался.
  ///
  /// Форма — ТА ЖЕ, что пишет веб (app/games/sudoku-fractal-deep.tsx, `finish(true)`):
  /// game_type `sudoku_fractal_deep`, режим `deep`, трудность — пресет, очки
  /// `решённые узлы × 120 − ошибки × 20 + 2000`. Ошибок нативный экран не считает
  /// (ход сверяется не с разгадкой, а с правилами сетки) — отдаём 0, а не выдуманное.
  void _reportWin() {
    if (_reported) return;
    _reported = true;
    final solved = _grids.keys.where((p) => p != '' && deepNodeDone(_nodeAt, _grids, p)).length;
    unawaited(SessionReport.send(
      gameType: gameId,
      score: max(0, solved * 120 - _errors * 20) + 2000,   // формула веба
      timeSeconds: (gameNow() - _startedAt) ~/ 1000,
      difficulty: _preset,
      mode: 'deep',
      errors: _errors,
      details: {
        'preset': _preset,
        'depth': _cfg.depth,
        'solved_nodes': solved,
        'touched': _grids.length,
      },
    ));
  }

  void _undo() {
    if (_past.isEmpty || _won) return;
    setState(() {
      final m = _past.removeLast();
      _gridFor(m.path)[m.r][m.c] = m.prev;
      _future.add(m);
      _won = deepRootComplete(_nodeAt, _grids);
    });
    _save();
  }

  /// 🔴 РАЗБОР «БЕЗДНЫ» — ПО ТОЙ СЕТКЕ, ГДЕ ЧЕЛОВЕК СЕЙЧАС (`_path`).
  ///
  /// У бездны сеток не девять, а дерево: разбирать не ту, в которую человек
  /// спустился, значит объяснять доску, которой он не видит.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachSudokuNaked' => L.t('teachSudokuNaked'),
      'teachSudokuHiddenRow' => L.t('teachSudokuHiddenRow'),
      'teachSudokuHiddenCol' => L.t('teachSudokuHiddenCol'),
      'teachSudokuHiddenBox' => L.t('teachSudokuHiddenBox'),
      _ => L.t('teachSudokuPlain'),
    };
    for (final e in args.entries) {
      out = out.replaceAll('{${e.key}}', e.value);
    }
    return out;
  }

  /// Заголовок один на экран и на разбор: вторая строка — второй долг подписей.
  String get _title => L.t('deepPreset_abyss');

  List<LessonStep> _lessonSteps() {
    if (_bank == null || _seed.isEmpty) return const [];
    final node = _nodeAt(_path);
    // Доска шага складывается из введённого И ПОДАННОГО СВЕРХУ: у бездны часть
    // цифр приходит из родительской сетки, и разбор обязан считать их занятыми.
    final grid = [
      for (var r = 0; r < deepN; r += 1)
        [for (var c = 0; c < deepN; c += 1) deepValueAt(_nodeAt, _grids, _path, r, c)],
    ];
    return sudokuLessonSteps(
      say: _teach, grid: grid, solution: node.solution, n: deepN, br: 3, bc: 3,
    );
  }

  Future<void> _openLesson() async {
    final steps = _lessonSteps();
    if (steps.isEmpty) return;
    final node = _nodeAt(_path);
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) {
          final m = steps[shown.clamp(0, steps.length - 1)].payload as SudokuMove;
          final cell = side / deepN;
          return Column(
            children: [
              for (var r = 0; r < deepN; r += 1)
                SizedBox(
                  height: cell,
                  child: Row(
                    children: [
                      for (var c = 0; c < deepN; c += 1)
                        _Cell(
                          size: cell,
                          row: r,
                          col: c,
                          value: m.grid[r][c],
                          given: node.puzzle[r][c] != 0,
                          feed: _isFeed(node, r, c),
                          portal: false,   // разбор приёма — доска шага, без порталов
                          selected: m.r == r && m.c == c,
                          onTap: (_, _) {},
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final bank = _bank;
    final ready = bank != null && _seed.isNotEmpty;
    final node = ready ? _nodeAt(_path) : null;
    final progress = ready ? deepNodeProgress(_nodeAt, _grids, _path) : 0;

    return GameShell(
      title: _title,
      onLesson: _lessonSteps().isEmpty ? null : _openLesson,
      // По адресу каркас правила не найдёт: карточки «Бездны» нет ни в одной развилке
      // (вход — дверь из фрактала), а `sudokuFractalDeepDesc` в словаре нет. Даём сами —
      // тот же текст, что «?» веба (`helpMap.ts`: introKey маршрута).
      onRules: () => showGameRules(context, title: L.t('deepTitle'), ruleKey: deepRuleKeys.first),
      hud: [
        HudItem(
          label: L.t('sdkDepth'),
          value: '${depthOf(_path) + 1}/${_cfg.depth}',
          icon: Icons.layers,
        ),
        if (node != null)
          HudItem(label: L.t('sdkNode'), value: '$progress/${node.unlockCells}', icon: Icons.grid_on),
        HudItem(label: L.t('sdkHudStage'), value: '${_band + 1}/${deepBands.length}', icon: Icons.trending_up),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.close),
      ],
      field: (context, height) {
        if (_failure != null) return Center(child: Text(_failure!));
        if (bank == null) return const Center(child: CircularProgressIndicator());
        // Банк загружен, партии нет — открыто окно настройки, ждём человека, а не загрузку.
        if (!ready || node == null) return const SizedBox.shrink();
        final pt = node.portal;
        return LayoutBuilder(
          builder: (context, c) {
            // Под доской — строка-подсказка веба (две строки мелким шрифтом).
            const hintH = 40.0;
            final avail = height - hintH;
            final side = (avail < c.maxWidth ? avail : c.maxWidth) - 8;
            final cell = (side < 0 ? 0.0 : side) / deepN;
            final board = Center(
              child: SizedBox(
                width: side < 0 ? 0 : side,
                height: side < 0 ? 0 : side,
                child: Column(
                  children: [
                    for (var r = 0; r < deepN; r++)
                      SizedBox(
                        height: cell,
                        child: Row(
                          children: [
                            for (var col = 0; col < deepN; col++)
                              _Cell(
                                size: cell,
                                row: r,
                                col: col,
                                value: deepValueAt(_nodeAt, _grids, _path, r, col),
                                given: node.puzzle[r][col] != 0,
                                feed: _isFeed(node, r, col),
                                portal: pt != null && pt.cell[0] == r && pt.cell[1] == col,
                                selected: _selected?.r == r && _selected?.c == col,
                                onTap: _tap,
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            );
            return Column(
              children: [
                board,
                SizedBox(
                  height: hintH,
                  child: Center(
                    child: Text(
                      _hintFor(node),
                      key: const Key('deep-hint'),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
      auxRow: AuxBar(children: [
        // 🔴 Показан только там, где есть куда подниматься: на корне подъём бессмыслен.
        if (_path.isNotEmpty)
          AuxAction(icon: Icons.arrow_upward, label: L.t('sdkUp'), onPressed: _up),
        AuxAction(
          icon: Icons.undo,
          label: L.t('btn_undo'),
          onPressed: _past.isEmpty || _won ? null : _undo,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('sdkNewGame'), onPressed: _chooseAndStart),
      ]),
      toolbar: _Toolbar(won: _won, onDigit: _place, onErase: _erase, onNext: _chooseAndStart),
      pauseActions: [
        PauseAction(label: L.t('sdkNewGame'), icon: Icons.refresh, onPressed: _chooseAndStart),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.size,
    required this.row,
    required this.col,
    required this.value,
    required this.given,
    required this.feed,
    required this.portal,
    required this.selected,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final int value;
  final bool given;
  final bool feed;

  /// Клетка-портал листа: держит ту же цифру, что клетка соседнего листа.
  final bool portal;
  final bool selected;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: selected
            ? scheme.primaryContainer
            : feed
                ? scheme.tertiaryContainer.withValues(alpha: 0.45)
                : scheme.surface,
        child: InkWell(
          key: Key('cell_${row}_$col'),
          onTap: () => onTap(row, col),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: row % 3 == 0 ? scheme.onSurface : scheme.outlineVariant,
                  width: row % 3 == 0 ? 1.6 : 0.4,
                ),
                left: BorderSide(
                  color: col % 3 == 0 ? scheme.onSurface : scheme.outlineVariant,
                  width: col % 3 == 0 ? 1.6 : 0.4,
                ),
                bottom: BorderSide(
                  color: row == deepN - 1 ? scheme.onSurface : scheme.outlineVariant,
                  width: row == deepN - 1 ? 1.6 : 0.4,
                ),
                right: BorderSide(
                  color: col == deepN - 1 ? scheme.onSurface : scheme.outlineVariant,
                  width: col == deepN - 1 ? 1.6 : 0.4,
                ),
              ),
            ),
            child: Stack(
              children: [
                // Кольцо кормимой клетки — как у веба (`fedRing`): пунктир, пока снизу
                // ничего не пришло, бледная сплошная — когда цифра всплыла. На него
                // ссылается карточка «как играть» («под пунктирными клетками…»).
                if (feed)
                  Positioned.fill(
                    child: CustomPaint(
                      key: Key('feed_ring_${row}_$col'),
                      painter: FedRingPainter(color: scheme.tertiary, dashed: value == 0),
                    ),
                  ),
                // Портал — циановое кольцо веба: пунктир, пока клетка пуста; рука встала — гаснет.
                if (portal)
                  Positioned.fill(
                    child: CustomPaint(
                      key: Key('portal_ring_${row}_$col'),
                      painter: FedRingPainter(color: portalColor, dashed: value == 0, width: 1.5),
                    ),
                  ),
                // Кормимая клетка помечена стрелкой: под ней целая судоку, и цифру туда
                // приносят снизу, а не ставят рукой.
                if (feed && value == 0)
                  Center(
                    child: Icon(Icons.arrow_downward, size: size * 0.4, color: scheme.tertiary),
                  ),
                Center(
                  child: Text(
                    value == 0 ? '' : '$value',
                    style: TextStyle(
                      fontSize: size * 0.52,
                      fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                      color: given
                          ? scheme.onSurface
                          : feed
                              ? scheme.tertiary
                              : scheme.primary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Цвет кольца портала — циан веба (`#22d3ee`).
const portalColor = Color(0xFF22D3EE);

/// Кольцо кормимой клетки: отступ 1,5, скругление 3, толщина 1 — размеры веба (`styles.fedRing`).
/// `dashed` — пустая клетка (пунктир); заполненная — сплошное кольцо вполсилы.
class FedRingPainter extends CustomPainter {
  const FedRingPainter({required this.color, required this.dashed, this.width = 1});

  final Color color;
  final bool dashed;
  final double width;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..color = dashed ? color : color.withValues(alpha: 0.45);
    final ring = RRect.fromRectAndRadius(
      Rect.fromLTRB(1.5, 1.5, size.width - 1.5, size.height - 1.5),
      const Radius.circular(3),
    );
    if (!dashed) {
      canvas.drawRRect(ring, paint);
      return;
    }
    const dash = 3.0, gap = 2.5;
    for (final metric in (Path()..addRRect(ring)).computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += dash + gap) {
        canvas.drawPath(metric.extractPath(d, d + dash), paint);
      }
    }
  }

  @override
  bool shouldRepaint(FedRingPainter old) => old.color != color || old.dashed != dashed || old.width != width;
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.won,
    required this.onDigit,
    required this.onErase,
    required this.onNext,
  });

  final bool won;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    if (won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: const Icon(Icons.arrow_forward),
          label: Text(L.t('sdkNewGame')),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        const keyWidth = 48.0, gap = 6.0, keys = 10;
        final fit = ((c.maxWidth - 8 + gap) / (keyWidth + gap)).floor().clamp(1, keys);
        final rows = (keys / fit).ceil();
        final perRow = (keys / rows).ceil();
        final width = perRow * keyWidth + (perRow - 1) * gap;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Center(
            child: SizedBox(
              width: width,
              child: Wrap(
                spacing: gap,
                runSpacing: gap,
                alignment: WrapAlignment.center,
                children: [
                  for (var v = 1; v <= 9; v++)
                    SizedBox(
                      width: keyWidth,
                      height: keyWidth,
                      child: FilledButton(
                        key: Key('digit$v'),
                        onPressed: () => onDigit(v),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text('$v', style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                  SizedBox(
                    width: keyWidth,
                    height: keyWidth,
                    child: OutlinedButton(
                      key: const Key('erase'),
                      onPressed: onErase,
                      style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                      child: const Icon(Icons.backspace_outlined, size: 18),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
