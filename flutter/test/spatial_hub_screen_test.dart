import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_hub/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗВИЛКА ВЕДЁТ ТУДА, КУДА НАПИСАНО — И ТУДА, ЧЕГО ЕЩЁ НЕТ НАТИВНО.
///
/// 🔴 Половина карточек ведёт в игры, которые ещё в вебе. Проба нажимает КАЖДУЮ и проверяет, что
/// маршрут ушёл хосту целиком, вместе с `?mode=`: срежь запрос — и «Клоцки» с «Сокобаном»
/// откроют одну и ту же игру, а никакая проверка маршрутов этого не заметит (адрес-то один).
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_mental_rotation_level_nzt48': '7',
      'psygames_spatial_lab_net_level_nzt48': '3',
    });
    state = await SharedState.open();
    await L.load('ru');
  });

  Future<List<String>> boot(WidgetTester tester, {bool withReceiver = true}) async {
    final opened = <String>[];
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: SpatialHubScreen(
            state: state,
            onOpen: withReceiver ? opened.add : null,
          ),
        ),
      );
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    return opened;
  }

  testWidgets('🔴 состав развилки — тот же и в том же порядке, что в вебе', (tester) async {
    await boot(tester);
    expect(find.text('Пространство'), findsWidgets);
    expect(spatialHubCards.map((c) => c.route).toList(), [
      '/games/mental-rotation',
      '/games/spatial-lab?mode=twiddle',
      '/games/spatial-lab?mode=net',
      '/games/puzzles?mode=Slide',
      '/games/puzzles?mode=Sokoban',
      '/games/dots-connect',
      '/games/one-line',
      '/games/trail-making',
      '/games/navigator',
    ]);
    expect(find.text('Ментальная ротация'), findsOneWidget);
    expect(find.byKey(const Key('hub-grid-3')), findsOneWidget);
  });

  testWidgets('🔴 каждая карточка уходит хосту своим маршрутом целиком', (tester) async {
    final opened = await boot(tester);
    for (final card in spatialHubCards) {
      await tester.ensureVisible(find.byKey(Key('hub-card-${card.route}')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key('hub-card-${card.route}')));
      await tester.pump();
    }
    expect(opened, spatialHubCards.map((c) => c.route).toList(),
        reason: 'маршрут уходит как написан — с запросом режима');
  });

  testWidgets('🔴 уровень на карточке берётся из ОБЩЕЙ памяти, а не заводится заново',
      (tester) async {
    await boot(tester);
    expect(find.text('ур. 7'), findsOneWidget, reason: 'уровень «Ротации» из ключа веб-стороны');
    expect(find.text('ур. 3'), findsOneWidget, reason: 'уровень «Сети труб»');
    expect(find.text('ур. 1'), findsWidgets);
  });

  testWidgets('🔴 без хоста нажатие не роняет экран', (tester) async {
    HybridApp.open = null;
    await boot(tester, withReceiver: false);
    final card = find.byKey(const Key('hub-card-/games/navigator'));
    await tester.ensureVisible(card);
    await tester.pumpAndSettle();
    await tester.tap(card);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('🔴 у каждой из девяти карточек — иллюстрация игры из общей карты', (tester) async {
    final hubArt = (jsonDecode(File('assets/hub_art/index.json').readAsStringSync())
        as Map<String, dynamic>)['byRoute'] as Map<String, dynamic>;
    await boot(tester);
    for (final card in spatialHubCards) {
      final row = find.byKey(Key('hub-card-${card.route}'));
      await tester.ensureVisible(row);
      await tester.pump();
      final icon = find.descendant(of: row, matching: find.byKey(ValueKey('hub-icon-${card.route}')));
      expect(icon, findsOneWidget, reason: '${card.route}: карточка без иллюстрации');
      final image = tester.widget<Image>(find.descendant(of: icon, matching: find.byType(Image)));
      final artwork = (hubArt[card.route] as Map<String, dynamic>)['light'] as String;
      expect((image.image as AssetImage).assetName, artwork,
          reason: '${card.route}: иллюстрация чужой игры');
      expect(File(artwork).existsSync(), isTrue,
          reason: '${card.route}: файла иллюстрации нет — экран показал бы запасной значок');
    }
  });

  testWidgets('нет карт иллюстраций и иконок — карточки с прежним значком, не пустое место', (tester) async {
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMessageHandler('flutter/assets', (msg) async {
      final key = Uri.decodeFull(utf8.decode(msg!.buffer.asUint8List(msg.offsetInBytes, msg.lengthInBytes)));
      if (key == 'assets/game_icons/index.json' || key == 'assets/hub_art/index.json') {
        return ByteData.sublistView(utf8.encode('{}'));
      }
      final f = File(key);
      return f.existsSync() ? ByteData.sublistView(f.readAsBytesSync()) : null;
    });
    addTearDown(() => messenger.setMockMessageHandler('flutter/assets', null));
    await boot(tester);
    final row = find.byKey(const Key('hub-card-/games/mental-rotation'));
    expect(find.descendant(of: row, matching: find.byType(Icon)), findsWidgets);
    expect(find.descendant(of: row, matching: find.byType(Image)), findsNothing);
  });
}
