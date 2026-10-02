import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/deep/tree.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПАРТИЯ ДОХОДИТ ДО СТАТИСТИКИ — задача 24cecc5c.
///
/// Разбор координатора 30.09: нативные экраны раздела отправляли отчёт партии только
/// через лестницу и только на победе в обычных уровнях. Проигрыш судоку, победа и
/// проигрыш в «Небоскрёбах»/«Неравенствах» и вся «Бездна» не доходили никуда — в
/// статистике их нет, шаг зарядки на них не засчитывался.
///
/// Каждая проба ИГРАЕТ партию нажатиями и ловит отчёт на выходе из приложения
/// (`SessionReport.sink`), а не читает код экрана. Форма отчёта сверяется с тем, что
/// пишет веб: game_type и режим обязаны совпасть, иначе партия ляжет в статистику под
/// другой игрой.
void main() {
  late SharedState state;
  late List<Map<String, Object?>> sent;

  setUp(() {
    sent = [];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, Object?>);
  });
  tearDown(() => SessionReport.sink = null);

  Future<void> pumpUntil(WidgetTester tester, Widget screen) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Что видно в клетке (0 — пусто).
  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return int.tryParse(s) ?? 0;
  }

  int clueAt(WidgetTester tester, int row, int col) {
    final f = find.byKey(Key('clue_${row}_$col'));
    if (f.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(f).data ?? '') ?? 0;
  }

  /// Сколько зданий видно по ряду высот: считаются новые максимумы.
  int visible(List<int> line) {
    var best = 0, seen = 0;
    for (final h in line) {
      if (h > best) {
        best = h;
        seen++;
      }
    }
    return seen;
  }

  /// Решатель пробы — СВОЙ, простым перебором, и видит только то, что видит человек:
  /// цифры на доске и подсказки кольца. Брать разгадку из данных экрана значило бы
  /// проверять код этим же кодом.
  List<List<int>> solve(List<List<int>> g, int n, int br, int bc, {List<List<int>>? ring}) {
    bool ok(int r, int c, int v) {
      for (var i = 0; i < n; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r ~/ br * br, c0 = c ~/ bc * bc;
      for (var i = r0; i < r0 + br; i++) {
        for (var j = c0; j < c0 + bc; j++) {
          if (g[i][j] == v) return false;
        }
      }
      return true;
    }

    bool towersHold() {
      if (ring == null) return true;
      for (var i = 0; i < n; i++) {
        final row = g[i], col = [for (var k = 0; k < n; k++) g[k][i]];
        final left = ring[i + 1][0], right = ring[i + 1][n + 1];
        final top = ring[0][i + 1], bottom = ring[n + 1][i + 1];
        if (!row.contains(0)) {
          if (left != 0 && visible(row) != left) return false;
          if (right != 0 && visible(row.reversed.toList()) != right) return false;
        }
        if (!col.contains(0)) {
          if (top != 0 && visible(col) != top) return false;
          if (bottom != 0 && visible(col.reversed.toList()) != bottom) return false;
        }
      }
      return true;
    }

    bool step(int k) {
      if (k == n * n) return towersHold();
      final r = k ~/ n, c = k % n;
      if (g[r][c] != 0) return step(k + 1);
      for (var v = 1; v <= n; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        if (towersHold() && step(k + 1)) return true;
        g[r][c] = 0;
      }
      return false;
    }

    if (!step(0)) fail('перебор пробы не нашёл решения — доска прочитана неверно');
    return g;
  }

  Future<void> put(WidgetTester tester, int r, int c, int v) async {
    await tester.tap(find.byKey(Key('cell_${r}_$c')), warnIfMissed: false);
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$v')), warnIfMissed: false);
    await tester.pump();
  }

  /// Столько ошибок, сколько позволяет ступень, — партия проиграна. Лимит читается так же,
  /// как его видит человек: счётчик «0/N» в шапке. С 01.10 он у каждой ступени свой
  /// (задача 1fa57de3), прежние «ровно три» проба держать не вправе.
  Future<void> loseByErrors(WidgetTester tester, int n) async {
    final hud = find.byWidgetPredicate((w) => w is Text && RegExp(r'^0/\d+$').hasMatch(w.data ?? ''));
    expect(hud, findsOneWidget, reason: 'в шапке нет счётчика ошибок «0/N»');
    final limit = int.parse((tester.widget<Text>(hud).data!).split('/').last);
    var made = 0;
    for (var r = 0; r < n && made < limit; r++) {
      for (var c = 0; c < n && made < limit; c++) {
        if (digitAt(tester, r, c) != 0) continue;
        // Заведомо неверная цифра: та, что уже стоит в этой строке.
        final row = [for (var j = 0; j < n; j++) digitAt(tester, r, j)].where((v) => v != 0);
        if (row.isEmpty) continue;
        await put(tester, r, c, row.first);
        made++;
      }
    }
    expect(made, limit, reason: 'проба не нашла куда поставить $limit ошибок');
  }

  List<Map<String, Object?>> reports(String gameType) =>
      sent.where((m) => m['game_type'] == gameType).toList();

  group('классика, уровень 5 (банк 9×9)', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '5'});
      state = await SharedState.open();
    });

    testWidgets('🔴 ПРОИГРЫШ — тоже партия: отчёт уходит, уровень не падает', (tester) async {
      // Три проигрыша подряд: будь проигрыш отправлен через лестницу, её правило
      // «третий провал опускает уровень» сработало бы — а веб уровень за проигрыши
      // не опускает. Одного проигрыша для этой проверки мало.
      for (var round = 0; round < 3; round++) {
        await pumpUntil(tester, SudokuScreen(state: state));
        await loseByErrors(tester, 9);
        await tester.pumpWidget(const SizedBox());
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 50));

      final r = reports('sudoku');
      expect(r.length, 3, reason: 'три проигрыша — три отчёта');
      final last = r.last;
      expect(last['mode'], 'level-5', reason: 'имя режима — как у веба');
      expect(last['score'], 0);
      final d = (last['details'] as Map).cast<String, Object?>();
      expect(d['completed'], false);
      expect(d['failed_out'], true, reason: 'веб помечает проигрыш именно так');
      expect(state.get('psygames_sudoku_level_nzt48'), '5',
          reason: 'проигрыши уровень не опустили — как в вебе');
    });

    testWidgets('🔴 победа на лестнице несёт очки, время и имя уровня', (tester) async {
      await pumpUntil(tester, SudokuScreen(state: state));
      final g = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, r, c)]];
      final givens = [for (final row in g) [...row]];
      final s = solve(g, 9, 3, 3);
      // Одна переделка: в первую пустую клетку сначала неверная цифра (та, что уже
      // стоит в строке), потом верная. Так веб и считает `backtrack_count`.
      var redone = false;
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (givens[r][c] != 0) continue;
          if (!redone) {
            await put(tester, r, c, givens[r].firstWhere((v) => v != 0));
            redone = true;
          }
          await put(tester, r, c, s[r][c]);
        }
      }
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pump();

      final r = reports('sudoku');
      expect(r.length, 1, reason: 'победа — один отчёт');
      expect(r.single['mode'], 'level-5');
      expect((r.single['score'] as num).toInt(), greaterThan(0), reason: 'очки по формуле веба');
      expect(r.single.containsKey('time_seconds'), isTrue);
      // 🔴 ТРУДНОСТЬ — ПОЛОСОЙ, А НЕ НОМЕРОМ. До 30.09 уходило «5»: общая лестница
      // умела слать только номер. Веб шлёт easy/medium/hard (5 — это medium).
      expect(r.single['difficulty'], 'medium', reason: 'трудность — полоса веба, не номер уровня');
      final d = (r.single['details'] as Map?)?.cast<String, Object?>();
      expect(d, isNotNull, reason: 'победа без подробностей — веб их пишет всегда');
      expect(d!['completed'], true);
      expect(d['level'], 5);
      expect(d['variant'], 'none');
      expect(d['road'], 'normal', reason: 'дорогу веб пишет явно, включая обычную');
      expect(d['hint_uses'], 0);
      expect(d['backtrack_count'], 1, reason: 'одна переделка — одна, как у веба');
      expect(d['errors'], 1, reason: 'неверная цифра перед переделкой — ошибка');
    });
  });

  group('режим «Небоскрёбы», ступень 1', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
    });

    testWidgets('🔴 победа в режиме уходит в статистику как towers-1', (tester) async {
      await pumpUntil(tester, SudokuScreen(state: state, mode: SideMode.towers));
      const n = 6;
      final ring = [for (var r = 0; r < n + 2; r++) [for (var c = 0; c < n + 2; c++) clueAt(tester, r, c)]];
      final g = [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) digitAt(tester, r, c)]];
      final givens = [for (final row in g) [...row]];
      final s = solve(g, n, 2, 3, ring: ring);
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (givens[r][c] == 0) await put(tester, r, c, s[r][c]);
        }
      }
      await tester.pump();

      final r = reports('sudoku');
      expect(r.length, 1, reason: 'до починки здесь было НОЛЬ отчётов');
      expect(r.single['mode'], 'towers-1', reason: 'как пишет веб: `${'{'}mode}-${'{'}level}`');
      final d = (r.single['details'] as Map).cast<String, Object?>();
      expect(d['completed'], true);
      expect(d['variant'], 'towers');
    });

    testWidgets('🔴 проигрыш в режиме тоже уходит', (tester) async {
      await pumpUntil(tester, SudokuScreen(state: state, mode: SideMode.towers));
      await loseByErrors(tester, 6);
      await tester.pump();
      final r = reports('sudoku');
      expect(r.length, 1);
      expect(r.single['mode'], 'towers-1');
      expect((r.single['details'] as Map)['failed_out'], true);
    });
  });

  testWidgets('🔴 «Бездна»: сборка корня уходит в статистику ОДИН раз', (tester) async {
    // Снимок партии, где решено всё, кроме одной клетки корня: доигрываем её нажатием.
    // Снимок собирается тем же материализатором дерева, что у экрана, — зерно и
    // пресет те же, значит и узлы те же.
    const seed = 'бездна-отчёт-партии';
    const cfg = DeepCfg(depth: 2, rating: 1.2, feedCount: 9, unlockShare: 0.24);
    late Map<String, List<List<int>>> grids;
    late ({int r, int c, int v}) last;
    await tester.runAsync(() async {
      final bank = await DeepBank.load();
      DeepNode nodeAt(String p) => materializeChain(bank, seed, p, cfg).last;
      final root = nodeAt('');
      bool isFeed(DeepNode node, int r, int c) => node.feedCells.any((f) => f[0] == r && f[1] == c);
      grids = {};
      final rootGrid = [for (var r = 0; r < deepN; r++) List<int>.filled(deepN, 0)];
      ({int r, int c, int v})? hole;
      for (var r = 0; r < deepN; r++) {
        for (var c = 0; c < deepN; c++) {
          if (root.puzzle[r][c] != 0) continue;
          if (isFeed(root, r, c)) {
            // Кормимая клетка: решаем её ребёнка целиком — цифра всплывёт сама.
            final cp = childPath('', r, c);
            final child = nodeAt(cp);
            grids[cp] = [
              for (var i = 0; i < deepN; i++)
                [for (var j = 0; j < deepN; j++) child.puzzle[i][j] == 0 ? child.solution[i][j] : 0],
            ];
            continue;
          }
          if (hole == null) {
            hole = (r: r, c: c, v: root.solution[r][c]);   // её поставим нажатием
            continue;
          }
          rootGrid[r][c] = root.solution[r][c];
        }
      }
      grids[''] = rootGrid;
      last = hole!;
    });

    SharedPreferences.setMockInitialValues({
      'psygames_resume_sudoku_fractal_deep_nzt48': jsonEncode({
        'v': 1,
        'savedAt': 1759000000000,
        'state': {
          'preset': 'scout',
          'band': 0,
          'seed': seed,
          'path': '',
          'grids': grids,
          'history': {'past': <Object?>[], 'future': <Object?>[]},
        },
      }),
    });
    state = await SharedState.open();
    await pumpUntil(tester, DeepScreen(state: state));
    expect(reports('sudoku_fractal_deep'), isEmpty, reason: 'до последнего хода отчёта нет');

    await put(tester, last.r, last.c, last.v);
    // После победы клавиш цифр нет вовсе (внизу «Дальше»), поэтому второй ход сделать
    // нельзя; проверяем, что лишние кадры и перерисовки второго отчёта не рождают.
    expect(find.byKey(const Key('digit1')), findsNothing, reason: 'партия закончена');
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    final r = reports('sudoku_fractal_deep');
    expect(r.length, 1, reason: 'до починки здесь было НОЛЬ отчётов; и не два');
    expect(r.single['mode'], 'deep', reason: 'как пишет веб');
    expect(r.single['difficulty'], 'scout');
    expect((r.single['score'] as num).toInt(), greaterThanOrEqualTo(2000),
        reason: 'формула веба: победа даёт +2000');
  });
}
