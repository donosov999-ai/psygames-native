import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  setUp(LessonUsed.reset);
  tearDown(LessonUsed.reset);

  Widget screen({bool? practice, bool fieldOnly = false}) => MaterialApp(
    home: GameShell(
      title: 'Test', practice: practice, fieldOnly: fieldOnly,
      field: (_, _) => const SizedBox(),
    ),
  );

  testWidgets('shared flag immediately shows practice, reset removes it', (t) async {
    await t.pumpWidget(screen());
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    LessonUsed.mark();
    await t.pump();
    expect(find.text(L.t('sudokuPracticeBadge')), findsOneWidget);
    LessonUsed.reset();
    await t.pump();
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('durable game flag overrides shared flag in both directions', (t) async {
    await t.pumpWidget(screen(practice: true));
    expect(find.text(L.t('sudokuPracticeBadge')), findsOneWidget);
    LessonUsed.mark();
    await t.pumpWidget(screen(practice: false));
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('field-only game also shows practice without a toolbar', (t) async {
    await t.pumpWidget(screen(fieldOnly: true));
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    LessonUsed.mark();
    await t.pump();
    expect(find.text(L.t('sudokuPracticeBadge')), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('practice badge and counters fit a small screen with enlarged text', (t) async {
    t.view.physicalSize = const Size(320, 640);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.4)),
        child: child!,
      ),
      home: GameShell(
        title: 'Test', practice: true,
        hud: const [HudItem(label: 'Level', value: '79'), HudItem(label: 'Errors', value: '0/2')],
        field: (_, height) { expect(height, greaterThan(0)); return const SizedBox(); },
      ),
    ));
    expect(find.text(L.t('sudokuPracticeBadge')), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox());
  });
}
