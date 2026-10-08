import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/games/schulte/series.dart';
import 'package:psygames_flutter/games/schulte/series_screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/module_strings.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// 🔴 СЕРИЯ БЛОКОВ «ШУЛЬТЕ» В ПРИЛОЖЕНИИ (задача 1b6338c1, 07.10.2026).
///
/// 📍 ПОВОД (раздел «Слова», замер main 7679684ac): шаг зарядки `schulte-blocks` шлёт
/// `/games/schulte?auto=1&series=1`, а натив серии не знал — `routeOf` откатывался к
/// `/games/schulte`, и шаг молча становился одной обычной партией.
///
/// Проба играет серию НАЖАТИЯМИ по клеткам: поле известно по зерну (общий генератор с пробой
/// ядра), время двигает поддельные часы партии. Меряется то, ради чего серия есть: три блока по
/// ОДНОМУ полю, врезка между ними не входит в время блока, разности — в одной сессии.
void main() {
  SeriesRandom lcg(int seed) {
    var s = seed & 0xFFFFFFFF;
    return () {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return s / 4294967296;
    };
  }

  late ModuleStrings text;
  final reports = <Map<String, dynamic>>[];

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
    final all = jsonDecode(File('assets/l10n/schulte-series.json').readAsStringSync()) as Map<String, dynamic>;
    text = ModuleStrings.fromMap((all['ru'] as Map).map((k, v) => MapEntry(k as String, v as String)));
  });

  setUp(() {
    reports.clear();
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    GamePreset.clear();
  });

  late SharedState state;

  Future<void> openSeries(WidgetTester tester, {int seed = 7, Map<String, Object> prefs = const {}}) async {
    useFakeGameClock(tester);
    SharedPreferences.setMockInitialValues(prefs);
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: SchulteSeriesScreen(key: UniqueKey(), state: state, random: lcg(seed), text: text),
    ));
    // Дерево снимается в конце пробы, пока часы ещё поддельные: иначе экран уходит в начале
    // СЛЕДУЮЩЕЙ пробы, на настоящих часах, и его отчёт попадает туда с временем в миллионы секунд.
    addTearDown(() => tester.pumpWidget(const SizedBox()));
    for (var i = 0; i < 4; i += 1) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  /// Поле серии — то же, что у экрана: тот же генератор с тем же зерном, размер 5 у новичка.
  SchulteField fieldOf(int seed) => buildSchulteField(5, lcg(seed));

  Future<void> tapValue(WidgetTester tester, SchulteField field, int value, Duration before) async {
    await tester.pump(before);
    await tester.tap(find.byKey(Key('series-cell${field.cells.indexOf(value)}')));
    await tester.pump();
  }

  String blockLine() => (find.byKey(const Key('series-block')).evaluate().single.widget as Text).data!;

  double opacityOf(WidgetTester tester, int index) => tester
      .widget<Opacity>(find.descendant(of: find.byKey(Key('series-cell$index')), matching: find.byType(Opacity)).first)
      .opacity;

  testWidgets('🔴 routeOf: шаг зарядки ?auto=1&series=1 ведёт в серию, обычный адрес — в таблицу', (tester) async {
    expect(HybridApp.routeOf('https://psy-games.pro/games/schulte?auto=1&series=1'), '/games/schulte?series=1');
    expect(HybridApp.routeOf('https://psy-games.pro/games/schulte?auto=1'), '/games/schulte');
    expect(HybridApp.routeOf('https://psy-games.pro/games/schulte'), '/games/schulte');
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();
    expect(HybridApp.native['/games/schulte?series=1']!(s), isA<SchulteSeriesScreen>());
  });

  testWidgets('🔴 серия идёт тремя блоками по ОДНОМУ полю, врезка не в замере, итог — одна сессия с разностями',
      (tester) async {
    await openSeries(tester);
    final field = fieldOf(7);
    expect(blockLine(), startsWith(text.fill('blockOf', {'n': 1, 'total': 3})));

    // Блок 1 — по порядку, 100 мс на клетку: 2,5 с.
    for (final v in orderTargets(25)) {
      await tapValue(tester, field, v, const Duration(milliseconds: 100));
    }
    expect(find.byKey(const Key('series-interlude')), findsOneWidget, reason: 'между блоками — врезка');
    expect(find.text(text.t('sameField')), findsOneWidget, reason: 'врезка говорит главное: поле то же');
    await tester.pump(const Duration(milliseconds: seriesInterludeMs));
    expect(blockLine(), startsWith(text.fill('blockOf', {'n': 2, 'total': 3})));
    for (var i = 0; i < 25; i += 1) {
      expect(find.descendant(of: find.byKey(Key('series-cell$i')), matching: find.text('${field.cells[i]}')),
          findsOneWidget, reason: 'второй блок — то же поле: в клетке $i то же число');
    }

    // Блок 2 — чередование, 200 мс на клетку: 5 с.
    for (final v in alternateTargets(25)) {
      await tapValue(tester, field, v, const Duration(milliseconds: 200));
    }
    await tester.pump(const Duration(milliseconds: seriesInterludeMs));
    expect(blockLine(), startsWith(text.fill('blockOf', {'n': 3, 'total': 3})));

    // Блок 3 — пары на сумму 26, 300 мс на клетку: 12 пар × 2 = 7,2 с.
    for (var a = 1; a <= 12; a += 1) {
      await tapValue(tester, field, a, const Duration(milliseconds: 300));
      await tapValue(tester, field, 26 - a, const Duration(milliseconds: 300));
    }
    await tester.pump();
    expect(find.byKey(const Key('series-result')), findsOneWidget);
    expect(find.byKey(const Key('series-diffs')), findsOneWidget, reason: 'полная серия даёт разности');

    expect(reports, hasLength(1), reason: 'одна сессия на всю серию, а не по одной на блок');
    final r = reports.single;
    expect(r['game_type'], schulteSeriesGameType);
    final details = r['details'] as Map<String, dynamic>;
    expect(details['series_complete'], isTrue);
    expect(details['level'], 5);
    final times = [for (final b in (details['blocks'] as List).cast<Map>()) b['time_ms'] as int];
    // Первый блок открыт с первого кадра: в нём ещё кадры запуска экрана (до 100 мс).
    expect(times[0] - 2500, inInclusiveRange(0, 100), reason: 'блок 1 — 25 клеток по 100 мс');
    expect(times.sublist(1), [5000, 7200], reason: 'время блока — его клетки; врезка 2,5 с в замер не вошла');
    expect(details['diffs'], {'alternate_minus_order': 5000 - times[0], 'sum_minus_order': 7200 - times[0]});

    final saved = SchulteSeriesProgress.parse(state.get(SchulteSeriesProgress.keyFor(state.activeProfile)));
    expect(saved.streaks, {'order': 1, 'alternate': 1, 'sum': 1}, reason: 'прогресс серии сохранён');
  });

  testWidgets('🔴 ошибка в блоке считается, а неверная клетка не закрывается', (tester) async {
    await openSeries(tester, seed: 11);
    final field = fieldOf(11);
    await tapValue(tester, field, 2, Duration.zero);
    expect(opacityOf(tester, field.cells.indexOf(2)), 1, reason: 'неверная клетка не закрыта');
    await tapValue(tester, field, 1, Duration.zero);
    expect(opacityOf(tester, field.cells.indexOf(1)), lessThan(1), reason: 'верная клетка закрыта');
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pause-action-exitConfirmLeave')).evaluate().isEmpty
        ? find.text(L.t('exitConfirmLeave')).first
        : find.byKey(const Key('pause-action-exitConfirmLeave')));
    await tester.pumpAndSettle();
    final details = reports.single['details'] as Map<String, dynamic>;
    expect((details['blocks'] as List).single['errors'], 1, reason: 'ошибка блока ушла в сессию');
  });

  testWidgets('🔴 «Заново» в паузе начинает новую СЕРИЮ; прерванная пишется без разностей', (tester) async {
    await openSeries(tester);
    final field = fieldOf(7);
    for (final v in [1, 2, 3]) {
      await tapValue(tester, field, v, const Duration(milliseconds: 100));
    }
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('restart')).last);
    await tester.pumpAndSettle();
    expect(blockLine(), startsWith(text.fill('blockOf', {'n': 1, 'total': 3})), reason: 'снова первый блок');
    for (var i = 0; i < 25; i += 1) {
      expect(opacityOf(tester, i), 1, reason: 'новая серия — ни одной закрытой клетки');
    }
    expect(reports, hasLength(1), reason: 'прерванная серия записана');
    final details = reports.single['details'] as Map<String, dynamic>;
    expect(details['series_complete'], isFalse);
    expect(details.containsKey('diffs'), isFalse, reason: 'у неполной серии ключа разностей нет вовсе');
  });

  testWidgets('🔴 «Выйти» посреди серии — разбор без разностей, уровень не двигается', (tester) async {
    await openSeries(tester);
    final field = fieldOf(7);
    await tapValue(tester, field, 1, const Duration(milliseconds: 100));
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('exitConfirmLeave')).first);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('series-not-finished')), findsOneWidget);
    expect(reports, hasLength(1));
    final saved = SchulteSeriesProgress.parse(state.get(SchulteSeriesProgress.keyFor(state.activeProfile)));
    expect(saved.streaks, {'order': 0, 'alternate': 0, 'sum': 0}, reason: 'незамеренное — не результат');
  });

  testWidgets('🔴 дверь серии на обычной таблице: есть вне зарядки, открывает серию; в шаге зарядки её нет',
      (tester) async {
    useFakeGameClock(tester);
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(key: UniqueKey(), state: state)));
    for (var i = 0; i < 6; i += 1) {
      await tester.pump(const Duration(milliseconds: 30));
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
    expect(find.byKey(const Key('schulte-series-door')), findsOneWidget, reason: 'дверь под «Начать»');
    await tester.tap(find.byKey(const Key('schulte-series-door')));
    for (var i = 0; i < 10; i += 1) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
    expect(find.byType(SchulteSeriesScreen), findsOneWidget, reason: 'дверь открывает серию');

    GamePreset.set({'wu': '1'});
    addTearDown(GamePreset.clear);
    // Свой ключ у приложения: иначе старый навигатор держит открытую дверью серию поверх таблицы.
    await tester.pumpWidget(MaterialApp(key: UniqueKey(), home: SchulteScreen(key: UniqueKey(), state: state)));
    for (var i = 0; i < 6; i += 1) {
      await tester.pump(const Duration(milliseconds: 30));
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
    // Шаг зарядки стартует сам — экран «до партии» виден только после «Заново». Там и меряем.
    // «Заново» — в меню паузы: в шапке или, в режиме «только поле», за плавающей кнопкой.
    final pause = find.byTooltip('Пауза');
    await tester.tap(pause.evaluate().isNotEmpty ? pause : find.byKey(const Key('field-only-pause')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('restart')).last);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
    expect(find.text(L.t('start')), findsOneWidget, reason: 'премиса: экран «до партии» на месте');
    expect(find.byKey(const Key('schulte-series-door')), findsNothing, reason: 'в шаге зарядки двери нет');
  });
}
