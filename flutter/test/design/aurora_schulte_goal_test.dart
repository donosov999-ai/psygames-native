import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЦЕЛЬ ШУЛЬТЕ ПОД «АВРОРОЙ» — КАРТОЧКОЙ ПОД ПОЛЕМ (лист 11, приёмка 29a06aa2).
/// Сборка 29.10: «Ищи: 1» строкой над сеткой. На листе — карточка «Найдите 12» под полем, число
/// выделено. В Classic — прежняя строка над полем.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, UiTemplate template) async {
    // Уровень 1 — без карточек правил уровня (как в schulte_screen_test).
    SharedPreferences.setMockInitialValues({'${SharedState.prefix}language': 'ru'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      home: SchulteScreen(key: UniqueKey(), state: state),
    ));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
  }

  /// Верх и низ сетки — по клеткам 0…24 (ключи `клетка$i`, не текст: «1» есть и в фишках HUD).
  (double, double) gridSpan(WidgetTester tester) {
    var top = double.infinity, bottom = 0.0;
    for (var i = 0; i < 25; i += 1) {
      final r = tester.getRect(find.byKey(Key('клетка$i')));
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    return (top, bottom);
  }

  testWidgets('«Аврора»: цель — карточка под полем, число выделено highlight', (tester) async {
    // Экран эмулятора приёмки (1080×2400, 420 dpi): сетка упирается в ширину, а не в высоту.
    tester.view.devicePixelRatio = 2.625;
    tester.view.physicalSize = const Size(1080, 2400);
    addTearDown(tester.view.reset);
    await open(tester, UiTemplate.aurora);
    final goal = find.byKey(const Key('цель'));
    final (_, bottom) = gridSpan(tester);
    expect(tester.getRect(goal).top, greaterThanOrEqualTo(bottom));
    // Сетка прижата к карточке: снимок 29.10 (b46bc4715) показал пустую полосу между ними.
    expect(tester.getRect(goal).top - bottom, lessThanOrEqualTo(28));
    final rich = tester.widget<Text>(goal).textSpan! as TextSpan;
    final colored = rich.children!.whereType<TextSpan>().where((s) => s.style?.color == GameColors.auroraDark.highlight);
    expect(colored.map((s) => s.text), ['1']);
  });

  testWidgets('Classic: прежняя строка цели над полем', (tester) async {
    await open(tester, UiTemplate.classic);
    final goal = find.byKey(const Key('цель'));
    final (top, _) = gridSpan(tester);
    expect(tester.getRect(goal).bottom, lessThanOrEqualTo(top));
    expect(tester.widget<Text>(goal).data, L.f('schulteFind', {'x': '1'}));
  });

  testWidgets('«Аврора», экран 320×568: без переполнения, карточка цели целиком в кадре', (tester) async {
    tester.view.devicePixelRatio = 2;
    tester.view.physicalSize = const Size(640, 1136);
    addTearDown(tester.view.reset);
    await open(tester, UiTemplate.aurora);
    expect(tester.takeException(), isNull);
    final goal = tester.getRect(find.byKey(const Key('цель')));
    expect(goal.bottom, lessThanOrEqualTo(568));
    final (_, bottom) = gridSpan(tester);
    expect(goal.top, greaterThanOrEqualTo(bottom));
  });
}
