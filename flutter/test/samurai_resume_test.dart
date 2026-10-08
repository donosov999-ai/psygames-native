import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ «САМУРАЯ» ПЕРЕЖИВАЕТ УХОД С ЭКРАНА — И В ФОРМАТЕ ВЕБА.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.3: партия идёт под час на 369 клетках,
/// а натив раздавал доску заново после любого ухода. Снимок — ключ и конверт каркаса
/// (`ResumeStore`, как `services/resume` веба), поля — `SamuraiResume` веба (RESUME_V 2).
/// Пробы играют нажатиями: ход → уход → вход → ход на месте, лента отмены цела; запись, какой
/// её пишет веб, поднимается нативом; проигрыш стирает снимок; чужая ступень и чужая веха
/// мегабосса не поднимаются.
void main() {
  setUpAll(() async => L.load('ru'));
  const key = 'psygames_resume_sudoku_samurai_nzt48';
  late SharedState state;

  Future<void> boot(WidgetTester tester, {int? megaboss}) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SamuraiScreen(state: state, megabossFrom: megaboss)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  /// Напечатанная цифра задания — жирная (у хода игрока — обычная).
  bool givenAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    return text.evaluate().isNotEmpty && tester.widget<Text>(text.first).style?.fontWeight == FontWeight.w800;
  }

  Future<void> tapCell(WidgetTester tester, int r, int c) async {
    final f = find.byKey(Key('cell_${r}_$c'));
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  /// Первая пустая клетка фигуры: ставится цифра [digit]. Карта на первом тычке переходит в
  /// рабочий масштаб — поэтому тычок повторяется.
  Future<({int r, int c})> put(WidgetTester tester, int digit, {({int r, int c})? at}) async {
    var cell = at;
    if (cell == null) {
      outer:
      for (var r = 0; r < samuraiSize; r++) {
        for (var c = 0; c < samuraiSize; c++) {
          if (isSamuraiCell(r, c) && digitAt(tester, r, c) == 0) {
            cell = (r: r, c: c);
            break outer;
          }
        }
      }
    }
    await tapCell(tester, cell!.r, cell.c);
    await tapCell(tester, cell.r, cell.c);
    await tester.tap(find.byKey(Key('digit$digit')), warnIfMissed: false);
    await tester.pump();
    return cell;
  }

  Map<String, Object?> stored() =>
      ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  group('ступень 1', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({'psygames_sudoku_samurai_level_nzt48': '1'});
      state = await SharedState.open();
    });

    testWidgets('🔴 ход → уход → вход: ход на месте, лента отмены цела, снимок в формате веба', (tester) async {
      await boot(tester);
      final cell = await put(tester, 7);
      await leave(tester);

      final env = jsonDecode(state.get(key)!) as Map;
      expect(env['v'], samuraiResumeVersion, reason: 'версия — та же, что у веба (SAMURAI_RESUME_V)');
      final s = stored();
      expect(s.keys.toSet(), containsAll(['level', 'megaboss', 'solution', 'grid', 'given', 'marks', 'errors', 'hintUses', 'elapsed', 'history']));
      expect(((s['grid'] as List)[cell.r] as List)[cell.c], 7, reason: 'ход в снимке');
      final past = ((s['history'] as Map)['past'] as List).cast<Map>();
      expect(past.single, {'r': cell.r, 'c': cell.c, 'from': 0, 'to': 7}, reason: 'ход ленты — как SamuraiMove веба');

      await boot(tester);
      expect(digitAt(tester, cell.r, cell.c), 7, reason: 'вход поднял партию');
      await tester.tap(find.byTooltip(L.t('btn_undo')));
      await tester.pump();
      expect(digitAt(tester, cell.r, cell.c), 0, reason: 'лента отмены пережила уход');
    });

    testWidgets('🔴 запись, какой её пишет ВЕБ, поднимается нативом', (tester) async {
      // Доска — из первой раздачи экрана; снимок собирается руками в форме SamuraiResume веба.
      await boot(tester);
      await leave(tester);
      final fresh = stored();
      final grid = [for (final row in (fresh['grid'] as List)) [...(row as List)]];
      final given = fresh['given'] as List;
      final sol = fresh['solution'] as List;
      // Первая пустая клетка — верная цифра из решения, как будто её поставили в вебе.
      late int r0, c0;
      outer:
      for (var r = 0; r < samuraiSize; r++) {
        for (var c = 0; c < samuraiSize; c++) {
          if (isSamuraiCell(r, c) && (given[r] as List)[c] != true) {
            r0 = r;
            c0 = c;
            break outer;
          }
        }
      }
      final v = ((sol[r0] as List)[c0] as num).toInt();
      grid[r0][c0] = v;
      state.set(key, jsonEncode({
        'v': 2,
        'savedAt': DateTime.now().millisecondsSinceEpoch,
        'state': {
          'level': 1, 'megaboss': null, 'solution': sol, 'grid': grid, 'given': given,
          'marks': [for (var r = 0; r < samuraiSize; r++) List.filled(samuraiSize, 0)],
          'errors': 2, 'hintUses': 0, 'elapsed': 300,
          'history': {'past': [{'r': r0, 'c': c0, 'from': 0, 'to': v}], 'future': []},
        },
      }));
      await boot(tester);
      expect(digitAt(tester, r0, c0), v, reason: 'веб-снимок поднят: цифра на месте');
      expect(find.text('2/${samuraiLevelParams(1).maxErrors}'), findsOneWidget, reason: 'ошибки из снимка');
    });

    testWidgets('🔴 проигрыш стирает снимок — продолжать нечего', (tester) async {
      await boot(tester);
      final limit = samuraiLevelParams(1).maxErrors;
      final s0 = stored();
      final sol = s0['solution'] as List;
      final given = s0['given'] as List;
      var made = 0;
      for (var r = 0; r < samuraiSize && made < limit; r++) {
        for (var c = 0; c < samuraiSize && made < limit; c++) {
          if (!isSamuraiCell(r, c) || (given[r] as List)[c] == true) continue;
          final right = ((sol[r] as List)[c] as num).toInt();
          await put(tester, right == 9 ? 1 : right + 1, at: (r: r, c: c));
          made++;
        }
      }
      expect(state.get(key), isNull, reason: 'проигранная партия не поднимается');
    });

    testWidgets('🔴 вход мегабоссом не поднимает обычную партию', (tester) async {
      await boot(tester);
      await put(tester, 7);
      await leave(tester);
      await boot(tester, megaboss: 15);
      // ⚠️ Мерим ХОДЫ игрока, а не цифру в той же клетке: доска мегабосса — новая раздача, и в этой
      // клетке часто стоит НАПЕЧАТАННАЯ цифра (замер 07.10: 27 входов из 40), иногда та же 7 — так
      // проба плавала «Expected: not <7>» в чужих PR (#187, #302). Ход игрока — нежирная цифра.
      final moves = [
        for (var r = 0; r < samuraiSize; r++)
          for (var c = 0; c < samuraiSize; c++)
            if (isSamuraiCell(r, c) && digitAt(tester, r, c) != 0 && !givenAt(tester, r, c)) (r, c)
      ];
      expect(moves, isEmpty, reason: 'мега-вход ждёт свою битву: ходов обычной партии на доске нет');
    });
  });

  testWidgets('🔴 снимок чужой ступени не поднимается', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_samurai_level_nzt48': '1'});
    state = await SharedState.open();
    await boot(tester);
    final cell = await put(tester, 7);
    await leave(tester);
    state.set('psygames_sudoku_samurai_level_nzt48', '2');   // в другой сессии лестница ушла вперёд
    await boot(tester);
    expect(digitAt(tester, cell.r, cell.c) == 7 && stored()['level'] == 1, isFalse,
        reason: 'партия первой ступени на второй не поднимается');
    expect(stored()['level'], 2, reason: 'снимок перезаписан своей доской');
  });
}
