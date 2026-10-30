import 'package:flutter/material.dart';

import 'design_template.dart';
import 'game_colors.dart';
import 'game_shell.dart';

/*
 * 🔴 «СТЕКЛО И ЗОЛОТО» — ОДИН ВИД ИГРОВОЙ РАМКИ «АВРОРЫ» (стандарт игрового экрана, Денис 30.10).
 *
 * Рефы Codex 30.10 (`sudoku-even-toolbar-v4`, `header-help-dropdown-v1`, `pause-grouped-levels-v4`):
 * шапка, нижний тулбар и пауза — полупрозрачные панели с тонкой золотой кромкой и мягким
 * свечением, кнопки — стеклянные круги в золотом ободке, пауза — жёлтый глянец. Первая версия
 * стандарта была плоской («по паузе хуйню отрисовал… и тулбар нижний плоский»), поэтому вид
 * собран здесь, в одном месте: шапка, тулбар, кнопки игры и пауза берут его отсюда, и
 * стандарт не расходится между ними. Цвета — только токены «Авроры» и цвета паузы.
 */
class AuroraGlass {
  AuroraGlass._();

  /// Золото кромки: в тёмной — тёплое светлое, в светлой — жёлтое паузы (на белом читается).
  static Color gold(bool dark) => dark ? GameColors.aurora(Brightness.dark).warning : GameShell.pauseYellow;

  /// Полупрозрачная заливка панели поверх фона.
  static Color fill(bool dark) {
    // Стекло подкрашено голубым «Авроры» (реф — синее стекло, не серое).
    final surface = auroraToken('surface', dark: dark)!;
    final tint = GameColors.aurora(dark ? Brightness.dark : Brightness.light).selected;
    return Color.lerp(surface, tint, dark ? 0.22 : 0.06)!.withValues(alpha: dark ? 0.78 : 0.9);
  }

  /// Панель: стекло, золотая кромка, мягкое свечение.
  static BoxDecoration panel(bool dark, {double radius = 18, bool glow = true}) => BoxDecoration(
        color: fill(dark),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: gold(dark).withValues(alpha: dark ? 0.85 : 0.9), width: 1.4),
        boxShadow: glow
            ? [
                BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.42 : 0.45), blurRadius: 22),
                BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.25 : 0.28), blurRadius: 5, spreadRadius: 0.8),
              ]
            : null,
      );

  /// Фон рамки: глубокий синий с голубым свечением сверху и тёплым снизу (реф — «боке»).
  static BoxDecoration backdrop(bool dark) {
    final colors = GameColors.aurora(dark ? Brightness.dark : Brightness.light);
    final background = auroraToken('background', dark: dark)!;
    return BoxDecoration(
      color: background,
      gradient: RadialGradient(
        center: const Alignment(0, -0.7),
        radius: 1.4,
        // Светлая — тёплый кремовый (реф), тёмная — глубокий синий с голубым сверху.
        colors: dark
            ? [colors.selected.withValues(alpha: 0.45), Color.lerp(background, colors.selected, 0.12)!, gold(dark).withValues(alpha: 0.14)]
            : [gold(dark).withValues(alpha: 0.16), Color.lerp(background, gold(dark), 0.06)!, gold(dark).withValues(alpha: 0.2)],
        stops: const [0, 0.65, 1],
      ),
    );
  }

  /// Круглая стеклянная кнопка в золотом ободке; [active] — залитая (включённый режим).
  static BoxDecoration ring(bool dark, {Color? active}) => BoxDecoration(
        shape: BoxShape.circle,
        color: active ?? fill(dark),
        gradient: active != null
            ? null
            : LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [auroraToken('raised', dark: dark)!.withValues(alpha: 0.95), fill(dark)],
              ),
        border: Border.all(color: active ?? gold(dark).withValues(alpha: dark ? 0.9 : 0.95), width: 1.6),
        boxShadow: [BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.3 : 0.3), blurRadius: 12)],
      );

  /// Жёлтая пауза — глянцевый круг со свечением.
  static BoxDecoration pause(bool dark) => BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [GameColors.auroraDark.warning, GameShell.pauseYellow],
        ),
        border: Border.all(color: gold(dark), width: 1.5),
        boxShadow: [BoxShadow(color: GameShell.pauseYellow.withValues(alpha: 0.5), blurRadius: 16)],
      );
}
