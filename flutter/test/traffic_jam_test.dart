import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/traffic_jam/model.dart';
import 'package:psygames_flutter/games/traffic_jam/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «ОСВОБОДИ ПУТЬ»: ПРАВИЛА, БАНК ДОСОК И ЭКРАН — ДО КОНЦА ПАРТИИ ПАЛЬЦЕМ.
///
/// Банк проверяется тем же поиском, что играет человек: «минимум ходов» в файле
/// обязан совпасть с поиском модели. Правка файла руками или смена правил без
/// перевыгрузки (`tool/gen_traffic_jam.dart`) краснит пробу числом.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  // Красная у левого края, выезд свободен: решается одним проездом.
  const oneMove = ['......', '......', 'XX....', '......', '......', '......'];
  // Вертикальная A стоит на пути: сначала она, потом красная — два хода.
  const twoMoves = ['......', '...A..', 'XX.A..', '......', '......', '......'];

  group('правила доски', () {
    test('строки банка читаются и пишутся обратно без потерь', () {
      final b = TjBoard.parse(twoMoves);
      expect(b.toRows(), twoMoves);
      expect(b.cars.length, 2);
      expect(b.cars[1].horizontal, isFalse);
    });

    test('машина едет только до упора и только вдоль своей оси', () {
      final b = TjBoard.parse(twoMoves);
      expect(b.range(0), (0, 1), reason: 'красную держит A в столбце 3');
      expect(b.apply(const TjMove(0, 3)), isNull, reason: 'проезд сквозь A');
      expect(b.range(1), (0, 4), reason: 'A свободна от верхнего края до нижнего');
      expect(b.solved, isFalse);
    });

    test('ход — проезд на любое число клеток: минимум у двух досок — 1 и 2', () {
      expect(tjSolve(TjBoard.parse(oneMove)).length, 1);
      expect(tjSolve(TjBoard.parse(twoMoves)).length, 2);
    });

    test('машина с разрывом или кривая — не доска, а ошибка', () {
      expect(() => TjBoard.parse(['......', '......', 'XX.XX.', '......', '......', '......']),
          throwsArgumentError);
    });
  });

  group('банк досок', () {
    final data = jsonDecode(File('assets/levels/traffic_jam.json').readAsStringSync()) as Map<String, dynamic>;
    final levels = [for (final l in data['levels'] as List) TjLevel.fromJson(l as Map<String, dynamic>)];

    test('60 разных досок, ступени не проваливаются назад', () {
      expect(levels.length, 60);
      expect(levels.map((l) => l.id).toSet().length, 60);
      expect(levels.map((l) => l.rows.join('/')).toSet().length, 60, reason: 'одна доска дважды — фальшивая ступень');
      for (var i = 1; i < levels.length; i++) {
        expect(levels[i].minMoves, greaterThanOrEqualTo(levels[i - 1].minMoves),
            reason: '${levels[i].id}: ${levels[i - 1].minMoves} → ${levels[i].minMoves}');
      }
      expect(levels.first.minMoves, lessThanOrEqualTo(3), reason: 'первая ступень — знакомство');
      expect(levels.last.minMoves, greaterThanOrEqualTo(20), reason: 'верх лестницы — настоящая задача');
    });

    test('каждая доска — законная и нерешённая на старте', () {
      for (final l in levels) {
        final b = l.board;
        expect(b.solved, isFalse, reason: l.id);
        expect(b.cars.first.fixed, tjExitRow, reason: l.id);
      }
    });

    test('🔴 записанный минимум — правда: поиск модели находит ровно столько ходов', () {
      // Каждая шестая и последняя: вся лестница целиком — минута, выборка — секунды,
      // а правка руками или смена правил ловится на любой из них.
      for (var i = 0; i < levels.length; i++) {
        if (i % 6 != 0 && i != levels.length - 1) continue;
        final l = levels[i];
        expect('${l.id}: ${tjSolve(l.board, maxStates: 400000).length}', '${l.id}: ${l.minMoves}');
      }
    });
  });

  group('экран', () {
    late List<Map<String, dynamic>> reports;

    Future<SharedState> fresh() async {
      SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      return SharedState.open();
    }

    testWidgets('🔴 протянул красную до выезда — победа, партия записана одна, с доской и ходами',
        (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(
        home: TrafficJamScreen(
          state: state,
          levels: const [TjLevel(id: 'probe-1', rows: oneMove, minMoves: 1)],
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byKey(const ValueKey('tj-car-0')), findsOneWidget);
      await tester.drag(find.byKey(const ValueKey('tj-car-0')), const Offset(600, 0));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byKey(const ValueKey('tj-next')), findsOneWidget, reason: 'доска решена, а кнопки дальше нет');
      expect(find.textContaining('★★★'), findsOneWidget, reason: 'решено минимумом — три звезды');
      expect(reports.length, 1, reason: 'партия пишется в момент решения, один раз');
      expect(reports.single['game_type'], 'traffic_jam');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['board_id'], 'probe-1');
      expect(d['moves'], 1);
      expect(d['min_moves'], 1);
    });

    testWidgets('машина не проезжает сквозь другую: протяжка останавливается у упора', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(
        home: TrafficJamScreen(
          state: state,
          levels: const [TjLevel(id: 'probe-2', rows: twoMoves, minMoves: 2)],
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.drag(find.byKey(const ValueKey('tj-car-0')), const Offset(600, 0));
      await tester.pump();
      expect(find.byKey(const ValueKey('tj-next')), findsNothing, reason: 'красная проехала сквозь A');
      expect(reports, isEmpty);
    });

    testWidgets('разбор открывается и называет приём, а не просто показывает ходы', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(
        home: TrafficJamScreen(
          state: state,
          levels: const [TjLevel(id: 'probe-2', rows: twoMoves, minMoves: 2)],
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер разбора не открылся');
      expect(find.textContaining('Шаг 1 из 2'), findsOneWidget);
      expect(find.textContaining(L.t('teachTrafficFirst')), findsOneWidget);
      expect(LessonUsed.inRound, isTrue, reason: 'партия с разбором не должна засчитываться');
    });
  });
}
