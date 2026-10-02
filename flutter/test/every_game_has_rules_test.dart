import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';

import 'support/hub_routes.dart';

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

    // Развилки — не игры. Что такое развилка — `test/support/hub_routes.dart`:
    // по реестру развилок, а не по имени на `-hub` (две из 13 называются иначе).
    final routes = HybridApp.native.keys.where((r) => !isHubRoute(r)).toList();
    expect(routes.length, greaterThan(90), reason: 'перехваченных игр ${routes.length}');

    /*
     * 🔴 ИГРА, ЧЬЁ ПРАВИЛО ПО АДРЕСУ НЕ НАЙТИ, — ПОИМЁННО, И ЭКРАН ДАЁТ ЕГО САМ.
     *
     * «Бездна» — не «фрактал поглубже», а отдельная игра: марафон с деревом до трёх
     * слоёв. Карточки в развилках у неё нет (вход — дверь из фрактала), поэтому каркас
     * правила по адресу не найдёт. Текст при этом есть — `deepHowTo`, карточка экрана
     * настройки веба, 12 языков; экран передаёт его в каркас сам (`onRules`, проба
     * `deep_screen_test`). Здесь сторожим, что под ключом не пусто.
     */
    const screenGivesRule = {'/games/sudoku-fractal-deep': 'deepHowTo'};

    final without = <String>[];
    for (final r in routes) {
      final own = screenGivesRule[r];
      if (own != null) {
        final text = dict[own];
        if (text is! String || text.trim().isEmpty) without.add('$r: под «$own» пусто');
        continue;
      }
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

    expect(find.byTooltip(L.t('btn_rules')), findsOneWidget,
        reason: 'экран ничего не передавал — кнопку обязан дать каркас');
    await tester.tap(find.byTooltip(L.t('btn_rules')));
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
    expect(find.byTooltip(L.t('btn_rules')), findsNothing);
  });

  test('список игр, чьё правило даёт экран, не протух: по адресу его всё ещё не найти', () {
    // Иначе запись переживёт саму причину: появись карточка «Бездны» в развилке, каркас
    // найдёт её описание сам, и два источника правила разойдутся молча.
    expect(GameRules.keyFor('/games/sudoku-fractal-deep'), isNull,
        reason: 'каркас нашёл правило по адресу — убери адрес из списка исключений');
  });
}
