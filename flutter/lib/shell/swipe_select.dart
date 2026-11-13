/// ПРОТЯЖКА — ОБЩИЙ ЖЕСТ КАРКАСА: выбор плиток одним движением пальца.
///
/// 📍 Отзыв игрока 2b597852 («Анаграммы», 10.10.2026) и скрин Дениса 13.11.2026 («Считалка: счёт»,
/// сумма 7, плитки 3×3): «нельзя пальцем соединять цифры, надо тыкать каждую». Протяжка была
/// написана внутри колеса «Анаграмм» (#501); канон каркаса — общий элемент один на все игры, а
/// не копия в каждой, — поэтому здесь.
///
/// Как пользоваться: плитки оборачиваются в [SwipeTarget] (номер плитки), всё поле — в
/// [SwipeSelect]. Раскладка не важна — сетка, `Wrap`, круг: плитка ищется по её настоящему месту на
/// экране, а не по формуле раскладки.
///
/// ПРАВИЛА ЖЕСТА (одни на все игры):
///  · палец ведут по плиткам — каждая новая под пальцем выбирается ровно один раз, по порядку;
///  · возврат на ПРЕДЫДУЩУЮ плитку снимает последнюю выбранную в этой протяжке ([onUnselect]);
///  · плитку считает «под пальцем» только её СЕРЕДИНА ([innerShare] стороны): на диагонали палец
///    проходит угол и задевает соседа — так «Корректура» теряла последнее слово (отзыв e39ce923,
///    #409). Первое касание — без зоны: с какой плитки начать, человек выбирает сам;
///  · быстрый палец не перепрыгивает плитки: отрезок между двумя событиями проверяется шагами;
///  · одиночный тап не затронут — он остаётся за самой плиткой. Протяжка включается, только когда
///    палец ушёл дальше касательного допуска Flutter (иначе тап и протяжка сработали бы оба, и
///    игра, где тап переключает, сняла бы только что выбранное).
///
/// ⚠️ Поле внутри прокручиваемого списка при вертикальном движении прокручивается тоже: слушатель
/// указателей жеста не отнимает. Игры, где поле целиком не влезает, это учитывают сами.
library;

import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/widgets.dart';

/// Дальше этого от места касания — уже протяжка, а не тап (логические точки). Чуть больше
/// допуска тапа ([kTouchSlop]): к моменту первой выбранной плитки тап уже отменён.
const double swipeSlop = kTouchSlop + 2;

/// Доля стороны плитки, в которой палец считается «на плитке» во время протяжки.
const double swipeInnerShare = 0.7;

/// Шаг проверки отрезка между двумя событиями пальца, точки.
const double _sampleStep = 6;

class _SwipeScope extends InheritedWidget {
  const _SwipeScope({required this.targets, required super.child});

  final Map<int, BuildContext> targets;

  @override
  bool updateShouldNotify(_SwipeScope old) => !identical(old.targets, targets);
}

