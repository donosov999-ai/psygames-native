import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/services.dart' show rootBundle;

import 'l10n.dart';

/// КАЛЕНДАРЬ СЕРИИ — РАСЧЁТ НА DART (задача d6a60b02, вариант Б, третий экран).
///
/// Перенос `frontend/app/streak-calendar.tsx` и функций серии из `frontend/src/services/warmup.ts`
/// (`completedWarmupDateKeys`, `computeStreak`, `computeLongestStreak`) один в один. Даты на языке
/// человека — шаблонами ICU (`assets/calendar_locales.json`, выгрузка `tools/embed-calendar.mjs`):
/// Dart только подставляет число и год. «Сегодня» — календарная дата, а не мгновение: расчёт не
/// зависит от часового пояса. Эталон — модель веб-экрана с её входами
/// (`fixtures/calendar_*`), проба `streak_calendar_model_test.dart`.
class CalendarLocales {
  CalendarLocales(this._byLang);
  final Map<String, Map<String, Object?>> _byLang;

  factory CalendarLocales.fromJson(Map<String, Object?> j) =>
      CalendarLocales({for (final e in (j['locales']! as Map).entries) e.key as String: (e.value as Map).cast<String, Object?>()});

  static CalendarLocales? _cache;

  static Future<CalendarLocales> load() async => _cache ??= CalendarLocales.fromJson(
    (jsonDecode(await rootBundle.loadString('assets/calendar_locales.json')) as Map).cast<String, Object?>(),
  );

  /// Язык человека; незнакомый — `en` (как `LOCALES[language] || 'en-US'` веба).
  Map<String, Object?> _of(String lang) => _byLang[lang] ?? _byLang['en']!;

  String _num(String lang, int n) {
    final digits = _of(lang)['digits']! as String;
    return '$n'.split('').map((c) => digits[c.codeUnitAt(0) - 48]).join();
  }

  String monthTitle(String lang, int year, int month) =>
      ((_of(lang)['monthYear']! as List)[month - 1] as String).replaceFirst('{y}', _num(lang, year));

  String spokenDate(String lang, int year, int month, int day) =>
      ((_of(lang)['spoken']! as List)[month - 1] as String).replaceFirst('{d}', _num(lang, day)).replaceFirst('{y}', _num(lang, year));

  List<String> weekdays(String lang) => (_of(lang)['weekdays']! as List).cast<String>();

  /// Короткая дата (`toLocaleDateString(язык, {day, month: 'short', year})` веба) — дата открытия
  /// достижения (`achievements_model.dart`).
  String shortDate(String lang, int year, int month, int day) =>
      ((_of(lang)['short']! as List)[month - 1] as String).replaceFirst('{d}', _num(lang, day)).replaceFirst('{y}', _num(lang, year));
}

/// Календарная дата без времени и пояса.
typedef Day = ({int y, int m, int d});

Day dayOf(DateTime t) => (y: t.year, m: t.month, d: t.day);

String dayKey(Day d) => '${d.y}-${'${d.m}'.padLeft(2, '0')}-${'${d.d}'.padLeft(2, '0')}';

/// Сдвиг даты на [delta] дней — календарём (UTC, без перехода на летнее время).
Day shiftDay(Day d, int delta) => dayOf(DateTime.utc(d.y, d.m, d.d + delta));

/// `вСтрик` веба: зарядка завершена и это не «не спится» (дорожка `rest`).
bool _inStreak(Object? h) => h is Map && h['completed'] == true && h['track'] != 'rest';

/// `completedWarmupDateKeys` веба: настоящие даты дней серии, без повторов, по порядку.
List<String> completedDateKeys(List<Object?> history) {
  final valid = <String>{};
  final re = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
  for (final h in history) {
    if (!_inStreak(h)) continue;
    final date = (h! as Map)['date'];
    if (date is! String) continue;
    final m = re.firstMatch(date);
    if (m == null) continue;
    final y = int.parse(m[1]!), mo = int.parse(m[2]!), d = int.parse(m[3]!);
    final t = DateTime.utc(y, mo, d);
    if (t.year != y || t.month != mo || t.day != d) continue;
    valid.add(date);
  }
  return valid.toList()..sort();
}

