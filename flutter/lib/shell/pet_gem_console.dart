import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'chrome_art.dart';
import 'l10n.dart';
import 'tab_chrome.dart';

/// One bounded scene: speech never becomes an unrelated list row, even for AI.
class PetGemConsole extends StatelessWidget {
  const PetGemConsole({
    super.key,
    required this.name,
    required this.stage,
    required this.portrait,
    required this.speech,
    required this.controls,
    required this.controlLabels,
    required this.expandedSpeech,
    required this.onExpand,
    this.playOverlay,
  });
  final Widget name, portrait, speech;
  final String stage;
  final List<Widget> controls;
  final List<String> controlLabels;
  final bool expandedSpeech;
  final VoidCallback onExpand;
  final Widget? playOverlay;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final width = math.min(box.maxWidth, 390.0);
      final scaler = MediaQuery.textScalerOf(context);
      final large = scaler.scale(1) > 1.25;
      final columns = large ? 2 : 4;
      final buttonWidth = (width - 16 - (columns - 1) * 6) / columns;
      var textHeight = 0.0;
      for (final label in controlLabels) {
        final p = TextPainter(
          text: TextSpan(
            text: label,
            style: const TextStyle(
              fontSize: 11.5,
              height: 1.2,
              fontWeight: FontWeight.w700,
            ),
          ),
          textDirection: Directionality.of(context),
          textScaler: scaler,
        )..layout(maxWidth: math.max(30, buttonWidth - 8));
        textHeight = math.max(textHeight, p.height);
        p.dispose();
      }
      final buttonHeight = math.max(68.0, textHeight + 36);
      final rows = (controls.length / columns).ceil();
      final controlsHeight = buttonHeight * rows + (rows - 1) * 6;
      final headHeight = math.max(48.0, scaler.scale(12) * 1.2 + 24);
      final speechHeight = expandedSpeech
          ? (large ? 170.0 : 130.0)
          : (large ? 96.0 : 60.0);
      final height = large || expandedSpeech
          ? math.max(
              width,
              24 + headHeight + speechHeight + controlsHeight + 120,
            )
          : width;
      final dark = Theme.of(context).brightness == Brightness.dark;
      return Center(
        child: SizedBox(
          width: width,
          height: height,
          child: Container(
            key: const ValueKey('pet-gem-stage'),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              image: DecorationImage(
                image: AssetImage(
                  'assets/aurora_tab_panels/pet-stage-${dark ? 'dark' : 'light'}.png',
                ),
                fit: BoxFit.cover,
                alignment: Alignment.bottomCenter,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: headHeight,
                  child: Row(
                    children: [
                      Flexible(
                        flex: 2,
                        child: Container(
                          constraints: const BoxConstraints(
                            minWidth: 44,
                            minHeight: 44,
                          ),
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surface
                                .withValues(alpha: .82),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Theme.of(context)
                                  .colorScheme
                                  .outlineVariant,
                            ),
                          ),
                          child: Text(
                            stage,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        flex: 5,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            image: ChromeArt.header(dark),
                          ),
                          child: name,
                        ),
                      ),
                      const SizedBox(width: 4),
                      SizedBox(
                        width: 44,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surface
                                .withValues(alpha: .65),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: IconButton(
                            key: const ValueKey('pet-shop'),
                            tooltip: L.t('shop'),
                            onPressed: TabChromeHost.open == null
                                ? null
                                : () => TabChromeHost.open!('/shop'),
                            icon: Image.asset(
                              'assets/aurora_game_chrome/home_icons_approved/shop.png',
                              width: 28,
                              height: 28,
                              excludeFromSemantics: true,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: ClipRect(
                          child: Transform.scale(
                            scale: large || expandedSpeech ? 1 : 1.18,
                            alignment: Alignment.bottomCenter,
                            child: FittedBox(
                              fit: BoxFit.contain,
                              alignment: Alignment.bottomCenter,
                              child: portrait,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        height: speechHeight,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: CustomPaint(
                                foregroundPainter: _ComicTail(
                                  Theme.of(context).colorScheme.surface,
                                  Theme.of(context).colorScheme.outlineVariant,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Scrollbar(
                                    child: SingleChildScrollView(
                                      key: const ValueKey('pet-speech-scroll'),
                                      child: speech,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            IconButton(
                              key: const ValueKey('pet-speech-expand'),
                              tooltip: expandedSpeech
                                  ? MaterialLocalizations.of(context)
                                        .expandedIconTapHint
                                  : MaterialLocalizations.of(context)
                                        .collapsedIconTapHint,
                              onPressed: onExpand,
                              icon: Icon(
                                expandedSpeech
                                    ? Icons.expand_less
                                    : Icons.expand_more,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (playOverlay != null)
                        Positioned.fill(
                          top: speechHeight + 8,
                          child: playOverlay!,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final control in controls)
                      SizedBox(
                        width: buttonWidth,
                        height: buttonHeight,
                        child: control,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _ComicTail extends CustomPainter {
  const _ComicTail(this.fill, this.border);
  final Color fill, border;
  @override
  void paint(Canvas canvas, Size size) {
    final x = size.width * .65, y = size.height - 8;
    final p = Path()
      ..moveTo(x - 6, y - 1)
      ..lineTo(x + 6, y + 6)
      ..lineTo(x + 8, y - 1);
    canvas.drawPath(p, Paint()..color = fill);
    canvas.drawPath(
      p,
      Paint()
        ..color = border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_ComicTail old) =>
      old.fill != fill || old.border != border;
}
