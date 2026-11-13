import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗВИЛКА «ПРОСТРАНСТВО» — НА ОБЩЕМ ХАБЕ, СОСТАВ ИЗ `hubs.json` ЦЕЛИКОМ (задачи 73b1c67e, 8ae0a39d).
///
/// 🔴 До 12.11.2026 развилка рисовала свою шапку и свой список из девяти строк, а `hubs.json`
/// давал 24: пятнадцать головоломок (петли, Мосты, Рельсы, Галактики, Сеть, Сдвиг, 15, Куб…)
/// нельзя было открыть из развилки ни в одном из 13 профилей. Проба открывает развилку тем же
/// путём, что оболочка (`HybridApp.native`), и сверяет экран с данными, а не со своим списком.
void main() {
  late SharedState state;
  final hub = (jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>)['hubs']
      ['/games/spatial-hub'] as List;
  final cards = [for (final e in hub) HubCard.fromJson(e as Map<String, dynamic>)];

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_mental_rotation_level_nzt48': '7',
    });
    state = await SharedState.open();
  });

  tearDown(() => L.load('ru'));

  Future<void> boot(WidgetTester tester, {Widget Function(Widget)? wrap}) async {
    // Окно высокое: все 24 строки строятся сразу, проба сверяет состав, а не прокрутку.
    tester.view.physicalSize = const Size(780, 16000);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.runAsync(() async {
      final screen = HybridApp.native['/games/spatial-hub']!(state);
      await tester.pumpWidget(MaterialApp(home: wrap == null ? screen : wrap(screen)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  testWidgets('🔴 все режимы раздела из hubs.json на экране — не девять из 24', (tester) async {
    await L.load('ru');
    expect(cards.length, greaterThan(20), reason: 'данные развилки прочитаны: ${cards.length}');
    await boot(tester);
    // Строка ищется по маршруту (иконка строки несёт его в ключе), а не по подписи: подпись
    // каркас берёт из каталога, и проба по тексту сверяла бы словарь, а не состав.
    for (final c in cards) {
      final row = find.byKey(ValueKey('hub-icon-${c.route}'));
      expect(row, findsOneWidget, reason: '${c.route} не виден в развилке');
    }
  });

  testWidgets('🔴 шапка — общая, заголовок на языке интерфейса, «назад» на месте', (tester) async {
    await L.load('en');
    await boot(tester);
    expect(find.text(L.t('spatialGroup')), findsWidgets, reason: 'заголовок развилки на английском');
    expect(find.text('Пространство'), findsNothing, reason: 'русский заголовок на английском интерфейсе');
    expect(find.byTooltip(L.t('back')), findsOneWidget, reason: 'кнопка «назад» общей шапки');
  });

  testWidgets('🔴 нажатие уводит маршрутом целиком, вместе с ?mode=', (tester) async {
    await L.load('ru');
    Object? popped;
    await boot(tester, wrap: (screen) => Builder(
          builder: (ctx) => Center(
            child: TextButton(
              key: const Key('открыть'),
              onPressed: () async => popped = await Navigator.of(ctx).push<Object?>(MaterialPageRoute<Object?>(builder: (_) => screen)),
              child: const Text('открыть'),
            ),
          ),
        ));
    await tester.tap(find.byKey(const Key('открыть')));
    await tester.runAsync(() async {
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
    });
    final bridges = cards.firstWhere((c) => c.route.contains('mode=Bridges'));
    final row = find.byKey(ValueKey('hub-icon-${bridges.route}'));
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(popped, isA<HubCardTap>());
    expect((popped! as HubCardTap).route, '/games/puzzles?mode=Bridges');
  });

  testWidgets('уровень на карточке — из общей памяти', (tester) async {
    await L.load('ru');
    await boot(tester);
    expect(find.text('${L.t('unitLevelShort')} 7'), findsOneWidget, reason: 'уровень «Вращения» из ключа веб-стороны');
  });
}
