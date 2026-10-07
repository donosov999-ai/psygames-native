import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/level_map.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КАРТА УРОВНЕЙ — ВЕРНУТЬСЯ НА ПРОЙДЕННЫЙ («Судоку», «Фрактал», «Самурай»; b5df5096 п.4).
///
/// Сверка 138f7818, строки 101 / 303 / «Самурай» 4 («высокая»): уровень только рос сам, а
/// `LevelLadder.pick` в каркасе был, но не звался. Проверяется нажатиями: пауза → «Уровни» →
/// узел пройденного уровня → партия на нём; потолок (best) не тронут; закрытые узлы не жмутся;
/// при живой партии — вопрос «Заново?»; звёзды из записи веба видны.
void main() {
  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });
  late SharedState state;

  Future<void> boot(WidgetTester tester, Widget Function(SharedState) screen, Map<String, Object> prefs, String ready) async {
    SharedPreferences.setMockInitialValues(prefs);
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: screen(state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(Key(ready)).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> openMap(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('sudokuModeLevels')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('level-map')), findsOneWidget, reason: 'карта открылась');
  }

  /// Нажать узел карты: в боковую ленту он может не помещаться — прокрутить к нему.
  Future<void> pickNode(WidgetTester tester, int n) async {
    await tester.scrollUntilVisible(find.byKey(Key('level-node-$n')), -120,
        scrollable: find.descendant(of: find.byKey(const Key('level-map')), matching: find.byType(Scrollable)));
    // «Видим» у scrollUntilVisible — хотя бы краем; касание в центр узла у границы ленты промахивается.
    await tester.ensureVisible(find.byKey(Key('level-node-$n')));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byKey(Key('level-node-$n')));
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await tester.pumpAndSettle();
  }

  Map<String, Object?> snapshot(String key) => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  testWidgets('🔴 «Судоку»: пройденный уровень — переиграть; потолок и счётчик дороги не тронуты', (tester) async {
    await boot(tester, (s) => SudokuScreen(state: s),
        {'psygames_sudoku_level_nzt48': '12', 'psygames_sudoku_best_nzt48': '20'}, 'cell_0_0');
    await openMap(tester);
    // 07.10.2026: потолок — ИЗ ЛЕСТНИЦЫ, а не литералом: #256 удлинил её 120 → 128, и литерал покраснел
    // на исправном экране (замер раздела «Поиск» на голове выпуска 2.56.15).
    final ladderSteps = ((jsonDecode(File('assets/levels/sudoku-ladder.json').readAsStringSync()) as Map)['ladder'] as List).length;
    expect(ladderSteps, greaterThanOrEqualTo(120), reason: 'лестница не может стать короче 120');
    expect(tester.widget<Text>(find.byKey(const Key('level-map-title'))).data, L.f('levelOfMax', {'n': '12', 'max': '$ladderSteps'}));
    // Закрытый узел (выше лучшего) не нажимается.
    await tester.scrollUntilVisible(find.byKey(const Key('level-node-21')), 120,
        scrollable: find.descendant(of: find.byKey(const Key('level-map')), matching: find.byType(Scrollable)));
    expect(tester.widget<InkWell>(find.byKey(const Key('level-node-21'))).onTap, isNull, reason: 'выше лучшего — закрыто');
    expect(tester.widget<InkWell>(find.byKey(const Key('level-node-20'))).onTap, isNotNull, reason: 'лучший пройден — открыт');

    await pickNode(tester, 3);
    expect(find.byKey(const Key('level-map')), findsNothing);
    expect(snapshot('psygames_resume_sudoku_nzt48')['level'], 3, reason: 'раздана доска выбранного уровня');
    expect(state.get('psygames_sudoku_best_nzt48'), '20', reason: 'потолок не тронут');
    expect(state.get('psygames_sudoku_level_nzt48'), '12', reason: 'счётчик дороги хранит максимум — прогресс не потерян');
  });

  testWidgets('🔴 «Судоку»: при живой партии — сначала вопрос «Заново?», «Отмена» оставляет уровень', (tester) async {
    await boot(tester, (s) => SudokuScreen(state: s),
        {'psygames_sudoku_level_nzt48': '12', 'psygames_sudoku_best_nzt48': '20', 'psygames_sudoku_rulehint_diagonal': '1'},
        'cell_0_0');
    // Ход — партия «живая».
    late int r0, c0;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        final t = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
        if (t.evaluate().isEmpty || ((t.evaluate().first.widget as Text).data ?? '').isEmpty) {
          (r0, c0) = (r, c);
          found = true;
        }
      }
    }
    await tester.tap(find.byKey(Key('cell_${r0}_$c0')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit1')));
    await tester.pump();
    await openMap(tester);
    await pickNode(tester, 4);
    expect(find.text(L.t('restartConfirmTitle')), findsOneWidget, reason: 'есть что терять — спрашиваем');
    await tester.tap(find.byKey(const Key('confirm-stay')));
    await tester.pumpAndSettle();
    expect(snapshot('psygames_resume_sudoku_nzt48')['level'], 12, reason: '«Отмена» — партия и уровень те же');
  });

  testWidgets('🔴 звёзды пройденных уровней — из записи веба', (tester) async {
    await boot(tester, (s) => SudokuScreen(state: s), {
      'psygames_sudoku_level_nzt48': '5',
      'psygames_sudoku_best_nzt48': '6',
      'psygames_sudoku_stars_nzt48': jsonEncode({'3': 2, '4': 3}),
    }, 'cell_0_0');
    await openMap(tester);
    expect(tester.widget<Text>(find.byKey(const Key('level-stars-3'))).data, '★★');
    expect(tester.widget<Text>(find.byKey(const Key('level-stars-4'))).data, '★★★');
    expect(find.byKey(const Key('level-stars-5')), findsNothing, reason: 'без звёзд — пусто');
  });

  testWidgets('🔴 «Фрактал»: пройденная ступень — переиграть, потолок не тронут', (tester) async {
    await boot(tester, (s) => FractalScreen(state: s),
        {'psygames_sudoku_fractal_level_nzt48': '6', 'psygames_sudoku_fractal_best_nzt48': '9'}, 'tile0');
    await openMap(tester);
    await pickNode(tester, 2);
    expect(snapshot('psygames_resume_sudoku_fractal_nzt48')['level'], 2);
    expect(state.get('psygames_sudoku_fractal_level_nzt48'), '2', reason: 'ступень фрактала — выбранная');
    expect(state.get('psygames_sudoku_fractal_best_nzt48'), '9', reason: 'потолок не тронут');
  });

  testWidgets('🔴 «Самурай»: пройденная ступень — переиграть, потолок не тронут', (tester) async {
    await boot(tester, (s) => SamuraiScreen(state: s),
        {'psygames_sudoku_samurai_level_nzt48': '5', 'psygames_sudoku_samurai_best_nzt48': '8'}, 'cell_0_0');
    await openMap(tester);
    await pickNode(tester, 2);
    expect(state.get('psygames_sudoku_samurai_level_nzt48'), '2');
    expect(state.get('psygames_sudoku_samurai_best_nzt48'), '8');
  });

  testWidgets('звёзды: держится лучший результат, формулы — как у веба', (tester) async {
    await boot(tester, (s) => SudokuScreen(state: s), {'psygames_sudoku_stars_nzt48': jsonEncode({'3': 2})}, 'cell_0_0');
    await tester.runAsync(() => saveLevelStars(state, 'sudoku', 3, 1));
    expect(jsonDecode(state.get('psygames_sudoku_stars_nzt48')!), {'3': 2}, reason: 'переиграл хуже — лучшее не затёрто');
    await tester.runAsync(() async {
      await saveLevelStars(state, 'sudoku', 4, 3);
      await saveLevelStars(state, 'sudoku', 3, 3);
    });
    expect(jsonDecode(state.get('psygames_sudoku_stars_nzt48')!), {'3': 3, '4': 3}, reason: 'хуже — не затирает, лучше — пишет');
    expect([sudokuStars(0), sudokuStars(2), sudokuStars(3)], [3, 2, 1]);
    expect([fractalStars(0), fractalStars(3), fractalStars(4)], [3, 2, 1]);
    expect([samuraiStars(0, 0), samuraiStars(0, 1), samuraiStars(2, 1), samuraiStars(0, 2), samuraiStars(3, 0)], [3, 2, 2, 1, 1]);
  });

  testWidgets('малыши и режимы — без карты: лестницы нет', (tester) async {
    await boot(tester, (s) => SudokuScreen(state: s, junior: true), {}, 'cell_0_0');
    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    expect(find.text(L.t('sudokuModeLevels')), findsNothing);
  });
}
