import 'dart:math' as math;

import 'package:flutter/gestures.dart' show DeviceGestureSettings, DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'geometry.dart';
import 'session.dart';
import 'strings.dart';
import 'types.dart';

/// Цвета игры — те же, что у веб-версии (`GRADIENT` в `frontend/app/games/navigator.tsx`).
const navigatorGradient = [Color(0xFF2563EB), Color(0xFF14B8A6)];

/// Пол стороны клетки: ниже номера на карте не читаются (замер веба 16.09.2026). На мелких окнах
/// и старших сетках пол честно даёт прокрутку, а не нечитаемую карту.
const navigatorMinCell = 28.0;

/// Подпись поверх заливки — по яркости САМОЙ заливки. Один цвет на оба конца градиента не
/// проходит: белый на бирюзовом конце и чёрный на синем оба ниже нормы контраста.
Color navigatorOn(Color background) =>
    ThemeData.estimateBrightnessForColor(background) == Brightness.dark
    ? Colors.white
    : Colors.black;

const _directionGlyphs = {
  Cardinal.north: '↑',
  Cardinal.east: '→',
  Cardinal.south: '↓',
  Cardinal.west: '←',
};
const _turnGlyphs = {Turn.left: '↰', Turn.straight: '↑', Turn.right: '↱'};
const _homeGlyphs = {
  HomeSector.north: '↑',
  HomeSector.northEast: '↗',
  HomeSector.east: '→',
  HomeSector.southEast: '↘',
  HomeSector.south: '↓',
  HomeSector.southWest: '↙',
  HomeSector.west: '←',
  HomeSector.northWest: '↖',
};

String _landmarkGlyph(String symbol) => switch (symbol) {
  'diamond' => '◆',
  'circle' => '●',
  'triangle' => '▲',
  'star' => '✦',
  _ => '■',
};

/// Клавиши, на которые партия отвечает, — те же, что у веба (`keyMap` в `NavigatorGame.tsx`):
/// стрелки, WASD, пробел на «прямо», цифры 1–9 без 5 на восемь сторон, P — пауза, R — заново.
/// Имя клавиши — как у `KeyboardEvent.key` в вебе: так его понимает ядро (`handleNavigatorKey`).
String? navigatorKeyName(KeyEvent event) {
  final logical = event.logicalKey;
  if (logical == LogicalKeyboardKey.arrowUp) return 'ArrowUp';
  if (logical == LogicalKeyboardKey.arrowDown) return 'ArrowDown';
  if (logical == LogicalKeyboardKey.arrowLeft) return 'ArrowLeft';
  if (logical == LogicalKeyboardKey.arrowRight) return 'ArrowRight';
  final char = event.character?.toLowerCase();
  const accepted = {
    'w',
    'a',
    's',
    'd',
    ' ',
    '1',
    '2',
    '3',
    '4',
    '6',
    '7',
    '8',
    '9',
    'p',
    'r',
  };
  return char != null && accepted.contains(char) ? char : null;
}

/// КАРТА: клетки сетки в экранном повороте, маршрут или текущая позиция, ориентиры.
class NavigatorMap extends StatelessWidget {
  const NavigatorMap({
    super.key,
    required this.session,
    required this.strings,
    required this.side,
    required this.showRoute,
    required this.showCurrent,
  });

  final NavigatorSession session;
  final NavigatorStrings strings;
  final double side;
  final bool showRoute;
  final bool showCurrent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final round = session.round;
    final n = round.gridSize;
    final cell = side / n;
    // Первый индекс, как `findIndex` в вебе.
    final routeIndex = <String, int>{};
    for (var i = 0; i < round.route.length; i++) {
      routeIndex.putIfAbsent(cellKey(round.route[i]), () => i);
    }
    final landmarkIndex = <String, int>{};
    for (var i = 0; i < round.landmarks.length; i++) {
      landmarkIndex.putIfAbsent(cellKey(round.landmarks[i].cell), () => i);
    }
    final branches = {for (final b in round.falseBranches) cellKey(b.to)};
    final current = cellKey(session.currentCell);
    final label =
        '${strings.mode(round.mode)}. ${strings.fill('grid', {'size': n, 'steps': round.routeSteps})}.';

