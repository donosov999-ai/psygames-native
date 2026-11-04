import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/warmup_screens.dart';

void main() {
  final calls = <String>[];
  setUp(() {
    calls.clear();
    L.useForTest(
      'en',
      (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map)
          .cast<String, String>(),
    );
    WarmupUi.run = (js) async => calls.add(js);
    WarmupUi.picker.value = (jsonDecode(
      File('test/fixtures/warmup_model_from_screen_en.json').readAsStringSync(),
    ) as Map).cast<String, Object?>();
  });
  tearDown(() {
    WarmupUi.run = null;
    WarmupUi.picker.value = null;
  });
  testWidgets(
    'real picker actions: single choice, explicit duration, real launch and help',
    (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        MaterialApp(
          theme: applyUiTemplate(
            classicShellTheme(Brightness.dark),
            UiTemplate.aurora,
          ),
          home: const WarmupPickerScreen(),
        ),
      );
      await t.pump();
      calls.clear();
      await t.tap(find.byKey(const Key('warmup-card-day')));
      expect(calls, [contains('picker.pick("day")')]);
      expect(
        find.byKey(const Key('warmup-details-morning')),
        findsOneWidget,
        reason: 'tap requests model action; UI must not silently replace the chosen program',
      );
      calls.clear();
      await t.tap(find.byKey(const Key('warmup-durs-morning-10')));
      expect(calls, [contains('picker.dur("morning",10)')]);
      calls.clear();
      await t.tap(find.byKey(const Key('warmup-picker-start')));
      expect(calls, [contains('picker.launch()')]);
      await t.tap(find.byKey(const Key('warmup-picker-help-btn')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('warmup-picker-help')), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
}
