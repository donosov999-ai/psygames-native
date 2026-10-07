import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/walking_pet.dart' show PetFrames;

/// 🔴 «ПИТОМЕЦ» НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача d1e147b0).
///
/// Образец выгружает веб-проба `pet-host-model.test.tsx` с настоящего экрана.
///   Портрет: кадры текущего действия из описаний веба (`PetFrames`); «ест» — с лакомством у рта.
///   Рост, облики (выбранный — фиолетовой рамкой 2, запертый — с замком), уровень, совет, шкалы — строками модели.
///   Нажатия — действия веба: угостить (после кормления — нельзя), помыть, погладить, поиграть, облик,
///   совет, имя (правка на месте и «✓»), «назад».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();
  const route = PetScreen.route;

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? m) async {
    t.view.physicalSize = const Size(780, 6000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: PetScreen(origin: 'http://127.0.0.1:1'))));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  Map<String, Object?> part(Map<String, Object?> m, String k) => (m[k]! as Map).cast<String, Object?>();
  List<Map<String, Object?>> list(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, Object?>()];

  testWidgets('без модели — ожидание', (t) async {
    await mount(t, null);
    expect(key('pet-screen-loading'), findsOneWidget);
  });

  testWidgets('🔴 портрет — кадры действия веба; реплика, стадия, рост, облики, уровень, совет, шкалы', (t) async {
    final m = load('pet_model.json');
    await mount(t, m);
    expect(key('pet-frames-idle'), findsOneWidget);
    final frames = t.widget<PetFrames>(key('pet-frames-idle'));
    expect(frames.spec.uris, (part(part(m, 'portrait'), 'specs')['idle']! as Map)['uris']);
    expect(find.text(m['bubble'] as String), findsOneWidget);
    expect(find.text(m['stageName'] as String), findsOneWidget);
    expect(find.text(part(m, 'growth')['text'] as String), findsOneWidget);
    for (final s in list(m['skins'])) {
      final card = t.widget<Container>(find.descendant(of: key('pet-skin-${s['id']}'), matching: find.byType(Container)).first);
      final b = ((card.decoration! as BoxDecoration).border! as Border).top;
      expect(b.width, s['on'] == true ? 2 : 1, reason: '${s['id']}');
      expect(key('pet-skin-lock-${s['id']}'), s['locked'] == true ? findsOneWidget : findsNothing);
    }
    expect(find.descendant(of: key('pet-total'), matching: find.text(m['total'] as String)), findsOneWidget);
    expect(find.text(part(m, 'advice')['body'] as String), findsOneWidget);
    for (final k in list(m['skills'])) {
      expect(find.descendant(of: key('pet-skill-${k['key']}'), matching: find.text('${k['value']}')), findsOneWidget);
    }
  });

  testWidgets('🔴 действие веба меняет кадры портрета; «ест» — с лакомством у рта', (t) async {
    final m = load('pet_model.json');
    await mount(t, m);
    final p = part(m, 'portrait');
    ScreenUi.model(route).value = {
      ...m,
      'portrait': {...p, 'state': 'eat', 'treat': {'emoji': '🐟', 'mouth': {'x': 50, 'y': 40}}},
    };
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    expect(key('pet-frames-eat'), findsOneWidget);
    expect(key('pet-treat'), findsOneWidget);
    expect(find.text('🐟'), findsOneWidget);
    ScreenUi.model(route).value = {...m, 'portrait': {...p, 'state': 'groom', 'treat': null}};
    await t.pump();
    expect(key('pet-frames-groom'), findsOneWidget);
    expect(key('pet-treat'), findsNothing, reason: 'лакомство — только к еде');
  });

  testWidgets('🔴 забота, облик, совет, «назад» — действия веба; накормленный «Угостить» молчит', (t) async {
    final m = load('pet_model.json');
    await mount(t, m);
    await t.tap(key('pet-feed'));
    for (final c in list(m['care'])) {
      if (c['enabled'] == true) await t.tap(key('pet-care-${c['id']}'));
    }
    await t.tap(key('pet-skin-robot'));
    await t.tap(key('pet-advice'));
    await t.tap(key('pet-back'));
    expect(js, [
      contains('["/pet"].feed()'),
      contains('["/pet"].wash()'),
      contains('["/pet"].stroke()'),
      contains('["/pet"].play()'),
      contains('["/pet"].skin("robot")'),
      contains('["/pet"].advice()'),
      contains('["/pet"].back()'),
    ]);
    js.clear();
    ScreenUi.model(route).value = {
      ...m,
      'feed': {...part(m, 'feed'), 'fed': true},
      'care': [for (final c in list(m['care'])) c['id'] == 'wash' ? {...c, 'enabled': false} : c],
    };
    await t.pump();
    await t.tap(key('pet-feed'));
    await t.tap(key('pet-care-wash'));
    expect(js, isEmpty, reason: 'накормлен и помыт сегодня — кнопки молчат');
  });

  testWidgets('🔴 имя: тап — правка на месте с текущим именем; «✓» — saveName(текст)', (t) async {
    final m = load('pet_model.json');
    await mount(t, m);
    await t.tap(key('pet-name'));
    await t.pump();
    final field = t.widget<TextField>(key('pet-name-field'));
    expect(field.controller!.text, m['nameRaw']);
    expect(field.maxLength, m['nameMax']);
    await t.enterText(key('pet-name-field'), 'Мурзик');
    await t.tap(key('pet-name-save'));
    await t.pump();
    expect(js.single, contains('["/pet"].saveName("Мурзик")'));
    expect(key('pet-name-field'), findsNothing);
  });
}
