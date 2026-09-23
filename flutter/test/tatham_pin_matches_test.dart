import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ДВА РАБОЧИХ ПРОЦЕССА СОБИРАЮТ ДВИЖОК ОДНОЙ И ТОЙ ЖЕ МЕТКОЙ КАНОНА.
///
/// 🔴 ЧТО ЭТО ЛОВИТ И ПОЧЕМУ ЭТОГО НЕ ВИДНО ИНАЧЕ. Движок Тэтхэма собирается из
/// чужого репозитория в ДВУХ местах: `flutter-pilot.yml` гоняет им пробы,
/// `flutter-testflight.yml` собирает сборку для людей. Если метки разойдутся,
/// обе сборки останутся ЗЕЛЁНЫМИ, но проверяли мы один движок, а человеку
/// уехал другой. Ни один прогон такого не заметит: у каждого свой движок, и у
/// каждого всё сходится.
///
/// ⚠️ Сама метка — не украшение. Канон обновляется своей жизнью: без неё
/// «свежий master» ронял бы наши эталоны без единой нашей правки, и краснел бы
/// не наш код, а чужой выпуск.
///
/// 📍 Замер 23.09.2026, из-за которого проба и появилась: шаг сборки движка я
/// добавил в ОДИН процесс из двух, и выкладка упала ровно там же — прогон
/// 35885629221, 580 зелёных и 3 красных на пробах головоломок.
void main() {
  test('🔴 метка канона Тэтхэма одинакова во всех процессах, которые его собирают', () {
    final dir = Directory('../.github/workflows');
    if (!dir.existsSync()) {
      markTestSkipped('нет ../.github/workflows — прогон вне общего дерева');
      return;
    }
    final pin = RegExp(r'TATHAM_SHA=([0-9a-f]{40})');
    final found = <String, String>{};
    for (final f in dir.listSync().whereType<File>()) {
      if (!f.path.endsWith('.yml') && !f.path.endsWith('.yaml')) continue;
      final m = pin.firstMatch(f.readAsStringSync());
      if (m != null) found[f.uri.pathSegments.last] = m.group(1)!;
    }

    expect(found.length, greaterThanOrEqualTo(2),
        reason: 'движок собирают меньше чем в двух процессах — проверь, не потерялся ли шаг: '
            'нашлось ${found.keys.join(", ")}');
    expect(found.values.toSet().length, 1,
        reason: 'метки канона РАЗОШЛИСЬ, и обе сборки будут зелёными на разных движках:\n'
            '${found.entries.map((e) => "  · ${e.key} → ${e.value}").join("\n")}');
  });

  test('метка — полный SHA, а не ветка и не короткий вид', () {
    final dir = Directory('../.github/workflows');
    if (!dir.existsSync()) {
      markTestSkipped('нет workflows');
      return;
    }
    // Короткая метка однажды перестаёт быть однозначной, а имя ветки не метка вовсе:
    // и то и другое даёт «зелёную сборку на другом движке».
    final loose = <String>[];
    for (final f in dir.listSync().whereType<File>()) {
      if (!f.path.endsWith('.yml')) continue;
      for (final m in RegExp(r'TATHAM_SHA=(\S+)').allMatches(f.readAsStringSync())) {
        if (!RegExp(r'^[0-9a-f]{40}$').hasMatch(m.group(1)!)) {
          loose.add('${f.uri.pathSegments.last}: ${m.group(1)}');
        }
      }
    }
    expect(loose, isEmpty, reason: 'метка канона задана не полным SHA: ${loose.join(", ")}');
  });
}
