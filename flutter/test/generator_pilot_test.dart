import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/contract.dart';
import 'package:psygames_flutter/games/sudoku/generator/engine.dart';
import 'package:psygames_flutter/games/sudoku/generator/pool.dart';
import 'package:psygames_flutter/games/sudoku/generator/store.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЗАКРЫТЫЙ ПИЛОТ ГЕНЕРАТОРА (§10 шаг 3, задача c38a9365).
///
/// «Закрытый пилот отдельной кнопкой: свой путь, новые ключи, флаг, возможность
/// мгновенного отката без миграции старого прогресса». Кнопка — пункт меню паузы
/// классической судоку. Каждая проба ИГРАЕТ партии нажатиями и читает то, что видно
/// человеку (номер в полосе счётчиков, кнопки), и то, что уходит наружу (хранилище,
/// отчёт партии), — а не код экрана.
///
/// Решения Дениса, которые здесь меряются:
///   · номер пилота — счётчик побед: только растёт (18.09);
///   · старт — от трудности текущей ступени лестницы, номер с нуля (23.09, В3);
///   · «ещё раз эту же» — та же трудность, другая доска (23.09, В1);
///   · лестница на 92 ступени не трогается ничем (вариант В, 18.09).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const ladderKey = 'psygames_sudoku_level_nzt48';

  late SudokuLevels levels;
  late List<Template> pool;
  late SharedState state;
  late GeneratorStore store;
  late List<Map<String, Object?>> sent;

  setUpAll(() async {
    levels = await SudokuLevels.load();
    pool = buildPool(levels);
    await L.load('ru');
  });

  setUp(() {
    sent = [];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, Object?>);
  });
  tearDown(() => SessionReport.sink = null);

  Future<void> boot(WidgetTester tester, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    await tester.runAsync(() async {
      state = await SharedState.open();
      store = GeneratorStore(state);
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Номер из полосы счётчиков — по подписи для экранного чтеца «Уровень: N».
  /// Голая цифра не годится: «1» и «2» стоят и на доске.
  String? hudLevel(WidgetTester tester) {
    final f = find.byWidgetPredicate(
        (w) => w is Semantics && (w.properties.label ?? '').startsWith('Уровень: '));
    if (f.evaluate().isEmpty) return null;
    return tester.widget<Semantics>(f.first).properties.label!.substring('Уровень: '.length);
  }

  Future<void> pauseAction(WidgetTester tester, String label) async {
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    expect(find.text(label), findsOneWidget, reason: 'в меню паузы нет пункта «$label»');
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  int sideOf() => find.byKey(const Key('cell_8_8')).evaluate().isNotEmpty ? 9 : 6;

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
  }

  List<List<int>> board(WidgetTester tester, int n) =>
      [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) digitAt(tester, r, c)]];

  Future<void> put(WidgetTester tester, int r, int c, int v) async {
    await tester.tap(find.byKey(Key('cell_${r}_$c')), warnIfMissed: false);
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$v')), warnIfMissed: false);
    await tester.pump();
  }

  /// Три заведомо неверные цифры (та, что уже стоит в строке) — партия проиграна.
  /// Повтор в строке запрещён у ВСЕХ вариантов лестницы, поэтому годится на любой доске.
  Future<void> loseByThreeErrors(WidgetTester tester) async {
    final n = sideOf();
    var made = 0;
    for (var r = 0; r < n && made < 3; r++) {
      for (var c = 0; c < n && made < 3; c++) {
        if (digitAt(tester, r, c) != 0) continue;
        final row = [for (var j = 0; j < n; j++) digitAt(tester, r, j)].where((v) => v != 0);
        if (row.isEmpty) continue;
        await put(tester, r, c, row.first);
        made++;
      }
    }
    expect(made, 3, reason: 'проба не нашла куда поставить три ошибки');
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump();
  }

  /// Свой решатель простым перебором — видит только цифры на доске. Годится для досок
  /// КЛАССИКИ; вариантную доску проба сюда не отправляет.
  List<List<int>> solve(List<List<int>> g, int n) {
    final br = n == 9 ? 3 : 2, bc = 3;
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

    bool step(int k) {
      if (k == n * n) return true;
      final r = k ~/ n, c = k % n;
      if (g[r][c] != 0) return step(k + 1);
      for (var v = 1; v <= n; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        if (step(k + 1)) return true;
        g[r][c] = 0;
      }
      return false;
    }

    if (!step(0)) fail('перебор пробы не нашёл решения — доска прочитана неверно');
    return g;
  }

  Future<void> winBoard(WidgetTester tester) async {
    final n = sideOf();
    final givens = board(tester, n);
    final s = solve([for (final row in givens) [...row]], n);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (givens[r][c] == 0) await put(tester, r, c, s[r][c]);
      }
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
  }

  List<Map<String, Object?>> reports() => sent.where((m) => m['game_type'] == 'sudoku').toList();

  testWidgets('🔴 флаг выключен — лестница как была, пилот своих ключей не пишет', (tester) async {
    await boot(tester, {ladderKey: '5'});
    expect(hudLevel(tester), '5', reason: 'без флага номер — ступень лестницы');
    expect(state.get(store.flagKey), isNull, reason: 'флаг не ставится сам');
    expect(state.get(store.pilotKey), isNull, reason: 'пилот не начинался');
    expect(state.get(store.stateKey), isNull,
        reason: 'открыть экран — не повод писать состояние пилота');
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('sudokuPilotOn')), findsOneWidget, reason: 'кнопка пилота — в паузе');
  });

  testWidgets('🔴 включение: старт от трудности ступени 54, номер с единицы, лестница цела',
      (tester) async {
    await boot(tester, {ladderKey: '54'});
    expect(hudLevel(tester), '54');
    await pauseAction(tester, L.t('sudokuPilotOn'));

    final s = store.load();
    expect(s.skillRating, ratingForLevel(levels, 54),
        reason: 'В3: старт — от трудности ЕЁ ступени, а не с новичка 1200');
    expect(s.adaptiveWins, 0, reason: 'номер лестницы пилот не наследует');
    expect(s.ratingUncertainty, 350, reason: 'ступень говорит ЧТО проходила, но не как уверенно');
    expect(state.get(store.flagKey), '1');
    expect(store.pilotStarted, isTrue);
    expect(hudLevel(tester), '1', reason: 'номер пилота — счётчик побед: первая партия — 1');
    expect(state.get(ladderKey), '54', reason: 'лестница не тронута включением');
  });

  testWidgets('🔴 проигрыш → «ещё раз эту же»: тот же шаблон, другая доска, номер на месте',
      (tester) async {
    await boot(tester, {
      ladderKey: '54',
      'psygames_sudoku_adaptive_on_nzt48': '1',
      'psygames_sudoku_adaptive_pilot_nzt48': '1',
      'psygames_sudoku_adaptive_nzt48': startFromLadder(levels, 54).encode(),
    });
    expect(hudLevel(tester), '1');
    final start = store.load().skillRating;
    final n = sideOf();
    final first = board(tester, n);

    await loseByThreeErrors(tester);
    var s = store.load();
    expect(s.recentOutcomes, ['failed']);
    expect(s.adaptiveWins, 0, reason: 'провал номер не двигает');
    expect(s.skillRating, lessThan(start), reason: 'провал опускает рейтинг');
    expect(hudLevel(tester), '1', reason: 'номер не падает (решение 18.09)');

    final r = reports();
    expect(r.length, 1, reason: 'проигрыш пилота — одна партия в статистике');
    expect(r.single['mode'], 'adaptive',
        reason: 'не level-N: восстановление уровня не должно принять партию пилота за ступень');
    final d = (r.single['details'] as Map).cast<String, Object?>();
    expect(d['progression_kind'], 'adaptive');
    expect(d.containsKey('level'), isFalse, reason: '§8.1: счёт пилота — adaptive_wins, не level');
    expect(d['completed'], false);
    expect(d['failed_out'], true);
    final played = s.recentTemplateIds.single;
    expect(d['template_id'], played);
    // Снимок для восстановления после переустановки (§8.7) — на сервере, в каждой партии.
    expect(d['event_id'], s.lastEventId, reason: 'по event_id сервер не применит партию дважды');
    expect((d['skill_rating'] as num).toDouble(), closeTo(s.skillRating, 0.05));
    expect((d['rating_uncertainty'] as num).toDouble(), closeTo(s.ratingUncertainty, 0.05));
    expect(state.get(ladderKey), '54', reason: 'проигрыш пилота лестницу не трогает');

    expect(find.byKey(const Key('repeat')), findsOneWidget,
        reason: 'после проигрыша пилота — кнопка «ещё раз эту же»');
    await tester.tap(find.byKey(const Key('repeat')));
    await tester.pump();
    expect(sideOf(), n, reason: 'тот же шаблон — та же сторона доски');
    expect(board(tester, n), isNot(equals(first)), reason: 'доска другая — зерно новое');

    await loseByThreeErrors(tester);
    s = store.load();
    expect(s.recentTemplateIds, [played, played],
        reason: 'В1: «эту же» — тот же шаблон, а не соседнее правило с похожим рейтингом');
    final again = (reports().last['details'] as Map).cast<String, Object?>();
    expect(again['repeat'], true);
    expect(again['template_id'], played);
  });

  testWidgets('🔴 победа пилота: номер +1, ступень лестницы не открывается', (tester) async {
    // Шаблон классики с НЕПОВТОРИМЫМ рейтингом: рейтинг игрока ставится так, чтобы
    // выбор пал ровно на него (цель «Обычной» без провалов — рейтинг + 20). Классика —
    // потому что свой решатель пробы вариантных правил не знает.
    final t = pool.firstWhere((t) =>
        t.id.startsWith('sudoku:bank:') && pool.where((u) => u.rating == t.rating).length == 1);
    await boot(tester, {
      ladderKey: '54',
      'psygames_sudoku_adaptive_on_nzt48': '1',
      'psygames_sudoku_adaptive_pilot_nzt48': '1',
      'psygames_sudoku_adaptive_nzt48': AdaptiveState(skillRating: t.rating - 20).encode(),
    });
    expect(hudLevel(tester), '1');

    await winBoard(tester);
    final s = store.load();
    expect(s.adaptiveWins, 1, reason: 'победа — +1 к номеру');
    expect(s.recentTemplateIds, [t.id], reason: 'сыгран выбранный рейтингом шаблон');
    expect(hudLevel(tester), '2');
    final r = reports();
    expect(r.length, 1);
    expect(r.single['mode'], 'adaptive');
    expect((r.single['score'] as num).toInt(), greaterThan(0));
    final d = (r.single['details'] as Map).cast<String, Object?>();
    expect(d['completed'], true);
    expect(d['adaptive_wins'], 1);
    expect(d['template_id'], t.id);
    expect(state.get(ladderKey), '54',
        reason: '§9.8: адаптивная партия не открывает ступень прописанного пути');
  });

  testWidgets('🔴 выключил — лестница; победы лестницы в счёт пилота не идут; включил — счёт цел',
      (tester) async {
    await boot(tester, {
      ladderKey: '5',
      'psygames_sudoku_adaptive_on_nzt48': '1',
      'psygames_sudoku_adaptive_pilot_nzt48': '1',
      'psygames_sudoku_adaptive_nzt48': AdaptiveState(adaptiveWins: 3, skillRating: 1300).encode(),
    });
    expect(hudLevel(tester), '4', reason: 'три победы пилота — идёт четвёртый');

    await pauseAction(tester, L.t('sudokuPilotOff'));
    expect(state.get(store.flagKey), '0');
    expect(hudLevel(tester), '5', reason: 'откат мгновенный: снова ступень лестницы');

    // Уровень 5 — банк классики 9×9: решается перебором пробы.
    await winBoard(tester);
    expect(state.get(ladderKey), '6', reason: 'лестница работает как прежде');
    expect(store.load().adaptiveWins, 3,
        reason: '§4.3: победа ЛЕСТНИЦЫ не прибавляется к счёту пилота');

    await pauseAction(tester, L.t('sudokuPilotOn'));
    final s = store.load();
    expect(s.adaptiveWins, 3, reason: 'повторное включение продолжает, а не начинает заново');
    expect(s.skillRating, 1300, reason: 'рейтинг пилота не пересчитан со ступени');
    expect(hudLevel(tester), '4');
  });
}
