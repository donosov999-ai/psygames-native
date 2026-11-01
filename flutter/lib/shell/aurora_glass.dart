import 'package:flutter/material.dart';

import 'game_colors.dart';

/*
 * 🔴 ВИД ИГРОВОЙ РАМКИ — ПИЛОТ CODEX «СТЕКЛО И КАМНИ» (31.10), ОДИН НА ВСЕ ИГРЫ (стандарт игрового экрана).
 * Денис 31.10: «мы делали пилот нового дизайна, красивого, чего тебе не удавалось достичь» — вид
 * перенесён из пилота (подложки, текстуры, фон, кнопки-шары), функции и размеры — стандарта.
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

  static const _dir = 'assets/aurora_game_chrome';

  /// Кромка (золото пилота Codex 31.10).
  static Color gold(bool dark) => palette(dark).gold;

  /// Заливка стекла одним цветом.
  static Color fill(bool dark) => dark ? ChromePilot.fillDark : ChromePilot.fillLight;

  /*
   * Подложка шапки и нижнего ряда — пилот Codex «стекло и камни» (31.10, выбор Дениса): нарисованное
   * стекло `*_chrome_glass` поверх градиента, тонкая золотая кромка, ореол и тень. Без нарисованной
   * внутренней кромки: растянутая, она попадала на подписи нижнего ряда.
   */
  static BoxDecoration chrome(bool dark, {double radius = 22, bool glow = true}) => BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        image: DecorationImage(
          image: AssetImage('$_dir/${dark ? 'dark' : 'light'}_chrome_glass.webp'),
          fit: BoxFit.fill,
          opacity: 0.78,
        ),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark ? ChromePilot.chromeDark : ChromePilot.chromeLight,
          stops: const [0, 0.16, 0.7, 1],
        ),
        border: Border.all(color: gold(dark), width: 1.35),
        boxShadow: glow ? [
          BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.32 : 0.22), blurRadius: 13),
          const BoxShadow(color: ChromePilot.shadow, blurRadius: 10, offset: Offset(0, 4)),
        ] : null,
      );

  /// Панель (пауза, меню): стекло с переливом, на крупных тёмных — текстура `dark_panel`, кромка, ореол.
  static BoxDecoration panel(bool dark, {double radius = 18, bool glow = true, bool textured = true}) => BoxDecoration(
        image: dark && radius >= 20 && textured
            ? const DecorationImage(image: AssetImage('$_dir/dark_panel.webp'), fit: BoxFit.cover)
            : null,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark ? ChromePilot.panelDark : ChromePilot.panelLight,
          stops: const [0, 0.14, 0.55, 1],
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: gold(dark).withValues(alpha: dark ? 0.85 : 0.9), width: 1.4),
        boxShadow: glow
            ? [
                BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.42 : 0.45), blurRadius: 22),
                BoxShadow(color: gold(dark).withValues(alpha: dark ? 0.25 : 0.28), blurRadius: 5, spreadRadius: 0.8),
              ]
            : null,
      );

  /// Круглая кнопка: в тёмной — нарисованный стеклянный шар, в светлой — перламутр в золоте;
  /// [active] — залитая (включённый режим).
  static BoxDecoration ring(bool dark, {Color? active}) => BoxDecoration(
        shape: BoxShape.circle,
        image: dark && active == null
            ? const DecorationImage(image: AssetImage('$_dir/dark_round_button.webp'), fit: BoxFit.contain)
            : null,
        color: dark && active == null ? Colors.transparent : active,
        gradient: active != null || dark
            ? null
            : const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: ChromePilot.ringLight),
        border: dark && active == null ? null : Border.all(color: active ?? gold(dark).withValues(alpha: 0.95), width: 1.6),
        boxShadow: [BoxShadow(color: gold(dark).withValues(alpha: 0.3), blurRadius: 12)],
      );

  /// Жёлтый глянец: «Пауза» и «Продолжить».
  static LinearGradient primaryGradient(bool dark) {
    final p = palette(dark);
    return LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [p.primaryTop, p.primaryBottom]);
  }

  /// Круг «Пауза» (если у игры нет нарисованного камня).
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
      // Та же толщина, что у [panel] (1.4): «Заново» и «Продолжить» в одном ряду одной высоты.
      border: Border.all(color: p.goldSoft, width: 1.4),
      boxShadow: [BoxShadow(color: p.primaryBottom.withValues(alpha: 0.55), blurRadius: 18)],
    );
  }

  /// Фон рамки: тёмная — боке (картинка), светлая — кремовый; [lightPilot] — переливы PrismaLoop
  /// (пока только Судоку: прозрачное поле, контраст проверен).
  static BoxDecoration backdrop(bool dark, {bool lightPilot = false}) => BoxDecoration(
        image: dark
            ? const DecorationImage(image: AssetImage('$_dir/dark_bokeh.webp'), fit: BoxFit.cover)
            : lightPilot
                ? const DecorationImage(image: AssetImage('$_dir/light_prismaloop.webp'), fit: BoxFit.cover)
                : null,
        gradient: RadialGradient(
          center: const Alignment(0, -0.85),
          radius: 1.25,
          colors: dark ? ChromePilot.backdropDark : ChromePilot.backdropLight,
          stops: const [0, 0.65, 1],
        ),
      );
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

  /// Круг кнопки нижнего ряда по ширине колонки: крупнее, где помещается (пилот Codex — до 62),
  /// на узком экране меньше, подпись кромки не касается.
  double circleFor(double columnWidth) => (columnWidth - 6).clamp(36.0, compact ? 50.0 : 62.0);
  double get barLabel => compact ? 11 : 12.5;
  EdgeInsets get barPadding => compact ? const EdgeInsets.fromLTRB(4, 6, 4, 4) : const EdgeInsets.fromLTRB(6, 10, 6, 8);
}
