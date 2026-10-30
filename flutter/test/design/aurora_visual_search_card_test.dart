import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/visual_search/model.dart';
import 'package:psygames_flutter/games/visual_search/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// КАРТОЧКА ЦЕЛИ «ВИЗУАЛЬНОГО ПОИСКА» ПОД «АВРОРОЙ» (лист 23, приёмка 29a06aa2, D-003).
/// Сборка 29.10: подпись строкой, под ней мелкий образец. На листе — одна карточка: образец
/// крупно слева, подпись справа. В Classic — прежний столбец «подпись над образцом».
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, UiTemplate template) async {
    SharedPreferences.setMockInitialValues({
      for (final k in ['multi', 'conj', 'closer']) LevelRules.seenKey('visual_search', k): '1',
    });
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      home: VisualSearchScreen(state: state, rnd: createRng('карточка')),
    ));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('«Аврора»: образец слева от подписи, в одной строке', (tester) async {
    await open(tester, UiTemplate.aurora);
    final sample = tester.getRect(find.byKey(const Key('sample')));
    final hint = tester.getRect(find.byKey(const Key('hint')));
    expect(sample.right, lessThanOrEqualTo(hint.left));
    expect((sample.center.dy - hint.center.dy).abs(), lessThan(sample.height / 2));
    expect(sample.width, greaterThan(30), reason: 'образец крупнее прежних 26');
  });

  testWidgets('Classic: прежний столбец — подпись над образцом', (tester) async {
    await open(tester, UiTemplate.classic);
    final sample = tester.getRect(find.byKey(const Key('sample')));
    final hint = tester.getRect(find.byKey(const Key('hint')));
    expect(hint.bottom, lessThanOrEqualTo(sample.top));
  });
}
