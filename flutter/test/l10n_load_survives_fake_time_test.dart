import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 СЛОВАРЬ ГРУЗИТСЯ И ПРИ ПОДДЕЛЬНОМ ВРЕМЕНИ `testWidgets`.
///
/// `AssetBundle.loadString` отдаёт строки от 50 КБ в `compute()` — в изолят, которого
/// поддельное время не дожидается. Пока словарь был меньше порога, голый
/// `await L.load(...)` внутри `testWidgets` работал; 30.09.2026 `ru.json` перешёл
/// 51 200 байт, и `goods_set_picker_test` повис на 10 минут — на CI и локально.
/// `L.load` теперь декодирует байты сам. Проба держит это на САМОМ БОЛЬШОМ словаре:
/// берёт язык с наибольшим файлом, а не называет его — вырастет другой, проба
/// переедет на него сама.
void main() {
  testWidgets('🔴 самый большой словарь грузится голым await внутри testWidgets', (tester) async {
    final files = Directory('assets/l10n').listSync().whereType<File>().where((f) => f.path.endsWith('.json')).toList()
      ..sort((a, b) => b.lengthSync().compareTo(a.lengthSync()));
    final biggest = files.first;
    final loc = biggest.uri.pathSegments.last.replaceAll('.json', '');
    expect(biggest.lengthSync(), greaterThan(50 * 1024),
        reason: 'проба стоит там, где правило работает: файл обязан быть за порогом 50 КБ');
    // Без runAsync — ровно так, как это пишут в пробах экранов.
    await L.load(loc);
    expect(L.locale, loc);
    expect(L.t('level'), isNot('level'), reason: '$loc: словарь не загрузился — показан ключ');
    // Свой срок, а не общие 10 минут: вернётся зависание — проба покраснеет за 30 секунд
    // и назовёт причину, а не повиснет вместе с набором.
  }, timeout: const Timeout(Duration(seconds: 30)));
}
