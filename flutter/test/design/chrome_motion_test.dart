import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/pilot_press_response.dart';

void main() {
  const capture = bool.fromEnvironment('CAPTURE_MOTION');
  setUpAll(() async {
    NativeTabs.use((jsonDecode(File('assets/tabs.json').readAsStringSync()) as Map).cast<String, dynamic>());
    L.useForTest('en', (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map).cast<String, String>());
    if (capture && Platform.isMacOS) {
      final font = FontLoader('PreviewArial')..addFont(Future.value(File('/System/Library/Fonts/Supplemental/Arial.ttf').readAsBytesSync().buffer.asByteData()));
      await font.load();
    }
  });
  testWidgets('real footer: finite press, one real route, fixed bounds and frame evidence', (t) async {
    t.view.physicalSize = const Size(780, 240);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final shot = GlobalKey();
    var active = '/';
    var calls = 0;
    await t.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), UiTemplate.aurora).copyWith(
        textTheme: capture ? ThemeData.dark().textTheme.apply(fontFamily: 'PreviewArial') : null),
      home: Scaffold(body: Center(child: RepaintBoundary(key: shot,
        child: StatefulBuilder(builder: (c, change) => NativeTabBar(active: active,
          accent: Colors.amber, onTap: (route) => change(() { active = route; calls++; }))),
      ))),
    ));
    await t.pumpAndSettle();
    Future<void> frame(int n) async {
      if (!capture) return;
      await t.runAsync(() async {
        final image = await (shot.currentContext!.findRenderObject() as RenderRepaintBoundary).toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        image.dispose();
        final dir = Directory('test/design/preview/motion-frames')..createSync(recursive: true);
        File('${dir.path}/${n.toString().padLeft(3, '0')}.png').writeAsBytesSync(bytes!.buffer.asUint8List());
      });
    }
    final target = find.byKey(const ValueKey('native-tab-/games'));
    final original = t.getRect(target);
    await frame(0);
    final gesture = await t.startGesture(t.getCenter(target));
    for (var i = 1; i <= 6; i++) { await t.pump(const Duration(milliseconds: 25)); await frame(i); }
    final scale = t.widget<AnimatedScale>(find.descendant(of: target, matching: find.byType(AnimatedScale)));
    expect(scale.scale, .90);
    expect(t.getRect(target), original, reason: 'fixed footer tap targets must not move');
    await gesture.up();
    for (var i = 7; i <= 20; i++) { await t.pump(const Duration(milliseconds: 25)); await frame(i); }
    expect(active, '/games');
    expect(calls, 1);
    expect(t.getRect(target), original);
    await t.pumpAndSettle();
    expect(t.binding.hasScheduledFrame, isFalse, reason: 'no idle shimmer or perpetual animation');
    expect(t.takeException(), isNull);
  }, skip: !uiMotionPilot);

  testWidgets('press cancellation resets and Reduce Motion has no scale animation', (t) async {
    Future<void> show(bool reduce) => t.pumpWidget(MaterialApp(home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduce),
      child: Center(child: PilotPressResponse(child: SizedBox(width: 100, height: 60,
        child: FilledButton(onPressed: () {}, child: const Text('Action'))))),
    )));
    await show(false);
    final gesture = await t.startGesture(t.getCenter(find.byType(FilledButton)));
    await t.pump(const Duration(milliseconds: 100));
    expect(t.widget<AnimatedScale>(find.byType(AnimatedScale)).scale, .90);
    await gesture.cancel();
    await t.pumpAndSettle();
    expect(t.widget<AnimatedScale>(find.byType(AnimatedScale)).scale, 1);
    await show(true);
    expect(find.byType(AnimatedScale), findsNothing);
    expect(t.takeException(), isNull);
  }, skip: !uiMotionPilot);
}
