import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/game_preset.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Зрительный поиск» на общем каркасе: найди все цели среди отвлекающих.
///
/// 🔴 РАУНД ЗАКРЫВАЕТСЯ, ТОЛЬКО КОГДА НАЙДЕНЫ ВСЕ ЦЕЛИ. Промежуточная находка
/// подсвечивается и поиск продолжается без остановки; промах — ошибка и короткий
/// красный отклик. Партия из `trials` раундов; уровень берётся при ошибках ≤ 1.
///
/// 🔴 СТОРОНА ПОЛЯ БЕРЁТ МЕНЬШЕЕ ИЗ ШИРИНЫ И ВЫСОТЫ. В вебе она считалась
/// только от ширины — там страница прокручивалась. Каркас отдаёт высоту ЧИСЛОМ,
/// и квадрат, посчитанный по ширине, вылезал бы за низ: ровно эта жалоба
/// («игры ездят») и завела переезд. Раздача мест считается от итоговой стороны,
/// иначе предметы уехали бы за край поля.
class VisualSearchScreen extends StatefulWidget {
  const VisualSearchScreen({
    super.key,
    required this.state,
    this.rnd,
    this.trials = 8,
  });

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  /// Раундов в партии (в вебе выбирается 5/8/12 до старта).
  final int trials;

  @override
  State<VisualSearchScreen> createState() => _VisualSearchScreenState();
}

enum _Phase { playing, wrong, right, result }

