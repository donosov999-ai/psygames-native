/// «ЛИЦА И ИМЕНА» В ПРИЛОЖЕНИИ: УРОВЕНЬ ИЗ ШАГА ЗАРЯДКИ, НО НЕ ВЫШЕ ЛИЧНОГО + 1.
///
/// 🔴 До 30.09.2026 шаг зарядки (profiles.ts: level 6 и 12) читался только вебом: в приложении
/// зарядка молча играла личный уровень. Правило потолка — то же, что в вебе (`capPresetByLevel`).
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/faces_names/model.dart';
import 'package:psygames_flutter/games/faces_names/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late FacesNamesLibrary lib;

  setUpAll(() {
    lib = FacesNamesLibrary.fromJsonString(File('assets/faces-names.json').readAsStringSync());
  });

  tearDown(GamePreset.clear);

  Future<int> roundLevel(WidgetTester tester, {required int personal}) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    if (personal > 1) await state.set('psygames_faces_names_level_nzt48', '$personal');
    await tester.pumpWidget(MaterialApp(
      home: FacesNamesScreen(key: ValueKey('p$personal'), state: state, library: lib),
    ));
    await tester.pump();
    await tester.pump();
    return (tester.state(find.byType(FacesNamesScreen)) as dynamic).roundLevel as int;
  }

  testWidgets('🔴 шаг «уровень 12» у новичка идёт на 2-м, у опытного — на 12-м', (tester) async {
    GamePreset.set({'wu': '1', 'level': '12'});
    expect(await roundLevel(tester, personal: 1), 2, reason: 'не выше личного + 1');
    expect(await roundLevel(tester, personal: 14), 12, reason: 'выше не поднимаем: шаг просит 12');
  });

  testWidgets('без шага зарядки — личный уровень', (tester) async {
    expect(await roundLevel(tester, personal: 5), 5);
  });
}
