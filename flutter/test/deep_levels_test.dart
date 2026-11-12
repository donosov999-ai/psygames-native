import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/levels.dart';
import 'package:psygames_flutter/games/deep/portals.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/deep/tree.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЛЕСТНИЦА «БЕЗДНЫ» — решение Дениса 12.11.2026: «сложность + бесконечные ступени» (задача c345a8f1,
/// правило «все функции — у всех 131 игр»). Меряется: расписание ступеней по осям, которые у игры уже
/// есть; на ступенях 9–10 порталов больше, чем у веба; партия по уровню пишет уровень в снимок и даёт
/// в паузе карту и «проще»; свободная партия — без лестницы.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const resumeKey = 'psygames_resume_sudoku_fractal_deep_nzt48';

  group('расписание ступеней', () {
    test('1–3 — объём, первая ступень досок, порталы и доля — как у веба', () {
      expect([for (var n = 1; n <= 3; n++) deepLevel(n).preset], ['scout', 'trek', 'abyss']);
      for (var n = 1; n <= 3; n++) {
        expect(deepLevel(n).band, 0);
        expect(deepLevel(n).portalPairs, 2);
        expect(deepLevel(n).unlockShare, deepBaseUnlockShare);
      }
    });

    test('4–8 — ступень досок 2…6; 9–10 — порталов 3, 4; дальше доля закрытия растёт до 1,0', () {
      expect([for (var n = 4; n <= 8; n++) deepLevel(n).band], [1, 2, 3, 4, 5]);
      expect([deepLevel(9).portalPairs, deepLevel(10).portalPairs], [3, 4]);
      expect(deepLevel(11).unlockShare, closeTo(0.32, 1e-9));
      for (var n = 11; n < deepPlateauLevel; n++) {
        expect(
          deepLevel(n + 1).unlockShare,
          greaterThan(deepLevel(n).unlockShare),
          reason: 'ступень $n → ${n + 1} тяжелее',
        );
      }
      expect(deepLevel(deepPlateauLevel).unlockShare, 1.0);
      expect(deepLevel(deepPlateauLevel + 7), deepLevel(deepPlateauLevel), reason: 'после 20-й нагрузка не растёт');
    });
  });

  test('🔴 больше пар порталов — на деле больше порталов (по эталонным раскладкам веба)', () async {
    final bank = await DeepBank.load();
    final data =
        jsonDecode(File('test/fixtures/deep-portals-reference.json').readAsStringSync()) as Map<String, Object?>;
    final cases = (data['cases'] as List).cast<Map<String, Object?>>().where((c) => c['preset'] == 'abyss').toList();
    expect(cases, isNotEmpty);
    var two = 0, four = 0;
    for (final c in cases) {
      final seed = c['seed'] as String, parentPath = c['parentPath'] as String;
      DeepCfg cfg(int pairs) => DeepCfg(
        depth: 3,
        rating: deepBands[(c['band'] as num).toInt()],
        feedCount: null,
        unlockShare: 0.24,
        portalPairs: pairs,
      );
      final parent = materializeChain(bank, seed, parentPath, cfg(2)).last;
      final a = deepPortalsFor(bank, seed, parentPath, cfg(2), parent.solution).length;
      final b = deepPortalsFor(bank, seed, parentPath, cfg(4), parent.solution).length;
      expect(a, lessThanOrEqualTo(2));
      expect(b, greaterThanOrEqualTo(a), reason: '«$seed»/«$parentPath»: больше пар не может дать меньше порталов');
      two += a;
      four += b;
    }
    expect(four, greaterThan(two), reason: 'ступени 9–10 действительно добавляют перекрёстные зависимости');
  });

  group('экран', () {
    late SharedState state;
    setUpAll(() async => L.load('ru'));

    Future<void> boot(WidgetTester t, Map<String, Object> prefs, {bool free = false}) async {
      SharedPreferences.setMockInitialValues(prefs);
      state = await SharedState.open();
      LevelLadder.newScreen();
      await t.runAsync(() async {
        await t.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
        var started = false;
        for (var i = 0; i < 60; i++) {
          await t.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          final start = find.byKey(const Key('deep-start'));
          if (!started && start.evaluate().isNotEmpty) {
            if (free) {
              await t.tap(find.byKey(const Key('deep-mode-free')));
              await t.pump();
            }
            await t.tap(start);
            started = true;
          }
          if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
        }
      });
      await t.pumpAndSettle();
    }

    Map<String, Object?> snapshot() =>
        ((jsonDecode(state.get(resumeKey)!) as Map)['state'] as Map).cast<String, Object?>();

    Future<void> pause(WidgetTester t) async {
      await t.tap(find.byTooltip(L.t('teachPause')));
      await t.pumpAndSettle();
    }

    testWidgets('🔴 новая игра — по уровню: ступень 3 = «Бездна», уровень в снимке, в паузе карта и «проще»', (
      t,
    ) async {
      await boot(t, {
        'psygames_active_profile': 'nzt48',
        'psygames_sudoku_fractal_deep_level_nzt48': '3',
        'psygames_sudoku_fractal_deep_best_nzt48': '3',
      });
      final s = snapshot();
      expect(s['level'], 3, reason: 'уровень партии — в снимке, без него ступени 9+ собрались бы другими');
      expect(s['preset'], 'abyss');
      expect(s['band'], 0);
      await pause(t);
      expect(find.text(L.t('levelMap')), findsOneWidget);
      expect(find.text(L.t('pauseEasier')), findsOneWidget);
    });

    testWidgets('свободная партия — без лестницы: в снимке нет уровня, в паузе нет карты и «проще»', (t) async {
      await boot(t, {
        'psygames_active_profile': 'nzt48',
        'psygames_sudoku_fractal_deep_level_nzt48': '3',
        'psygames_sudoku_fractal_deep_best_nzt48': '3',
      }, free: true);
      expect(snapshot().containsKey('level'), isFalse);
      await pause(t);
      expect(find.text(L.t('levelMap')), findsNothing);
      expect(find.text(L.t('pauseEasier')), findsNothing);
    });
  });
}
