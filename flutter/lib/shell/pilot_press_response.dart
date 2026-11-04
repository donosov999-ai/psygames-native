import 'package:flutter/material.dart';

const uiMotionPilot = bool.fromEnvironment('PSYGAMES_UI_MOTION', defaultValue: false);

/// Finite press feedback on artwork only. Layout and the parent's hit target
/// stay fixed; Listener does not compete with the real button's gesture.
class PilotPressResponse extends StatefulWidget {
  const PilotPressResponse({super.key, required this.child, this.enabled = true});
  final Widget child;
  final bool enabled;
  @override
  State<PilotPressResponse> createState() => _PilotPressResponseState();
}

class _PilotPressResponseState extends State<PilotPressResponse> {
  final _pointers = <int>{};
  void _down(PointerDownEvent e) => setState(() => _pointers.add(e.pointer));
  void _up(PointerEvent e) => setState(() => _pointers.remove(e.pointer));
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    if (!widget.enabled || !uiMotionPilot || media.disableAnimations || media.accessibleNavigation) {
      _pointers.clear();
      return widget.child;
    }
    return Listener(
      onPointerDown: _down, onPointerUp: _up, onPointerCancel: _up,
      child: AnimatedScale(
        scale: _pointers.isEmpty ? 1 : .90,
        duration: Duration(milliseconds: _pointers.isEmpty ? 240 : 95),
        curve: _pointers.isEmpty ? Curves.easeOutBack : Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}
