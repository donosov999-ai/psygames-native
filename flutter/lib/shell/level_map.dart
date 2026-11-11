/// КАРТА УРОВНЕЙ — ВЕРНУТЬСЯ НА ПРОЙДЕННЫЙ (перенос смысла `LevelProgressMap` веба).
///
/// 🔴 С 11.11.2026 — ОБЩИЙ КОМПОНЕНТ КАРКАСА (задача 8e90ac74): в вебе тропинка стояла у 76 игр, в нативе
/// осталась у трёх «Судоку». Теперь её открывает пауза любой игры с лестницей ([GameShell], пункт
/// «Карта уровней» в «Уровни · Сложность»), звёзды пишет [LevelLadder.win]. Родилась здесь, в «Судоку»:
///
/// 🔴 ПОВОД — сверка «веб против натива» 138f7818, строки 101 («Судоку»), 199 («Самурай»),
/// 303 («Фрактал»), все «высокая»; задача b5df5096 п.4. В нативе уровень только рос сам
/// (`LevelLadder.win`), вернуться на лёгкий, переиграть пройденный, увидеть путь — было нельзя,
/// хотя `LevelLadder.pick` в каркасе есть. Денис: «тропинки прохождения уровней как это в
/// играх делают (там можно вернуться к боссу или какой-то интересной части)».
///
/// Лента узлов 1…последний: пройденные (≤ лучшего) нажимаются, текущий выделен, дальше —
/// закрыто; звёзды — общая запись с вебом (`psygames_<игра>_stars_<профиль>`, `levelStars.ts`):
/// победа пишет лучшее, карта читает. Нажатие отдаёт номер уровня; что с ним делать (`pick` +
/// раздача, вопрос «Заново?» при живой партии) — решает экран. Потолок (`best`) выбор не
/// трогает — как у веба.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'aurora_glass.dart';
import 'aux_action.dart';
import 'game_shell.dart';
import 'level_ladder.dart' show LevelSector;
import 'chrome_art.dart';
import 'game_colors.dart';
import 'l10n.dart';
import 'shared_level_store.dart' show decodeLevelStars, encodeLevelStars;
import 'shared_state.dart';

String _starsKey(SharedState state, String gameId) => '${SharedState.prefix}${gameId}_stars_${state.activeProfile}';

/// Звёзды по уровням (общая запись с вебом, `levelStars.ts`); пусто — побед со звёздами не было.
Map<int, int> levelStarsOf(SharedState state, String gameId) => decodeLevelStars(state.get(_starsKey(state, gameId)));

/// Записать звёзды пройденного уровня — как `saveLevelStars` веба: держится лучший результат.
/// Победы пишет [LevelLadder.win] сам; эта функция — для проб и переноса.
Future<void> saveLevelStars(SharedState state, String gameId, int level, int stars) async {
  final map = Map<int, int>.of(levelStarsOf(state, gameId));
  if ((map[level] ?? 0) >= stars) return;
  map[level] = stars;
  await state.set(_starsKey(state, gameId), encodeLevelStars(map));
}

/// Ключи общих названий — литералами: встраиватель переводов (`embed-l10n.mjs`) берёт только видимые ключи.
const _sectorKeys = [
  'levelSector1', 'levelSector2', 'levelSector3', 'levelSector4', 'levelSector5', //
  'levelSector6', 'levelSector7', 'levelSector8', 'levelSector9', 'levelSector10',
];

/// Секторы по умолчанию: по 10 уровней, общие игровые названия (10 имён, дальше — по кругу с «II», «III»).
List<LevelSector> defaultLevelSectors(int last, {int size = 10}) {
  const roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  return [
    for (var i = 0, from = 1; from <= last; i++, from += size)
      LevelSector(
        from: from,
        to: math.min(last, from + size - 1),
        name: '${L.t(_sectorKeys[i % 10])}${roman[math.min(i ~/ 10, roman.length - 1)]}',
      ),
  ];
}

