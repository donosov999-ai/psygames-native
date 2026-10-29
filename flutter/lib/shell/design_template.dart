import 'package:flutter/material.dart';

import 'game_colors.dart';

/// Storage is owned by the shell, not by this theme transformation.
const uiTemplateKey = 'psygames_ui_template_id';

enum UiTemplate {
  classic('classic_v1'),
  aurora('aurora_v1');

  const UiTemplate(this.id);

  final String id;
}

/// Unknown IDs fall back without rewriting the stored value.
UiTemplate parseUiTemplate(String? id) => switch (id) {
  'aurora_v1' => UiTemplate.aurora,
  _ => UiTemplate.classic,
};

/// Shared shell tokens. Profile/cosmetic accents are deliberately not included.
Color? auroraToken(String name, {required bool dark}) => switch (name) {
  'background' => Color(dark ? 0xFF071823 : 0xFFF7F9FC),
  'surface' || 'card' => Color(dark ? 0xFF102734 : 0xFFFFFFFF),
  'raised' => Color(dark ? 0xFF173442 : 0xFFEFF5FA),
  'border' => Color(dark ? 0xFF345564 : 0xFFCEDDE8),
  'text' => Color(dark ? 0xFFF4F7FA : 0xFF152A38),
  'textSecondary' => Color(dark ? 0xFFB7CAD6 : 0xFF526577),
  _ => null,
};

/// A context-local marker for shell widgets that consume explicit WebColors.
class UiTemplateTheme extends ThemeExtension<UiTemplateTheme> {
  const UiTemplateTheme(this.template);
  final UiTemplate template;

  @override
  UiTemplateTheme copyWith({UiTemplate? template}) =>
      UiTemplateTheme(template ?? this.template);

  @override
  UiTemplateTheme lerp(covariant UiTemplateTheme? other, double t) =>
      other != null && t >= 0.5 ? other : this;
}

