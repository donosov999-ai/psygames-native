import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 СЛОВАРЬ БОЛЬШЕ 50 КБ ГРУЗИТСЯ И ВНУТРИ `testWidgets`.
///
/// 📍 Замер 30.09.2026. `rootBundle.loadString` для файла больше 50 КБ уходит в изолят (`compute`),
/// а изолят в тестовой зоне `testWidgets` не продвигается. `ru.json` на main весил 50 619 байт — на
/// 581 байт ниже порога; пять новых ключей дали 52 063, и проба витрины товаров, зовущая `L.load`
/// без `runAsync`, встала тайм-аутом в 10 минут — на CI и у меня. Починка — в `L.load`: байты и разбор
/// там же, без изолята.
///
/// ⚠️ Проба стоит там, где правило работает: сперва требует, чтобы словарь БЫЛ больше порога, — на
/// маленьком она зеленела бы и с `loadString`. И ждёт не 10 минут, а один кадр: завершилась загрузка
/// или нет, видно по флагу.
void main() {
  testWidgets('словарь больше 50 КБ загружается без runAsync', (tester) async {
    final size = File('assets/l10n/ru.json').lengthSync();
    expect(size, greaterThan(50 * 1024), reason: 'словарь меньше порога — проба ничего не проверяет');
    var done = false;
    L.load('ru').then((_) => done = true);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(done, isTrue, reason: 'L.load не завершился в тестовой зоне — ушёл в изолят?');
    expect(L.t('navigator'), isNot('navigator'), reason: 'словарь загружен, а не пуст');
  });
}
