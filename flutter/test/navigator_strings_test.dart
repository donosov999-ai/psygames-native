import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/navigator/strings.dart';
import 'package:psygames_flutter/games/navigator/types.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// СЛОВАРЬ «НАВИГАТОРА» СОБРАН ЦЕЛИКОМ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
///
/// 🔴 ЗАЧЕМ. `NavigatorStrings.t` на промахе возвращает сам ключ, и проба экрана, сверяющая
/// показанное с ожидаемым, этого не видит: показан ключ — ключ и сверен. Ловится только сверкой
/// «что зовём» против «что собрано» (урок `tolWonPreset`, 24.09.2026).
void main() {
  final all = jsonDecode(File('assets/l10n/navigator.json').readAsStringSync()) as Map<String, dynamic>;

  test('двенадцать языков, у всех один набор ключей и ни одной пустой строки', () {
    expect(all.keys.toSet(), L.locales.toSet());
    final ru = (all['ru'] as Map<String, dynamic>).keys.toSet();
    expect(ru.length, greaterThan(40), reason: 'ключей подозрительно мало — не сломан ли экспортёр');
    for (final code in L.locales) {
      final d = all[code] as Map<String, dynamic>;
      expect(d.keys.toSet(), ru, reason: '$code: состав ключей разъехался с ru');
      final empty = d.entries.where((e) => '${e.value}'.trim().isEmpty).map((e) => e.key).toList();
      expect(empty, isEmpty, reason: '$code: пустые строки');
    }
  });

  test('🔴 у каждого значения ядра есть подпись кнопки — на каждом языке', () {
    final keys = [
      for (final v in NavigatorMode.values) 'mode.${v.wire}',
      for (final v in Cardinal.values) 'direction.${v.wire}',
      for (final v in Turn.values) 'turn.${v.wire}',
      for (final v in HomeSector.values) 'home.${v.wire}',
    ];
    for (final code in L.locales) {
      final s = NavigatorStrings.fromMap((all[code] as Map<String, dynamic>).map((k, v) => MapEntry(k, '$v')));
      for (final key in keys) {
        expect(s.t(key), isNot(key), reason: '$code: нет подписи $key — кнопка покажет сам ключ');
      }
    }
  });

  test('🔴 каждый ключ, который зовёт экран «Навигатора», лежит в словаре', () {
    // Словарь модуля зовут как `s.t(…)` / `strings.fill(…)`; `L.t(…)` — общий словарь, его сторожит
    // l10n_keys_are_bundled_test.
    final call = RegExp(r"\b(?:s|strings)\.(?:t|fill)\(\s*'([a-zA-Z_][\w.-]*)'");
    final used = <String>{};
    for (final f in Directory('lib/games/navigator').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.endsWith('strings.dart')) continue;
      final src = f.readAsStringSync().replaceAll(RegExp(r'//.*$', multiLine: true), '');
      used.addAll(call.allMatches(src).map((m) => m.group(1)!));
    }
    // Проба, не нашедшая ни одного вызова, сторожила бы пустоту: экран зовёт словарь десятками мест.
    expect(used.length, greaterThan(20), reason: 'вызовов словаря подозрительно мало — не сломан ли поиск');
    final ru = (all['ru'] as Map<String, dynamic>).keys.toSet();
    expect(used.difference(ru), isEmpty, reason: 'ключ зовут, а в navigator.json его нет');
  });

  test('подстановка — одним проходом, как interpolateNavigator в вебе', () {
    final s = NavigatorStrings.fromMap({
      'grid': 'Сетка {size}×{size} · маршрут {steps}',
      'odd': '{a} и {missing}',
    });
    expect(s.fill('grid', {'size': 5, 'steps': 7}), 'Сетка 5×5 · маршрут 7');
    expect(s.fill('odd', {'a': '{missing}', 'missing': 'X'}), '{missing} и X',
        reason: 'вставленный текст не разбирается повторно');
    expect(s.fill('odd', {'a': 1}), '1 и {missing}', reason: 'незнакомая метка остаётся как есть');
    expect(s.t('нет-такого'), 'нет-такого');
  });
}
