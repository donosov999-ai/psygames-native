import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_run/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_NR_UI');
  setUpAll(() async {
    if (capture && Platform.isMacOS) {
      for (final pair in [
        ('ReviewArial', '/System/Library/Fonts/Supplemental/Arial.ttf'),
        (
          'MaterialIcons',
          '/opt/homebrew/share/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
        ),
      ]) {
        await (FontLoader(pair.$1)..addFont(
              Future.value(File(pair.$2).readAsBytesSync().buffer.asByteData()),
            ))
            .load();
      }
    }
  });
  for (final width in [320.0, 360.0, 390.0, 430.0]) {
    for (final dark in [false, true]) {
      for (final lang in ['en', 'ru', 'ar']) {
        for (final scale in [1.0, 2.0]) {
          testWidgets('real NumberRunScreen $width dark=$dark $lang x$scale', (
            t,
          ) async {
            t.view
              ..devicePixelRatio = 1
              ..physicalSize = Size(width, 844);
            addTearDown(t.view.reset);
            SharedPreferences.setMockInitialValues({
              'language': lang,
              'psygames_active_profile': 'nzt48',
              '${SharedState.prefix}number_run_level_nzt48': '9',
              uiTemplateKey: UiTemplate.aurora.id,
            });
            final state = await SharedState.open();
            await L.load(lang);
            await t.pumpWidget(
              MaterialApp(
                theme:
                    appShellTheme(
                      state,
                      brightness: dark ? Brightness.dark : Brightness.light,
                    ).copyWith(
                      textTheme:
                          appShellTheme(
                            state,
                            brightness: dark
                                ? Brightness.dark
                                : Brightness.light,
                          ).textTheme.apply(
                            fontFamily: capture ? 'ReviewArial' : null,
                          ),
                    ),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: TextScaler.linear(scale)),
                  child: Directionality(
                    textDirection: lang == 'ar'
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    child: child!,
                  ),
                ),
                home: RepaintBoundary(
                  key: const Key('nr-review-capture'),
                  child: AuroraGameScope(
                    route: '/games/number-run',
                    child: NumberRunScreen(state: state, seed: 1),
                  ),
                ),
              ),
            );
            await t.pumpAndSettle();
            await t.ensureVisible(find.byKey(const Key('nr-start')));
            await t.tap(find.byKey(const Key('nr-start')));
            await t.pump();
            await t.pump(const Duration(milliseconds: 50));
            expect(t.takeException(), isNull);
            // UI-референс Кодекса v1.0 + Денис 11.11.2026: забег во весь экран — дорога занимает всё
            // поле, HUD лежит на ней сверху (не выше трети поля), пауза одна, плавающая внизу слева (прежнее место),
            // ряда кнопок полос нет.
            final field = t.getRect(find.byKey(const Key('game-field')));
            final road = t.getRect(find.byKey(const Key('nr-road')));
            final readout = t.getRect(
              find.byKey(const Key('nr-readout-viewport')),
            );
            expect(road.height, closeTo(field.height, 1), reason: 'дорога — всё поле');
            expect(readout.top, greaterThanOrEqualTo(field.top));
            expect(readout.height, lessThanOrEqualTo(field.height * .34 + 1e-6), reason: 'инфо не больше игры');
            expect(readout.left, greaterThanOrEqualTo(0));
            expect(readout.right, lessThanOrEqualTo(width));
            final pause = t.getRect(find.byKey(const Key('field-only-pause')));
            expect(pause.height, greaterThanOrEqualTo(48));
            expect(pause.bottom, lessThanOrEqualTo(844));
            expect(pause.left, lessThan(width * .25), reason: 'пауза — на прежнем месте, внизу слева');
            for (final key in ['nr-steer-left', 'nr-steer-center', 'nr-steer-right']) {
              expect(find.byKey(Key(key)), findsNothing, reason: 'ряда кнопок полос нет — только пауза');
            }
            if (const bool.fromEnvironment('CAPTURE_NR_UI') &&
                width == 390 &&
                lang == 'en' &&
                scale == 1) {
              final boundary = t.renderObject<RenderRepaintBoundary>(
                find.byKey(const Key('nr-review-capture')),
              );
              await t.runAsync(() async {
                final image = await boundary.toImage(pixelRatio: 2);
                final png = await image.toByteData(
                  format: ui.ImageByteFormat.png,
                );
                final dir = Directory('test/preview')
                  ..createSync(recursive: true);
                File(
                  '${dir.path}/number-run-${dark ? 'dark' : 'light'}-390.png',
                ).writeAsBytesSync(png!.buffer.asUint8List());
                image.dispose();
              });
            }
            await t.pumpWidget(const SizedBox());
            await t.pump();
          });
        }
      }
    }
  }
}
