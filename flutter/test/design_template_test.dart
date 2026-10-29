import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/design_template.dart';

double contrast(Color foreground, Color background) {
  final a = foreground.computeLuminance();
  final b = background.computeLuminance();
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
}

class _GameColors extends ThemeExtension<_GameColors> {
  const _GameColors(this.board);

  final Color board;

  @override
  _GameColors copyWith({Color? board}) => _GameColors(board ?? this.board);

  @override
  _GameColors lerp(covariant _GameColors? other, double t) => this;
}

class _OtherExtension extends ThemeExtension<_OtherExtension> {
  const _OtherExtension();

  @override
  _OtherExtension copyWith() => this;

  @override
  _OtherExtension lerp(covariant _OtherExtension? other, double t) => this;
}

void main() {
  test('stable IDs and storage key are separate from the theme override', () {
    expect(uiTemplateKey, 'psygames_ui_template_id');
    expect(UiTemplate.classic.id, 'classic_v1');
    expect(UiTemplate.aurora.id, 'aurora_v1');
    for (final template in UiTemplate.values) {
      expect(parseUiTemplate(template.id), template);
    }
  });

  test('missing, invalid and future IDs fall back to classic', () {
    for (final id in [
      null,
      '',
      'unknown_v2',
      'aurora',
      'AURORA_V1',
      ' aurora_v1',
    ]) {
      expect(parseUiTemplate(id), UiTemplate.classic, reason: '$id');
    }
  });

  for (final brightness in Brightness.values) {
    final dark = brightness == Brightness.dark;
    final background = Color(dark ? 0xFF071823 : 0xFFF7F9FC);
    final surface = Color(dark ? 0xFF102734 : 0xFFFFFFFF);
    final raised = Color(dark ? 0xFF173442 : 0xFFEFF5FA);
    final border = Color(dark ? 0xFF345564 : 0xFFCEDDE8);
    final text = Color(dark ? 0xFFF4F7FA : 0xFF152A38);
    final secondaryText = Color(dark ? 0xFFB7CAD6 : 0xFF526577);
    ThemeData baseTheme() => ThemeData(
      brightness: brightness,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF7F7FD5),
        brightness: brightness,
      ).copyWith(primary: const Color(0xFFFFA34C)),
    );

    group(brightness.name, () {
      test('classic returns the identical base object', () {
        final base = baseTheme();
        expect(applyUiTemplate(base, UiTemplate.classic), same(base));
      });

      test('Aurora maps the reference surfaces, borders and readable text', () {
        final base = baseTheme();
        final theme = applyUiTemplate(base, UiTemplate.aurora);
        expect(theme.brightness, brightness);
        expect(theme.scaffoldBackgroundColor, background);
        expect(theme.canvasColor, surface);
        expect(theme.colorScheme.surface, surface);
        expect(theme.colorScheme.surfaceContainer, raised);
        expect(theme.colorScheme.surfaceContainerLowest, background);
        expect(theme.colorScheme.outline, border);
        expect(theme.dividerColor, border);
        expect(theme.colorScheme.onSurface, text);
        expect(theme.colorScheme.onSurfaceVariant, secondaryText);
        expect(theme.textTheme.bodyLarge?.color, text);
        expect(theme.textTheme.headlineSmall?.color, text);
        expect(contrast(text, surface), greaterThanOrEqualTo(4.5));
        expect(contrast(secondaryText, raised), greaterThanOrEqualTo(4.5));
        expect(base.scaffoldBackgroundColor, isNot(background));
        expect(base.colorScheme.onPrimary, isNot(theme.colorScheme.onPrimary));
      });

      test('all existing extensions and non-surface color roles survive', () {
        const game = _GameColors(Color(0xFF224466));
        const other = _OtherExtension();
        final base = baseTheme().copyWith(extensions: [game, other]);
        final theme = applyUiTemplate(base, UiTemplate.aurora);
        expect(theme.extension<_GameColors>(), same(game));
        expect(theme.extension<_OtherExtension>(), same(other));
        // +2: метка шаблона и смысловые цвета игр «Авроры» (GameColors).
        expect(theme.extensions.length, base.extensions.length + 2);
        expect(theme.extension<UiTemplateTheme>()?.template, UiTemplate.aurora);
        expect(theme.colorScheme.primary, base.colorScheme.primary);
        expect(
          theme.colorScheme.primaryContainer,
          base.colorScheme.primaryContainer,
        );
        expect(theme.colorScheme.secondary, base.colorScheme.secondary);
        expect(theme.colorScheme.onSecondary, base.colorScheme.onSecondary);
        expect(
          theme.colorScheme.secondaryContainer,
          base.colorScheme.secondaryContainer,
        );
        expect(theme.colorScheme.tertiary, base.colorScheme.tertiary);
        expect(theme.colorScheme.error, base.colorScheme.error);
        expect(theme.colorScheme.onError, base.colorScheme.onError);
      });

      for (final accent in [
        Colors.black,
        Colors.white,
        Color(0xFFFFA34C),
        Color(0xFF0A84FF),
        Color(0xFF808080),
        Color(0x800A84FF),
      ]) {
        test('preserves accent $accent and computes contrasting onPrimary', () {
          final base = baseTheme().copyWith(
            colorScheme: baseTheme().colorScheme.copyWith(primary: accent),
          );
          final theme = applyUiTemplate(base, UiTemplate.aurora);
          expect(theme.colorScheme.primary, accent);
          expect(
            contrast(
              theme.colorScheme.onPrimary,
              Color.alphaBlend(accent, surface),
            ),
            greaterThanOrEqualTo(4.5),
          );
        });
      }

      test(
        'buttons, fields and controls use Aurora without losing disabled state',
        () {
          final base = baseTheme();
          final theme = applyUiTemplate(base, UiTemplate.aurora);
          const selected = {WidgetState.selected};
          const disabled = {WidgetState.disabled, WidgetState.selected};
          for (final style in [
            theme.filledButtonTheme.style!,
            theme.elevatedButtonTheme.style!,
          ]) {
            expect(
              style.backgroundColor!.resolve({}),
              base.colorScheme.primary,
            );
            expect(
              style.foregroundColor!.resolve({}),
              theme.colorScheme.onPrimary,
            );
            expect(
              style.minimumSize!.resolve({})!.height,
              greaterThanOrEqualTo(48),
            );
            expect(
              style.backgroundColor!.resolve(disabled),
              isNot(base.colorScheme.primary),
            );
          }
          expect(
            theme.textButtonTheme.style!.foregroundColor!.resolve({}),
            text,
          );
          expect(
            theme.outlinedButtonTheme.style!.side!.resolve({})!.color,
            border,
          );
          expect(theme.inputDecorationTheme.fillColor, raised);
          expect(
            theme.inputDecorationTheme.enabledBorder!.borderSide.color,
            border,
          );
          expect(
            theme.inputDecorationTheme.focusedBorder!.borderSide.color,
            base.colorScheme.primary,
          );
          expect(
            theme.checkboxTheme.fillColor!.resolve(selected),
            base.colorScheme.primary,
          );
          expect(
            theme.checkboxTheme.checkColor!.resolve(selected),
            theme.colorScheme.onPrimary,
          );
          expect(
            theme.checkboxTheme.fillColor!.resolve({}),
            Colors.transparent,
          );
          expect(
            theme.checkboxTheme.fillColor!.resolve(disabled),
            isNot(base.colorScheme.primary),
          );
          expect(
            theme.checkboxTheme.fillColor!.resolve({WidgetState.error}),
            base.colorScheme.error,
          );
          expect(
            theme.checkboxTheme.checkColor!.resolve({WidgetState.error}),
            base.colorScheme.onError,
          );
          expect(
            theme.radioTheme.fillColor!.resolve(selected),
            base.colorScheme.primary,
          );
          expect(
            theme.switchTheme.trackColor!.resolve(selected),
            base.colorScheme.primary,
          );
          expect(
            theme.switchTheme.thumbColor!.resolve(selected),
            theme.colorScheme.onPrimary,
          );
          expect(theme.switchTheme.trackColor!.resolve({}), raised);
          expect(theme.sliderTheme.thumbColor, base.colorScheme.primary);
          expect(theme.progressIndicatorTheme.color, base.colorScheme.primary);
        },
      );

      test(
        'retains base typography, behavior, motion and component settings',
        () {
          const disabledColor = Color(0xFF999999);
          final base = baseTheme().copyWith(
            visualDensity: VisualDensity.comfortable,
            materialTapTargetSize: MaterialTapTargetSize.padded,
            splashFactory: NoSplash.splashFactory,
            textTheme: baseTheme().textTheme.copyWith(
              bodyLarge: const TextStyle(
                fontSize: 21,
                fontFamily: 'custom',
                height: 1.7,
              ),
            ),
            filledButtonTheme: FilledButtonThemeData(
              style: ButtonStyle(
                animationDuration: Duration.zero,
                padding: const WidgetStatePropertyAll(EdgeInsets.all(20)),
                minimumSize: const WidgetStatePropertyAll(Size(140, 60)),
                foregroundColor: WidgetStateProperty.resolveWith(
                  (states) => states.contains(WidgetState.disabled)
                      ? disabledColor
                      : null,
                ),
              ),
            ),
            checkboxTheme: const CheckboxThemeData(
              splashRadius: 0,
              fillColor: WidgetStatePropertyAll(disabledColor),
            ),
          );
          final theme = applyUiTemplate(base, UiTemplate.aurora);
          expect(theme.pageTransitionsTheme, same(base.pageTransitionsTheme));
          expect(theme.splashFactory, same(base.splashFactory));
          expect(theme.visualDensity, base.visualDensity);
          expect(theme.materialTapTargetSize, base.materialTapTargetSize);
          expect(theme.platform, base.platform);
          expect(theme.textTheme.bodyLarge?.fontSize, 21);
          expect(theme.textTheme.bodyLarge?.fontFamily, 'custom');
          expect(theme.textTheme.bodyLarge?.height, 1.7);
          final style = theme.filledButtonTheme.style!;
          expect(style.animationDuration, Duration.zero);
          expect(style.minimumSize!.resolve({}), const Size(140, 60));
          expect(style.padding!.resolve({}), const EdgeInsets.all(20));
          expect(
            style.foregroundColor!.resolve({WidgetState.disabled}),
            disabledColor,
          );
          expect(theme.checkboxTheme.splashRadius, 0);
          expect(
            theme.checkboxTheme.fillColor!.resolve({WidgetState.disabled}),
            disabledColor,
          );
        },
      );
    });
  }

  testWidgets('Aurora leaves ambient accessibility and reduced motion intact', (
    tester,
  ) async {
    const media = MediaQueryData(
      disableAnimations: true,
      accessibleNavigation: true,
      boldText: true,
      textScaler: TextScaler.linear(2),
    );
    await tester.pumpWidget(
      MediaQuery(
        data: media,
        child: Theme(
          data: applyUiTemplate(ThemeData(), UiTemplate.aurora),
          child: Builder(
            builder: (context) {
              expect(MediaQuery.of(context), media);
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
  });
}