class _VisualSearchScreenState extends State<VisualSearchScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  static const _rightDelay = Duration(milliseconds: 500);
  static const _wrongDelay = Duration(milliseconds: 450);

  late LevelLadder _ladder;
  late Rng _rng;
  late VsCfg _cfg;
  late VsTarget _target;

  List<VsItem> _items = const [];
  int _round = 1;

  /// Раундов в этой партии: [VisualSearchScreen.trials] и, с 32-го, лишние (`vsDrawExtraTrials`).
  int _trials = 8;
  int _found = 0;
  int _hits = 0;
  int _errors = 0;
  bool _won = false;

  /// Итог боя с боссом после этой партии; `null` — боя не было (веб: `bossWon`).
  bool? _boss;
  bool _ready = false;
  _Phase _phase = _Phase.playing;
  double _side = 0;
  Timer? _next;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(
      gameId: 'visual_search',
      store: SharedLevelStore(widget.state),
      maxLevel: 999,
    );
    _boot();
  }

  @override
  void dispose() {
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  void _reset() {
    // Новая партия — снова зачётная. Отметку «разбор смотрели» ставит плеер, а
    // снимать её обязана новая раздача (договор shell/lesson.dart): без этого
    // один открытый разбор навсегда выключал бы рост уровня — отметка общая.
    LessonUsed.reset();
    _next?.cancel();
    _round = 1;
    _hits = 0;
    _errors = 0;
    _won = false;
    _phase = _Phase.playing;
    // С 32-го раундов в среднем больше (ось без предела, model.dart). Шаг зарядки — прежняя
    // длина: пресет лестницу не двигает, а бюджет шага рассчитан на неё.
    _trials = widget.trials + (GamePreset.isPreset ? 0 : vsDrawExtraTrials(_ladder.level, _rng));
    _newRound(1);
  }

  void _newRound(int r) {
    _round = r;
    _cfg = vsLevelParams(_ladder.level, r);
    _found = 0;
    _phase = _Phase.playing;
    _target = vsPickTarget(_cfg.conjunction, vsPaletteFor(_ladder.level), _rng);
    _items = const []; // доска раздаётся, когда известна сторона поля
  }

  /// Раздача откладывается до первого измерения поля: раскладка мест считается
  /// от СТОРОНЫ, и раздать раньше — значит разложить предметы не по тому полю.
  /// 🔴 МЕСТА РАЗДАЮТСЯ ПО ВНУТРЕННЕМУ ПРЯМОУГОЛЬНИКУ, УЖЕ НА ПОЛРАЗМЕРА ПРЕДМЕТА
  /// С КАЖДОЙ СТОРОНЫ. Раздача возвращает СЕРЕДИНЫ, а предмет занимает 32 точки:
  /// середина у самого края выносит половину предмета за доску. Замер 23.09.2026:
  /// на 360×640, L12 предмет торчал из поля на 1,24 точки — а обрезать его нельзя,
  /// целью может оказаться именно он, и нажать стало бы не по чему.
  void _deal(double side) {
    _side = side;
    final inner = math.max(vsItemSize, side - vsItemSize);
    _items = vsMakeBoard(
      count: _cfg.count,
      targetShape: _target.shape,
      targetColor: _target.color,
      targetCount: _cfg.targetCount,
      conjunction: _cfg.conjunction,
      w: inner,
      h: inner,
      rnd: _rng,
      palette: vsPaletteFor(_ladder.level),
      decoyCount: _cfg.decoys,
    );
  }

  void _pick(int index) {
    if (_phase != _Phase.playing) return;
    final it = _items[index];
    if (it.found) return;
    if (it.isTarget) {
      setState(() {
        it.found = true;
        _found += 1;
      });
      _found >= _cfg.targetCount ? _haptics.win() : _haptics.hit();
      if (_found >= _cfg.targetCount) {
        setState(() {
          _hits += 1;
          _phase = _Phase.right;
        });
        _next?.cancel();
        _next = Timer(_rightDelay, _advance);
      }
      return;
    }
    // Промах — в том числе по ПРИМАНКЕ: она выглядит как цель, и отличить её
    // можно только точкой. Это и есть ось подавления.
    _haptics.miss();
    setState(() {
      _errors += 1;
      _phase = _Phase.wrong;
    });
    _next?.cancel();
    _next = Timer(_wrongDelay, () {
      if (!mounted) return;
      setState(() => _phase = _Phase.playing);
    });
  }

  Future<void> _advance() async {
    if (!mounted) return;
    if (_round >= _trials) {
      final passed = _errors <= vsErrorsAllowed;
      // Веха как в вебе: каждый третий ЗАСЧИТАННЫЙ уровень — бой «сложи подсвеченные».
      bool? boss;
      if (passed) {
        boss = await BossRound.winThenBoss(context, _ladder,
            type: BossType.counting, color: const Color(0xFF536976));
      } else {
        await _ladder.fail();
      }
      if (!mounted) return;
      setState(() {
        _won = passed;
        _boss = boss;
        _phase = _Phase.result;
      });
      return;
    }
    setState(() => _newRound(_round + 1));
  }

  /// РАЗБОР ПОКАЗЫВАЕТ СТИМУЛ ТЕМ ЖЕ ВИДЖЕТОМ, ЧТО РИСУЕТ ПАРТИЯ.
  ///
  /// Фигуру нельзя «нарисовать похоже»: в игре она под случайным поворотом, и
  /// именно поворот делает поиск трудным. Поэтому образец — `_Glyph`, тот же
  /// класс, что стоит на поле, и цель берётся у того же выбора цели.
  List<DemoTrial> _demoTrials() {
    final formOnly = vsPickTarget(false, vsColors, createRng('lesson-form'));
    final pair = vsPickTarget(true, vsColors, createRng('lesson-pair'));
    return [
      DemoTrial(
        text: '',
        rule: L.t('vsFindAll'),
        art: VsGlyph(shape: formOnly.shape, color: formOnly.color, size: 64),
      ),
      DemoTrial(
        text: '',
        // Со восьмого уровня цель задаётся ПАРОЙ признаков, и отвлекающий делит
        // с ней ровно один — про это и правило второго примера.
        rule: L.t('vsFindConj'),
        art: VsGlyph(shape: pair.shape, color: pair.color, size: 64),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('visualSearch'),
      // Правила уровня объявляются до первого нажатия уровня и на итоге. До 02.10.2026 экран
      // их не объявлял вовсе: «несколько целей» (L4) и «цвет + форма» (L8) включались молча,
      // хотя в таблице правил стояли (задача 7f81fbc6, вместе с «цвета ближе» с L32).
      levelRule: LevelRuleSpot(
        gameId: 'visual_search',
        level: _ladder.level,
        state: widget.state,
        calm: (_round == 1 && _hits == 0 && _errors == 0 && _found == 0) || _phase == _Phase.result,
      ),
      onLesson: () => openDemoLesson(context, title: L.t('visualSearch'), trials: _demoTrials()),
      hud: [
        HudItem(
          label: L.t('level'),
          value: '${_ladder.level}',
          icon: Icons.flag_outlined,
        ),
        HudItem(
          label: L.t('personalBest'),
          value: '${_ladder.best}',
          icon: Icons.emoji_events_outlined,
        ),
        HudItem(
          label: L.t('round'),
          value: '$_round/$_trials',
          icon: Icons.repeat,
        ),
        HudItem(
          label: L.t('label_found'),
          value: '$_found/${_cfg.targetCount}',
          icon: Icons.center_focus_strong,
        ),
        HudItem(
          label: L.t('errors'),
          value: '$_errors/$vsErrorsAllowed',
          icon: Icons.error_outline,
        ),
      ],
      field: (context, h) => LayoutBuilder(
        builder: (context, c) {
          const headH = 64.0;
          final side = math.max(
            120.0,
            math.min(vsBoardSize(c.maxWidth + 32).w, h - headH),
          );
          if (_items.isEmpty || side != _side) _deal(side);
          return Column(
            children: [
              SizedBox(
                height: headH,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _cfg.conjunction ? L.t('vsFindConj') : L.t('vsFindAll'),
                        key: const Key('hint'),
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1F2937),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: VsGlyph(
                          shape: _target.shape,
                          color: _target.color,
                          size: 26,
                          key: const Key('sample'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Center(
                  child: Container(
                    key: const Key('board'),
                    width: side,
                    height: side,
                    decoration: BoxDecoration(
                      color: const Color(0xFF1F2937),
                      border: Border.all(
                        color: _phase == _Phase.wrong
                            ? const Color(0xFFF43F5E)
                            : Theme.of(context).colorScheme.outlineVariant,
                        width: 2,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Stack(
                      children: [
                        for (var i = 0; i < _items.length; i += 1)
                          Positioned(
                            left: _items[i].x - vsItemSize / 2,
                            top: _items[i].y - vsItemSize / 2,
                            child: _ItemView(
                              key: Key('item$i'),
                              item: _items[i],
                              onTap: _phase == _Phase.playing
                                  ? () => _pick(i)
                                  : null,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
      auxRow: AuxBar(
        children: [
          AuxAction(
            icon: Icons.refresh,
            label: L.t('restart'),
            onPressed: () => setState(_reset),
          ),
        ],
      ),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(
          label: L.t('restart'),
          icon: Icons.refresh,
          onPressed: () => setState(_reset),
        ),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.result) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$_hits/$_trials · ${L.t('errors')} $_errors',
              key: const Key('result'),
              textAlign: TextAlign.center,
              style: text.titleMedium,
            ),
            BossOutcomeLine(_boss),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('next'),
              onPressed: () => setState(_reset),
              icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
              label: Text(_won ? L.t('nextLabel') : L.t('retry')),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        L.t('visualSearchDesc'),
        key: const Key('task'),
        textAlign: TextAlign.center,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: text.bodySmall,
      ),
    );
  }
}

class _ItemView extends StatelessWidget {
  const _ItemView({super.key, required this.item, this.onTap});

  final VsItem item;
  final VoidCallback? onTap;

  /// Подпись читает ТОЛЬКО ТО, ЧТО НАРИСОВАНО: форму, цвет, метку приманки и
  /// отметку «найдено». Ни цель, ни ответ в неё не попадают — иначе экранный
  /// диктор (и проба) знали бы больше, чем видит игрок.
  String get _label {
    final shape = switch (item.shape) {
      VsShape.t => 'T',
      VsShape.l => 'L',
      VsShape.i => 'I',
      VsShape.plus => 'plus',
    };
    final marks = [
      shape,
      item.color,
      if (item.decoy) 'dot',
      if (item.found) 'found',
    ];
    return marks.join(' ');
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: _label,
      button: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: vsItemSize,
          height: vsItemSize,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: item.found ? const Color(0x6622C55E) : Colors.transparent,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Transform.rotate(
                angle: item.rot * math.pi / 180,
                child: VsGlyph(shape: item.shape, color: item.color, size: 26),
              ),
              if (item.decoy)
                // Точка в середине — единственное отличие приманки от цели. Своя, а
                // не цветом: цвет с восьмого уровня уже несёт смысл.
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: _color(item.color),
                    shape: BoxShape.circle,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

Color _color(String hex) =>
    Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

/// Фигура рисуется теми же черточками, что в вебе: стебель плюс перекладина на
/// своём месте. T, plus и I держат стебель по центру, L — слева.
/// Фигура зрительного поиска. Геометрия — ДОЛЯМИ размера: на 26 точках (доска игры) это
/// те же 11/5/3 точки, что были; крупнее (разбор, окна раннера «Поиска») — не съезжает.
class VsGlyph extends StatelessWidget {
  const VsGlyph({
    super.key,
    required this.shape,
    required this.color,
    required this.size,
  });

  final VsShape shape;
  final String color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final paint = _color(color.isEmpty ? vsNeutral : color);
    final u = size / 26;
    final sw = 3.0 * u;
    final centerStem =
        shape == VsShape.t || shape == VsShape.plus || shape == VsShape.i;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          Positioned(
            top: 0,
            bottom: 0,
            left: (centerStem ? 11 : 5) * u,
            width: sw,
            child: ColoredBox(color: paint),
          ),
          if (shape == VsShape.t)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: sw,
              child: ColoredBox(color: paint),
            ),
          if (shape == VsShape.plus)
            Positioned(
              top: 11 * u,
              left: 0,
              right: 0,
              height: sw,
              child: ColoredBox(color: paint),
            ),
          if (shape == VsShape.l)
            Positioned(
              bottom: 0,
              left: 5 * u,
              right: 0,
              height: sw,
              child: ColoredBox(color: paint),
            ),
        ],
      ),
    );
  }
}
