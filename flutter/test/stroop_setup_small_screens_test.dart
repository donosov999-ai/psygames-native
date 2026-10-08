import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// НАСТРОЙКА СТРУПА НА МАЛЫХ ЭКРАНАХ: с L5 под строкой уровня встаёт ещё одна — доля проб
/// с другим правилом (задача 8a507e76). На L15 обе строки самые длинные; длиннее всего они
/// на немецком и хинди. Проверяется, что новая строка и «Начать» остаются на экране, а
/// переполнения нет (его Flutter сам роняет исключением). Карточка правила уровня здесь
/// выключена: она честно всплывает при входе на L15, но проба — про сам экран настройки.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => LevelRules.debugSetTable(const {}));
  tearDown(() => LevelRules.debugSetTable(null));

  for (final lang in ['ru', 'en', 'de', 'hi', 'ar']) {
    for (final size in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
      testWidgets('$lang ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
        await L.load(lang);
        tester.view.physicalSize = size * 3;
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        SharedPreferences.setMockInitialValues({'${SharedState.prefix}stroop_level_nzt48': '15'});
        final state = await SharedState.open();
        await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
        await tester.pumpAndSettle();
        final line = find.byKey(const Key('stroop-switch-line'));
        expect(line, findsOneWidget, reason: 'на L15 строки о смене правила нет');
        expect(tester.getRect(line).bottom, lessThanOrEqualTo(size.height), reason: 'строка ушла за край');
        final start = find.text(L.t('start'));
        expect(tester.getRect(start).bottom, lessThanOrEqualTo(size.height), reason: '«Начать» ушла за край');
      });
    }
  }
}
