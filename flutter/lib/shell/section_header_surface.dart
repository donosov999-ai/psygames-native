import 'package:flutter/material.dart';

import 'design_template.dart';
import 'chrome_art.dart';
import 'pilot_liquid_surface.dart';

/// Shared content height, excluding the system safe area. Content may grow.
const auroraSectionHeaderMinHeight = 104.0;

class SectionHeaderSurface extends StatelessWidget {
  const SectionHeaderSurface({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (Theme.of(context).extension<UiTemplateTheme>()?.template != UiTemplate.aurora) return child;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      key: const ValueKey('section-header-surface'),
      constraints: const BoxConstraints(minHeight: auroraSectionHeaderMinHeight),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        image: ChromeArt.header(dark),
      ),
      child: PilotLiquidSurface(child: child),
    );
  }
}
