import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗВИЛКА — НЕ ИГРА: ПАУЗЫ НА НЕЙ БЫТЬ НЕ ДОЛЖНО.
///
/// Повод — кадр Дениса 23.09.2026: «Пространство» с кнопкой паузы в шапке, «по хабам
/// наксячил солидно». Причина: экран развилки был построен на `GameShell`, а тот даёт
/// то, что нужно ИГРЕ — паузу, кружок питомца, «Правила». Паузить на списке нечего.
///
/// ⚠️ Проба НЕ читает исходник на слово `GameShell`: подняли бы экран иначе — и она
/// снова проглядела бы. Она ПОДНИМАЕТ каждую развилку из карты перехвата и ищет на
/// ней кнопку паузы глазами: есть — значит развилка снова притворяется игрой.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });

  testWidgets('🔴 ни на одной развилке нет кнопки паузы', (tester) async {
    final hubs = HybridApp.native.keys.where((r) => r.endsWith('-hub')).toList();
    expect(hubs.length, greaterThanOrEqualTo(4), reason: 'развилок в карте найдено ${hubs.length}');
    final guilty = <String>[];
    for (final route in hubs) {
      await tester.pumpWidget(MaterialApp(home: HybridApp.native[route]!(state)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      if (find.byTooltip('Пауза').evaluate().isNotEmpty) guilty.add(route);
    }
    expect(guilty, isEmpty, reason: 'развилка построена как игра — на ней пауза');
  });
}
