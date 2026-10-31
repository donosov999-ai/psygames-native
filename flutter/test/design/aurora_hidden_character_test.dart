import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hidden_character/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «КТО СПРЯТАЛСЯ?» ПОД «АВРОРОЙ» — ВОПРОС КАРТОЧКОЙ (лист 24, «Кто это»; задача 06b7a38d).
/// Строка «вопрос — ответ» над героями под «Авророй» стоит в карточке cellAlt с обводкой
/// boardLine, в Classic — прежняя строка без карточки.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, UiTemplate template) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      home: HiddenCharacterScreen(state: state, seed: 21),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('«Аврора»: вопрос — в карточке cellAlt с обводкой boardLine', (tester) async {
    await open(tester, UiTemplate.aurora);
    final card = find.byKey(const ValueKey('hc-note-card'));
    expect(card, findsOneWidget);
    expect(find.descendant(of: card, matching: find.byKey(const ValueKey('hc-note'))), findsOneWidget);
    final box = tester.widget<Container>(card).decoration! as BoxDecoration;
    // Явно набор «Авроры»: GameColors.of при теме без расширения молча отдаёт classicFor (29.10).
    expect(box.color, GameColors.auroraDark.cellAlt);
    expect(box.border, Border.all(color: GameColors.auroraDark.boardLine));
  });

  testWidgets('Classic: прежняя строка, без карточки', (tester) async {
    await open(tester, UiTemplate.classic);
    expect(find.byKey(const ValueKey('hc-note-card')), findsNothing);
    expect(find.byKey(const ValueKey('hc-note')), findsOneWidget);
  });
}
