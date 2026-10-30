import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// «Аврора», лист 32 (задача 045be21d, ч. 2): служебные действия игры под полем — плитки со
/// значком и подписью рядом с жёлтой паузой. Меняется один общий [AuxAction] — для всех игр.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  var undone = 0;

  Future<void> mount(WidgetTester t, UiTemplate template,
      {Size size = const Size(780, 1688), double textScale = 1}) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    undone = 0;
    await t.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: AuroraGameScope(
        route: '/games/probe',
        child: GameShell(
          title: 'Судоку',
          field: (_, _) => const SizedBox.expand(),
          auxRow: AuxBar(children: [
            AuxAction(icon: Icons.lightbulb_outline, label: 'Правила', onPressed: () {}),
            AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: () => undone++),
            const AuxAction(icon: Icons.edit, label: 'Карандаш', active: true),
            const AuxAction(icon: Icons.auto_fix_high, label: 'Подсказка', count: 3),
            const AuxAction(icon: Icons.cleaning_services, label: 'Очистить'),
          ]),
        ),
      ),
    ));
    await t.pump();
  }

  testWidgets('«Аврора»: плитки с подписями в одну строку справа от паузы, нажатие работает', (t) async {
    await mount(t, UiTemplate.aurora);
    expect(find.byKey(const Key('aux-bar-aurora')), findsOneWidget);
    for (final l in ['Правила', 'Отменить', 'Карандаш', 'Подсказка', 'Очистить']) {
      expect(find.text(l), findsOneWidget, reason: 'подпись «$l» видна');
    }
    final pause = t.getRect(find.byKey(const Key('game-pause')));
    final undo = t.getRect(find.text('Отменить'));
    final clean = t.getRect(find.text('Очистить'));
    expect(undo.left, greaterThan(pause.right), reason: 'плитки — справа от паузы');
    expect(clean.center.dy, closeTo(undo.center.dy, 1), reason: 'одной строкой');
    expect(find.descendant(of: find.byKey(const Key('aux-count')), matching: find.text('3')), findsOneWidget, reason: 'число — счётчиком на значке (реф 30.10)');
    await t.tap(find.text('Отменить'));
    expect(undone, 1, reason: 'нажимается и подпись под кругом');
    // Стандарт 30.10: равные колонки на всю ширину — центры кнопок на равном шаге, справа пусто не остаётся.
    final centers = [for (final l in ['Правила', 'Отменить', 'Карандаш', 'Подсказка', 'Очистить']) t.getRect(find.text(l)).center.dx];
    final steps = [for (var i = 1; i < centers.length; i++) centers[i] - centers[i - 1]];
    for (final d in steps) {
      expect(d, closeTo(steps.first, 1.5));
    }
    final width = t.view.physicalSize.width / t.view.devicePixelRatio;
    expect(width - centers.last, lessThan(steps.first), reason: 'последняя кнопка у правого края, без пустого места');
  });

  testWidgets('Classic: прежние круглые значки без подписей', (t) async {
    await mount(t, UiTemplate.classic);
    expect(find.byKey(const Key('aux-bar-aurora')), findsNothing);
    expect(find.text('Отменить'), findsNothing, reason: 'в Classic подпись — только подсказка и чтец');
    expect(find.byTooltip('Отменить'), findsOneWidget);
  });

  testWidgets('«Аврора»: 320 pt и шрифт ×2 — пять плиток и пауза без переполнения', (t) async {
    await mount(t, UiTemplate.aurora, size: const Size(640, 1136), textScale: 2);
    expect(t.takeException(), isNull);
  });
}
