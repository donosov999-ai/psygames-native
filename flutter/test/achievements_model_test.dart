import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/achievements_model.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/streak_calendar_model.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ДОСТИЖЕНИЯ»: РАСЧЁТ НА DART СОВПАДАЕТ С ВЕБОМ (задача d6a60b02, вариант Б, пятый экран).
///
/// Эталоны выгружает веб-проба `info-pages-host-model.test.tsx` с настоящего экрана вместе с ключом
/// хранилища (`achievements_input*.json`), плюс оракул даты открытия на 12 языках. Здесь тот же ключ
/// кладётся в общую память, и Dart проходит весь путь: таблица веба, чтение открытых, дата шаблоном
/// ICU, модель.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  final data = AchievementsData.fromJson((json('assets/achievements.json')! as Map).cast<String, Object?>());
  final loc = CalendarLocales.fromJson((json('assets/calendar_locales.json')! as Map).cast<String, Object?>());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());

  Future<SharedState> stateWith(Map<String, Object?> storage) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48', ...storage.cast<String, Object>()});
    return SharedState.open();
  }

  for (final (l, input, model) in [
    ('ru', 'achievements_input.json', 'achievements_model.json'),
    ('en', 'achievements_input_en.json', 'achievements_model_en.json'),
  ]) {
    test('🔴 $model: модель Dart = модель веба на том же ключе хранилища', () async {
      lang(l);
      final inp = (json('test/fixtures/$input')! as Map).cast<String, Object?>();
      final state = await stateWith((inp['storage']! as Map).cast<String, Object?>());
      expect(jsonDecode(jsonEncode(achievementsModel(data, unlockedOf(state), loc))), json('test/fixtures/$model'));
    });
  }

  test('🔴 дата открытия = humanDate веба на 12 языках (переполнение, високосный год, непонятное)', () {
    final rows = (json('test/fixtures/achievements_dates_oracle.json')! as List).cast<Map>();
    expect(rows.map((r) => r['lang']).toSet(), hasLength(12));
    for (final r in rows) {
      expect(humanDate(r['date'], r['lang'] as String, loc), r['out'], reason: '${r['lang']} ${r['date']}');
    }
  });

  test('битое хранилище — пусто, а не падение (веб тут уронил бы экран)', () async {
    lang('ru');
    for (final raw in ['не json', '{"id":"first_session"}', '42']) {
      final s = await stateWith({'psygames_achievements_unlocked': raw});
      expect(unlockedOf(s), isEmpty, reason: raw);
    }
    final s = await stateWith({'psygames_achievements_unlocked': '[null,{"id":"first_session","date":"2026-10-01"}]'});
    final m = achievementsModel(data, unlockedOf(s), loc);
    expect(m['title'], contains('2/${data.achievements.length}'));
  });

  testWidgets('🔴 экран считает модель сам — страница не нужна', (t) async {
    lang('ru');
    final inp = (json('test/fixtures/achievements_input.json')! as Map).cast<String, Object?>();
    final state = await stateWith((inp['storage']! as Map).cast<String, Object?>());
    final web = (json('test/fixtures/achievements_model.json')! as Map).cast<String, Object?>();
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    t.view.physicalSize = const Size(780, 3000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: AchievementsScreen(state: state)));
    for (var i = 0; i < 20 && find.byKey(const ValueKey('achievement-first_session')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    expect(find.text(web['title']! as String), findsOneWidget);
    final first = (web['sections']! as List)
        .cast<Map>()
        .expand((s) => (s['cards'] as List).cast<Map>())
        .firstWhere((c) => c['id'] == 'first_session');
    expect(find.text(first['date'] as String), findsOneWidget);
    expect(ScreenUi.model(AchievementsScreen.route).value, isNull, reason: 'модель не от страницы');
  });
}
