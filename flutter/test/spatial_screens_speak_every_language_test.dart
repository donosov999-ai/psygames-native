import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/dots_connect/board.dart';
import 'package:psygames_flutter/games/dots_connect/screen.dart';
import 'package:psygames_flutter/games/mental_rotation/screen.dart';
import 'package:psygames_flutter/games/one_line/board.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_span/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «ПРОСТРАНСТВО» ГОВОРИТ НА ЯЗЫКЕ ИГРОКА — НА ВСЕХ ДВЕНАДЦАТИ, А НЕ НА ОДНОМ.
///
/// 🔴 ЧЕГО НЕ ВИДИТ ХРАПОВИК. `ui_text_debt_does_not_grow_test.dart` считает русские литералы в
/// ИСХОДНИКЕ. Он зелен, а экран всё равно может говорить по-русски или показывать имя ключа:
///   · ключ, спрятанный в переменную (`L.t(вид ? 'a' : 'b')`), сборщик словаря не видит — в сборку
///     он не доезжает, и на экране стоит `spatialLabBlockPos` вместо подписи;
///   · строка собрана из переведённых кусков с русским «клеем» между ними;
///   · словарь модуля игры не загрузился — и вместо вопроса задания виден `hintCompact`.
/// Поэтому здесь смотрится ЭКРАН: на каждом языке, кроме русского, в тексте экрана нет ни одной
/// кириллической буквы, и ни на одном языке текст не совпадает с именем ключа словаря.
///
/// ⚠️ ОКНО — САМОЕ УЗКОЕ, 360×640: немецкий и французский длиннее русского, и перевод, который
/// переполняет ряд, Flutter отдаёт исключением раскладки — проба его ловит тем же заходом.
///
/// ⚠️ ГРАНИЦА. Смотрятся текстовые виджеты экрана в двух-трёх фазах (настройка, партия, итог
/// там, где он достижим без игры), а не подсказки кнопок каркаса и не плеер разбора: их тексты —
/// общего слоя, и у каркаса свой долг в храповике.
void main() {
  late SharedState state;

  /// Имена ключей всех словарей, которые зовут экраны раздела: текст, совпавший с одним из них, —
  /// это ключ, не нашедший строки.
  final keyNames = <String>{};
  setUpAll(() {
    for (final file in ['en.json', 'mental-rotation.json', 'dots-connect.json']) {
      final json = jsonDecode(File('assets/l10n/$file').readAsStringSync()) as Map<String, dynamic>;
      final dict = (json['en'] ?? json) as Map<String, dynamic>;
      keyNames.addAll(dict.keys);
    }
  });

  setUp(() async {
    // Ступени подобраны так, чтобы на настройке стояли НЕ обучающие описания, а собранные из чисел:
    // именно там куски склеиваются, и там русский клей был бы виден. У «Вращения» — седьмая:
    // половина видов ещё закрыта, и у них в списке стоит «откроется на уровне N».
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_mental_rotation_level_nzt48': '7',
      'psygames_spatial_lab_twiddle_level_nzt48': '40',
      'psygames_spatial_lab_net_level_nzt48': '30',
      'psygames_spatial_lab_sixteen_level_nzt48': '20',
      'psygames_spatial_lab_netslide_level_nzt48': '10',
    });
    state = await SharedState.open();
  });

  tearDown(() async => L.load('ru'));

  final cyrillic = RegExp('[А-Яа-яЁё]');

  /// Имя ключа по виду: `camelCase` с горбом или `snake_case` без пробелов. Ловит и ключ с
  /// опечаткой, которого нет ни в одном словаре, — по списку имён его не узнать.
  final keyShaped = RegExp(r'^([a-z][a-z0-9]*([A-Z][a-z0-9]*)+|[a-z][a-z0-9]*(_[a-z0-9]+)+)$');

  /*
   * 🔴 НЕ ТОЛЬКО ВИДИМЫЙ ТЕКСТ. Подписи счётчиков полоса каркаса (`_HudRow`) рисует ИКОНКОЙ, а
   * слово отдаёт только чтецу экрана — `Semantics(label: 'подпись: число')`; у кнопок ряда
   * действий подпись живёт в подсказке. 📍 Замер мутацией 30.09.2026: ключ с опечаткой у
   * «Покрытия» («Точки») проба по одним `Text` пропустила — зелёная при сломанной подписи.
   * Поэтому смотрятся ещё метки `Semantics` и подсказки `Tooltip`.
   *
   * ⚠️ У каркаса две свои русские подсказки («Пауза», «Правила» в `lib/shell/game_shell.dart`,
   * его долг в храповике). Они берутся из исходника каркаса и пропускаются поимённо: переведёт
   * каркас — список опустеет сам, и проба начнёт смотреть и их.
   */
  final shellOwn = <String>{};
  setUpAll(() {
    final src = File('lib/shell/game_shell.dart')
        .readAsStringSync()
        .replaceAll(RegExp(r'/\*.*?\*/', dotAll: true), '')
        .replaceAll(RegExp(r'//.*'), '');
    for (final m in RegExp("'([^'\\n]*[А-Яа-яЁё][^'\\n]*)'").allMatches(src)) {
      shellOwn.add(m[1]!);
    }
  });

  List<String> texts(WidgetTester tester) => [
    for (final t in tester.widgetList<Text>(find.byType(Text))) t.data ?? t.textSpan?.toPlainText() ?? '',
    for (final s in tester.widgetList<Semantics>(find.byType(Semantics)))
      if (s.properties.label != null) s.properties.label!,
    for (final t in tester.widgetList<Tooltip>(find.byType(Tooltip)))
      if (t.message != null) t.message!,
  ].where((t) => !shellOwn.contains(t)).toList();

  /// Что на экране не так для языка `code`: кириллица на чужом языке или голый ключ. Метка
  /// счётчика — «подпись: число», поэтому ключ ищется и в каждом куске до двоеточия.
  List<String> faults(WidgetTester tester, String code, String phase) => [
    for (final t in texts(tester))
      if (code != 'ru' && cyrillic.hasMatch(t))
        '$code, $phase: по-русски «$t»'
      else if ([t, ...t.split(': ')].map((p) => p.trim()).any((p) => keyNames.contains(p) || keyShaped.hasMatch(p)))
        '$code, $phase: ключ вместо текста «$t»',
  ];

  /// Только общий словарь. Словарь модуля «Вращения» проба НЕ грузит сама: его обязан загрузить
  /// экран, и экран, который забыл, должен здесь покраснеть, а не выехать на загрузке пробы.
  Future<void> useLanguage(WidgetTester tester, String code) async {
    await tester.runAsync(() => L.load(code));
  }

  Future<void> open(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump();
    await tester.pump();
  }

  /// Доски «Одной линии» и «Точек» читают уровни `loadString`, а он от 50 КБ уходит в изолят,
  /// которого поддельное время не ждёт: ждём доску настоящим временем.
  Future<void> openWithRealTime(WidgetTester tester, Widget screen, Type board) async {
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

  Future<void> tapKey(WidgetTester tester, String key) async {
    final target = find.byKey(Key(key));
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
  }

  testWidgets('🔴 «Вращение»: настройка, список видов и партия — на языке игрока', (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await useLanguage(tester, code);
      await open(tester, MentalRotationScreen(state: state));
      expect(tester.takeException(), isNull, reason: '$code: раскладка настройки');
      bad.addAll(faults(tester, code, 'настройка'));
      await tapKey(tester, 'вид-заданий');
      bad.addAll(faults(tester, code, 'список видов'));
      await tapKey(tester, 'начать');
      expect(tester.takeException(), isNull, reason: '$code: раскладка партии');
      bad.addAll(faults(tester, code, 'партия'));
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 «Пространственный ряд»: до показа и во время показа — на языке игрока', (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await useLanguage(tester, code);
      await open(tester, SpatialSpanScreen(state: state));
      expect(tester.takeException(), isNull, reason: '$code: раскладка до показа');
      bad.addAll(faults(tester, code, 'до показа'));
      await tapKey(tester, 'показать-ряд');
      expect(tester.takeException(), isNull, reason: '$code: раскладка показа');
      bad.addAll(faults(tester, code, 'показ'));
      // Показ идёт таймером: доводим его до ввода, чтобы экран не ушёл из пробы с живым таймером.
      await tester.pump(const Duration(seconds: 10));
      bad.addAll(faults(tester, code, 'ввод'));
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 «Лаборатория»: описания ступеней всех четырёх упражнений и партия — на языке игрока',
      (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await useLanguage(tester, code);
      await open(tester, SpatialLabScreen(state: state));
      for (final mode in LabMode.values) {
        await tapKey(tester, 'упражнение-${mode.name}');
        expect(tester.takeException(), isNull, reason: '$code: раскладка настройки ${mode.name}');
        bad.addAll(faults(tester, code, 'настройка ${mode.name}'));
      }
      await tapKey(tester, 'начать-ступень');
      expect(tester.takeException(), isNull, reason: '$code: раскладка партии');
      bad.addAll(faults(tester, code, 'партия'));
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 «Одна линия» и «Соедини точки»: партия и решение — на языке игрока', (tester) async {
    final bad = <String>[];
    for (final code in L.locales) {
      await useLanguage(tester, code);
      for (final (name, screen, board) in [
        ('одна линия', OneLineScreen(state: state) as Widget, OneLineBoard),
        ('точки', DotsConnectScreen(state: state) as Widget, DotsBoard),
      ]) {
        await openWithRealTime(tester, screen, board);
        expect(find.byType(board), findsOneWidget, reason: '$code, $name: экран дошёл до доски');
        expect(tester.takeException(), isNull, reason: '$code, $name: раскладка партии');
        bad.addAll(faults(tester, code, '$name, партия'));
        // «Показать решение» ставит на экран кнопку перехода дальше — её подпись тоже из словаря.
        await tester.tap(find.byTooltip(L.t('puzzleShowSolution')).first);
        await tester.pump();
        bad.addAll(faults(tester, code, '$name, решение показано'));
      }
    }
    expect(bad, isEmpty);
  });
}
