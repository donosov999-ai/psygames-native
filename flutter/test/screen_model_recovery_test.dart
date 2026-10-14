import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_model_recovery.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('recovery copy exists in all 12 bundled dictionaries', () async {
    for (final locale in L.locales) {
      await L.load(locale);
      for (final key in [
        'nativeScreenModelFailed',
        'nativeScreenModelRetryHint',
        'retry',
        'goHome',
      ]) {
        expect(L.has(key), isTrue, reason: '$locale/$key');
        expect(L.t(key), isNotEmpty, reason: '$locale/$key');
        expect(L.t(key), isNot(key), reason: '$locale/$key');
      }
      if (locale != 'en') {
        expect(
          L.t('nativeScreenModelFailed'),
          isNot('Could not load screen data'),
        );
      }
    }
  });

  for (final locale in ['ru', 'en', 'ar']) {
    for (final brightness in Brightness.values) {
      testWidgets(
        'recovery controls usable at 320×568, text 2×: $locale/$brightness',
        (t) async {
          await L.load(locale);
          t.view.physicalSize = const Size(320, 568);
          t.view.devicePixelRatio = 1;
          addTearDown(t.view.reset);
          var retries = 0;
          var homes = 0;
          await t.pumpWidget(
            MaterialApp(
              theme: ThemeData(brightness: brightness),
              home: MediaQuery(
                data: const MediaQueryData(
                  size: Size(320, 568),
                  textScaler: TextScaler.linear(2),
                ),
                child: ScreenModelRecovery(
                  failed: true,
                  onRetry: () => retries++,
                  onHome: () => homes++,
                ),
              ),
            ),
          );
          await t.pump();
          expect(t.takeException(), isNull);
          await t.ensureVisible(
            find.byKey(const ValueKey('screen-model-retry')),
          );
          await t.tap(find.byKey(const ValueKey('screen-model-retry')));
          await t.ensureVisible(
            find.byKey(const ValueKey('screen-model-home')),
          );
          await t.tap(find.byKey(const ValueKey('screen-model-home')));
          expect(retries, 1);
          expect(homes, 1);
          expect(t.takeException(), isNull);
        },
      );
    }
  }
}