/// Открыть карту; вернёт выбранный пройденный уровень или null (закрыли / нажали текущий).
///
/// 🔴 ВИД — «ТРОПИНКА» КАК В ИГРАХ-САГАХ, В ЦВЕТАХ И МАТЕРИАЛЕ ТЕМЫ (Денис 11.11.2026: «надо к такой
/// ближе, только в нашем цвете и стиле под тему»). Экран целиком: извилистая дорога снизу вверх,
/// круглые узлы, над пройденными дуга из трёх звёзд, на текущем — маркер игрока. «Аврора» — её фон,
/// камни-кнопки, золото паузы и стеклянная шапка; Classic — цвета своей темы. Одно место на все игры.
Future<int?> showLevelMap(
  BuildContext context, {
  required int current,
  required int best,
  required int last,
  Map<int, int> stars = const {},
  bool open = false,
  List<LevelSector>? sectors,
}) {
  final top = last < best ? best : last;
  return Navigator.of(context).push<int>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (ctx) => _LevelMap(
      current: current,
      best: best,
      last: last,
      stars: stars,
      open: open,
      sectors: [for (final s in sectors ?? defaultLevelSectors(top)) if (s.from <= top) s],
    ),
  ));
}

class _LevelMap extends StatefulWidget {
  const _LevelMap({required this.current, required this.best, required this.last, required this.stars, this.open = false, this.sectors = const []});

  final int current, best, last;
  final Map<int, int> stars;
  final List<LevelSector> sectors;

  /// Лестница без потолка: заголовок «Уровень N» без «из …», впереди — несколько закрытых узлов.
  final bool open;

  @override
  State<_LevelMap> createState() => _LevelMapState();
}

/// Краски карты: «Аврора» — палитра стекла и золота; Classic — схема темы.
class _MapColors {
  _MapColors(BuildContext context)
      : aurora = ChromeArt.aurora(context),
        dark = Theme.of(context).brightness == Brightness.dark,
        scheme = Theme.of(context).colorScheme,
        reward = GameColors.of(context).reward;
  final bool aurora, dark;
  final ColorScheme scheme;
  final Color reward;
  ChromePalette get p => ChromePalette.of(dark);

  Color get text => aurora ? p.text : scheme.onSurface;
  Color get textSoft => aurora ? p.textSecondary : scheme.onSurfaceVariant;
  Color get road => aurora ? (dark ? p.glass : p.ringFill) : scheme.surfaceContainerHigh;
  Color get roadEdge => aurora ? p.gold : scheme.outline;
  Color get dash => aurora ? p.goldSoft : scheme.primary;
  Color get star => aurora ? ChromePilot.jewelStar : reward;
  Color get starOff => textSoft.withValues(alpha: .35);

  BoxDecoration passed() => aurora
      ? AuroraGlass.ring(dark)
      : BoxDecoration(shape: BoxShape.circle, color: scheme.primaryContainer, border: Border.all(color: scheme.primary, width: 2));
  BoxDecoration currentNode() => aurora
      ? AuroraGlass.pause(dark)
      : BoxDecoration(shape: BoxShape.circle, color: scheme.primary, boxShadow: [BoxShadow(color: scheme.primary.withValues(alpha: .5), blurRadius: 14)]);
  BoxDecoration locked() => BoxDecoration(
        shape: BoxShape.circle,
        color: road.withValues(alpha: .75),
        border: Border.all(color: roadEdge.withValues(alpha: .35), width: 1.4),
      );
  Color get onPassed => aurora ? p.text : scheme.onPrimaryContainer;
  Color get onCurrent => aurora ? p.onPrimary : scheme.onPrimary;
}

class _LevelMapState extends State<_LevelMap> {
  static const _step = 110.0, _bottomPad = 150.0, _topPad = 150.0, _node = 58.0, _currentNode = 72.0, _gap = 76.0;
  final _scroll = ScrollController();
  bool _placed = false;

  int get _last => widget.last < widget.best ? widget.best : widget.last;
  /// Начала секторов после первого: перед каждым — зазор под плашку с названием.
  late final Set<int> _starts = {for (final s in widget.sectors) if (s.from > 1) s.from};
  double get _height => _bottomPad + (_last - 1) * _step + _gapsUpTo(_last) + _topPad;
  double _gapsUpTo(int n) => _starts.where((s) => s <= n).length * _gap;
  double _yOf(int n) => _height - _bottomPad - (n - 1) * _step - _gapsUpTo(n);

  /// Центр узла n (1…последний) в координатах полотна: снизу вверх, ЗМЕЙКОЙ — дорога ходит от края
  /// к краю (Денис 11.11: «более извилистую… змейкой»): четверть оборота синуса на узел, размах —
  /// почти вся ширина за вычетом узла и звёзд.
  Offset _at(int n, double width) {
    final amp = math.max(0.0, math.min(width / 2 - 70, 170.0));
    return Offset(width / 2 + amp * math.sin((n - 1) * math.pi / 2.6), _yOf(n));
  }

