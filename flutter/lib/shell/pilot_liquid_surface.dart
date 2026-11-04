import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

const liquidGlassPilot = bool.fromEnvironment('PSYGAMES_LIQUID_GLASS', defaultValue: false);

/// Only chrome, not the task. Static artwork always remains behind the lens.
/// No Skia capture/frosted substitute: unsupported modes keep the exact artwork.
class PilotLiquidSurface extends StatelessWidget {
  const PilotLiquidSurface({super.key, required this.child});
  final Widget child;
  static Future<void>? _shaders;
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    if (!liquidGlassPilot || media.disableAnimations || media.accessibleNavigation || media.highContrast || !ui.ImageFilter.isShaderFilterSupported) return child;
    return FutureBuilder<void>(
      future: _shaders ??= LiquidGlassShaders.ensureLoaded(),
      builder: (context, snapshot) {
        if (snapshot.hasError || snapshot.connectionState != ConnectionState.done) return child;
        return LiquidGlassLens(
            touch: const LiquidGlassTouch(flex: LiquidGlassFlex(stretch: 5, lean: 0)),
            style: const LiquidGlassStyle(
              shape: LiquidGlassShape.continuousRoundedRectangle(cornerRadius: 24),
              refractionIndex: 1.01, refractionWidth: 5, blur: 0,
            ),
            child: child,
        );
      },
    );
  }
}
