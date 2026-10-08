import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/home_inputs.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ГЛАВНАЯ СЧИТАЕТ МОДЕЛЬ САМА (задача d6a60b02, вариант Б, шаг 7б).
///
/// Экран на хранилище эталона `home_inputs_rich.json` (часы — его же): рисует без страницы под
/// оболочкой — ни значка загрузки, ни ожидания веба; число очков и титул — из памяти; запись в память
/// пересчитывает модель; окно цели открывает своя модель; события веба (тост бонуса, «есть
/// обновление») ложатся поверх своей модели, а облик питомца — только если приехал из канала.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final rich = obj('test/fixtures/home_inputs_rich.json');

  setUpAll(() {
    WebTheme.use(obj('assets/web_theme.json').cast<String, dynamic>());
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
  });

  late SharedState state;
  setUp(() async {
    ScreenUi.reset();
    SharedPreferences.setMockInitialValues((rich['storage']! as Map).cast<String, Object>());
    state = await SharedState.open();
    Profiles.current = Profiles.parse(File('assets/profiles.json').readAsStringSync());
    final off = (rich['tzOffsetMinutes']! as num).toInt();
    HomeScreen.now = () => (rich['now']! as num).toInt();
    HomeScreen.wall = (ms) => DateTime.fromMillisecondsSinceEpoch(ms - off * 60000, isUtc: true);
  });

  Future<void> mount(WidgetTester t, {bool active = false}) async {
    await t.binding.setSurfaceSize(const Size(750, 1400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp(
      home: HomeAccent(
        color: const Color(0xFFA855F7),
        child: HomeScreen(state: state, origin: 'http://127.0.0.1:1', active: active, onOpen: (_) {}, onTab: (_) {}, onSwitcher: () {}),
      ),
    ));
    // Данные сборки грузятся байтами из пакета — даём им прийти, кадры — дорисоваться.
    for (var i = 0; i < 6; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('🔴 без страницы: Главная своя — очки и титул из памяти, загрузки нет', (t) async {
    await mount(t);
    expect(ScreenUi.model(HomeScreen.route).value, isNull);
    expect(key('home-loading'), findsNothing);
    expect(key('home-screen'), findsOneWidget);
    final want = (rich['input']! as Map)['tokens'];
    expect(find.descendant(of: key('home-tokens'), matching: find.text('$want')), findsOneWidget);
    expect(find.text((rich['input']! as Map)['titleLabel']! as String), findsWidgets);
  });

  testWidgets('🔴 запись в память пересчитывает модель', (t) async {
    await mount(t);
    await t.runAsync(() => state.set('psygames_tokens_v1', jsonEncode({'nzt48': 4321})));
    // Записи пересчитываются пачкой — через 200 мс после последней (таймер — настоящих часов: запись
    // пришла из `runAsync`, как приходит от страницы).
    for (var i = 0; i < 15; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    expect(find.descendant(of: key('home-tokens'), matching: find.text('4321')), findsOneWidget);
  });

  testWidgets('🔴 окно цели открывает своя модель (повод «неделя прошла»)', (t) async {
    await mount(t, active: true);
    await t.pump(const Duration(milliseconds: 400));
    expect(key('goal-sheet'), findsOneWidget);
  });

  testWidgets('события страницы — поверх своей модели: тост бонуса входа', (t) async {
    await mount(t);
    ScreenUi.model(HomeScreen.route).value = {
      'toasts': {'streak': {'text': '+25 ⭐', 'bg': '#ef4444', 'fg': '#2b0c0c'}},
      'header': {'update': null},
    };
    await t.pump();
    expect(find.text('+25 ⭐'), findsOneWidget);
    // Своё остаётся своим: очки — из памяти, а не из страницы (в ней их нет вовсе).
    expect(find.descendant(of: key('home-tokens'), matching: find.text('${(rich['input']! as Map)['tokens']}')), findsOneWidget);
  });

  test('withPageEvents: тосты и обновление — страницы; питомец — только лента канала', () {
    final own = {
      'toasts': {'streak': null},
      'header': {'tokens': 5, 'update': null, 'pet': {'kind': 'frames', 'uris': ['a']}},
      'goalSheet': {'pet': {'kind': 'frames'}},
    };
    expect(withPageEvents(own, null), same(own));
    final frames = withPageEvents(own, {
      'toasts': {'streak': {'text': '+1'}},
      'header': {'update': {'text': 'v9'}, 'pet': {'kind': 'frames', 'uris': ['b']}},
    });
    expect(frames['toasts'], {'streak': {'text': '+1'}});
    expect((frames['header']! as Map)['update'], {'text': 'v9'});
    expect((frames['header']! as Map)['pet'], {'kind': 'frames', 'uris': ['a']});
    expect((frames['header']! as Map)['tokens'], 5);
    final strip = withPageEvents(own, {
      'header': {'pet': {'kind': 'strip', 'uris': ['s']}},
      'goalSheet': {'pet': {'kind': 'strip', 'uris': ['t']}},
    });
    expect((strip['header']! as Map)['pet'], {'kind': 'strip', 'uris': ['s']});
    expect((strip['goalSheet']! as Map)['pet'], {'kind': 'strip', 'uris': ['t']});
  });
}