  void _toCurrent() {
    if (!_scroll.hasClients) return;
    final viewport = _scroll.position.viewportDimension;
    final target = _height - _yOf(widget.current) - viewport / 2;
    _scroll.animateTo(target.clamp(0.0, _scroll.position.maxScrollExtent),
        duration: const Duration(milliseconds: 450), curve: Curves.easeOutCubic);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Лента встаёт на текущем уровне, как у веба: текущий узел — посередине экрана.
  void _placeOnCurrent(double viewport) {
    if (_placed) return;
    _placed = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final target = _height - _yOf(widget.current) - viewport / 2;
      _scroll.jumpTo(target.clamp(0.0, _scroll.position.maxScrollExtent));
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = _MapColors(context);
    final levelValue = widget.open ? '${widget.current}' : '${widget.current}/$_last';
    // 🔴 ШАПКА И НИЖНИЙ РЯД — ОБЩИЕ, КАРКАСА (канон APP_CHROME_DESIGN_STANDARD_REF.md §1, §3): карта — экран
    // на [GameShell], как любая игра. Своей шапки и своего тулбара у карты нет (ошибка 11.11, Денис:
    // «верхний ты тоже изменил… правило дизайна читал?»). Кнопки карты — в общий тулбар через [AuxBar].
    return GameShell(
      title: L.t('levelMap'),
      hud: [HudItem(label: L.t('level'), value: levelValue, icon: Icons.trending_up)],
      levelMap: false,
      auroraTransparentField: true,
      auxRow: AuxBar(children: [
        AuxAction(key: const Key('level-map-current'), icon: Icons.my_location_rounded, label: L.t('level'), onPressed: _toCurrent),
        AuxAction(key: const Key('level-map-play'), icon: Icons.play_arrow_rounded, label: L.t('start'), onPressed: () => Navigator.of(context).pop()),
      ]),
      field: (context, _) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 4),
          child: Text(L.t('tapNodeToReplay'), textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.textSoft)),
        ),
        Expanded(
          child: LayoutBuilder(builder: (context, box) {
            _placeOnCurrent(box.maxHeight);
            final w = box.maxWidth;
            return SingleChildScrollView(
              key: const Key('level-map'),
              controller: _scroll,
              reverse: true,
              child: SizedBox(
                width: w,
                height: _height,
                child: Stack(clipBehavior: Clip.none, children: [
                  Positioned.fill(
                    child: CustomPaint(painter: _Road([for (var n = 1; n <= _last; n++) _at(n, w)], widget.best, c)),
                  ),
                  for (final s in widget.sectors) _sectorAt(s, w, c),
                  for (var n = 1; n <= _last; n++) _nodeAt(n, _at(n, w), c),
                ]),
              ),
            );
          }),
        ),
      ]),
    );
  }

  /// Плашка сектора поперёк дороги — под первым узлом сектора, в зазоре перед ним.
  Widget _sectorAt(LevelSector s, double w, _MapColors c) {
    final y = _yOf(s.from) + _step / 2 + (s.from > 1 ? _gap / 2 : 18);
    final reached = s.from <= widget.best;
    return Positioned(
      left: 24,
      right: 24,
      top: y - 22,
      height: 44,
      child: Container(
        key: Key('level-sector-${s.from}'),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: c.aurora
            ? AuroraGlass.panel(c.dark, radius: 16, glow: reached)
            : BoxDecoration(color: c.scheme.secondaryContainer, borderRadius: BorderRadius.circular(16)),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Flexible(
            child: Text(s.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: reached ? c.text : c.textSoft)),
          ),
          const SizedBox(width: 10),
          Text(s.from == s.to ? '${s.from}' : '${s.from}–${s.to}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.textSoft)),
        ]),
      ),
    );
  }

  Widget _nodeAt(int n, Offset at, _MapColors c) {
    final passed = n <= widget.best;
    final isCurrent = n == widget.current;
    final size = isCurrent ? _currentNode : _node;
    final s = (widget.stars[n] ?? 0).clamp(0, 3);
    return Positioned(
      left: at.dx - 60,
      top: at.dy - size / 2 - (isCurrent ? 74 : 26),
      width: 120,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (isCurrent) _Marker(c),
        SizedBox(height: 24, child: passed && s > 0 ? _StarArc(key: Key('level-stars-$n'), count: s, c: c) : null),
        Semantics(
          button: passed && !isCurrent,
          label: '${L.t('level')} $n',
          child: GestureDetector(
            key: Key('level-node-$n'),
            behavior: HitTestBehavior.opaque,
            // Закрытые узлы не нажимаются; текущий — тоже: он и так в игре.
            onTap: passed && !isCurrent ? () => Navigator.of(context).pop(n) : null,
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: isCurrent ? c.currentNode() : (passed ? c.passed() : c.locked()),
              child: passed
                  ? Text('$n',
                      style: TextStyle(
                        fontSize: isCurrent ? 26 : 21,
                        fontWeight: FontWeight.w800,
                        color: isCurrent ? c.onCurrent : c.onPassed,
                        shadows: isCurrent ? null : [Shadow(color: Colors.black.withValues(alpha: .35), blurRadius: 2)],
                      ))
                  : Icon(Icons.lock_rounded, size: 20, color: c.textSoft),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Дуга из трёх звёзд над узлом: средняя выше, заработанные — золото, остальные — контур.
class _StarArc extends StatelessWidget {
  const _StarArc({super.key, required this.count, required this.c});
  final int count;
  final _MapColors c;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < 3; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == 1 ? 6 : 0),
              child: Icon(
                i < count ? Icons.star_rounded : Icons.star_outline_rounded,
                size: i == 1 ? 24 : 20,
                color: i < count ? c.star : c.starOff,
                shadows: i < count ? [Shadow(color: c.star.withValues(alpha: .6), blurRadius: 6)] : null,
              ),
            ),
        ],
      );
}

