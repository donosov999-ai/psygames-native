import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/collection_model.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «КОЛЛЕКЦИЯ»: РАСЧЁТ НА DART СОВПАДАЕТ С ВЕБОМ (задача d6a60b02, вариант Б, четвёртый экран).
///
/// Эталоны выгружает веб-проба `info-pages-host-model.test.tsx` с настоящего экрана вместе с ключами
/// хранилища, на которых построена модель (`collection_input*.json`). Здесь те же ключи кладутся в
/// общую память, и Dart проходит весь путь: таблица фигурок, пороги из файла настроек, заработанное
/// (или баланс токенов, если записи нет), модель, подсказка по тапу.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  final base = CollectionData.fromJson((json('assets/collection.json')! as Map).cast<String, Object?>());

  Future<SharedState> stateWith(Map<String, Object?> storage) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48', ...storage.cast<String, Object>()});
    return SharedState.open();
  }

  for (final (lang, input, model, hint) in [
    ('ru', 'collection_input.json', 'collection_model.json', null),
    ('ru', 'collection_input.json', 'collection_model_hint.json', 'tap'),
    ('en', 'collection_input_en.json', 'collection_model_en.json', null),
  ]) {
    test('🔴 $model: модель Dart = модель веба на тех же ключах хранилища', () async {
      L.useForTest(lang, (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>());
      final inp = (json('test/fixtures/$input')! as Map).cast<String, Object?>();
      final web = (json('test/fixtures/$model')! as Map).cast<String, Object?>();
      final state = await stateWith((inp['storage']! as Map).cast<String, Object?>());
      final figures = figuresWith(base, state);
      final earned = earnedTotalOf(state, 'nzt48');
      final h = hint == null ? null : howToOpen(figures, earned, inp['tap']! as int);
      expect(jsonDecode(jsonEncode(collectionModel(figures, earned, primary: web['primary']! as String, hint: h))), web);
    });
  }

  test('заработанного нет — баланс токенов (стаж не обнуляется); битый файл настроек — заводские пороги', () async {
    final s1 = await stateWith({'psygames_tokens_v1': '{"nzt48":777.9}'});
    expect(earnedTotalOf(s1, 'nzt48'), 777);
    final s2 = await stateWith({'psygames_playlists_override': '{"коллекция":{"Acorn":1}}'});
    expect(figuresWith(base, s2).first.at, base.first.at, reason: 'без «профили» состав не читается — как загрузить() веба');
    final s3 = await stateWith({'psygames_playlists_override': 'не json'});
    expect(figuresWith(base, s3).map((f) => f.at), base.map((f) => f.at));
  });

  testWidgets('🔴 экран со своим состоянием: модель своя, тап по закрытой — подсказка, по собранной — убрана', (t) async {
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    final inp = (json('test/fixtures/collection_input.json')! as Map).cast<String, Object?>();
    final state = await stateWith((inp['storage']! as Map).cast<String, Object?>());
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    t.view.physicalSize = const Size(780, 3000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: CollectionScreen(state: state)));
    for (var i = 0; i < 20 && find.byKey(const ValueKey('collection-figure-0')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    final hinted = (json('test/fixtures/collection_model_hint.json')! as Map)['hint'] as String;
    await t.tap(find.byKey(ValueKey('collection-figure-${inp['tap']}')));
    await t.pump();
    expect(find.text(hinted), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('collection-figure-0')));
    await t.pump();
    expect(find.text(hinted), findsNothing, reason: 'собранная — подсказку снимает');
  });
}
