import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cake_sort/board.dart';
import 'package:psygames_flutter/games/cake_sort/screen.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/games/sort_tubes/board.dart';
import 'package:psygames_flutter/games/sort_tubes/screen.dart';
import 'package:psygames_flutter/games/tower_london/board.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «СОРТИРОВКИ» ГОВОРЯТ НА ЯЗЫКЕ ИГРОКА — НА ВСЕХ ДВЕНАДЦАТИ.
///
/// 02.10.2026, задача 48ca6466: основной язык — английский (решение Дениса 01.10), а семь
/// нативных экранов раздела говорили по-русски на любом телефоне. Храповик
/// `ui_text_debt_does_not_grow_test.dart` считает литералы в ИСХОДНИКЕ; он не видит ключ,
/// не доехавший до сборки (на экране — имя ключа), и русский «клей» между переведёнными
/// кусками. Поэтому здесь смотрится ЭКРАН: на каждом языке, кроме русского, в его текстах,
/// метках для чтеца экрана и подсказках нет ни одной кириллической буквы, и ни на одном
/// языке текст не совпадает с именем ключа. Образец — `spatial_screens_speak_every_language_test.dart`.
///
/// ⚠️ ОКНО — САМОЕ УЗКОЕ, 360×640: немецкий и французский длиннее русского, и перевод,
/// переполняющий ряд, Flutter отдаёт исключением раскладки — проба его ловит тем же заходом.
///
/// ⚠️ ГРАНИЦА. Смотрится начало партии (шапка, счётчики, ряд действий, доска) и у пробирок —
/// подпись отказа; итог партии требует сыгранного уровня, его тексты проверены в пробах экранов.
void main() {
  late SharedState state;
  final keyNames = <String>{};
  final shellOwn = <String>{};
  final cyrillic = RegExp('[А-Яа-яЁё]');
  final keyShaped = RegExp(r'^([a-z][a-z0-9]*([A-Z][a-z0-9]*)+|[a-z][a-z0-9]*(_[a-z0-9]+)+)$');

  setUpAll(() {
    final dict = jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map<String, dynamic>;
    keyNames.addAll(dict.keys);
    // У каркаса свои русские подсказки (его долг в храповике) — пропускаются поимённо.
    final src = File('lib/shell/game_shell.dart')
        .readAsStringSync()
        .replaceAll(RegExp(r'/\*.*?\*/', dotAll: true), '')
        .replaceAll(RegExp(r'//.*'), '');
    for (final m in RegExp("'([^'\\n]*[А-Яа-яЁё][^'\\n]*)'").allMatches(src)) {
      shellOwn.add(m[1]!);
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
  });
  tearDown(() async => L.load('ru'));

  List<String> texts(WidgetTester tester) => [
        for (final t in tester.widgetList<Text>(find.byType(Text))) t.data ?? t.textSpan?.toPlainText() ?? '',
        for (final s in tester.widgetList<Semantics>(find.byType(Semantics)))
          if (s.properties.label != null) s.properties.label!,
        for (final t in tester.widgetList<Tooltip>(find.byType(Tooltip)))
          if (t.message != null) t.message!,
      ].where((t) => !shellOwn.contains(t)).toList();

  List<String> faults(WidgetTester tester, String code, String phase) => [
        for (final t in texts(tester))
          if (code != 'ru' && cyrillic.hasMatch(t))
            '$code, $phase: по-русски «$t»'
          else if ([t, ...t.split(': ')].map((p) => p.trim()).any((p) => keyNames.contains(p) || keyShaped.hasMatch(p)))
            '$code, $phase: ключ вместо текста «$t»',
      ];

  /// Экран ждётся настоящим временем: уровни читаются из ассетов.
  Future<void> open(WidgetTester tester, Widget screen, Type board) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(() async {
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(board).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  testWidgets('🔴 пробирки, шарики, гайки: шапка, доска и подпись отказа — на языке игрока', (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await tester.runAsync(() => L.load(code));
      for (final (name, title, skin, id) in [
        ('пробирки', L.t('waterSort'), TubeSkin.water, 'water_sort'),
        ('шарики', L.t('ballSort'), TubeSkin.balls, 'ball_sort'),
        ('гайки', L.t('nutSort'), TubeSkin.nuts, 'nut_sort'),
      ]) {
        await open(tester, SortTubesScreen(state: state, gameId: id, title: title, skin: skin), TubesField);
        expect(find.byType(TubesField), findsOneWidget, reason: '$code, $name: экран дошёл до доски');
        expect(tester.takeException(), isNull, reason: '$code, $name: раскладка партии');
        bad.addAll(faults(tester, code, '$name, партия'));
        // Отказ: на первом уровне все цветные сосуды полные — ход 0 → 1 называет причину.
        await tester.tap(find.byKey(const ValueKey('tube-0')));
        await tester.pump();
        await tester.tap(find.byKey(const ValueKey('tube-1')));
        await tester.pump();
        bad.addAll(faults(tester, code, '$name, отказ'));
        await tester.pump(const Duration(seconds: 3));
      }
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 товары, Лондон, Ханой, торты, пицца: шапка и доска — на языке игрока', (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await tester.runAsync(() => L.load(code));
      for (final (name, screen, board) in [
        ('товары', GoodsSortScreen(state: state) as Widget, GoodsField),
        ('Лондон', TowerLondonScreen(state: state) as Widget, TolBoard),
        ('Ханой', HanoiScreen(state: state) as Widget, HanoiBoard),
        (
          'торты',
          CakeSortScreen(state: state, gameId: 'cake_sort', title: L.t('cakeSort'), skin: CakeSkin.cake) as Widget,
          CakeTable
        ),
        (
          'пицца',
          CakeSortScreen(state: state, gameId: 'pizza_sort', title: L.t('pizzaSort'), skin: CakeSkin.pizza) as Widget,
          CakeTable
        ),
      ]) {
        await open(tester, screen, board);
        expect(find.byType(board), findsOneWidget, reason: '$code, $name: экран дошёл до доски');
        expect(tester.takeException(), isNull, reason: '$code, $name: раскладка партии');
        bad.addAll(faults(tester, code, '$name, партия'));
      }
    }
    expect(bad, isEmpty);
  });
}
