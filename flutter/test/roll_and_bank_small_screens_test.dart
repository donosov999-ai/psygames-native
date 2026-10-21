import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/roll_and_bank/screen.dart';
import 'package:psygames_flutter/games/roll_and_bank/solver.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «РИСКНИ И СОХРАНИ»: ФОРА БОТА НЕ ЛОМАЕТ СТРОКУ НА МАЛОМ ЭКРАНЕ — В ДЛИННЫХ ЯЗЫКАХ.
///
/// 🔴 ПОЙМАНО ЭТОЙ ПРОБОЙ 30.09.2026 на собственной правке: подпись «Bot · head start 28»
/// в заголовке дорожки рядом с «28 / 30» и «(+12)» переполняла строку на 28 px уже на
/// 375 px (английский), падали и 320 px по-русски. Фора ушла отдельной строкой под
/// заголовок. ⚠️ Проба стоит на L22 — там фора самая длинная, 28, — и сначала даёт
/// человеку набрать несохранённое: «(+N)» появляется только посреди хода. Мерить на L1
/// значило бы мерить строку без форы вовсе. С 21.10.2026 верх — L30: трасса 60 и фора 27
/// (задача d1d32abb), строка «27 / 60» не короче прежней «28 / 30».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Бот верха играет по таблице решения; изолят в пробе не досчитает — считаем заранее.
  setUpAll(() => RollAndBankPolicy.solved(60));
  for (final lang in ['ru', 'en', 'de', 'hi', 'fr']) {
    for (final size in const [Size(320, 568), Size(360, 640), Size(375, 667)]) {
      testWidgets('$lang ${size.width.toInt()}', (tester) async {
        await L.load(lang);
        tester.view.physicalSize = size * 3;
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids', 'psygames_roll_and_bank_level_kids': '30'});
        final state = await SharedState.open();
        await tester.pumpWidget(MaterialApp(home: RollAndBankScreen(state: state, seed: 4, botDelay: const Duration(milliseconds: 5))));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 20));
        // дать человеку набрать несохранённое, чтобы в строке появилось «(+N)»
        for (var i = 0; i < 3; i++) {
          final roll = tester.widget<FilledButton>(find.byKey(const ValueKey('rb-roll')));
          if (roll.onPressed == null) break;
          await tester.tap(find.byKey(const ValueKey('rb-roll')));
          await tester.pump();
        }
        expect(find.textContaining(L.f('rbHeadStart', {'n': '27'})), findsOneWidget);
        final roll = tester.getRect(find.byKey(const ValueKey('rb-roll')));
        expect(roll.bottom, lessThanOrEqualTo(size.height), reason: 'кнопка броска на экране');
      });
    }
  }
}
