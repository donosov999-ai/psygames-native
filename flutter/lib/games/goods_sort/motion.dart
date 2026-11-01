import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Opt-in until phone/performance acceptance. Never owns board state or awards.
const goodsMotionPilot = bool.fromEnvironment('PSYGAMES_GOODS_MOTION', defaultValue: false);

class GoodsFlight {
  const GoodsFlight(this.id, this.type, this.from, this.to);
  final int id;
  final int type;
  final Rect from, to;
}

class GoodsMotion extends ChangeNotifier {
  final root = GlobalKey();
  final _items = <String, GlobalKey>{};
  final _niches = <int, GlobalKey>{};
  GlobalKey item(int niche, int index) => _items.putIfAbsent('$niche:$index', GlobalKey.new);
  GlobalKey niche(int index) => _niches.putIfAbsent(index, GlobalKey.new);
  GoodsFlight? flight;
  String? hiddenItem;
  VoidCallback? _onLand;
  int _epoch = 0;
  bool enabled = false;
  bool get busy => flight != null;

  Rect? _rect(GlobalKey? key) {
    final box = key?.currentContext?.findRenderObject();
    final base = root.currentContext?.findRenderObject();
    if (box is! RenderBox || base is! RenderBox || !box.hasSize || !base.hasSize) return null;
    return box.localToGlobal(Offset.zero, ancestor: base) & box.size;
  }

  /// Called only AFTER the real model accepted the move, before the next frame.
  /// Coordinates come from the currently rendered field, not a second layout formula.
  bool begin(int from, int index, int type, int to, {String? hide, VoidCallback? onLand}) {
    if (!enabled || busy) return false;
    final a = _rect(_items['$from:$index']);
    final b = _rect(_niches[to]);
    if (a == null || b == null) return false;
    final id = ++_epoch;
    hiddenItem = hide;
    flight = GoodsFlight(id, type, a, Rect.fromLTWH(b.center.dx - a.width / 2, b.bottom - a.height - 4, a.width, a.height));
    _onLand = onLand;
    notifyListeners();
    return true;
  }

  void complete(int id) {
    if (id != _epoch || flight == null) return;
    final landed = _onLand;
    _onLand = null;
    flight = null;
    hiddenItem = null;
    notifyListeners();
    landed?.call();
  }

  void cancel() {
    _epoch++;
    _onLand = null;
    final changed = flight != null;
    flight = null;
    hiddenItem = null;
    if (changed) notifyListeners();
  }

  @override
  void dispose() { _epoch++; _onLand = null; super.dispose(); }
}

class GoodsMotionLayer extends StatelessWidget {
  const GoodsMotionLayer({super.key, required this.motion, required this.child});
  final GoodsMotion motion;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: motion,
    builder: (context, _) {
      final f = motion.flight;
      return Stack(key: motion.root, clipBehavior: Clip.none, children: [
        child,
        if (f != null) Positioned.fromRect(
          rect: f.from,
          child: IgnorePointer(child: ExcludeSemantics(child:
            Image.asset('assets/goods/good${f.type}.webp', fit: BoxFit.contain)
              .animate(key: ValueKey('goods-flight-${f.id}'), onComplete: (_) => motion.complete(f.id))
              .move(end: f.to.topLeft - f.from.topLeft, duration: 260.ms, curve: Curves.easeInOutCubic)
              .then().scale(begin: const Offset(1.08, .94), end: const Offset(1, 1), duration: 90.ms),
          )),
        ),
      ]);
    },
  );
}
