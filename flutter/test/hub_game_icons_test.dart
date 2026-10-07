import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
/// · строка, подписанная своим ключом (`suiteStroop`), находит иконку по адресу;
/// · 01.10.2026 «да делай»: у режимов своя иконка (`MODE_ICONS`, ключ — адрес целиком) —
///   без иконки не остаётся НИ ОДНОЙ строки развилок (замер до: 50 строк из 113).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final index = jsonDecode(File('assets/game_icons/index.json').readAsStringSync()) as Map<String, dynamic>;

  test('🔴 выгрузка свежая: картинки байт в байт как в вебе, карта ключей пересчитывается из реестра', () {
    final reg = File('../frontend/src/constants/gameIcons.ts').readAsStringSync();
    final games = File('../frontend/src/constants/games.ts').readAsStringSync();
    final registry = {
      for (final m in RegExp(r"^\s*'?([a-z0-9_-]+)'?:\s*require\('\.\./\.\./assets/images/game_icons/([^']+)'\)", multiLine: true)
          .allMatches(reg))
        m.group(1)!: m.group(2)!,
    };
    final modes = {
      // Адрес — любой экран (07.10.2026: «Ночная» развилки «Релаксация» на `/warmup-night`), как в выгрузке.
      for (final m in RegExp(r"^\s*'(/[^']+)':\s*require\('\.\./\.\./assets/images/game_icons/([^']+)'\)", multiLine: true)
          .allMatches(reg))
        m.group(1)!: m.group(2)!,
    };
    expect(modes.length, greaterThan(40));
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
    byRoute.addAll(modes);
    expect(index['byNameKey'], byNameKey, reason: 'перевыгрузи: node flutter/tools/embed-game-icons.mjs');
    expect(index['byRoute'], byRoute, reason: 'перевыгрузи: node flutter/tools/embed-game-icons.mjs');
    for (final f in {...registry.values, ...modes.values}) {
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
    final towers = hubIconFile(index, card('/games/sudoku?mode=towers', 'sudokuTowersTitle'));
    expect(towers, isNotNull, reason: 'у режима «Башни» своя иконка');
    expect(towers, isNot(index['byRoute']['/games/sudoku']),
        reason: 'режим «Башни» — не обычное судоку: иконку обычного не берём');
    expect(hubIconFile(index, card('/games/puzzles?mode=Net', 'net')), isNot(index['byRoute']['/games/puzzles']),
        reason: 'у головоломки своя иконка, не иконка всей развилки');
  });

  test('🔴 у КАЖДОЙ игры каталога (GAMES) есть иконка — и у карточек-развилок тоже', () {
    final reg = File('../frontend/src/constants/gameIcons.ts').readAsStringSync();
    final games = File('../frontend/src/constants/games.ts').readAsStringSync();
    final registry = {
      for (final m in RegExp(r"^\s*'?([a-z0-9_-]+)'?:\s*require\(", multiLine: true).allMatches(reg)) m.group(1)!,
    };
    final ids = [
      for (final m in RegExp(r"^\s*id:\s*'([^']+)'", multiLine: true)
          .allMatches(games.substring(games.indexOf('export const GAMES'))))
        m.group(1)!,
    ];
    expect(ids.length, greaterThan(90));
    expect(ids.where((id) => !registry.contains(id)).toList(), isEmpty,
        reason: 'игра без иконки: добавь в GAME_ICONS (развилка — плитка-папка из иконок её игр)');
  });

  test('🔴 у КАЖДОЙ строки нативных развилок есть иконка игры', () {
    final hubs = (jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>)['hubs'] as Map<String, dynamic>;
    final missing = <String>[];
    var rows = 0;
    for (final e in hubs.entries) {
      for (final c in (e.value as List).cast<Map<String, dynamic>>()) {
        rows++;
        final card = HubCard(route: c['route'] as String, icon: 'apps', nameKey: c['nameKey'] as String, descKey: '', type: null);
        final f = hubIconFile(index, card);
        if (f == null || !File('assets/game_icons/$f').existsSync()) missing.add('${e.key} → ${card.route}');
      }
    }
    expect(rows, greaterThan(100));
    expect(missing, isEmpty, reason: 'строки без иконки: добавь в GAME_ICONS или MODE_ICONS и перевыгрузи');
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

    testWidgets('«Судоку»: режим «Башни» рисует СВОЮ иконку', (tester) async {
      await boot(tester, '/games/sudoku-hub');
      final icon = find.byKey(const ValueKey('hub-icon-/games/sudoku?mode=towers'));
      expect(icon, findsOneWidget);
      expect((tester.widget<Image>(icon).image as AssetImage).assetName,
          'assets/game_icons/${index['byRoute']['/games/sudoku?mode=towers']}');
    });

    testWidgets('🔴 EN: уровень на строке — словом языка, а не русским «ур.»', (tester) async {
      // До 01.10.2026 подпись была вшита строкой 'ур. N' во все нативные развилки.
      await L.load('en');
      await boot(tester, '/games/sudoku-hub');
      expect(find.textContaining('ур.'), findsNothing);
      expect(find.text('${L.t('unitLevelShort')} 1'), findsWidgets);
    });

    testWidgets('нет карты иконок — строки с прежним значком, не пустое место', (tester) async {
      // Карту подменяем пустой: новая строка без иконки (или битая выгрузка) не должна
      // оставлять дыру в ряду.
      final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMessageHandler('flutter/assets', (msg) async {
        final key = Uri.decodeFull(utf8.decode(msg!.buffer.asUint8List(msg.offsetInBytes, msg.lengthInBytes)));
        if (key == 'assets/game_icons/index.json') return ByteData.sublistView(utf8.encode('{}'));
        final f = File(key);
        return f.existsSync() ? ByteData.sublistView(f.readAsBytesSync()) : null;
      });
      addTearDown(() => messenger.setMockMessageHandler('flutter/assets', null));
      await boot(tester, '/games/sudoku-hub');
      final row = find.byKey(const ValueKey('hub-card-/games/sudoku?mode=towers'));
      expect(row, findsOneWidget);
      expect(find.descendant(of: row, matching: find.byType(CircleAvatar)), findsOneWidget);
      expect(find.descendant(of: row, matching: find.byType(Image)), findsNothing);
    });
  });
}
