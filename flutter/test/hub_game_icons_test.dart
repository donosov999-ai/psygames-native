import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🖼 ИКОНКИ ИГР В СТРОКАХ НАТИВНЫХ РАЗВИЛОК (задача 4c3ba7c9, решение Дениса 01.10.2026).
///
/// До 01.10 развилки приложения рисовали значок Material, а иконки «поле игры в
/// миниатюре» жили только в вебе: картинок-иконок в `flutter/assets` было 0.
/// Меряем три вещи:
/// · выгрузка свежая — каждая картинка байт в байт как в веб-реестре, карта ключей
///   пересчитывается из `gameIcons.ts` + `games.ts` тем же правилом, что у
///   `flutter/tools/embed-game-icons.mjs` (правка реестра без перевыгрузки — красный);
/// · строка с иконкой рисует картинку, строка без иконки — прежний значок, не пустоту;
/// · строка, подписанная своим ключом (`suiteStroop`), находит иконку по адресу.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final index = jsonDecode(File('assets/game_icons/index.json').readAsStringSync()) as Map<String, dynamic>;

  test('🔴 выгрузка свежая: картинки байт в байт как в вебе, карта ключей пересчитывается из реестра', () {
    final reg = File('../frontend/src/constants/gameIcons.ts').readAsStringSync();
    final games = File('../frontend/src/constants/games.ts').readAsStringSync();
    final registry = {
      for (final m in RegExp(r"^\s*([a-z0-9_]+):\s*require\('\.\./\.\./assets/images/game_icons/([^']+)'\)", multiLine: true)
          .allMatches(reg))
        m.group(1)!: m.group(2)!,
    };
    expect(registry.length, greaterThan(70));
    final byNameKey = <String, String>{};
    final byRoute = <String, String>{};
    String? id;
    for (final line in games.substring(games.indexOf('export const GAMES')).split('\n')) {
      final i = RegExp(r"^\s*id:\s*'([^']+)'").firstMatch(line);
      if (i != null) {
        id = i.group(1);
        continue;
      }
      if (id == null) continue;
      final n = RegExp(r"^\s*nameKey:\s*'([^']+)'").firstMatch(line);
      if (n != null && registry[id] != null) byNameKey.putIfAbsent(n.group(1)!, () => registry[id]!);
      final r = RegExp(r"^\s*route:\s*'([^']+)'").firstMatch(line);
      if (r != null && registry[id] != null) byRoute.putIfAbsent(r.group(1)!, () => registry[id]!);
    }
    expect(index['byNameKey'], byNameKey, reason: 'перевыгрузи: node flutter/tools/embed-game-icons.mjs');
    expect(index['byRoute'], byRoute, reason: 'перевыгрузи: node flutter/tools/embed-game-icons.mjs');
    for (final f in registry.values.toSet()) {
      final web = File('../frontend/assets/images/game_icons/$f').readAsBytesSync();
      final app = File('assets/game_icons/$f');
      expect(app.existsSync(), isTrue, reason: '$f нет в приложении');
      expect(app.readAsBytesSync(), web, reason: '$f в приложении не та, что в вебе');
    }
  });

  test('поиск иконки: по ключу названия, затем по адресу целиком (с режимом)', () {
    HubCard card(String route, String nameKey) =>
        HubCard(route: route, icon: 'apps', nameKey: nameKey, descKey: '', type: null);
    expect(hubIconFile(index, card('/games/digit-span', 'digitSpan')), isNotNull);
    expect(hubIconFile(index, card('/games/stroop', 'suiteStroop')), index['byRoute']['/games/stroop'],
        reason: 'строка подписана своим ключом — иконка по адресу');
    expect(hubIconFile(index, card('/games/sudoku?mode=towers', 'sudokuTowersTitle')), isNull,
        reason: 'режим «Башни» — не обычное судоку: иконку обычного не берём');
  });

  group('экран развилки', () {
    late SharedState state;
    setUp(() async {
      SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
      state = await SharedState.open();
      await L.load('ru');
    });

    Future<void> boot(WidgetTester tester, String hub) async {
      tester.view.physicalSize = const Size(780, 1688);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: HybridApp.native[hub]!(state)));
        for (var i = 0; i < 40; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 50));
          if (find.byType(Card).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
    }

    testWidgets('🔴 «Слух»: строки с иконкой рисуют картинку игры, а не значок', (tester) async {
      await boot(tester, '/games/hearing-hub');
      final icon = find.byKey(const ValueKey('hub-icon-/games/phoneme-pairs'));
      expect(icon, findsOneWidget);
      final img = tester.widget<Image>(icon);
      expect((img.image as AssetImage).assetName, 'assets/game_icons/${index['byNameKey']['phonemePairs']}');
      expect(find.byType(CircleAvatar), findsNothing, reason: 'у всех пяти игр «Слуха» иконки есть');
    });

    testWidgets('«Конфликт внимания»: «Струп» подписан своим ключом — иконка всё равно есть', (tester) async {
      await boot(tester, '/games/attention-conflict');
      expect(find.byKey(const ValueKey('hub-icon-/games/stroop')), findsOneWidget);
    });

    testWidgets('строка без иконки (режим судоку) — прежний значок, не пустое место', (tester) async {
      await boot(tester, '/games/sudoku-hub');
      final row = find.byKey(const ValueKey('hub-card-/games/sudoku?mode=towers'));
      expect(row, findsOneWidget);
      expect(find.descendant(of: row, matching: find.byType(CircleAvatar)), findsOneWidget);
      expect(find.descendant(of: row, matching: find.byType(Image)), findsNothing);
    });
  });
}
