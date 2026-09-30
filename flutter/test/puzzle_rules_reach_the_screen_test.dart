import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРАВИЛО ИГРЫ ДОХОДИТ ДО ЧЕЛОВЕКА, А НЕ ЛЕЖИТ В СЛОВАРЕ.
///
/// ПОВОД, 24.09.2026. Нативный экран головоломок показывал доску и НИ СЛОВА о
/// правилах. Текст при этом в словаре лежал — показать его было нечем. Отчёт
/// тестировщика по «Рельсам»: человек полтора часа искал, «как повернуть кусок»,
/// хотя поворота в игре нет вовсе. Сорок два режима, правила у всех разные, и с
/// доски они не угадываются.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final libPath = '${Directory.current.path}/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    await PuzzleModes.load();
  });

  test('🔴 у КАЖДОГО из 42 режимов есть ключ правила и текст под ним', () {
    final dict = jsonDecode(
      File('${Directory.current.path}/assets/l10n/ru.json').readAsStringSync(),
    ) as Map<String, dynamic>;

    final without = <String>[];
    for (final e in PuzzleModes.all.entries) {
      final key = e.value.descKey;
      if (key == null || key.isEmpty) {
        without.add('${e.key}: ключа нет');
        continue;
      }
      final text = dict[key];
      if (text is! String || text.trim().isEmpty) without.add('${e.key}: под «$key» пусто');
    }
    expect(without, isEmpty);
    expect(PuzzleModes.all.length, 42);
  });

  test('🔴 правило «Рельсов» больше НЕ врёт про тап по клетке', () {
    /*
     * Раздел «Сортировки» взял правила у автора (`puzzles.but`): рельс кладётся
     * нажатием на ГРАНИЦУ между клетками, а тап внутрь лишь помечает «здесь рельс
     * есть». Прежний текст называл пометку укладкой и отправлял человека не туда.
     * Проба держит именно это: текст говорит про протяжку и про то, что поворачивать
     * ничего не надо.
     */
    final rule = L.t(PuzzleModes.all['Train Tracks']!.descKey!);
    expect(rule, contains('Тяни'), reason: 'правило не говорит про протяжку');
    expect(rule.contains('Тапни клетку — положишь рельс'), isFalse,
        reason: 'вернулся текст, который врал про способ хода');
  });

  testWidgets('🔴 кнопка справки на экране есть и показывает правило ИМЕННО этого режима',
      (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: 'Bridges', libraryPath: libPath),
      ));
      for (var i = 0; i < 200; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byTooltip('Правила').evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    expect(find.byTooltip('Правила'), findsOneWidget, reason: 'кнопки справки нет');
    await tester.tap(find.byTooltip('Правила'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('game-rules')), findsOneWidget, reason: 'справка не открылась');
    // Текст — правило ЭТОГО режима, а не общая фраза про головоломки.
    expect(find.text(L.t('puzzlesBridgesDesc')), findsOneWidget);
  });
}