/// Плитка, которую можно выбрать протяжкой. [index] — номер плитки в игре.
class SwipeTarget extends StatefulWidget {
  const SwipeTarget({super.key, required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<SwipeTarget> createState() => _SwipeTargetState();
}

class _SwipeTargetState extends State<SwipeTarget> {
  Map<int, BuildContext>? _targets;
  int? _registered;

  void _register() {
    final t = _targets;
    if (t == null) return;
    if (_registered != null && _registered != widget.index && identical(t[_registered], context)) {
      t.remove(_registered);
    }
    t[widget.index] = context;
    _registered = widget.index;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _targets = context.getInheritedWidgetOfExactType<_SwipeScope>()?.targets;
    _register();
  }

  @override
  void didUpdateWidget(SwipeTarget old) {
    super.didUpdateWidget(old);
    _register();
  }

  @override
  void dispose() {
    final t = _targets;
    if (t != null && _registered != null && identical(t[_registered], context)) t.remove(_registered);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Номер плитки под глобальной точкой [global] среди зарегистрированных [targets]; [share] —
/// доля стороны, внутри которой плитка «под пальцем» (1 — вся плитка).
int? swipeHit(Map<int, BuildContext> targets, Offset global, double share) {
  for (final e in targets.entries) {
    final ctx = e.value;
    if (!ctx.mounted) continue;
    final ro = ctx.findRenderObject();
    if (ro is! RenderBox || !ro.hasSize || !ro.attached) continue;
    final local = ro.globalToLocal(global);
    final size = ro.size;
    final zone = Rect.fromCenter(center: size.center(Offset.zero), width: size.width * share, height: size.height * share);
    if (zone.contains(local)) return e.key;
  }
  return null;
}

/// Низкий уровень: ведёт палец по плиткам и сообщает, на какую плитку он вошёл. Для игр, где
/// выбор — не набор, а своя логика (линия слова в филвордах). Набор плиток — [SwipeSelect].
class SwipeTrack extends StatefulWidget {
  const SwipeTrack({
    super.key,
    required this.child,
    this.onStart,
    this.onEnter,
    this.onEnd,
    this.enabled = true,
    this.innerShare = swipeInnerShare,
  });

  final Widget child;

  /// Палец коснулся: плитка под ним (вся плитка, без зоны) или null, и точка касания.
  final void Function(int? cell, Offset position)? onStart;

  /// Палец вошёл в середину плитки — по разу на каждый вход, по порядку вдоль пути; точка — где
  /// палец сейчас (для порога протяжки).
  final void Function(int cell, Offset position)? onEnter;

  /// Палец оторван или жест отменён.
  final VoidCallback? onEnd;

  final bool enabled;
  final double innerShare;

  @override
  State<SwipeTrack> createState() => _SwipeTrackState();
}

class _SwipeTrackState extends State<SwipeTrack> {
  final Map<int, BuildContext> _targets = {};
  Offset? _last;
  int? _lastCell;

  void _down(PointerDownEvent e) {
    if (!widget.enabled) return;
    _last = e.position;
    _lastCell = null;
    widget.onStart?.call(swipeHit(_targets, e.position, 1.0), e.position);
  }

  void _move(PointerMoveEvent e) {
    final from = _last;
    if (!widget.enabled || from == null) return;
    final to = e.position;
    final steps = ((to - from).distance / _sampleStep).ceil().clamp(1, 200);
    for (var s = 1; s <= steps; s++) {
      final p = Offset.lerp(from, to, s / steps)!;
      final c = swipeHit(_targets, p, widget.innerShare);
      if (c != null && c != _lastCell) {
        _lastCell = c;
        widget.onEnter?.call(c, p);
      }
    }
    _last = to;
  }

  void _end() {
    if (_last == null) return;
    _last = null;
    _lastCell = null;
    widget.onEnd?.call();
  }

  @override
  Widget build(BuildContext context) => _SwipeScope(
        targets: _targets,
        child: Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: _down,
          onPointerMove: _move,
          onPointerUp: (_) => _end(),
          onPointerCancel: (_) => _end(),
          child: widget.child,
        ),
      );
}

/// Выбор набора плиток протяжкой. [isSelected] — выбрана ли плитка сейчас (из состояния игры),
/// [onSelect] — взять плитку, [onUnselect] — вернуться на предыдущую и снять последнюю (не
/// задан — возврат ничего не снимает).
class SwipeSelect extends StatefulWidget {
  const SwipeSelect({
    super.key,
    required this.child,
    required this.isSelected,
    required this.onSelect,
    this.onUnselect,
    this.enabled = true,
    this.innerShare = swipeInnerShare,
  });

  final Widget child;
  final bool Function(int index) isSelected;
  final ValueChanged<int> onSelect;
  final ValueChanged<int>? onUnselect;
  final bool enabled;
  final double innerShare;

  @override
  State<SwipeSelect> createState() => _SwipeSelectState();
}

class _SwipeSelectState extends State<SwipeSelect> {
  /// Взято в ТЕКУЩЕЙ протяжке: состояние игры перерисуется позже, чем придёт следующее движение.
  final List<int> _path = [];

  /// Плитки, в которые палец вошёл ДО порога протяжки: порог ещё не пройден, но терять их нельзя —
  /// протяжка начиналась в щели или на соседней плитке.
  final List<int> _pending = [];
  Offset? _down;
  int? _downCell;
  bool _dragging = false;

  void _take(int i) {
    if (_path.contains(i) || widget.isSelected(i)) return;
    _path.add(i);
    widget.onSelect(i);
  }

  void _start(int? cell, Offset at) {
    _path.clear();
    _pending.clear();
    _dragging = false;
    _downCell = cell;
    _down = at;
  }

  void _enter(int cell, Offset where) {
    final down = _down;
    if (down == null) return;
    if (!_dragging) {
      if (!_pending.contains(cell)) _pending.add(cell);
      if ((where - down).distance < swipeSlop) return;
      _dragging = true;
      final first = _downCell;
      if (first != null) _take(first);
      _pending.forEach(_take);
      return;
    }
    if (_path.isNotEmpty && _path.last == cell) return;
    if (_path.length >= 2 && _path[_path.length - 2] == cell && widget.onUnselect != null) {
      widget.onUnselect!(_path.removeLast());
      return;
    }
    _take(cell);
  }

  void _end() {
    _path.clear();
    _pending.clear();
    _down = null;
    _downCell = null;
    _dragging = false;
  }

  @override
  Widget build(BuildContext context) => SwipeTrack(
        enabled: widget.enabled,
        innerShare: widget.innerShare,
        onStart: _start,
        onEnter: _enter,
        onEnd: _end,
        child: widget.child,
      );
}
