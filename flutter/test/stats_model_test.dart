import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/stats_model.dart';
import 'package:psygames_flutter/shell/stats_screen.dart';
import 'package:psygames_flutter/shell/streak_calendar_model.dart';
import 'package:psygames_flutter/shell/training_history.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПРОГРЕСС»: РАСЧЁТ НА DART СОВПАДАЕТ С ВЕБОМ (задача d6a60b02, вариант Б, шестой экран).
///
/// Эталоны выгружает веб-проба `stats-host-model.test.tsx` с настоящего экрана при замороженных часах:
/// модель и её входы — всё хранилище после монтирования, миг «сейчас», пояс, охват. Здесь то же
/// хранилище кладётся в общую память, часы — те же, и Dart проходит весь путь: чтение партий (старые
/// имена, самурай), профиль с файлом состава, итоги игр, баланс со сдвигом, история с вердиктами,
/// уровень, дайджест недели из кэша.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  Map<String, Object?> obj(String f) => (json(f)! as Map).cast<String, Object?>();
  final rules = StatsRules.fromJson(obj('assets/stats_rules.json'));
  final catalog = obj('assets/catalog.json');
  final profilesJson = obj('assets/profiles.json');
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  final loc = CalendarLocales.fromJson(obj('assets/calendar_locales.json'));
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());

  setUpAll(() async {
    WebTheme.use(obj('assets/web_theme.json').cast<String, dynamic>());
  });

  /// Часы эталона: `getTimezoneOffset` веба — минуты «UTC минус местное».
  Wall wallOf(int offsetMinutes) =>
      (ms) => DateTime.fromMillisecondsSinceEpoch(ms - offsetMinutes * 60000, isUtc: true);

  Future<(SharedState, Map<String, Object?>)> stateOf(String name) async {
    final inp = obj('test/fixtures/stats_input_$name.json');
    SharedPreferences.setMockInitialValues((inp['storage']! as Map).cast<String, Object>());
    return (await SharedState.open(), inp);
  }

  for (final name in ['ru', 'ru_all', 'en', 'empty', 'scoped']) {
    test('🔴 stats_model_$name: модель Dart = модель веба на том же хранилище и часах', () async {
      final (state, inp) = await stateOf(name);
      lang(state.get('language') ?? 'en');
      final inputs = statsInputsFrom(
        state,
        rules: rules,
        catalog: catalog,
        profilesJson: profilesJson,
        profiles: profiles,
        loc: loc,
        now: (inp['now']! as num).toInt(),
        wall: wallOf((inp['tzOffsetMinutes']! as num).toInt()),
      );
      final dart = statsModel(inputs, scopeAll: inp['scopeAll'] == true, textSecondary: inp['textSecondary']! as String);
      expect(jsonDecode(jsonEncode(dart)), json('test/fixtures/stats_model_$name.json'));
    });
  }

  test('правила по краям: Math.round веба, формат времени, уровень на пороге, неделя ISO', () {
    expect([jsRound(-2.5), jsRound(2.5), jsRound(0.49999999999999994), jsRound(-0.5)], [-2, 3, 0, 0]);
    expect(
      [formatTime(0), formatTime(0.4), formatTime(59.9), formatTime(61), formatTime(86401), formatTime(double.nan)],
      ['—', '0.4s', '59s', '1:01', '—', '—'],
    );
    expect([levelInfo(79, rules).level, levelInfo(80, rules).level, levelInfo(7000, rules).span], [0, 1, null]);
    expect(
      [isoWeekKey(DateTime.utc(2026, 1, 1)), isoWeekKey(DateTime.utc(2027, 1, 3)), isoWeekKey(DateTime.utc(2026, 10, 7))],
      ['2026-W1', '2026-W53', '2026-W41'],
    );
  });

  test('файл состава: без раздела «профили» — без слоя; пусто — заводской слой; «убрать» закрывает', () async {
    final p = profiles.byId('vasilyeva')!;
    SharedPreferences.setMockInitialValues({'psygames_playlists_override': '{"наборы":[]}'});
    final none = ProfileAccess.of(p, await SharedState.open(), profilesJson);
    expect(none.allowed, p.raw['allowed_games']);
    SharedPreferences.setMockInitialValues({});
    final factory = ProfileAccess.of(p, await SharedState.open(), profilesJson);
    expect(factory.allowed, ((profilesJson['factoryOverlay']! as Map)['vasilyeva'] as Map)['игры']);
    final closed = ProfileAccess(allowed: 'all', closed: ['corsi'], alwaysAllowed: const {'corsi'});
    expect([closed.allows('corsi'), closed.allows('sudoku')], [false, true]);
  });

  /// Экран «Прогресса» на хранилище эталона [name], часы — его же; ждёт, пока своя модель посчитается.
  Future<(SharedState, Map<String, Object?>)> mountStats(WidgetTester t, String name) async {
    final (state, inp) = await stateOf(name);
    lang('ru');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    StatsScreen.now = () => (inp['now']! as num).toInt();
    StatsScreen.wall = wallOf((inp['tzOffsetMinutes']! as num).toInt());
    addTearDown(() {
      StatsScreen.now = () => DateTime.now().millisecondsSinceEpoch;
      StatsScreen.wall = deviceWall;
    });
    t.view.physicalSize = const Size(780, 3000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: StatsScreen(onTab: (_) {}, state: state),
      ),
    );
    for (var i = 0; i < 40 && find.byKey(const ValueKey('stats-screen')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    return (state, inp);
  }

  testWidgets('🔴 экран считает модель сам: охват «все игры» — свой, страница не нужна', (t) async {
    await mountStats(t, 'ru');
    final ru = obj('test/fixtures/stats_model_ru.json');
    expect(find.text(ru['totalPlayed']! as String), findsOneWidget);
    expect(ScreenUi.model(StatsScreen.route).value, isNull, reason: 'модель не от страницы');
    await t.tap(find.text(((ru['scope']! as Map)['all']) as String));
    await t.pump();
    final all = obj('test/fixtures/stats_model_ru_all.json');
    expect(find.text(all['totalPlayed']! as String), findsOneWidget, reason: 'охват переключён здесь, без веба');
  });

  testWidgets('🔴 новая партия в памяти — «Прогресс» пересчитан сам, без перезахода (слушает запись, не только профиль)', (t) async {
    final (state, inp) = await mountStats(t, 'ru');
    final ru = obj('test/fixtures/stats_model_ru.json');
    expect(find.text(ru['totalPlayed']! as String), findsOneWidget);
    final now = (inp['now']! as num).toInt();
    final list = jsonDecode(state.get('psygames_sessions')!) as List;
    list.add({
      'profile_id': state.activeProfile,
      'game_type': 'corsi',
      'score': 5,
      'time_seconds': 50,
      'timestamp': DateTime.fromMillisecondsSinceEpoch(now - 60000, isUtc: true).toIso8601String(),
      'passed': true,
    });
    await t.runAsync(() => state.set('psygames_sessions', jsonEncode(list)));
    await t.pump(const Duration(milliseconds: 250));
    for (var i = 0; i < 10; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    final want = statsModel(
      statsInputsFrom(
        state,
        rules: rules,
        catalog: catalog,
        profilesJson: profilesJson,
        profiles: profiles,
        loc: loc,
        now: now,
        wall: wallOf((inp['tzOffsetMinutes']! as num).toInt()),
      ),
      scopeAll: false,
      textSecondary: inp['textSecondary']! as String,
    );
    expect(want['totalPlayed'], isNot(ru['totalPlayed']));
    expect(find.text(want['totalPlayed']! as String), findsOneWidget);
  });
}
