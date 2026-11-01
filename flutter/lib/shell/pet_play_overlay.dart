import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'chrome_art.dart';
import 'game_colors.dart';
import 'l10n.dart';

/// Local toy interaction, NOT a training session or a source of rewards.
class PetPlayOverlay extends StatelessWidget {
  const PetPlayOverlay({
    super.key,
    required this.hits,
    required this.onHit,
    required this.onClose,
  });
  final int hits;
  final VoidCallback onHit, onClose;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      const spots = [
        Offset(.08, .2),
        Offset(.55, .7),
        Offset(.22, .65),
        Offset(.72, .1),
      ];
      final spot = spots[hits % spots.length];
      return Stack(
        key: const ValueKey('pet-play-overlay'),
        children: [
          Positioned(
            left: math.max(0, box.maxWidth - 104) * spot.dx,
            top: math.max(0, box.maxHeight - 48) * spot.dy,
            child: Semantics(
              button: true,
              label: L.t('petPlay'),
              value: '$hits',
              excludeSemantics: true,
              onTap: onHit,
              child: Tooltip(
                message: L.t('petPlay'),
                child: InkWell(
                  key: const ValueKey('pet-play-toy'),
                  onTap: onHit,
                  borderRadius: BorderRadius.circular(24),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        center: Alignment.topLeft,
                        colors: [
                          Colors.white,
                          ChromePilot.controlGold,
                          ChromePilot.timeEvening,
                        ],
                      ),
                    ),
                    child: const Icon(
                      Icons.sports_baseball,
                      size: 34,
                      color: ChromePilot.onGoldAction,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: DecoratedBox(
              decoration: ChromeArt.panel(context, square: true),
              child: IconButton(
                key: const ValueKey('pet-play-close'),
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: onClose,
                icon: const Icon(Icons.close),
              ),
            ),
          ),
        ],
      );
    },
  );
}
