import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/model.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «СВОБОДНО» В ШУЛЬТЕ НА ЭКРАНЕ (задача 5250081b, 13.11.2026): как у веба — «Уровни / Свободно» и
/// все ручные модификации. Проба играет, как игрок: жмёт кнопки настройки по ключам, «Начать» и
/// клетки, которые велит строка цели. Лестница стоит, партия уходит в статистику со своей меткой.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  late SharedState state;
  late List<Map<String, dynamic>> reports;
  const levelKey = '${SharedState.prefix}schulte_table_level_nzt48';

  Future<void> open(WidgetTester tester) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    SharedPreferences.setMockInitialValues({'${SharedState.prefix}language': 'ru'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(key: UniqueKey(), state: state)));
    await tester.pump();
    await tester.pump();
  }

  Finder chip(String key) => find.byKey(Key(key));

  /// Кнопка настройки лежит в прокручиваемой панели — докручиваем и жмём.
  Future<void> pick(WidgetTester tester, String key) async {
    final f = chip(key);
    expect(f, findsOneWidget, reason: 'кнопка $key есть на экране настройки');
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f);
    await tester.pump();
  }

  Future<void> start(WidgetTester tester) async {
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
  }

  /// Клетки поля: (номер, текст, цвет текста).
  List<(int, String, Color?)> cells(WidgetTester tester) {
    final out = <(int, String, Color?)>[];
    for (var i = 0; i < 200; i += 1) {
      final cell = find.byKey(Key('клетка$i'));
      if (cell.evaluate().isEmpty) break;
      final text = tester.widget<Text>(find.descendant(of: cell, matching: find.byType(Text)));
      out.add((i, text.data ?? '', text.style?.color));
    }
    return out;
  }

  /// Что велено искать и цветом какой группы: из строки цели. Число отрезается от подписи по `{x}`.
  (String, Color?) goal(WidgetTester tester) {
    final w = tester.widget<Text>(find.byKey(const Key('цель')));
    final plain = w.data ?? w.textSpan!.toPlainText();
    final parts = L.t('schulteFind').split('{x}');
    var v = plain;
    if (plain.startsWith(parts.first)) v = plain.substring(parts.first.length);
    if (parts.length > 1 && parts[1].isNotEmpty && v.endsWith(parts[1])) v = v.substring(0, v.length - parts[1].length);
    Color? accent;
    final span = w.textSpan;
    if (span is TextSpan && span.children != null) {
      for (final c in span.children!) {
        if (c is TextSpan && c.text == v && c.style?.color != null) accent = c.style!.color;
      }
    }
    return (v, accent);
  }

  /// Идеальная партия: жмёт клетку с нужным значением (в группах — нужного цвета).
  Future<void> playAll(WidgetTester tester, {bool grouped = false}) async {
    for (var step = 0; step < 200; step += 1) {
      final g = tester.widget<Text>(find.byKey(const Key('цель'))).data;
      if (g == L.t('storyDone')) return;
      final (target, accent) = goal(tester);
      final hit = cells(tester).firstWhere((c) => c.$2 == target && (!grouped || c.$3 == accent));
      await tester.ensureVisible(find.byKey(Key('клетка${hit.$1}')));
      await tester.tap(find.byKey(Key('клетка${hit.$1}')));
      await tester.pump();
    }
    fail('партия не закончилась за 200 нажатий');
  }

  testWidgets('по умолчанию «Уровни»: правило ступени и серия, ручных настроек нет', (tester) async {
    await open(tester);
    expect(chip('schulte-mode-levels'), findsOneWidget);
    expect(chip('schulte-mode-free'), findsOneWidget);
    expect(find.byKey(const Key('schulte-rule')), findsOneWidget);
    for (final k in ['schulte-size-5', 'schulte-content-letters', 'schulte-groups-2', 'schulte-moving-on']) {
      expect(chip(k), findsNothing, reason: '$k — только в «Свободно»');
    }
  });

  testWidgets('🔴 «Свободно» показывает все модификации веба понятными подписями', (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    // Содержимое: цифры, буквы и Шульте–Горбов — ПО ИМЕНИ, а не только «1-А-2-Б».
    expect(chip('schulte-content-numbers'), findsOneWidget);
    expect(chip('schulte-content-letters'), findsOneWidget);
    expect(chip('schulte-content-mixed'), findsOneWidget);
    expect(find.textContaining(L.t('schulteGorbov')), findsOneWidget);
    expect(find.textContaining('Горбов'), findsOneWidget);
    // Направление: вперёд, назад, от центра (у цифр).
    for (final k in ['schulte-dir-forward', 'schulte-dir-backward', 'schulte-dir-center']) {
      expect(chip(k), findsOneWidget, reason: k);
    }
    expect(find.text('1 → 25'), findsOneWidget);
    expect(find.text('25 → 1'), findsOneWidget);
    expect(find.text(L.t('schulteCenterOut')), findsOneWidget);
    // Разделённое внимание: классика и 2–4 группы; убегающая цель; размер 5…10; цвет.
    for (final k in [
      'schulte-groups-1', 'schulte-groups-2', 'schulte-groups-3', 'schulte-groups-4',
      'schulte-moving-off', 'schulte-moving-on',
      'schulte-size-5', 'schulte-size-6', 'schulte-size-7', 'schulte-size-8', 'schulte-size-9', 'schulte-size-10',
      'schulte-color-off', 'schulte-color-on',
    ]) {
      expect(chip(k), findsOneWidget, reason: k);
    }
    expect(find.text(L.t('schulteDivided')), findsOneWidget);
    expect(find.text(L.t('schulteMoving')), findsOneWidget);
    expect(find.text(L.t('classicLabel')), findsOneWidget);
    // У цифр письменности нет.
    expect(chip('schulte-script-latin'), findsNothing);
  });

  testWidgets('🔴 буквы: пять письменностей без греческого, без «от центра» и групп, сторона не выше 5', (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    await pick(tester, 'schulte-content-letters');
    for (final id in ['latin', 'cyrillic', 'devanagari', 'hiragana', 'hanzi']) {
      expect(chip('schulte-script-$id'), findsOneWidget, reason: id);
    }
    expect(chip('schulte-script-greek'), findsNothing, reason: 'греческий короче 25 знаков');
    expect(chip('schulte-dir-center'), findsNothing);
    expect(chip('schulte-groups-2'), findsNothing);
    expect(chip('schulte-size-5'), findsOneWidget);
    expect(chip('schulte-size-6'), findsNothing, reason: 'у латиницы 26 знаков — 5×5 и всё');
    // Подпись направления показывает знаки, которые лягут на поле.
    // В алфавите поля нет Ё, Й, Ъ, Ы, Ь: двадцать пятый знак — «Щ».
    expect(find.text('А → Щ'), findsOneWidget, reason: 'кириллица 5×5: первые 25 знаков');
  });

  testWidgets('🔴 Шульте–Горбов: греческий доступен, сторона не выше 6, выбора направления нет', (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    await pick(tester, 'schulte-content-mixed');
    expect(chip('schulte-script-greek'), findsOneWidget);
    await pick(tester, 'schulte-script-greek');
    expect(chip('schulte-size-6'), findsOneWidget);
    expect(chip('schulte-size-7'), findsNothing, reason: '24 знака греческого держат Горбова до 6×6');
    for (final k in ['schulte-dir-forward', 'schulte-dir-backward', 'schulte-groups-2']) {
      expect(chip(k), findsNothing, reason: k);
    }
  });

  testWidgets('в группах цвета и направления нет: цвет — имя группы, ряда нет', (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    await pick(tester, 'schulte-groups-3');
    expect(chip('schulte-color-on'), findsNothing);
    expect(chip('schulte-dir-forward'), findsNothing);
    await start(tester);
    final colors = cells(tester).map((c) => c.$3).toSet();
    expect(colors.length, 3, reason: 'три группы — три цвета');
    expect(find.byKey(const Key('цель')), findsOneWidget);
  });

  // (название, кнопки, метка режима, сторона, число клеток, письменность в отчёте, групп, ошибок до конца)
  final combos = <(String, List<String>, String, String, int, String?, int?, int)>[
    ('цифры вперёд 5×5', [], 'numbers_forward_bw', '5x5', 25, null, null, 0),
    ('цифры вперёд 5×5 с ошибкой', [], 'numbers_forward_bw', '5x5', 25, null, null, 1),
    ('цифры назад 6×6', ['schulte-dir-backward', 'schulte-size-6'], 'numbers_backward_bw', '6x6', 36, null, null, 0),
    ('цифры от центра', ['schulte-dir-center'], 'numbers_center-out_bw', '5x5', 25, null, null, 0),
    ('цифры цветом', ['schulte-color-on'], 'numbers_forward_color', '5x5', 25, null, null, 0),
    ('цифры, убегающая цель', ['schulte-moving-on'], 'numbers_forward_bw_moving', '5x5', 25, null, null, 0),
    ('цифры 10×10', ['schulte-size-10'], 'numbers_forward_bw', '10x10', 100, null, null, 0),
    ('буквы кириллицы', ['schulte-content-letters'], 'letters_forward_bw', '5x5', 25, 'cyrillic', null, 0),
    ('буквы иероглифами назад', ['schulte-content-letters', 'schulte-script-hanzi', 'schulte-dir-backward'], 'letters_backward_bw', '5x5', 25, 'hanzi', null, 0),
    ('Шульте–Горбов', ['schulte-content-mixed'], 'mixed_forward_bw', '5x5', 25, 'cyrillic', null, 0),
    ('Шульте–Горбов, греческий 6×6', ['schulte-content-mixed', 'schulte-script-greek', 'schulte-size-6'], 'mixed_forward_bw', '6x6', 36, 'greek', null, 0),
    ('три группы', ['schulte-groups-3'], 'divided_attention_3g', '5x5', 25, null, 3, 0),
    ('три группы с ошибкой', ['schulte-groups-3'], 'divided_attention_3g', '5x5', 25, null, 3, 1),
    ('две группы, убегающая цель', ['schulte-groups-2', 'schulte-moving-on'], 'divided_attention_2g', '5x5', 25, null, 2, 0),
  ];

  for (final c in combos) {
    final (title, taps, mode, diff, cellCount, script, groups, wrong) = c;
    testWidgets('🔴 партия «Свободно»: $title — таблица верная, проходится, лестница стоит, статистика получила метку',
        (tester) async {
      await open(tester);
      await pick(tester, 'schulte-mode-free');
      for (final k in taps) {
        await pick(tester, k);
      }
      await start(tester);

      final grid = cells(tester);
      expect(grid.length, cellCount, reason: 'число клеток');
      if (script != null && groups == null) {
        final chars = schulteScriptById(script).chars.runes.map(String.fromCharCode).toSet();
        final letters = grid.where((g) => int.tryParse(g.$2) == null).map((g) => g.$2);
        expect(letters.isNotEmpty, isTrue);
        expect(letters.every(chars.contains), isTrue, reason: 'знаки — из письменности $script');
      }
      if (mode.startsWith('mixed')) {
        expect(grid.any((g) => int.tryParse(g.$2) != null), isTrue, reason: 'у Горбова есть и числа');
        expect(grid.any((g) => int.tryParse(g.$2) == null), isTrue, reason: '…и буквы');
      }
      if (groups != null) {
        expect(grid.map((g) => g.$3).toSet().length, groups, reason: 'цвет на группу');
      }

      // Ошибка: клетка с чужим значением (в группах — и с чужим цветом тоже ошибка, берём чужое число).
      for (var i = 0; i < wrong; i += 1) {
        final (target, _) = goal(tester);
        final bad = cells(tester).firstWhere((x) => x.$2 != target);
        await tester.ensureVisible(find.byKey(Key('клетка${bad.$1}')));
        await tester.tap(find.byKey(Key('клетка${bad.$1}')));
        await tester.pump();
      }

      await playAll(tester, grouped: groups != null);
      await tester.pump();
      await tester.pump();

      expect(tester.widget<Text>(find.byKey(const Key('цель'))).data, L.t('storyDone'), reason: 'партия закончилась');
      expect(state.get(levelKey), isNull, reason: '🔴 свободная партия лестницу не двигает');
      expect(reports.length, 1, reason: 'партия ушла в статистику ровно один раз');
      final r = reports.single;
      expect(r['game_type'], 'schulte_table');
      expect(r['mode'], mode);
      expect(r['difficulty'], diff);
      expect(r['errors'], wrong);
      expect(r['score'], cellCount - wrong);
      final d = r['details'] as Map<String, dynamic>;
      expect(d['total_cells'], cellCount);
      expect(d['errors'], wrong);
      expect(d['script'], groups == null && script != null ? script : isNull);
      expect(d['group_count'], groups ?? isNull);
    });
  }

  testWidgets('🔴 ошибки свободной партии не откатывают лестницу, а «Уровни» после «Свободно» работают как прежде',
      (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    await start(tester);
    for (var i = 0; i < 4; i += 1) {
      final (target, _) = goal(tester);
      final bad = cells(tester).firstWhere((x) => x.$2 != target);
      await tester.tap(find.byKey(Key('клетка${bad.$1}')));
      await tester.pump();
    }
    await playAll(tester);
    await tester.pump();
    expect(state.get(levelKey), isNull, reason: 'четыре ошибки в «Свободно» — не провал уровня');
    expect(reports.single['errors'], 4);
    // Назад к уровням: экран настройки ступени с правилом, и партия по ступени идёт по лестнице.
    await tester.tap(find.text(L.t('retry')));
    await tester.pump();
    await pick(tester, 'schulte-mode-levels');
    expect(find.byKey(const Key('schulte-rule')), findsOneWidget);
    expect(chip('schulte-size-5'), findsNothing);
    await start(tester);
    expect(cells(tester).length, 25, reason: 'ступень 1 — 5×5');
    await playAll(tester);
    await tester.pump();
    await tester.pump();
    expect(state.get(levelKey), '2', reason: 'уровневая партия засчитана: 1 → 2');
  });

  testWidgets('шаг зарядки: переключателя «Уровни / Свободно» нет, таблицу задаёт шаг', (tester) async {
    GamePreset.set({'wu': '1', 'auto': '1', 'size': '5'});
    addTearDown(GamePreset.clear);
    await open(tester);
    expect(chip('schulte-mode-free'), findsNothing);
    expect(chip('schulte-mode-levels'), findsNothing);
    expect(cells(tester).length, 25, reason: 'шаг начался сам, таблица 5×5');
  });
}
