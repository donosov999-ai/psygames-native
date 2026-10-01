import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';

/// 🔴 У КАЖДОГО ЗНАЧКА ИЗ ВЕБ-РЕЕСТРА — СВОЯ СТРОКА В ТАБЛИЦЕ ЗНАЧКОВ.
///
/// Незнакомое имя развилка рисует общим пазлом — это страховка от пустого места, а
/// не способ показывать значки. Замер 30.09.2026: в таблице было 12 имён из 75, и
/// 98 карточек из 113 шли с пазлом. Страховка молчит, поэтому полноту держит эта
/// проба: новое имя в `hubContents.ts` без строки в `hubIcons` — красный CI с этим
/// именем.
void main() {
  test('🔴 все имена значков из assets/hubs.json есть в таблице hubIcons', () {
    final data = jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>;
    final used = <String, Set<String>>{};
    void take(String where, Object? card) {
      final icon = (card as Map<String, dynamic>)['icon'] as String?;
      if (icon != null) used.putIfAbsent(icon, () => {}).add(where);
    }

    (data['hubs'] as Map<String, dynamic>).forEach((hub, cards) {
      for (final c in cards as List) {
        take(hub, c);
      }
    });
    (data['extra'] as Map<String, dynamic>? ?? {}).forEach((_, c) => take('extra', c));

    expect(used.length, greaterThan(60), reason: 'имён значков в данных ${used.length} — данные не прочитались?');
    final missing = [
      for (final e in used.entries)
        if (!hubIcons.containsKey(e.key)) '${e.key} (${e.value.join(', ')})',
    ];
    expect(missing, isEmpty,
        reason: 'нет строки в hubIcons (lib/shell/hub_screen.dart) — карточка покажет пазл');
  });
}
