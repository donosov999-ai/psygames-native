import 'dart:math' as math;
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'game_colors.dart';

const rewardEffectsPilot = bool.fromEnvironment('PSYGAMES_REWARD_EFFECTS', defaultValue: false);

/// Presentation of an already confirmed level-up. Never awards anything.
class RewardStar extends StatelessWidget {
  const RewardStar({super.key});
  @override
  Widget build(BuildContext context) {
    if (!rewardEffectsPilot || MediaQuery.disableAnimationsOf(context)) {
      return const Text('⭐', style: TextStyle(fontSize: 40));
    }
    return ExcludeSemantics(child: Lottie.asset(
      'assets/animation_pilot/reward_star.json', key: const ValueKey('reward-lottie'),
      width: 56, height: 56, repeat: false,
      errorBuilder: (_, _, _) => const Text('⭐', style: TextStyle(fontSize: 40)),
    ));
  }
}

class VictorySparks extends StatefulWidget {
  const VictorySparks({super.key});
  @override
  State<VictorySparks> createState() => _VictorySparksState();
}
class _VictorySparksState extends State<VictorySparks> {
  final game = _Sparks();
  @override
  Widget build(BuildContext context) {
    if (!rewardEffectsPilot || MediaQuery.disableAnimationsOf(context)) return const SizedBox.shrink();
    return IgnorePointer(child: ExcludeSemantics(child: GameWidget(game: game)));
  }
}
class _Sparks extends FlameGame {
  double elapsed = 0;
  @override
  Color backgroundColor() => Colors.transparent;
  @override
  void update(double dt) {
    super.update(dt);
    elapsed = (elapsed + dt).clamp(0, 1.2);
    if (elapsed >= 1.2) pauseEngine();
  }
  @override
  void render(Canvas canvas) {
    super.render(canvas);
    final opacity = (1 - elapsed / 1.2).clamp(0.0, 1.0);
    for (var i = 0; i < 14; i++) {
      final angle = 2 * math.pi * i / 14;
      final distance = (14 + 55 * elapsed) * (i.isEven ? 1.0 : .7);
      final center = Offset(size.x / 2 + math.cos(angle) * distance, size.y / 2 + math.sin(angle) * distance * .6);
      canvas.drawCircle(center, 2.5 + (i % 3), Paint()..color = ChromePalette.of(true).gold.withValues(alpha: opacity));
    }
  }
}
