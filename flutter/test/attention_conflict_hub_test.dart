import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// РАЗВИЛКА «КОНФЛИКТ ВНИМАНИЯ» — СОСТАВ И ПОДПИСИ. Экран стережёт
/// `attention_conflict_hub_screen_test.dart`, здесь — только данные.
///
/// Своего экрана у развилки нет: карточки лежат в `assets/hubs.json`, заголовок —
/// в `meta`, подписи — в словарях, рисует всё общий `HubScreen`. Поэтому ломается
/// она не вёрсткой, а двумя тихими способами.
///
/// 🔴 ПЕРВЫЙ — КАРТОЧКА УВОДИТ В ВЕБ. Раздел перенесён целиком, 18 из 18, и каждая
/// карточка обязана открывать нативный экран. Уберут маршрут одной игры — человек
/// с развилки поедет в веб-половину, а узнать об этом будет неоткуда: развилка
/// откроется, карточка нарисуется, пропадёт только значок ⚡. Сверка идёт с картой
/// `HybridApp.native` — тем самым списком, по которому оболочка решает, куда
/// открывать. И по ВСЕМ профилям: у каждого профиля может быть своя раскладка
/// развилки (`layouts`), и проверка одной заводской пропустила бы чужой состав.
///
/// 🔴 ВТОРОЙ — ПОДПИСЬ ОСТАЁТСЯ КЛЮЧОМ. Ключи карточек каркас читает ИЗ ДАННЫХ, и
/// сборщик словаря `embed-l10n.mjs`, вырезающий ключи по вызовам `L.t('…')`, их
/// статически не видит. А `L.t` на промахе возвращает сам ключ и не падает:
/// человек увидел бы `suiteStroop` вместо названия, и ни analyze, ни сборка не
/// сказали бы ни слова.
///
/// ⚠️ Данные читаются С ДИСКА, а не через `rootBundle`: так же устроены соседние
/// пробы развилок (`hub_layout_matches_web_test.dart`), файл тот же, что попадает
/// в сборку.
void main() {
  const hub = '/games/attention-conflict';
  final bundle = jsonDecode(
    File('${Directory.current.path}/assets/hubs.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final ru = jsonDecode(
    File('${Directory.current.path}/assets/l10n/ru.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  List<String> routesOf(List<dynamic> cards) => [
        for (final c in cards) c is String ? c : (c as Map<String, dynamic>)['route'] as String,
      ];

  List<Map<String, dynamic>> defaultCards() =>
      ((bundle['hubs'] as Map<String, dynamic>)[hub] as List? ?? const []).cast<Map<String, dynamic>>();

  test('🔴 все карточки ведут на НАТИВНЫЕ экраны — и в заводском составе, и в раскладке каждого профиля', () {
    // Слепое = красное: пустой состав дал бы зелёный цикл без единой сверки.
    // 07.10.2026: переезды по решению Дениса 18.09 (задача 668bcc73): «Корректура» уехала в «Поиск глазами» — 9 → 8.
    expect(defaultCards().length, 8, reason: 'восемь карточек развилки в assets/hubs.json');
    final sets = <String, List<String>>{'заводской состав': routesOf(defaultCards())};
    for (final e in (bundle['layouts'] as Map<String, dynamic>? ?? const {}).entries) {
      final cards = (e.value as Map<String, dynamic>)[hub] as List?;
      if (cards != null) sets['профиль ${e.key}'] = routesOf(cards);
    }
    final web = <String>[
      for (final e in sets.entries)
        for (final r in e.value)
          if (!HybridApp.native.containsKey(r)) '${e.key}: $r',
    ];
    expect(web, isEmpty, reason: 'эти карточки увели бы человека в веб-половину: ${web.join(", ")}');
  });

  test('🔴 у каждой карточки название и описание есть в словаре, а не останутся ключами', () {
    expect(ru.length, greaterThan(100), reason: 'словарь прочитан, а не пуст');
    final missing = <String>[
      for (final c in defaultCards())
        for (final k in [c['nameKey'] as String, c['descKey'] as String])
          if (!ru.containsKey(k)) k,
    ];
    expect(missing, isEmpty, reason: 'без перевода карточка покажет ключ: ${missing.join(", ")}');
  });

  test('🔴 развилка зарегистрирована в перехвате и названа в данных', () {
    expect(HybridApp.native.containsKey(hub), isTrue, reason: 'без маршрута развилка откроется в вебе');
    final meta = (bundle['meta'] as Map<String, dynamic>)[hub] as Map<String, dynamic>?;
    expect(meta?['title'], 'Конфликт внимания');
  });
}