/// `computeLongestStreak` веба: один пропуск подряд серию не рвёт, два — рвут.
int computeLongestStreak(List<Object?> history) {
  var best = 0, current = 0;
  int? previous;
  for (final key in completedDateKeys(history)) {
    final p = key.split('-').map(int.parse).toList();
    final ordinal = (DateTime.utc(p[0], p[1], p[2]).millisecondsSinceEpoch / 86400000).floor();
    final gap = previous == null ? 0 : ordinal - previous;
    current = previous == null || gap <= 2 ? current + 1 : 1;
    best = math.max(best, current);
    previous = ordinal;
  }
  return best;
}

/// `computeStreak` веба от дня [today]: сегодня ещё не сыграно — не штраф; один пропуск прощается.
int computeStreak(List<Object?> history, Day today) {
  if (history.isEmpty) return 0;
  final dates = {
    for (final h in history)
      if (_inStreak(h)) (h! as Map)['date'],
  };
  var streak = 0;
  var graceUsed = false;
  for (var i = 0; i < 365; i++) {
    final key = dayKey(shiftDay(today, -i));
    if (dates.contains(key)) {
      streak++;
      if (i > 0) graceUsed = false;
    } else if (i == 0) {
      continue;
    } else if (!graceUsed) {
      graceUsed = true;
    } else {
      break;
    }
  }
  return streak;
}

/// `monthCells` веба: клетки месяца с понедельника, пустые — null, кратно неделе.
List<int?> monthCells(int year, int month) {
  final days = DateTime.utc(year, month + 1, 0).day;
  final mondayOffset = (DateTime.utc(year, month, 1).weekday + 6) % 7; // Dart: пн = 1
  final total = ((mondayOffset + days) / 7).ceil() * 7;
  return [
    for (var i = 0; i < total; i++)
      if (i - mondayOffset + 1 >= 1 && i - mondayOffset + 1 <= days) i - mondayOffset + 1 else null,
  ];
}

/// Модель календаря — та же, что `calendarModel` веба.
Map<String, Object?> calendarModel(
  CalendarLocales loc,
  List<Object?> history, {
  required int year,
  required int month,
  required Day today,
  required String primary,
  required String border,
}) {
  final lang = L.locale;
  final days = completedDateKeys(history).toSet();
  final isCurrentMonth = year == today.y && month == today.m;
  final todayKey = dayKey(today);
  final cells = monthCells(year, month);
  return {
    'v': 1,
    'title': '🔥 ${L.t('streakCalendarTitle')}',
    'primary': primary,
    'labels': {'back': L.t('a11yBack'), 'prev': L.t('streakPreviousMonth'), 'next': L.t('streakNextMonth')},
    'metrics': [
      {'emoji': '🔥', 'value': '${computeStreak(history, today)}', 'label': L.t('streakCurrent'), 'border': border},
      {'emoji': '🏆', 'value': '${computeLongestStreak(history)}', 'label': L.t('personalBest'), 'border': '#f97316'},
      {'emoji': '📅', 'value': '${days.length}', 'label': L.t('streakTrainingDays'), 'border': border},
    ],
    'bestCaption': L.t('streakBestCaption'),
    'month': {'title': loc.monthTitle(lang, year, month), 'canNext': !isCurrentMonth},
    'weekdays': loc.weekdays(lang),
    'cells': [
      for (var i = 0; i < cells.length; i++)
        if (cells[i] == null)
          null
        else
          () {
            final day = cells[i]!;
            final d = (y: year, m: month, d: day);
            final key = dayKey(d);
            final trained = days.contains(key);
            final column = i % 7;
            return {
              'day': day,
              'trained': trained,
              'left': trained && column > 0 && days.contains(dayKey(shiftDay(d, -1))),
              'right': trained && column < 6 && days.contains(dayKey(shiftDay(d, 1))),
              'today': key == todayKey,
              // Каждый ключ — своим L.t: ключ внутри тернарника сборщик словаря не видит (на экране был бы сам ключ).
              'a11y': '${loc.spokenDate(lang, year, month, day)}. ${trained ? L.t('streakTrainingDay') : L.t('streakNoTraining')}',
            };
          }(),
    ],
    'empty': days.isEmpty ? L.t('streakEmpty') : null,
  };
}