/// Маркер «ты здесь» над текущим узлом: золотое кольцо с фигуркой и хвостик вниз.
class _Marker extends StatelessWidget {
  const _Marker(this.c);
  final _MapColors c;

  @override
  Widget build(BuildContext context) => SizedBox(
        key: const Key('level-map-marker'),
        height: 50,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 40,
            height: 40,
            decoration: c.aurora
                ? AuroraGlass.primary(c.dark, radius: 20)
                : BoxDecoration(shape: BoxShape.circle, color: c.scheme.tertiary),
            child: Icon(Icons.emoji_people_rounded, size: 26, color: c.onCurrent),
          ),
          CustomPaint(size: const Size(14, 8), painter: _Tail(c.aurora ? c.p.primaryBottom : c.scheme.tertiary)),
        ]),
      );
}

class _Tail extends CustomPainter {
  _Tail(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) => canvas.drawPath(
        Path()
          ..moveTo(0, 0)
          ..lineTo(size.width, 0)
          ..lineTo(size.width / 2, size.height)
          ..close(),
        Paint()..color = color,
      );
  @override
  bool shouldRepaint(_Tail old) => old.color != color;
}

/// Дорога через центры узлов: золотая кромка, стеклянное полотно, пунктир по оси. Пройденный участок —
/// ярче, впереди — приглушённо.
class _Road extends CustomPainter {
  _Road(this.points, this.best, this.c);
  final List<Offset> points;
  final int best;
  final _MapColors c;

  Path _through(List<Offset> pts) {
    final path = Path();
    if (pts.isEmpty) return path;
    path.moveTo(pts.first.dx, pts.first.dy);
    // Сплайн Катмулла — Рома: на развороте дорога идёт дугой, а не прямой между двумя узлами у края.
    for (var i = 0; i < pts.length - 1; i++) {
      final p0 = pts[i == 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
      final c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
      path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    return path;
  }

  void _dashed(Canvas canvas, Path path, Paint paint) {
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 22) {
        canvas.drawPath(m.extractPath(d, d + 11), paint);
      }
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    final split = best.clamp(1, points.length);
    final done = _through(points.sublist(0, split));
    final ahead = _through(points.sublist(split - 1));
    Paint stroke(Color color, double w) => Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final (path, alpha) in [(ahead, .45), (done, 1.0)]) {
      canvas.drawPath(path, stroke(Colors.black.withValues(alpha: .22 * alpha), 46)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
      canvas.drawPath(path, stroke(c.roadEdge.withValues(alpha: .9 * alpha), 40));
      canvas.drawPath(path, stroke(c.road.withValues(alpha: alpha == 1 ? .96 : .7), 34));
      _dashed(canvas, path, stroke(c.dash.withValues(alpha: .75 * alpha), 3.5));
    }
  }

  @override
  bool shouldRepaint(_Road old) => old.points != points || old.best != best || old.c.dark != c.dark || old.c.aurora != c.aurora;
}
