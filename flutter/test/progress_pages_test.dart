import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/assessment_result_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/streak_calendar_screen.dart';

/// 🔴 КАЛЕНДАРЬ СЕРИИ И ИТОГ ОЦЕНКИ НА FLUTTER РИСУЮТ МОДЕЛЬ ВЕБА (задачи cd77367d, 455d71b1).
///
/// Образцы выгружает веб-проба `progress-pages-host-model.test.tsx` с настоящих экранов.
///   Календарь: клетка на каждый день месяца, дни зарядки — оранжевые с огоньком, полоски серии —
///   там, где модель велит; «вперёд» выключен на текущем месяце; листание и «Назад» — действия веба.
///   Итог оценки: 12 строк доменов с цветом уровня, радар по геометрии веба (точки на местах модели),
///   «Сохранить профиль» и «На главную» — действия веба; после сохранения — зелёная плашка.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Widget w, {double height = 844}) async {
    t.view.physicalSize = Size(780, height * 2);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: w)));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  group('календарь серии', () {
    testWidgets('без модели — ожидание', (t) async {
      await mount(t, const StreakCalendarScreen());
      expect(key('calendar-loading'), findsOneWidget);
    });

    testWidgets('🔴 клетки, дни зарядки и полоски — как в модели', (t) async {
      final m = load('calendar_model.json');
      ScreenUi.model(StreakCalendarScreen.route).value = m;
      await mount(t, const StreakCalendarScreen());
      expect(find.text(m['title'] as String), findsOneWidget);
      expect(find.text((m['month'] as Map)['title'] as String), findsOneWidget);
      final cells = [for (final c in m['cells'] as List) if (c != null) (c as Map).cast<String, Object?>()];
      for (final c in cells) {
        expect(find.bySemanticsLabel(c['a11y'] as String), findsOneWidget);
      }
      final trained = cells.where((c) => c['trained'] == true).length;
      expect(find.text('🔥', skipOffstage: false).evaluate().length, trained + 1, reason: 'огонёк у каждого дня зарядки + метрика серии');
      // Полоски: половинки к соседям — по флагам модели.
      final strips = cells.where((c) => c['left'] == true).length + cells.where((c) => c['right'] == true).length;
      final drawn = t.widgetList<ColoredBox>(find.descendant(of: key('calendar-card'), matching: find.byType(ColoredBox)))
          .where((b) => b.color == const Color(0x66FB923C));
      expect(drawn.length, strips);
      for (final x in (m['metrics'] as List).cast<Map>()) {
        expect(find.text(x['label'] as String), findsOneWidget);
      }
    });

    testWidgets('🔴 листание и «Назад» — действия веба; «вперёд» на текущем месяце выключен', (t) async {
      final m = load('calendar_model.json');
      ScreenUi.model(StreakCalendarScreen.route).value = m;
      await mount(t, const StreakCalendarScreen());
      await t.tap(key('calendar-next'));
      expect(js, isEmpty, reason: 'текущий месяц — вперёд некуда');
      await t.tap(key('calendar-prev'));
      await t.tap(key('calendar-back'));
      expect(js[0], contains('["/streak-calendar"].month(-1)'));
      expect(js[1], contains('["/streak-calendar"].back()'));
      ScreenUi.model(StreakCalendarScreen.route).value = {
        ...m,
        'month': {'title': 'сентябрь 2026 г.', 'canNext': true},
      };
      await t.pump();
      await t.tap(key('calendar-next'));
      expect(js.last, contains('["/streak-calendar"].month(1)'));
      expect(find.text('сентябрь 2026 г.'), findsOneWidget);
    });
  });

  group('итог оценки', () {
    testWidgets('🔴 12 доменов с цветом уровня; радар — точки на местах модели', (t) async {
      final m = load('assessment_model.json');
      ScreenUi.model(AssessmentResultScreen.route).value = m;
      // Высокое окно: все строки построены сразу — проба про модель, а не про прокрутку.
      await mount(t, const AssessmentResultScreen(), height: 3000);
      final domains = (m['domains'] as List).cast<Map>();
      expect(domains.length, 12);
      for (final d in domains) {
        final row = key('assessment-domain-${d['id']}');
        expect(find.descendant(of: row, matching: find.text(d['label'] as String)), findsOneWidget);
        expect(find.descendant(of: row, matching: find.text(d['badge'] as String)), findsOneWidget);
        final dot = t.widget<Container>(find.descendant(of: row, matching: find.byType(Container)).at(1));
        expect((dot.decoration as BoxDecoration).color, cssColor(d['color']));
      }
      // Радар рисует ровно геометрию модели: тот же объект уходит в рисовальщик.
      final paint = t.widget<CustomPaint>(find.descendant(of: key('assessment-radar'), matching: find.byType(CustomPaint)));
      expect((paint.painter! as RadarPainter).g['poly'], (m['radar'] as Map)['poly']);
      expect(paint.size, const Size.square(320));
    });

    testWidgets('🔴 «Сохранить профиль» и «На главную» — действия веба; после — зелёная плашка', (t) async {
      final m = load('assessment_model.json');
      ScreenUi.model(AssessmentResultScreen.route).value = m;
      await mount(t, const AssessmentResultScreen(), height: 3000);
      await t.tap(key('assessment-apply'));
      await t.tap(key('assessment-home'));
      expect(js[0], contains('["/assessment-result"].apply()'));
      expect(js[1], contains('["/assessment-result"].home()'));
      ScreenUi.model(AssessmentResultScreen.route).value = {...m, 'applied': true};
      await t.pump();
      expect(key('assessment-apply'), findsNothing);
      expect(find.text((m['saved'] as Map)['label'] as String), findsOneWidget);
    });

    testWidgets('пока веб считает — его строка «считаем»', (t) async {
      ScreenUi.model(AssessmentResultScreen.route).value = {'v': 1, 'loading': 'Считаем результаты…'};
      await mount(t, const AssessmentResultScreen());
      expect(find.text('Считаем результаты…'), findsOneWidget);
    });
  });
}
