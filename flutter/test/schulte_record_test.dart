import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/free_result.dart';
import 'package:psygames_flutter/games/schulte/model.dart';
import 'package:psygames_flutter/games/schulte/record_book.dart';
import 'package:psygames_flutter/games/schulte/screen.dart' show SchulteFreeConfig;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РЕКОРД И ГРАФИК СВОБОДНОЙ ПАРТИИ «ШУЛЬТЕ» (задача 793b9faf): правило зачёта, запись в общие с вебом
/// ключи, порядок «сначала читаем — потом пишем», тренд и координаты графика.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  const bestKey = '${SharedState.prefix}leaderboard_personal_best_schulte_table_5x5';
  String histKey(String profile) => '${SharedState.prefix}history_schulte_table_5x5_$profile';

  Future<SchulteRecordBook> book([Map<String, Object> initial = const {}]) async {
    SharedPreferences.setMockInitialValues(initial);
    return SchulteRecordBook(await SharedState.open());
  }

  group('что идёт в рекорд (веб: countsForRecord)', () {
    SchulteFreeConfig cfg() => SchulteFreeConfig(script: 'latin');

    test('🔴 только классика 5×5: цифры, вперёд, без цвета, групп и убегающей цели', () {
      expect(cfg().countsForRecord, isTrue);
      expect((cfg()..size = 6).countsForRecord, isFalse);
      expect((cfg()..size = 10).countsForRecord, isFalse);
      expect((cfg()..direction = Direction.backward).countsForRecord, isFalse);
      expect((cfg()..direction = Direction.centerOut).countsForRecord, isFalse);
      expect((cfg()..content = ContentMode.letters).countsForRecord, isFalse);
      expect((cfg()..content = ContentMode.mixed).countsForRecord, isFalse);
      expect((cfg()..color = true).countsForRecord, isFalse);
      expect((cfg()..groups = 2).countsForRecord, isFalse);
      expect((cfg()..moving = true).countsForRecord, isFalse);
    });
  });

  group('книга рекордов', () {
    test('ключи те же, что у веба: рекорд один на игру, история — по профилю', () async {
      final b = await book({'${SharedState.prefix}active_profile': 'kids'});
      await b.record(14.2);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(bestKey), '14.2');
      expect(jsonDecode(prefs.getString(histKey('kids'))!), [14.2], reason: 'JSON-список, как у веба');
      expect(prefs.getString(histKey('nzt48')), isNull, reason: 'чужой профиль не затронут');
    });

    test('🔴 первая партия: прежнего нет — «нового рекорда» нет, график не рисуется', () async {
      final b = await book();
      final r = await b.record(20);
      expect(r.hadPrevious, isFalse);
      expect(r.isNewBest, isTrue, reason: 'сравнивать не с чем — лучшее время и есть это');
      expect(r.best, 20);
      expect(r.points, [20]);
      expect(SchulteRecordBook.trend(r), isNull);
    });

    test('🔴 читаем ДО записи: график сравнивает партию с прежними, а не с самой собой', () async {
      final b = await book({
        histKey('nzt48'): jsonEncode([22.0, 21.0, 20.0]),
        bestKey: '19.5',
      });
      final r = await b.record(18.0);
      expect(r.history, [22.0, 21.0, 20.0], reason: 'без текущей');
      expect(r.points, [22.0, 21.0, 20.0, 18.0]);
      expect(r.isNewBest, isTrue);
      expect(r.best, 18.0);
      expect(b.personalBest(), 18.0, reason: 'рекорд обновился');
      expect(b.history(), [22.0, 21.0, 20.0, 18.0]);
    });

    test('медленнее рекорда: рекорд стоит, история растёт, лучшее — прежнее', () async {
      final b = await book({bestKey: '15.0', histKey('nzt48'): jsonEncode([16.0])});
      final r = await b.record(17.5);
      expect(r.isNewBest, isFalse);
      expect(r.best, 15.0);
      expect(b.personalBest(), 15.0, reason: 'рекорд не перезаписан худшим временем');
      expect(b.history(), [16.0, 17.5]);
    });

    test('ничья с рекордом — не «новый рекорд» (строго лучше)', () async {
      final b = await book({bestKey: '15.0'});
      final r = await b.record(15.0);
      expect(r.isNewBest, isFalse);
      expect(r.best, 15.0);
    });

    test('лучшее берётся и из истории, если личный рекорд потерян (веб: min по истории)', () async {
      final b = await book({histKey('nzt48'): jsonEncode([12.0, 30.0])});
      final r = await b.record(25.0);
      expect(r.best, 12.0);
      expect(r.isNewBest, isFalse);
    });

    test('🔴 в истории не больше восьми времён: старые вытесняются', () async {
      final b = await book({histKey('nzt48'): jsonEncode([for (var i = 1; i <= 8; i += 1) 10.0 + i])});
      await b.record(30.0);
      final h = b.history();
      expect(h.length, schulteHistoryMax);
      expect(h.first, 12.0, reason: 'самое старое (11) ушло');
      expect(h.last, 30.0);
    });

    test('повреждённое хранилище не роняет экран: пустая история, нет рекорда', () async {
      final b = await book({histKey('nzt48'): '{не json', bestKey: 'abc'});
      expect(b.history(), isEmpty);
      expect(b.personalBest(), isNull);
      final r = await b.record(9.0);
      expect(r.history, isEmpty);
      expect(b.personalBest(), 9.0);
    });

    test('не-числа и бесконечности в истории отбрасываются', () async {
      final b = await book({histKey('nzt48'): '[10, "x", null, 12.5, 1e999]'});
      expect(b.history(), [10.0, 12.5]);
    });
  });

  group('тренд и график', () {
    SchulteRecordResult res(double own, List<double> hist) =>
        SchulteRecordResult(own: own, best: own, isNewBest: false, history: hist);

    test('тренд — от двух прежних партий, как у веба', () {
      expect(SchulteRecordBook.trend(res(10, const [])), isNull);
      expect(SchulteRecordBook.trend(res(10, const [12])), isNull);
      final t = SchulteRecordBook.trend(res(9, const [10, 10]))!;
      expect((t.pct, t.better), (10, true), reason: 'на 10 % быстрее среднего');
      final w = SchulteRecordBook.trend(res(12, const [10, 10]))!;
      expect((w.pct, w.better), (20, false));
      expect(SchulteRecordBook.trend(res(10, const [10, 10]))!.pct, 0);
    });

    test('подписи тренда — из словаря веба на трёх исходах', () {
      expect(SchulteFreeResultCard.trendText(res(9, const [10, 10])), 'лучше среднего на 10%');
      expect(SchulteFreeResultCard.trendText(res(12, const [10, 10])), 'хуже среднего на 20%');
      expect(SchulteFreeResultCard.trendText(res(10, const [10, 10])), 'как обычно');
      expect(SchulteFreeResultCard.trendText(res(10, const [10])), isNull);
    });

    test('строка сравнения — как у веба: «время сек · Личный рекорд: лучшее сек»', () {
      final r = SchulteRecordResult(own: 12.34, best: 11.8, isNewBest: false, history: const [11.8]);
      expect(SchulteFreeResultCard.comparisonLine(r), '12.3 сек · Личный рекорд: 11.8 сек');
    });

    test('координаты графика: рамка 220×48, поля 6; больше время — выше; текущая справа', () {
      final c = SchulteSparkline.layout(const [10, 20, 15]);
      expect(c.length, 3);
      expect(c.first.dx, 6);
      expect(c.last.dx, SchulteSparkline.width - 6);
      expect(c[1].dy, 6, reason: 'максимум — у верхнего поля');
      expect(c[0].dy, SchulteSparkline.height - 6, reason: 'минимум — у нижнего');
      for (final o in c) {
        expect(o.dx, inInclusiveRange(0, SchulteSparkline.width));
        expect(o.dy, inInclusiveRange(0, SchulteSparkline.height));
      }
    });

    test('все времена равны — линия по центру высоты, а не деление на ноль', () {
      final c = SchulteSparkline.layout(const [12, 12, 12]);
      expect(c.every((o) => o.dy.isFinite), isTrue);
      expect(c.map((o) => o.dy).toSet().length, 1);
    });

    testWidgets('карточка: линия сравнения всегда; график и тренд — только от двух прежних', (tester) async {
      Future<void> show(SchulteRecordResult r) => tester.pumpWidget(
          MaterialApp(home: Scaffold(body: SchulteFreeResultCard(result: r))));
      await show(SchulteRecordResult(own: 14, best: 14, isNewBest: true, history: const []));
      expect(find.byKey(const Key('schulte-record-line')), findsOneWidget);
      expect(find.byKey(const Key('schulte-sparkline')), findsNothing);
      expect(find.byKey(const Key('schulte-trend')), findsNothing);
      await show(SchulteRecordResult(own: 14, best: 9, isNewBest: false, history: const [10, 11]));
      expect(find.byKey(const Key('schulte-sparkline')), findsOneWidget);
      expect(find.byKey(const Key('schulte-trend')), findsOneWidget);
    });
  });
}
