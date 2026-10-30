import 'package:flutter/material.dart';

import 'game_colors.dart';

/*
 * 🔴 ВИД ИГРОВОЙ РАМКИ — ПО РЕФУ CODEX 30.10, ОДИН НА ВСЕ ИГРЫ (стандарт игрового экрана).
 *
 * Рефы: `pause-grouped-levels-v4`, `sudoku-even-toolbar-v4`, `header-help-dropdown-v1`.
 * Денис 30.10: «по паузе хуйню отрисовал… тулбар нижний плоский… собрал в другой палитре и
 * другой вид по форме и геометрии… повтори сначала». Поэтому цвета — только [ChromePalette]
 * (снята с рефа по пикселям), а размеры — [ChromeMetrics] (сняты с рефа по сетке, 390 pt).
 * Шапка, счётчики, тулбар, кнопки игры и пауза берут вид отсюда — стандарт не расходится.
 */
class AuroraGlass {
  AuroraGlass._();

  static ChromePalette palette(bool dark) => ChromePalette.of(dark);

  /// Кромка.
  static Color gold(bool dark) => palette(dark).gold;

  /// Заливка стекла (для мест, где нужен один цвет).
  static Color fill(bool dark) => palette(dark).glass.withValues(alpha: dark ? 0.88 : 0.94);

  /// Панель: стекло сверху светлее, тонкая яркая золотая кромка, ореол.
  static BoxDecoration panel(bool dark, {double radius = 18, bool glow = true}) {
    final p = palette(dark);
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [p.glassTop.withValues(alpha: dark ? 0.82 : 0.96), p.glass.withValues(alpha: dark ? 0.9 : 0.94)],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: dark ? p.gold.withValues(alpha: 0.95) : p.gold, width: 1.5),
      boxShadow: glow
          ? [
              BoxShadow(color: p.gold.withValues(alpha: dark ? 0.38 : 0.45), blurRadius: 16),
              BoxShadow(color: p.goldSoft.withValues(alpha: dark ? 0.22 : 0.3), blurRadius: 3, spreadRadius: 0.5),
            ]
          : null,
    );
  }

  /// Круглая кнопка — стеклянный шар в золотом кольце; [active] — залитая (включённый режим).
  static BoxDecoration ring(bool dark, {Color? active}) {
    final p = palette(dark);
    return BoxDecoration(
      shape: BoxShape.circle,
      color: active,
      gradient: active != null
          ? null
          : RadialGradient(center: const Alignment(0, -0.5), radius: 0.95, colors: [p.ringFillTop, p.ringFill]),
      border: Border.all(color: active ?? p.gold, width: 2),
      boxShadow: [BoxShadow(color: p.gold.withValues(alpha: dark ? 0.4 : 0.45), blurRadius: 10)],
    );
  }

  /// Жёлтый глянец: «Пауза» и «Продолжить».
  static LinearGradient primaryGradient(bool dark) {
    final p = palette(dark);
    return LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [p.primaryTop, p.primaryBottom]);
  }

  /// Круг «Пауза».
  static BoxDecoration pause(bool dark) {
    final p = palette(dark);
    return BoxDecoration(
      shape: BoxShape.circle,
      gradient: primaryGradient(dark),
      border: Border.all(color: p.goldSoft, width: 2),
      boxShadow: [BoxShadow(color: p.primaryBottom.withValues(alpha: 0.6), blurRadius: 16)],
    );
  }

  /// Кнопка «Продолжить».
  static BoxDecoration primary(bool dark, {double radius = 18}) {
    final p = palette(dark);
    return BoxDecoration(
      gradient: primaryGradient(dark),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: p.goldSoft, width: 1.5),
      boxShadow: [BoxShadow(color: p.primaryBottom.withValues(alpha: 0.55), blurRadius: 18)],
    );
  }

  /// Фон рамки: тёмная — глубокий синий с голубым свечением, светлая — тёплый кремовый.
  static BoxDecoration backdrop(bool dark) {
    final p = palette(dark);
    return BoxDecoration(
      color: p.background,
      gradient: RadialGradient(
        center: const Alignment(0, -0.6),
        radius: 1.25,
        colors: [p.glow.withValues(alpha: 0.55), p.background, p.background],
        stops: const [0, 0.7, 1],
      ),
    );
  }
}

/// Размеры рамки — с рефа по сетке (экран 390 pt). На коротком экране — компактные: поле игры
/// не должно сжиматься до переполнения (реф: «если места мало — адаптивное решение»).
class ChromeMetrics {
  const ChromeMetrics._(this.compact);
  final bool compact;

  static ChromeMetrics of(BuildContext context) => ChromeMetrics._(MediaQuery.sizeOf(context).height < 760);

  double get headerHeight => compact ? 54 : 62;
  double get headerRing => compact ? 34 : 38;
  double get titleSize => compact ? 22 : 27;
  double get barCircle => compact ? 46 : 52;
  double get barLabel => compact ? 11 : 12.5;
  EdgeInsets get barPadding => compact ? const EdgeInsets.fromLTRB(4, 6, 4, 4) : const EdgeInsets.fromLTRB(6, 10, 6, 8);
}
