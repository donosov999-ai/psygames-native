import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// СТИЛЬ ШКАФА БЕРЁТСЯ У ПРОФИЛЯ — и это видно НА ЭКРАНЕ, а не в таблице.
///
/// 🔴 ЧТО ЭТА ПРОБА ЛОВИТ И ПОЧЕМУ ДРУГИЕ НЕ ЛОВИЛИ. Первая редакция переноса
/// рисовала `niche-birch.webp` строкой в виджете. Все двадцать девять проб
/// экранов при этом были зелёные: доска считается, ходы играются, раскладка
/// сходится — плитка на них не влияет никак. Расхождение с вебом (профилю
/// `nzt48` назначен там ОРЕХ) жило бы до тех пор, пока кто-нибудь не открыл бы
/// две половины приложения рядом.
///
/// ⚠️ ПРОБА СМОТРИТ НА ПУТЬ КАРТИНКИ В ДЕРЕВЕ ВИДЖЕТОВ, а не спрашивает
/// `shelfForProfile`. Спросить таблицу — значит проверить таблицу таблицей:
/// зашитая в виджет берёза осталась бы зелёной.
String? _shelfPath(WidgetTester tester) {
  final drawn = tester
      .widgetList<Image>(find.byType(Image))
      .map((w) => w.image)
      .whereType<AssetImage>()
      .map((a) => a.assetName)
      .where((n) => n.contains('/niche-'))
      .toSet();
  return drawn.isEmpty ? null : drawn.first;
}

Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: GoodsSortScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(GoodsField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('у каждого стиля есть плитка, и она не заглушка', () async {
    final absent = <String>[];
    final light = <String>[];
    for (final style in shelfStyles) {
      try {
        final data = await rootBundle.load('assets/goods/niche-$style.webp');
        // 📍 Порог 400 Б — не вкус: девять нынешних плиток весят 1236–1706 Б,
        // а «файл есть, картинки нет» был бы в разы легче.
        if (data.lengthInBytes < 400) light.add('$style (${data.lengthInBytes} Б)');
      } catch (_) {
        absent.add(style);
      }
    }
    expect(absent, isEmpty, reason: 'стилю назначен профиль, а картинки нет');
    expect(light, isEmpty, reason: 'плитка подозрительно лёгкая — не заглушка ли');
  });

  test('каждому профилю каталога назначен ИЗВЕСТНЫЙ стиль', () {
    final strangers = shelfByProfile.entries
        .where((e) => !shelfStyles.contains(e.value))
        .map((e) => '${e.key} → ${e.value}')
        .toList();
    expect(strangers, isEmpty);
    // Профиль по умолчанию обязан стоять в таблице явно: его видят чаще всех.
    expect(shelfByProfile.containsKey('nzt48'), isTrue);
    expect(shelfForProfile('такого профиля нет'), 'birch');
    expect(shelfForProfile(null), 'birch');
  });

  testWidgets('🔴 ЭКРАН РИСУЕТ ПЛИТКУ ПРОФИЛЯ: nzt48 — орех, а не берёза', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(_shelfPath(tester), 'assets/goods/niche-walnut.webp');
  });

  testWidgets('🔴 СМЕНА ПРОФИЛЯ МЕНЯЕТ ШКАФ: kids — мята', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(_shelfPath(tester), 'assets/goods/niche-mint.webp');
  });

  testWidgets('незнакомый профиль не валит экран, а даёт берёзу', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'выдуманный'});
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(find.byType(GoodsField), findsOneWidget);
    expect(_shelfPath(tester), 'assets/goods/niche-birch.webp');
  });

  test('таблица стилей та же, что в вебе — сверка с живым исходником TS', () {
    // 🔴 ЗАЧЕМ ЧИТАТЬ ВЕБ. Таблица перенесена руками, и руками же она разъедется:
    // профиль добавят в вебе, а сюда — нет, и приложение молча покажет берёзу.
    // Здесь чтение исходника уместно: сверяется ПЕРЕНОС, а не поведение, —
    // поведение проверено тремя пробами выше, кадром экрана.
    final ts = File('../frontend/src/games/goods-sort/core/level.ts');
    if (!ts.existsSync()) return;   // в сборке приложения веба рядом нет — это не поломка
    final slice = RegExp(r'SHELF_BY_PROFILE: Record<string, ShelfStyle> = \{([^}]*)\}')
        .firstMatch(ts.readAsStringSync());
    expect(slice, isNotNull, reason: 'таблица в вебе переименована — перенос устарел');
    final fromWeb = <String, String>{};
    for (final m in RegExp(r"(\w+):\s*'(\w+)'").allMatches(slice!.group(1)!)) {
      fromWeb[m.group(1)!] = m.group(2)!;
    }
    expect(fromWeb, isNotEmpty);
    expect(shelfByProfile, fromWeb, reason: 'таблицы веба и приложения разошлись');
  });
}
