import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_about.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/ionicons.g.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';

/// 🔴 «ОБ ИГРЕ» — ОДИН БЛОК КАРКАСА ДЛЯ ВСЕХ ИГР (задача 3a365b5d, 12.11.2026).
///
/// У веба блок стоял в 57 экранах, во Flutter его не перенесла ни одна игра. Теперь он в паузе каркаса
/// по `LevelLadder.current.gameId`, данные — `assets/game_about.json`. Сторож: таблица полна (игры есть в
/// каталоге, тексты — на всех 12 языках, значки — в шрифте), пауза показывает блок у игры с данными и не
/// показывает у игры без них.
class _Game extends StatefulWidget {
  const _Game(this.gameId);
  final String gameId;
  @override
  State<_Game> createState() => _GameState();
}

class _GameState extends State<_Game> {
  late final ladder = LevelLadder(gameId: widget.gameId, store: MemoryLevelStore());

  @override
  void initState() {
    super.initState();
    ladder.load().then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) => GameShell(title: 'Проба', field: (_, _) => const SizedBox.expand());
}

void main() {
  final table = GameAboutData.parse(File('assets/game_about.json').readAsStringSync());

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  setUp(() {
    GamePreset.clear();
    GameAboutData.debugSet(table);
  });
  tearDown(() => GameAboutData.debugSet(null));

  group('таблица assets/game_about.json', () {
    test('не меньше 59 игр веба, у каждой описание и польза', () {
      expect(table.length, greaterThanOrEqualTo(59));
      for (final MapEntry(:key, :value) in table.entries) {
        expect(value.description, isNotEmpty, reason: key);
        expect(value.benefits, isNotEmpty, reason: key);
      }
    });

    test('каждая игра — в каталоге', () {
      final catalog = jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map;
      final ids = {for (final g in (catalog['games'] as List).cast<Map>()) g['id']};
      expect([
        for (final id in table.keys)
          if (!ids.contains(id)) id,
      ], isEmpty);
    });

    test('🔴 тексты — на всех 12 языках словаря сборки (иначе на экране ключ)', () {
      final keys = {
        for (final a in table.values) ...[a.description, for (final b in a.benefits) b.key],
      };
      for (final loc in ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
        final dict = jsonDecode(File('assets/l10n/$loc.json').readAsStringSync()) as Map;
        expect(
          [
            for (final k in keys)
              if (dict[k] is! String || (dict[k] as String).isEmpty) k,
          ],
          isEmpty,
          reason: loc,
        );
      }
    });

    test('значки — из шрифта веба (Ionicons)', () {
      final icons = {
        for (final a in table.values)
          for (final b in a.benefits) b.ion,
      };
      expect([
        for (final i in icons)
          if (Ion.of(i) == null) i,
      ], isEmpty);
    });
  });

  Future<void> openPause(WidgetTester t, String gameId) async {
    await t.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => _Game(gameId))));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip(L.t('teachPause')));
    await t.pumpAndSettle();
  }

  testWidgets('🔴 пауза игры с данными: «Об игре» свёрнуто, по нажатию — описание и польза', (t) async {
    await openPause(t, 'schulte_table');
    final about = table['schulte_table']!;
    expect(find.byKey(const Key('pause-game-about')), findsOneWidget);
    expect(find.byKey(const Key('pause-game-about-body')), findsNothing, reason: 'свёрнуто по умолчанию');
    await t.ensureVisible(find.byKey(const Key('pause-game-about-toggle')));
    await t.tap(find.byKey(const Key('pause-game-about-toggle')));
    await t.pumpAndSettle();
    expect(find.text(L.t(about.description)), findsOneWidget);
    for (final b in about.benefits) {
      expect(find.byKey(Key('pause-game-about-${b.key}')), findsOneWidget, reason: b.key);
    }
  });

  testWidgets('игра без данных — блока нет (каркас не рисует пустое)', (t) async {
    await openPause(t, 'probe_no_about');
    expect(find.byKey(const Key('pause-game-about')), findsNothing);
  });
}
