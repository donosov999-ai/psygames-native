import 'package:flutter/material.dart';

import 'design_template.dart';

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
        image: DecorationImage(
          image: AssetImage(dark
              ? 'assets/aurora_game_chrome/section-header-dark-blank-v1.png'
              : 'assets/aurora_game_chrome/home_panels_pilot/light_header.png'),
          fit: BoxFit.fill,
        ),
      ),
      child: child,
    );
  }
}
