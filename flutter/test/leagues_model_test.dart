import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/progression.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ЛИГИ»: РАСЧЁТ НА DART СОВПАДАЕТ С ВЕБОМ (задача d6a60b02, вариант Б, второй экран).
///
/// Эталоны выгружает веб-проба `info-pages-host-model.test.tsx` с настоящего `progression.ts`:
///   · `progression_oracle.json` — `standingFor` и рамки на 74 точках (границы каждой лиги ±1, ранги, верх);
///   · `leagues_model*.json` + `leagues_input*.json` — модель экрана и её входы (партии и «сейчас»).
/// Таблицы — `assets/progression.json` (выгрузка `tools/embed-progression.mjs`).
void main() {
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  final p = Progression.fromJson((json('assets/progression.json')! as Map).cast<String, Object?>());

  test('🔴 формулы — по каждой точке эталона: лига, ранг, до следующего, заполнение, рамки', () {
    final rows = (json('test/fixtures/progression_oracle.json')! as List).cast<Map>();
    expect(rows.length, greaterThan(60));
    for (final r in rows) {
      final pts = r['pts'] as int;
      final st = p.standingFor(pts);
      final frames = [
        for (final f in p.frames)
          if (p.isLeagueReached(f.league, pts)) f.id,
      ];
      expect(
        {
          'league': p.leagues[st.league].id,
          'rank': st.rank,
          'toNext': st.toNext,
          'progress': double.parse(st.progress.toStringAsFixed(12)),
          'frames': frames,
        },
        {
          'league': r['league'],
          'rank': r['rank'],
          'toNext': r['toNext'],
          'progress': (r['progress'] as num).toDouble(),
          'frames': r['frames'],
        },
        reason: 'pts=$pts',
      );
    }
  });

  for (final (lang, suffix) in [('ru', ''), ('en', '_en')]) {
    test('🔴 $lang: модель Dart = модель веба на тех же партиях и том же «сейчас»', () {
      L.useForTest(lang, (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>());
      final web = (json('test/fixtures/leagues_model$suffix.json')! as Map).cast<String, Object?>();
      final input = (json('test/fixtures/leagues_input$suffix.json')! as Map).cast<String, Object?>();
      final pts = p.seasonPointsFrom((input['sessions']! as List).cast<Object?>(), nowMs: (input['now']! as num).toInt());
      expect(jsonDecode(jsonEncode(leaguesModel(p, pts, primary: web['primary']! as String))), web);
    });
  }

  test('очки сезона: без времени, из будущего и старше сезона — мимо; строка-число считается', () {
    final now = DateTime.utc(2026, 10, 7, 12).millisecondsSinceEpoch;
    String ago(int d) => DateTime.fromMillisecondsSinceEpoch(now - d * 86400000, isUtc: true).toIso8601String();
    expect(
      p.seasonPointsFrom([
        {'score': 100, 'timestamp': ago(1)},
        {'score': '50', 'timestamp': ago(2)},
        {'score': 999},
        {'score': 999, 'timestamp': ago(31)},
        {'score': 999, 'timestamp': ago(-1)},
        {'score': -5, 'timestamp': ago(1)},
        {'score': 0.6, 'timestamp': ago(1)},
      ], nowMs: now),
      150,
    );
  });

  testWidgets('🔴 экран со своим состоянием считает «Лиги» сам: партии из общей памяти, цвет — профиля', (t) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    L.useForTest('en', (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map).cast<String, String>());
    final input = (json('test/fixtures/leagues_input_en.json')! as Map).cast<String, Object?>();
    final web = (json('test/fixtures/leagues_model_en.json')! as Map).cast<String, Object?>();
    // Те же партии, сдвинутые к сегодняшнему дню: «сейчас» экрана — настоящее.
    final shift = DateTime.now().millisecondsSinceEpoch - (input['now']! as num).toInt();
    final sessions = [
      for (final s in (input['sessions']! as List).cast<Map>())
        {
          ...s,
          'timestamp': DateTime.fromMillisecondsSinceEpoch(
            DateTime.parse(s['timestamp'] as String).millisecondsSinceEpoch + shift,
            isUtc: true,
          ).toIso8601String(),
        },
    ];
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48', 'psygames_sessions': jsonEncode(sessions)});
    final state = await SharedState.open();
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    t.view.physicalSize = const Size(780, 3000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: LeaguesScreen(state: state)));
    for (var i = 0; i < 20 && find.text((web['card']! as Map)['pts'] as String).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    expect(find.text((web['card']! as Map)['pts'] as String), findsOneWidget, reason: 'очки сезона — свой расчёт, страницы нет');
    final own = await t.runAsync(() => leaguesModelFor(state));
    expect(jsonDecode(jsonEncode(own)), web);
  });
}
