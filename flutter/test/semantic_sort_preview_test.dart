import 'dart:io';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/semantic_sort/basket_field.dart';
import 'package:psygames_flutter/games/semantic_sort/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'semantic_basket_screen_test.dart' show basketVocab;

void main() {
  const capture = bool.fromEnvironment('CAPTURE_WORD_SORT');
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
  tearDown(GamePreset.clear);
  for (final dark in [true, false]) {
    for (final width in [320.0, 390.0, 1024.0]) {
      for (final config in [
        (locale: 'en', scale: 1.0, cats: 2),
        (locale: 'ar', scale: 1.0, cats: 4),
        for (final locale in L.locales) (locale: locale, scale: 2.0, cats: 4),
      ]) {
        testWidgets(
          'real field $width dark=$dark ${config.locale} x${config.scale} cats=${config.cats}',
          (t) async {
            t.view.physicalSize = Size(
              width * 2,
              (width == 320 ? 640 : 844) * 2,
            );
            t.view.devicePixelRatio = 2;
            addTearDown(t.view.reset);
            SharedPreferences.setMockInitialValues({
              'language': config.locale,
              'psygames_active_profile': 'nzt48',
              uiTemplateKey: UiTemplate.aurora.id,
            });
            final state = await SharedState.open();
            await L.load(config.locale);
            GamePreset.set({
              'wu': '1',
              'mode': 'baskets',
              'targetLang': 'en',
              'cats': '${config.cats}',
              'rounds': '8',
            });
            final vocab = [
              ...basketVocab,
              for (final w
                  in config.cats > 2 ? ['cat', 'dog', 'cow'] : <String>[])
                {'en': w, 'cat': 'animals'},
              for (final w
                  in config.cats > 2 ? ['bread', 'milk', 'egg'] : <String>[])
                {'en': w, 'cat': 'food'},
            ];
            final brightness = dark ? Brightness.dark : Brightness.light;
            var theme = appShellTheme(state, brightness: brightness);
            if (capture) {
              theme = theme.copyWith(
                textTheme: theme.textTheme.apply(fontFamily: 'ReviewArial'),
              );
            }
            final boundary = GlobalKey();
            await t.pumpWidget(
              MaterialApp(
                theme: theme,
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: TextScaler.linear(config.scale)),
                  child: Directionality(
                    textDirection: config.locale == 'ar'
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    child: child!,
                  ),
                ),
                home: RepaintBoundary(
                  key: boundary,
                  child: AuroraGameScope(
                    route: '/games/semantic-sort',
                    child: RestartScope(
                      builder: (_) => SemanticSortScreen(
                        state: state,
                        random: () => .4,
                        vocabOverride: vocab,
                        distractorsOverride: const {},
                      ),
                    ),
                  ),
                ),
              ),
            );
            await t.pumpAndSettle();
            expect(t.takeException(), isNull);
            final field = t.widget<SemanticBasketField>(
              find.byType(SemanticBasketField),
            );
            for (final cat in field.party.rounds.first.cats) {
              final target = t.getRect(find.byKey(Key('semantic-basket-$cat')));
              expect(target.width, greaterThanOrEqualTo(48));
              // Global-coordinate subtraction can produce 47.99999999999994.
              expect(target.height + 1e-6, greaterThanOrEqualTo(48));
              expect(
                target.bottom,
                lessThanOrEqualTo(width == 320 ? 640 : 844),
              );
            }
            if (capture && config.locale == 'en' && config.scale == 1 && width == 390) {
              final fieldRect = t.getRect(find.byKey(const Key('game-field')));
              final render =
                  boundary.currentContext!.findRenderObject()
                      as RenderRepaintBoundary;
              await t.runAsync(() async {
                final image = await render.toImage(pixelRatio: 2);
                final png = await image.toByteData(
                  format: ui.ImageByteFormat.png,
                );
                final out = File(
                  'test/preview/word-sort-${dark ? 'dark' : 'light'}-390.png',
                );
                await out.parent.create(recursive: true);
                await out.writeAsBytes(png!.buffer.asUint8List());
                await File(
                  'test/preview/word-sort-${dark ? 'dark' : 'light'}-390.layout.json',
                ).writeAsString(
                  jsonEncode({
                    'pixelRatio': 2,
                    'fixture': true,
                    'field': [
                      fieldRect.left,
                      fieldRect.top,
                      fieldRect.right,
                      fieldRect.bottom,
                    ],
                  }),
                );
                image.dispose();
              });
            }
            await t.pumpWidget(const SizedBox());
            await t.pumpAndSettle();
          },
        );
      }
    }
  }
}