/// Applies only shell styling. Game painters and semantic game colors remain
/// owned by their existing widgets. Classic is an identity-preserving rollback.
ThemeData applyUiTemplate(ThemeData base, UiTemplate template) {
  if (template == UiTemplate.classic) return base;

  final dark = base.brightness == Brightness.dark;
  final background = auroraToken('background', dark: dark)!;
  final surface = auroraToken('surface', dark: dark)!;
  final raised = auroraToken('raised', dark: dark)!;
  final border = auroraToken('border', dark: dark)!;
  final text = auroraToken('text', dark: dark)!;
  final secondaryText = auroraToken('textSecondary', dark: dark)!;
  final accent = base.colorScheme.primary;
  // For translucent supplied accents, contrast is measured on the actual surface.
  final paintedAccent = Color.alphaBlend(accent, surface);
  final luminance = paintedAccent.computeLuminance();
  final blackContrast = (luminance + 0.05) / 0.05;
  final whiteContrast = 1.05 / (luminance + 0.05);
  final onAccent = blackContrast >= whiteContrast ? Colors.black : Colors.white;
  final scheme = base.colorScheme.copyWith(
    onPrimary: onAccent,
    surface: surface,
    onSurface: text,
    onSurfaceVariant: secondaryText,
    surfaceDim: background,
    surfaceBright: raised,
    surfaceContainerLowest: background,
    surfaceContainerLow: surface,
    surfaceContainer: raised,
    surfaceContainerHigh: raised,
    surfaceContainerHighest: raised,
    outline: border,
    outlineVariant: border,
    inverseSurface: text,
    onInverseSurface: surface,
    surfaceTint: Colors.transparent,
  );
  final textTheme = base.textTheme.apply(bodyColor: text, displayColor: text);
  final buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(12),
  );

  ButtonStyle buttonStyle(ButtonStyle? original, {required bool filled}) {
    final minimumSize = original?.minimumSize;
    final aurora = ButtonStyle(
      minimumSize: WidgetStateProperty.resolveWith((states) {
        final size = minimumSize?.resolve(states) ?? const Size(0, 48);
        return Size(size.width, size.height < 48 ? 48 : size.height);
      }),
      shape: WidgetStatePropertyAll(buttonShape),
      backgroundColor: filled
          ? WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.disabled)) {
                return original?.backgroundColor?.resolve(states) ??
                    text.withValues(alpha: 0.12);
              }
              return accent;
            })
          : null,
      foregroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return original?.foregroundColor?.resolve(states) ??
              text.withValues(alpha: 0.38);
        }
        // Unfilled actions need contrast against the surface, not the accent.
        return filled ? onAccent : text;
      }),
      surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
    );
    return (original ?? const ButtonStyle()).merge(aurora);
  }

  WidgetStateProperty<Color?> controlColor(
    Color selected,
    Color unselected,
    WidgetStateProperty<Color?>? original, {
    Color? errorColor,
  }) => WidgetStateProperty.resolveWith((states) {
    if (states.contains(WidgetState.disabled)) {
      return original?.resolve(states) ?? text.withValues(alpha: 0.38);
    }
    if (states.contains(WidgetState.error)) return errorColor ?? scheme.error;
    return states.contains(WidgetState.selected) ? selected : unselected;
  });

  final fieldBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: border),
  );

  // copyWith retains extensions, typography metrics, density, platform behavior,
  // transitions and splash settings. No animation or MediaQuery override is added.
  return base.copyWith(
    extensions: [
      ...base.extensions.values.where((e) => e is! UiTemplateTheme && e is! GameColors),
      UiTemplateTheme(template),
      // Смысловые цвета игр «Авроры» (`game_colors.dart`). Игры, ещё не переведённые, их не видят:
      // `AuroraGameScope` рисует их в classic-теме без расширения, где `GameColors.of` = Classic.
      GameColors.aurora(base.brightness),
    ],
    colorScheme: scheme,
    scaffoldBackgroundColor: background,
    canvasColor: surface,
    cardColor: surface,
    dividerColor: border,
    disabledColor: text.withValues(alpha: 0.38),
    textTheme: textTheme,
    iconTheme: base.iconTheme.copyWith(color: text),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: background,
      foregroundColor: text,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: (base.appBarTheme.titleTextStyle ?? textTheme.titleLarge)
          ?.copyWith(color: text),
      toolbarTextStyle:
          (base.appBarTheme.toolbarTextStyle ?? textTheme.bodyMedium)?.copyWith(
            color: text,
          ),
      iconTheme: (base.appBarTheme.iconTheme ?? base.iconTheme).copyWith(
        color: text,
      ),
      actionsIconTheme: (base.appBarTheme.actionsIconTheme ?? base.iconTheme)
          .copyWith(color: text),
    ),
    cardTheme: base.cardTheme.copyWith(
      color: surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: border),
      ),
    ),
    dialogTheme: base.dialogTheme.copyWith(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle:
          (base.dialogTheme.titleTextStyle ?? textTheme.headlineSmall)
              ?.copyWith(color: text),
      contentTextStyle:
          (base.dialogTheme.contentTextStyle ?? textTheme.bodyMedium)?.copyWith(
            color: text,
          ),
    ),
    bottomSheetTheme: base.bottomSheetTheme.copyWith(
      backgroundColor: surface,
      modalBackgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: border),
      ),
    ),
    dividerTheme: base.dividerTheme.copyWith(color: border),
    listTileTheme: base.listTileTheme.copyWith(
      textColor: text,
      iconColor: secondaryText,
      selectedColor: text,
      selectedTileColor: raised,
    ),
    navigationBarTheme: base.navigationBarTheme.copyWith(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: raised,
      iconTheme: WidgetStatePropertyAll(base.iconTheme.copyWith(color: text)),
      labelTextStyle: WidgetStatePropertyAll(
        (textTheme.labelMedium ?? const TextStyle()).copyWith(color: text),
      ),
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      filled: true,
      fillColor: raised,
      labelStyle: (base.inputDecorationTheme.labelStyle ?? const TextStyle())
          .copyWith(color: secondaryText),
      hintStyle: (base.inputDecorationTheme.hintStyle ?? const TextStyle())
          .copyWith(color: secondaryText),
      border: fieldBorder,
      enabledBorder: fieldBorder,
      disabledBorder: fieldBorder,
      focusedBorder: fieldBorder.copyWith(
        borderSide: BorderSide(color: accent, width: 2),
      ),
      errorBorder: fieldBorder.copyWith(
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: fieldBorder.copyWith(
        borderSide: BorderSide(color: scheme.error, width: 2),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: buttonStyle(base.elevatedButtonTheme.style, filled: true),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: buttonStyle(base.filledButtonTheme.style, filled: true),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: buttonStyle(
        base.outlinedButtonTheme.style,
        filled: false,
      ).copyWith(side: WidgetStatePropertyAll(BorderSide(color: border))),
    ),
    textButtonTheme: TextButtonThemeData(
      style: buttonStyle(base.textButtonTheme.style, filled: false),
    ),
    checkboxTheme: base.checkboxTheme.copyWith(
      fillColor: controlColor(
        accent,
        Colors.transparent,
        base.checkboxTheme.fillColor,
      ),
      checkColor: controlColor(
        onAccent,
        onAccent,
        base.checkboxTheme.checkColor,
        errorColor: scheme.onError,
      ),
      side: WidgetStateBorderSide.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return BorderSide.none;
        return BorderSide(
          color: states.contains(WidgetState.error) ? scheme.error : border,
          width: 2,
        );
      }),
    ),
    radioTheme: base.radioTheme.copyWith(
      fillColor: controlColor(accent, secondaryText, base.radioTheme.fillColor),
    ),
    switchTheme: base.switchTheme.copyWith(
      trackColor: controlColor(accent, raised, base.switchTheme.trackColor),
      thumbColor: controlColor(
        onAccent,
        secondaryText,
        base.switchTheme.thumbColor,
      ),
      trackOutlineColor: controlColor(
        Colors.transparent,
        border,
        base.switchTheme.trackOutlineColor,
      ),
    ),
    sliderTheme: base.sliderTheme.copyWith(
      activeTrackColor: accent,
      inactiveTrackColor: border,
      thumbColor: accent,
      valueIndicatorColor: accent,
      valueIndicatorTextStyle:
          (base.sliderTheme.valueIndicatorTextStyle ?? textTheme.labelLarge)
              ?.copyWith(color: onAccent),
    ),
    progressIndicatorTheme: base.progressIndicatorTheme.copyWith(
      color: accent,
      linearTrackColor: raised,
      circularTrackColor: raised,
    ),
  );
}
