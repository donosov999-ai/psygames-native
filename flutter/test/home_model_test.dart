import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/home_model.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 СБОРЩИК МОДЕЛИ ГЛАВНОЙ НА DART = СБОРЩИК ВЕБА (задача d6a60b02, вариант Б, Главная — шаг «сборщик»).
///
/// Эталоны выгружает веб-проба `home-host-model.test.tsx`: вход `buildHomeModel`, снятый с живой Главной,
/// и «всё включено» (лестница, сундук, «продолжить», цель на проверке, «Сегодня» сверх потолка,
/// рекомендация «уже сегодня», зарядка, вызов дня, любимые разделы, окно цели, тосты, обновление, фото
/// фона) — и модель того же сборщика с настоящим словарём на RU и EN. Здесь тот же вход проходит через
/// Dart-сборщик с данными сборки (`catalog.json`, `home.json`).
void main() {
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  Map<String, Object?> obj(String f) => (json(f)! as Map).cast<String, Object?>();
  final data = HomeData.fromJson(obj('assets/catalog.json'), obj('assets/home.json'));

  for (final name in ['live', 'rich']) {
    for (final lang in ['ru', 'en']) {
      test('🔴 home_builder_model_${name}_$lang: модель Dart = модель веба на том же входе', () {
        L.useForTest(lang, (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>());
        final dart = buildHomeModel(obj('test/fixtures/home_builder_input_$name.json'), data);
        expect(jsonDecode(jsonEncode(dart)), json('test/fixtures/home_builder_model_${name}_$lang.json'));
      });
    }
  }

  test('адрес с параметрами — как encodeURIComponent веба; пустые параметры не пишутся', () {
    expect(hrefOf('/games/sudoku', {'calm': '1', 'empty': '', 'none': null}), '/games/sudoku?calm=1');
    expect(hrefOf('/x', {"a b": "(c)!*'~"}), "/x?a%20b=(c)!*'~");
    expect(hrefOf('/x', const {}), '/x');
  });

  test('ключи блоков — те же имена, что у веба (коды символов не врут)', () {
    expect([
      HomeBlockKeys.goal,
      HomeBlockKeys.today,
      HomeBlockKeys.reco,
      HomeBlockKeys.practices,
      HomeBlockKeys.favourites,
    ], (obj('test/fixtures/home_builder_input_rich.json')['showBlock']! as Map).keys.toList());
  });
}
