import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/streak_calendar_screen.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/streak_calendar_model.dart';

/// 🔴 КАЛЕНДАРЬ СЕРИИ: РАСЧЁТ НА DART СОВПАДАЕТ С ВЕБОМ (задача d6a60b02, вариант Б, третий экран).
///
/// Эталоны выгружает веб-проба `progress-pages-host-model.test.tsx` с настоящего экрана вместе с его
/// входами (`calendar_input.json`: «сегодня» календарной датой и история зарядок):
///   · этот месяц RU — серия, рекорд, дни, полоски через соседей (не через край недели), «сегодня»,
///     заголовок месяца и даты для чтения вслух шаблонами ICU (`assets/calendar_locales.json`);
///   · прошлый месяц RU — листание назад: дней нет, «вперёд» можно;
///   · этот месяц EN.
void main() {
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  final loc = CalendarLocales.fromJson((json('assets/calendar_locales.json')! as Map).cast<String, Object?>());
  final input = (json('test/fixtures/calendar_input.json')! as Map).cast<String, Object?>();
  final t = (input['today']! as Map).cast<String, Object?>();
  final today = (y: t['y']! as int, m: t['m']! as int, d: t['d']! as int);
  final history = (input['history']! as List).cast<Object?>();
  final prev = shiftDay((y: today.y, m: today.m, d: 1), -1);

  for (final (name, lang, fixture, year, month) in [
    ('этот месяц RU', 'ru', 'calendar_model.json', today.y, today.m),
    ('прошлый месяц RU', 'ru', 'calendar_model_prev.json', prev.y, prev.m),
    ('этот месяц EN', 'en', 'calendar_model_en.json', today.y, today.m),
  ]) {
    test('🔴 $name: модель Dart = модель веба', () {
      L.useForTest(lang, (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>());
      final web = (json('test/fixtures/$fixture')! as Map).cast<String, Object?>();
      final metrics = (web['metrics']! as List).cast<Map>();
      final dart = calendarModel(
        loc,
        history,
        year: year,
        month: month,
        today: today,
        primary: web['primary']! as String,
        border: metrics.first['border'] as String,
      );
      expect(jsonDecode(jsonEncode(dart)), web);
    });
  }

  test('🔴 правило серии — по эталону веба: текущая и рекордная на пяти историях с пропусками', () {
    final o = (json('test/fixtures/streak_oracle.json')! as Map).cast<String, Object?>();
    final t = (o['today']! as Map).cast<String, Object?>();
    final day = (y: t['y']! as int, m: t['m']! as int, d: t['d']! as int);
    for (final c in (o['cases']! as List).cast<Map>()) {
      final h = (c['history'] as List).cast<Object?>();
      expect([computeStreak(h, day), computeLongestStreak(h)], [c['streak'], c['longest']], reason: '$h');
    }
  });

  test('серия: сегодня не сыграно — не штраф; один пропуск прощается, два подряд рвут; «не спится» не в счёт', () {
    const today = (y: 2026, m: 3, d: 30); // через переход на летнее время — календарём, не часами
    Map<String, Object?> day(int back, {String track = 'training', bool completed = true}) => {
      'date': dayKey(shiftDay(today, -back)),
      'completed': completed,
      'track': track,
    };
    expect(computeStreak([day(1), day(2), day(4), day(5)], today), 4, reason: 'пропуск 3-го прощён');
    expect(computeStreak([day(1), day(4)], today), 1, reason: 'пропуски 2 и 3 — серия кончилась');
    expect(computeStreak([day(0), day(1, track: 'rest'), day(2)], today), 2, reason: 'ночь серию не двигает, но и не рвёт (прощён)');
    expect(computeLongestStreak([day(10), day(8), day(5), day(4), day(1, completed: false)]), 2, reason: 'разрыв в 3 дня обнуляет');
    // Пропуск ровно одного дня прощается и в рекорде: 6-й, (5-й пропущен), 4-й, 3-й — серия 3, а не 2.
    expect(computeLongestStreak([day(6), day(4), day(3)]), 3, reason: 'один пропуск рекорд не рвёт');
    expect(monthCells(2027, 2).length, 28, reason: 'февраль 2027 — с понедельника, ровно 4 недели');
    expect(monthCells(2026, 2).length, 35, reason: 'февраль 2026 — с воскресенья: шесть пустых клеток впереди');
  });

  testWidgets('🔴 экран со своим состоянием: модель своя, «назад месяц» и обратно, вперёд текущего — нельзя', (t) async {
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48', 'psygames_warmup_history': jsonEncode(history)});
    final state = await SharedState.open();
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    final realClock = StreakCalendarScreen.clock;
    StreakCalendarScreen.clock = () => DateTime(today.y, today.m, today.d, 12);
    addTearDown(() => StreakCalendarScreen.clock = realClock);
    t.view.physicalSize = const Size(780, 2400);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: StreakCalendarScreen(state: state)));
    for (var i = 0; i < 20 && find.byKey(const ValueKey('calendar-screen')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    String title(String f) => ((json('test/fixtures/$f')! as Map)['month']! as Map)['title'] as String;
    expect(find.text(title('calendar_model.json')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('calendar-next')));
    await t.pump();
    expect(find.text(title('calendar_model.json')), findsOneWidget, reason: 'вперёд текущего месяца — нельзя');
    await t.tap(find.byKey(const ValueKey('calendar-prev')));
    await t.pump();
    expect(find.text(title('calendar_model_prev.json')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('calendar-next')));
    await t.pump();
    expect(find.text(title('calendar_model.json')), findsOneWidget);
  });
}
