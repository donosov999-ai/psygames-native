import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 СЛОВАРЬ БОЛЬШЕ 50 КБ ГРУЗИТСЯ И ВНУТРИ ПРОБЫ.
///
/// `rootBundle.loadString` расшифровывает файл больше 50 × 1024 байт в отдельном
/// изоляте (`compute`), а внутри `testWidgets` изолят не завершается никогда:
/// проба, грузящая словарь в теле, висит 10 минут и падает по таймауту. Замер
/// 30.09.2026: `ru.json` на main — 50 619 байт, в 581 байте от порога, `hi.json` —
/// 61 019, уже за ним. Первый же PR, добавивший в словарь пару строк, ронял чужие
/// пробы: `goods_set_picker_test` висел 10 минут, на main проходил за секунду.
/// Грузящих словарь в теле проб — 63 файла, поэтому правило стоит в самом
/// `L.load`, а эта проба держит его: берём САМЫЙ БОЛЬШОЙ словарь и грузим в теле.
void main() {
  testWidgets('🔴 самый большой словарь грузится в теле testWidgets, без зависания',
      (tester) async {
    final files = Directory('assets/l10n')
        .listSync()
        .whereType<File>()
        .where((f) => RegExp(r'/[a-z]{2}\.json$').hasMatch(f.path))
        .toList()
      ..sort((a, b) => b.lengthSync().compareTo(a.lengthSync()));
    final biggest = files.first;
    final code = biggest.path.split('/').last.replaceAll('.json', '');
    expect(biggest.lengthSync(), greaterThan(50 * 1024),
        reason: 'проба мерит порог 50 КБ — нужен словарь за ним, а самый большой ${biggest.lengthSync()} байт');

    await L.load(code);
    expect(L.locale, code);
    expect(L.has('start'), isTrue, reason: 'словарь $code загружен, а не пуст');
  }, timeout: const Timeout(Duration(seconds: 30)));
}