    final cells = <Widget>[];
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        final logical = GridCell(x, y);
        final key = cellKey(logical);
        final visual = rotateCell(logical, n, round.mapRotation);
        final ri = routeIndex[key];
        final li = landmarkIndex[key];
        final onRoute = showRoute && ri != null;
        final isCurrent = showCurrent && key == current;
        final isStart = ri == 0;
        final isFinish = ri == round.routeSteps;
        final background = isCurrent
            ? navigatorGradient[1]
            : onRoute
            ? navigatorGradient[0]
            : branches.contains(key)
            ? scheme.surfaceContainerHighest
            : scheme.surface;
        final ink = navigatorOn(background);
        cells.add(
          Positioned(
            key: Key('nav-cell-$x-$y'),
            left: visual.x * cell,
            top: visual.y * cell,
            width: cell,
            height: cell,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: background,
                border: Border.all(color: scheme.outlineVariant, width: 0.5),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (onRoute)
                    Semantics(
                      label: isStart
                          ? strings.t('startCell')
                          : isFinish
                          ? strings.t('finishCell')
                          : strings.fill('routeCell', {'index': ri}),
                      child: ExcludeSemantics(
                        child: Text(
                          isStart
                              ? 'S'
                              : isFinish
                              ? 'H'
                              : '$ri',
                          style: TextStyle(
                            fontSize: 16,
                            height: 1.25,
                            fontWeight: FontWeight.w900,
                            color: ink,
                          ),
                        ),
                      ),
                    )
                  else if (isCurrent)
                    Semantics(
                      label: strings.t('currentCell'),
                      child: ExcludeSemantics(
                        child: Text(
                          '●',
                          style: TextStyle(
                            fontSize: 20,
                            height: 1.2,
                            fontWeight: FontWeight.w900,
                            color: ink,
                          ),
                        ),
                      ),
                    ),
                  if (li != null)
                    Positioned(
                      right: 3,
                      bottom: 1,
                      child: Semantics(
                        label: strings.fill('landmark', {'index': li + 1}),
                        child: ExcludeSemantics(
                          child: Text(
                            _landmarkGlyph(round.landmarks[li].symbol),
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.15,
                              fontWeight: FontWeight.w900,
                              color: isCurrent || onRoute
                                  ? ink
                                  : navigatorGradient[0],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      }
    }
    return Semantics(
      label: label,
      image: true,
      child: Container(
        key: const Key('nav-map'),
        width: side,
        height: side,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Stack(children: cells),
      ),
    );
  }
}

/// Поле для свайпа: подпись вопроса и подсказка. Свайп считается от касания до отпускания —
/// как `PanResponder` веба, который отдаёт полный сдвиг жеста.
class NavigatorSwipeSurface extends StatefulWidget {
  const NavigatorSwipeSurface({
    super.key,
    required this.label,
    required this.hint,
    required this.onSwipe,
  });

  final String label;
  final String hint;
  final void Function(double dx, double dy) onSwipe;

  @override
  State<NavigatorSwipeSurface> createState() => _NavigatorSwipeSurfaceState();
}

class _NavigatorSwipeSurfaceState extends State<NavigatorSwipeSurface> {
  Offset _travel = Offset.zero;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // 🔴 ЖЕСТ БЕРЁТСЯ С 12 ТОЧЕК, КАК У ВЕБА (`onMoveShouldSetPanResponder: hypot >= 12`). У Flutter
    // протяжка по умолчанию начинается с 36 точек, а засчитывает ядро с 24: свайп в 24–36 точек в
    // вебе — ответ, здесь пропал бы молча. И вертикальный свайп перехватила бы прокрутка поля — её
    // порог 18. Порог протяжки — удвоенный `touchSlop`, поэтому 6.
    return MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(gestureSettings: const DeviceGestureSettings(touchSlop: 6)),
      child: Semantics(
        label: '${widget.label}. ${widget.hint}',
        child: GestureDetector(
          key: const Key('nav-swipe'),
          behavior: HitTestBehavior.opaque,
          // Сдвиг — от точки КАСАНИЯ, как `gesture.dx` у `PanResponder` веба. По умолчанию жест
          // отсчитывается от места, где он выиграл спор жестов, и первые 18 точек пропадают:
          // свайп в 30 точек засчитался бы как 12 и ушёл бы под порог 24.
          dragStartBehavior: DragStartBehavior.down,
          onPanStart: (_) => _travel = Offset.zero,
          onPanUpdate: (d) => _travel += d.delta,
          onPanEnd: (_) => widget.onSwipe(_travel.dx, _travel.dy),
          onPanCancel: () => _travel = Offset.zero,
          child: Container(
            constraints: const BoxConstraints(minHeight: 96),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: ExcludeSemantics(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    widget.label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      height: 1.3,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    widget.hint,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Кнопки ответа. Раскладка — как `flexWrap` веба: основа 21 % ширины, но не уже 82, и строка
/// растягивает свои кнопки на всю ширину. Поэтому на 344 точках в ряд входят три кнопки, а не
/// четыре, — ровно как в вебе на телефоне шириной 360.
class NavigatorChoices extends StatelessWidget {
  const NavigatorChoices({
    super.key,
    required this.session,
    required this.strings,
    required this.onAnswer,
  });

  final NavigatorSession session;
  final NavigatorStrings strings;
  final void Function(Object answer) onAnswer;

  @override
  Widget build(BuildContext context) {
    final round = session.round;
    final items = <({String id, String glyph, String label, Object value})>[
      if (round.mode == NavigatorMode.routeRecall)
        for (final d in Cardinal.values)
          (
            id: d.wire,
            glyph: _directionGlyphs[d]!,
            label: strings.direction(d),
            value: d,
          ),
      if (round.mode == NavigatorMode.turnSequence)
        for (final t in Turn.values)
          (
            id: t.wire,
            glyph: _turnGlyphs[t]!,
            label: strings.turn(t),
            value: t,
          ),
      if (round.mode == NavigatorMode.homeDirection)
        for (final h in HomeSector.values)
          (
            id: h.wire,
            glyph: _homeGlyphs[h]!,
            label: strings.home(h),
            value: h,
          ),
    ];
    return LayoutBuilder(
      builder: (context, c) {
        const gap = 8.0;
        final basis = math.max(82.0, c.maxWidth * 0.21);
        final perRow = math.max(
          1,
          math.min(items.length, ((c.maxWidth + gap) / (basis + gap)).floor()),
        );
        final rows = <Widget>[];
        for (var i = 0; i < items.length; i += perRow) {
          final row = items.sublist(i, math.min(items.length, i + perRow));
          if (rows.isNotEmpty) rows.add(const SizedBox(height: gap));
          rows.add(
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var j = 0; j < row.length; j++) ...[
                    if (j > 0) const SizedBox(width: gap),
                    Expanded(
                      child: _ChoiceButton(
                        key: Key('nav-choice-${row[j].id}'),
                        glyph: row[j].glyph,
                        label: row[j].label,
                        onPressed: () => onAnswer(row[j].value),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        }
        return Column(mainAxisSize: MainAxisSize.min, children: rows);
      },
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    super.key,
    required this.glyph,
    required this.label,
    required this.onPressed,
  });

  final String glyph;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(15),
          side: BorderSide(color: scheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: ExcludeSemantics(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      glyph,
                      style: const TextStyle(
                        fontSize: 25,
                        height: 1.16,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 11,
                        height: 1.27,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Показ поворотов в режиме «Повороты»: куда смотришь на старте и цепочка лево/прямо/право.
class NavigatorTurnStudy extends StatelessWidget {
  const NavigatorTurnStudy({
    super.key,
    required this.session,
    required this.strings,
  });

  final NavigatorSession session;
  final NavigatorStrings strings;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final round = session.round;
    final ink = navigatorOn(navigatorGradient[0]);
    return Container(
      key: const Key('nav-turn-study'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        children: [
          Text(
            '${strings.direction(round.startingFacing)} ${_directionGlyphs[round.startingFacing]}',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              height: 1.4,
              fontWeight: FontWeight.w800,
              color: scheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < round.turns.length; i++)
                Semantics(
                  label: '${i + 1}. ${strings.turn(round.turns[i])}',
                  child: ExcludeSemantics(
                    child: Container(
                      width: 62,
                      constraints: const BoxConstraints(minHeight: 70),
                      decoration: BoxDecoration(
                        color: navigatorGradient[0],
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: scheme.outlineVariant),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            _turnGlyphs[round.turns[i]]!,
                            style: TextStyle(
                              fontSize: 30,
                              height: 1.13,
                              fontWeight: FontWeight.w900,
                              color: ink,
                            ),
                          ),
                          Text(
                            '${i + 1}',
                            style: TextStyle(
                              fontSize: 11,
                              height: 1.27,
                              fontWeight: FontWeight.w800,
                              color: ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Заглушка вместо карты, когда на уровне карта в ответе спрятана.
class NavigatorHiddenMap extends StatelessWidget {
  const NavigatorHiddenMap({super.key, required this.strings});

  final NavigatorStrings strings;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      key: const Key('nav-hidden-map'),
      constraints: const BoxConstraints(minHeight: 150),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const ExcludeSemantics(
            child: Text(
              '⌖',
              style: TextStyle(
                fontSize: 54,
                height: 1.1,
                fontWeight: FontWeight.w900,
                color: Color(0xFF2563EB),
              ),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            strings.t('mapHidden'),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              height: 1.4,
              fontWeight: FontWeight.w800,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// РАСКЛАДКА ПАРТИИ сверху вниз: шапка, строка хода, карта, органы ответа.
///
/// 🔴 СТОРОНА КАРТЫ СЧИТАЕТСЯ В ТОМ ЖЕ ПРОХОДЕ, ЧТО И ВСЁ ПРОЧЕЕ. Веб меряет высоту прочего ПОСЛЕ
/// кадра и перерисовывает, поэтому его первый кадр идёт по запасным константам. Здесь шапка,
/// строка хода и органы ответа раскладываются первыми, их высоты известны сразу, и карте
/// достаётся остаток поля: `min(ширины, max(пола, поле − прочее))` — формула веба (`сторонаКарты`).
///
/// 🔴 ПРОЧЕЕ ОДНО И ТО ЖЕ ПРИ ИЗУЧЕНИИ И ПРИ ОТВЕТЕ — это обязанность вызывающего: в фазе
/// изучения органы ответа стоят невидимыми, но с размером (`Visibility.maintainSize`). Правило
/// веба 16.09.2026: карта обязана быть одной и той же в запоминании и в ответе, иначе меняется
/// сама задача.
class NavigatorPlayLayout extends MultiChildRenderObjectWidget {
  NavigatorPlayLayout({
    super.key,
    required this.fieldHeight,
    required this.widthLimit,
    required this.minSide,
    required this.squareMap,
    required Widget header,
    required Widget progress,
    required Widget map,
    required Widget bottom,
  }) : super(children: [header, progress, map, bottom]);

  final double fieldHeight;

  /// Предел ширины карты — у веба `min(600, max(220, ширина − 24))`.
  final double widthLimit;

  /// Пол стороны карты: `сетка × 28`.
  final double minSide;

  /// Карта в третьем слоте квадратная (карта сетки), а не карточка (повороты, скрытая карта).
  final bool squareMap;

  @override
  RenderNavigatorPlayLayout createRenderObject(BuildContext context) =>
      RenderNavigatorPlayLayout(
        fieldHeight: fieldHeight,
        widthLimit: widthLimit,
        minSide: minSide,
        squareMap: squareMap,
      );

  @override
  void updateRenderObject(
    BuildContext context,
    RenderNavigatorPlayLayout renderObject,
  ) {
    renderObject
      ..fieldHeight = fieldHeight
      ..widthLimit = widthLimit
      ..minSide = minSide
      ..squareMap = squareMap;
  }
}

class _PlayParentData extends ContainerBoxParentData<RenderBox> {}

class RenderNavigatorPlayLayout extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _PlayParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _PlayParentData> {
  RenderNavigatorPlayLayout({
    required double fieldHeight,
    required double widthLimit,
    required double minSide,
    required bool squareMap,
    // ignore: prefer_initializing_formals — поля приватные, а параметры именованные
  }) : _fieldHeight = fieldHeight,
       _widthLimit = widthLimit, // ignore: prefer_initializing_formals
       _minSide = minSide, // ignore: prefer_initializing_formals
       _squareMap = squareMap; // ignore: prefer_initializing_formals

  static const double padding = 8;
  static const double gap = 10;

  double _fieldHeight;
  set fieldHeight(double v) {
    if (v == _fieldHeight) return;
    _fieldHeight = v;
    markNeedsLayout();
  }

  double _widthLimit;
  set widthLimit(double v) {
    if (v == _widthLimit) return;
    _widthLimit = v;
    markNeedsLayout();
  }

  double _minSide;
  set minSide(double v) {
    if (v == _minSide) return;
    _minSide = v;
    markNeedsLayout();
  }

  bool _squareMap;
  set squareMap(bool v) {
    if (v == _squareMap) return;
    _squareMap = v;
    markNeedsLayout();
  }

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _PlayParentData) {
      child.parentData = _PlayParentData();
    }
  }

  List<RenderBox> get _kids {
    final out = <RenderBox>[];
    var child = firstChild;
    while (child != null) {
      out.add(child);
      child = childAfter(child);
    }
    return out;
  }

  /// Одна формула для настоящей и для «сухой» раскладки: иначе они разъедутся молча.
  Size _layout(
    BoxConstraints constraints,
    Size Function(RenderBox child, BoxConstraints c) lay, [
    void Function(RenderBox child, Offset at)? place,
  ]) {
    final kids = _kids;
    assert(kids.length == 4, 'раскладка партии ждёт ровно четыре слота');
    final width = constraints.maxWidth;
    final inner = math.max(0.0, width - 2 * padding);
    final row = BoxConstraints(minWidth: inner, maxWidth: inner);
    final header = lay(kids[0], row);
    final progress = lay(kids[1], row);
    final bottom = lay(kids[3], row);
    final other =
        2 * padding + header.height + progress.height + bottom.height + 3 * gap;
    final side = math.min(
      math.min(_widthLimit, inner),
      math.max(_minSide, _fieldHeight - other),
    );
    final map = lay(
      kids[2],
      _squareMap ? BoxConstraints.tight(Size(side, side)) : row,
    );
    if (place != null) {
      var y = padding;
      place(kids[0], Offset(padding, y));
      y += header.height + gap;
      place(kids[1], Offset(padding, y));
      y += progress.height + gap;
      place(kids[2], Offset(padding + (inner - map.width) / 2, y));
      y += map.height + gap;
      place(kids[3], Offset(padding, y));
    }
    final total = other + map.height;
    return constraints.constrain(Size(width, math.max(_fieldHeight, total)));
  }

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) =>
      _layout(constraints, (child, c) => child.getDryLayout(c));

  @override
  void performLayout() {
    size = _layout(constraints, (child, c) {
      child.layout(c, parentUsesSize: true);
      return child.size;
    }, (child, at) => (child.parentData! as _PlayParentData).offset = at);
  }

  @override
  void paint(PaintingContext context, Offset offset) =>
      defaultPaint(context, offset);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      defaultHitTestChildren(result, position: position);
}
