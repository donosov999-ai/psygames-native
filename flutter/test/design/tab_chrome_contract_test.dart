import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/tab_chrome.dart';
import 'package:psygames_flutter/shell/pilot_press_response.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';

void main() {
  final host = Object();
  const routes = ['/', '/games', '/warmup-picker', '/statistics', '/pet'];
  const keys = ['home', 'tabGames', 'warmupPickerTitle', 'progress', 'tabPet'];
  tearDown(() => TabChromeHost.unbind(host));
  for (final b in Brightness.values) {
    for (final locale in ['en', 'de', 'ar']) {
      for (final width in [320.0, 390.0]) {
        for (final scale in [1.0, 2.0]) {
          testWidgets(
            'same five header slots $locale ${b.name} $width x$scale',
            (t) async {
              t.view.physicalSize = Size(width, 2000);
              t.view.devicePixelRatio = 1;
              addTearDown(t.view.reset);
              L.useForTest(
                locale,
                (jsonDecode(
                  File('assets/l10n/$locale.json').readAsStringSync(),
                ) as Map).cast<String, String>(),
              );
              await t.pumpWidget(
                MaterialApp(
                  theme: applyUiTemplate(
                    classicShellTheme(b),
                    UiTemplate.aurora,
                  ),
                  home: MediaQuery(
                    data: MediaQueryData(
                      size: Size(width, 2000),
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: Directionality(
                      textDirection: locale == 'ar'
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                      child: Material(
                        child: Column(
                          children: [
                            for (var i = 0; i < 5; i++)
                              AuroraTabHeader(
                                route: routes[i],
                                title: L.t(keys[i]),
                                subtitle: 'A localized subtitle',
                                onOpen: (_) {},
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await t.pump();
              final heights = {
                for (final element in find.byType(AuroraTabHeader).evaluate())
                  (element.renderObject as RenderBox).size.height,
              };
              expect(heights.length, 1);
              expect(heights.single, greaterThanOrEqualTo(104));
              expect(t.takeException(), isNull);
            },
          );
        }
      }
    }
  }

  testWidgets(
    'entry glint routes, fixed layout and finite end; no replay on rebuild',
    (t) async {
      L.useForTest(
        'en',
        (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map)
            .cast<String, String>(),
      );
      TabChromeHost.bind(host, (_) {});
      TabChromeHost.update(host, '/');
      Widget page() => MaterialApp(
        theme: applyUiTemplate(
          classicShellTheme(Brightness.dark),
          UiTemplate.aurora,
        ),
        home: const Scaffold(
          body: AuroraTabHeader(route: '/games', title: 'Games'),
        ),
      );
      await t.pumpWidget(page());
      final glint = find.byKey(const ValueKey('tab-header-entry-glint'));
      expect(glint, findsNothing);
      final rect = t.getRect(find.byType(AuroraTabHeader));
      TabChromeHost.update(host, '/games');
      await t.pump(const Duration(milliseconds: 60));
      expect(glint, findsOneWidget);
      await t.pumpWidget(page());
      await t.pump(const Duration(milliseconds: 460));
      await t.pumpAndSettle();
      expect(glint, findsNothing);
      expect(t.getRect(find.byType(AuroraTabHeader)), rect);
      expect(t.binding.hasScheduledFrame, isFalse);
    },
    skip: !uiMotionPilot,
  );

  testWidgets(
    'Progress reveals upper blocks first; a route exit cancels all pending motion',
    (t) async {
      TabChromeHost.bind(host, (_) {});
      TabChromeHost.update(host, '/statistics');
      await t.pumpWidget(
        MaterialApp(
          theme: applyUiTemplate(
            classicShellTheme(Brightness.dark),
            UiTemplate.aurora,
          ),
          home: const Scaffold(
            body: ProgressEntryList(
              padding: EdgeInsets.zero,
              children: [
                Text('First real result'),
                Text('Second real result'),
                Text('Third real result'),
              ],
            ),
          ),
        ),
      );
      await t.pump(const Duration(milliseconds: 100));
      final opacities = t.widgetList<Opacity>(find.byType(Opacity)).toList();
      expect(opacities.first.opacity, greaterThan(opacities.last.opacity));
      expect(opacities.every((o) => o.alwaysIncludeSemantics), isTrue);
      TabChromeHost.update(host, '/games');
      await t.pumpAndSettle();
      expect(
        t
            .widgetList<Opacity>(find.byType(Opacity))
            .every((o) => o.opacity == 1),
        isTrue,
      );
      expect(t.binding.hasScheduledFrame, isFalse);
    },
    skip: !uiMotionPilot,
  );

  testWidgets('320pt catalogue keeps two square columns at normal text size', (
    t,
  ) async {
    t.view.physicalSize = const Size(320, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        theme: applyUiTemplate(
          classicShellTheme(Brightness.dark),
          UiTemplate.aurora,
        ),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Builder(
              builder: (context) => CatalogKit.grid(context, [
                for (var i = 0; i < 4; i++)
                  (_) => ColoredBox(key: ValueKey(i), color: Colors.blue),
              ]),
            ),
          ),
        ),
      ),
    );
    expect(t.getSize(find.byKey(const ValueKey(0))), const Size(139, 139));
    expect(
      t.getTopLeft(find.byKey(const ValueKey(0))).dy,
      t.getTopLeft(find.byKey(const ValueKey(1))).dy,
    );
    expect(
      t.getTopLeft(find.byKey(const ValueKey(2))).dy,
      greaterThan(t.getTopLeft(find.byKey(const ValueKey(0))).dy),
    );
  });
}
