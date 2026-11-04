import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/chrome_art.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/pilot_liquid_surface.dart';
import 'package:psygames_flutter/shell/section_header_surface.dart';

void main() {
  for (final dark in [true, false]) {
    for (final width in [320.0, 390.0]) {
      testWidgets('9-slice ${dark ? 'dark' : 'light'} $width, long RTL/large text grows without overflow', (t) async {
        t.view.physicalSize = Size(width, 600) * 2;
        t.view.devicePixelRatio = 2;
        addTearDown(t.view.reset);
        final theme = applyUiTemplate(classicShellTheme(dark ? Brightness.dark : Brightness.light), UiTemplate.aurora);
        await t.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2), disableAnimations: true),
          child: const Directionality(textDirection: TextDirection.rtl, child: SectionHeaderSurface(
            child: Padding(padding: EdgeInsets.all(16), child: Text('Training progress — long translated section title', style: TextStyle(fontSize: 24))),
          )),
        ))));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        expect(t.getSize(find.byKey(const ValueKey('section-header-surface'))).height, greaterThanOrEqualTo(104));
        for (final image in [ChromeArt.header(dark), ChromeArt.footer(dark), ChromeArt.action]) {
          expect(image.centerSlice, isNotNull);
          expect(image.fit, BoxFit.fill);
        }
        expect(find.byType(PilotLiquidSurface), findsOneWidget);
      });
    }
  }
  testWidgets('Classic remains unwrapped', (t) async {
    await t.pumpWidget(MaterialApp(theme: applyUiTemplate(classicShellTheme(Brightness.light), UiTemplate.classic),
      home: const SectionHeaderSurface(child: Text('Classic'))));
    expect(find.byKey(const ValueKey('section-header-surface')), findsNothing);
    expect(find.text('Classic'), findsOneWidget);
  });
}
