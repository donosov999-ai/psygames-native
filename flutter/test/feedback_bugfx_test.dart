import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/feedback_fab.dart';
import 'package:psygames_flutter/shell/feedback_screen.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final fab = find.byKey(const ValueKey('feedback-fab'));
  final header = find.byKey(const Key('game-feedback'));
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    PetHost.state = state;
    PetHost.origin = null;
    GameExit.feedback = () {};
    GameRules.currentRoute = null;
    L.useForTest('en', {'feedbackFabLabel': 'Send feedback'});
    ScreenUi.reset();
  });

  tearDown(() {
    PetHost.state = null;
    PetHost.origin = null;
    GameExit.feedback = null;
    GameShell.feedbackState = null;
    GameRules.currentRoute = null;
    ScreenUi.reset();
  });

  Future<void> mount(
    WidgetTester t, {
    Size size = const Size(320, 568),
    EdgeInsets padding = const EdgeInsets.only(top: 44, bottom: 34),
    double scale = 1,
    bool fieldOnly = false,
    TextDirection direction = TextDirection.ltr,
    VoidCallback? onLesson,
  }) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(padding: padding, textScaler: TextScaler.linear(scale)),
          child: Directionality(textDirection: direction, child: child!),
        ),
        home: GameShell(
          title: 'A long game title',
          fieldOnly: fieldOnly,
          onLesson: onLesson,
          field: (_, _) => const ColoredBox(color: Colors.blue),
          toolbar: const SizedBox(height: 48),
        ),
      ),
    );
  }

  void withinSafe(WidgetTester t, Size size, EdgeInsets padding) {
    final rect = t.getRect(fab);
    expect(rect.left, greaterThanOrEqualTo(padding.left + FabRules.edge));
    expect(rect.top, greaterThanOrEqualTo(padding.top + FabRules.edge));
    expect(
      rect.right,
      lessThanOrEqualTo(size.width - padding.right - FabRules.edge),
    );
    expect(
      rect.bottom,
      lessThanOrEqualTo(size.height - padding.bottom - FabRules.edge),
    );
    expect(rect.width, greaterThanOrEqualTo(48));
    expect(rect.height, greaterThanOrEqualTo(48));
    expect(t.takeException(), isNull);
  }

  testWidgets(
    'button and header show bug + exact bugFX with localized accessibility',
    (t) async {
      final semantics = t.ensureSemantics();
      await mount(t);
      for (final button in [fab, header]) {
        expect(
          find.descendant(of: button, matching: find.text('bugFX')),
          findsOneWidget,
        );
        expect(
          find.descendant(of: button, matching: find.byIcon(Icons.bug_report)),
          findsOneWidget,
        );
        expect(t.getRect(button).height, greaterThanOrEqualTo(48));
      }
      expect(find.byTooltip(L.t('feedbackFabLabel')), findsNWidgets(2));
      expect(find.bySemanticsLabel(L.t('feedbackFabLabel')), findsNWidgets(2));
      semantics.dispose();
    },
  );

  testWidgets(
    'game FAB opens existing feedback sheet and leaves the game intact',
    (t) async {
      var moves = 0;
      final nav = GlobalKey<NavigatorState>();
      ScreenUi.model(FeedbackHost.route).value = (jsonDecode(
        File('test/fixtures/feedback_model.json').readAsStringSync(),
      ) as Map).cast<String, Object?>();
      GameExit.feedback = () =>
          nav.currentState!.push(FeedbackHost.sheetRoute());
      await t.pumpWidget(
        MaterialApp(
          navigatorKey: nav,
          home: GameShell(
            title: 'Game',
            field: (_, _) =>
                TextButton(onPressed: () => moves++, child: const Text('Move')),
          ),
        ),
      );
      await t.tap(find.text('Move'));
      await t.tap(fab);
      await t.pumpAndSettle();
      expect(find.byType(FeedbackScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('feedback-sheet')), findsOneWidget);
      nav.currentState!.pop();
      await t.pumpAndSettle();
      expect(find.text('Move'), findsOneWidget);
      expect(moves, 1);
    },
  );

  testWidgets('no callback means no FAB or header feedback button', (t) async {
    GameExit.feedback = null;
    await mount(t);
    expect(fab, findsNothing);
    expect(header, findsNothing);
    expect(find.text('bugFX'), findsNothing);
  });

  testWidgets(
    'without shared host state FAB is not promised; header callback still works',
    (t) async {
      PetHost.state = null;
      var opened = 0;
      GameExit.feedback = () => opened++;
      await mount(t);
      expect(fab, findsNothing);
      await t.tap(header);
      expect(opened, 1);
    },
  );

  testWidgets(
    'hide setting suppresses both game buttons and reacts without remount',
    (t) async {
      await state.set(FabRules.visibleKey, '0');
      await mount(t);
      expect(fab, findsNothing);
      expect(header, findsNothing);
      await state.set(FabRules.visibleKey, '1');
      await t.pump();
      expect(fab, findsOneWidget);
      expect(header, findsOneWidget);
      await state.set(FabRules.visibleKey, '0');
      await t.pump();
      expect(fab, findsNothing);
      expect(header, findsNothing);
    },
  );

  testWidgets(
    'field-only game gets draggable feedback and respects hide setting',
    (t) async {
      var opened = 0;
      GameExit.feedback = () => opened++;
      await mount(t, fieldOnly: true);
      expect(header, findsNothing);
      expect(find.byKey(const Key('field-only-pause')), findsOneWidget);
      await t.tap(fab);
      expect(opened, 1);
      await state.set(FabRules.visibleKey, '0');
      await t.pump();
      expect(fab, findsNothing);
    },
  );

  testWidgets('overlay does not reduce game field or swallow other game taps', (
    t,
  ) async {
    GameExit.feedback = null;
    await mount(t, fieldOnly: true);
    final before = t.getRect(find.byKey(const Key('game-field')));
    GameExit.feedback = () {};
    await mount(t, fieldOnly: true);
    expect(t.getRect(find.byKey(const Key('game-field'))), before);
    await t.tap(find.byKey(const Key('field-only-pause')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('pause-resume')), findsOneWidget);
  });

  for (final scale in [1.0, 2.0, 3.0]) {
    testWidgets('320x568 safe area and readable text at scale $scale', (
      t,
    ) async {
      await mount(t, scale: scale, onLesson: () {});
      withinSafe(
        t,
        const Size(320, 568),
        const EdgeInsets.only(top: 44, bottom: 34),
      );
      for (final button in [fab, header]) {
        final label = find.descendant(of: button, matching: find.text('bugFX'));
        expect(t.getRect(button).contains(t.getRect(label).topLeft), isTrue);
        expect(
          t.getRect(button).contains(t.getRect(label).bottomRight),
          isTrue,
        );
      }
    });
  }

  testWidgets(
    'saved bottom-right position clamps in landscape with side cutouts',
    (t) async {
      await state.set(FabRules.spotKey, '{"fx":1,"fy":1}');
      const size = Size(568, 320);
      const padding = EdgeInsets.fromLTRB(44, 0, 44, 21);
      await mount(t, size: size, padding: padding, scale: 2);
      withinSafe(t, size, padding);
    },
  );

  testWidgets('RTL default position and short viewport stay in safe bounds', (
    t,
  ) async {
    const size = Size(320, 180);
    const padding = EdgeInsets.only(top: 44, bottom: 34);
    await mount(
      t,
      size: size,
      padding: padding,
      scale: 2,
      direction: TextDirection.rtl,
      fieldOnly: true,
    );
    withinSafe(t, size, padding);
    expect(t.getRect(fab).right, closeTo(size.width - 14, 0.01));
  });

  testWidgets(
    'live drag stays safe, persists existing key, never opens feedback',
    (t) async {
      var opened = 0;
      GameExit.feedback = () => opened++;
      await mount(t);
      final gesture = await t.startGesture(t.getCenter(fab));
      await gesture.moveBy(const Offset(1000, -1000));
      await t.pump();
      withinSafe(
        t,
        const Size(320, 568),
        const EdgeInsets.only(top: 44, bottom: 34),
      );
      await gesture.up();
      await t.pump();
      final saved = FabRules.readSpot(state.get('psygames_feedback_fab_spot'));
      expect(saved, isNotNull);
      final dropped = t.getRect(fab);
      await t.pumpWidget(const SizedBox.shrink());
      await mount(t);
      expect(t.getRect(fab), dropped);
      expect(opened, 0);
    },
  );

  testWidgets('FAB coordinates use local Stack bounds, including SafeArea', (
    t,
  ) async {
    await state.set(FabRules.spotKey, '{"fx":1,"fy":1}');
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SafeArea(
            child: SizedBox(
              width: 160,
              height: 120,
              child: Stack(
                children: [FeedbackFab(state: state, onOpen: () {})],
              ),
            ),
          ),
        ),
      ),
    );
    final rect = t.getRect(fab);
    expect(rect.right, 160 - FabRules.edge);
    expect(rect.bottom, 120 - FabRules.edge);
    expect(rect.left, greaterThanOrEqualTo(FabRules.edge));
    expect(rect.top, greaterThanOrEqualTo(FabRules.edge));
    expect(t.takeException(), isNull);
  });
}
