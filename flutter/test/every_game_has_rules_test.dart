import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 СПРАВКА ЕСТЬ У КАЖДОЙ ПЕРЕНЕСЁННОЙ ИГРЫ, А НЕ У ОДНОЙ.
///
/// Цель Дениса 24.09.2026: «решатель и учитель для наших игр, чтобы был у всех
/// хабов и игр». Первая часть — правило: до сегодня нативный экран не показывал
/// его ВООБЩЕ, и человек оставался с доской один на один (полтора часа поисков
/// поворота в «Рельсах», которого в игре нет).
///
/// ⚠️ Проба идёт по КАРТЕ ПЕРЕХВАТА, а не по списку, который я бы написал руками:
/// список устарел бы на первом же перенесённом экране.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await L.load('ru');
    await GameRules.load();
  });

  test('🔴 у каждого перехваченного адреса игры есть ключ правила и текст под ним', () {
    final dict = jsonDecode(
      File('${Directory.current.path}/assets/l10n/ru.json').readAsStringSync(),
    ) as Map<String, dynamic>;

    final routes = HybridApp.native.keys.where((r) => !r.endsWith('-hub')).toList();
    expect(routes.length, greaterThan(90), reason: 'перехваченных игр ${routes.length}');

    /*
     * 🔴 ИГРА БЕЗ ПРАВИЛА — ПОИМЁННО И С ПРИЧИНОЙ, А НЕ МОЛЧА.
     *
     * «Бездна» — не «фрактал поглубже», а отдельная игра: марафон с деревом до трёх
     * слоёв, партия живёт неделями. Подставить ей правило обычного фрактала значило
     * бы соврать — ровно так врала справка «Рельсов». Текст пишет ВЛАДЕЛЕЦ игры,
     * выверяя его на людях; задача разделу «Судоку» заведена.
     */
    const noRuleYet = {
      '/games/sudoku-fractal-deep':
          'отдельная игра-марафон, своего правила нет ни в одном словаре; пишет раздел «Судоку»',
    };

    final without = <String>[];
    for (final r in routes) {
      if (noRuleYet.containsKey(r)) continue;
      final key = GameRules.keyFor(r);
      if (key == null) {
        without.add('$r: ключа правила нет');
        continue;
      }
      final text = dict[key];
      if (text is! String || text.trim().isEmpty) without.add('$r: под «$key» пусто');
    }
    expect(without, isEmpty,
        reason: 'игра без правила — это доска, с которой человек остаётся один на один');
  });

  testWidgets('🔴 каркас показывает правило САМ, без участия экрана', (tester) async {
    GameRules.currentRoute = '/games/hanoi';
    addTearDown(() => GameRules.currentRoute = null);

    await tester.pumpWidget(MaterialApp(
      home: GameShell(
        title: 'Проба',
        field: (_, _) => const SizedBox.shrink(),
      ),
    ));
    await tester.pump();

    expect(find.byTooltip('Правила'), findsOneWidget,
        reason: 'экран ничего не передавал — кнопку обязан дать каркас');
    await tester.tap(find.byTooltip('Правила'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('game-rules')), findsOneWidget);
    expect(find.text(L.t(GameRules.keyFor('/games/hanoi')!)), findsOneWidget);
  });

  testWidgets('🔴 режим с хвостом получает СВОЁ правило, а не общее у игры', (tester) async {
    // За `/games/puzzles?mode=Bridges` стоит своя игра. Общее правило головоломок
    // тут соврало бы, а врущая справка хуже её отсутствия — это и был дефект «Рельсов».
    final whole = GameRules.keyFor('/games/puzzles?mode=Bridges');
    final base = GameRules.keyFor('/games/puzzles');
    expect(whole, isNotNull);
    expect(whole == base, isFalse, reason: 'режиму подставили правило другой игры');
  });

  testWidgets('нет адреса — нет и кнопки: пустая справка хуже её отсутствия', (tester) async {
    GameRules.currentRoute = null;
    await tester.pumpWidget(MaterialApp(
      home: GameShell(title: 'Проба', field: (_, _) => const SizedBox.shrink()),
    ));
    await tester.pump();
    expect(find.byTooltip('Правила'), findsNothing);
  });

  test('список игр без правила не протух: у каждой всё ещё нет ключа', () {
    // Иначе запись переживёт саму причину, и правило, которое появилось, никто не
    // подключит — исключение молча станет дырой.
    expect(GameRules.keyFor('/games/sudoku-fractal-deep'), isNull,
        reason: 'правило появилось — убери адрес из списка исключений');
  });
}
