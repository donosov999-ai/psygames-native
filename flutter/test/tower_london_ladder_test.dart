import 'dart:collection';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/tower_london/board.dart';
import 'package:psygames_flutter/games/tower_london/model.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПЕРВАЯ СОБСТВЕННАЯ ПРОБА «ЛОНДОНСКОЙ БАШНИ» — И ОНА СТЕРЕЖЁТ ДВА ДЕФЕКТА,
/// КОТОРЫЕ ПРОЖИЛИ В ВЫПУСКЕ НЕЗАМЕЧЕННЫМИ (замер 24.09.2026).
///
/// 1. В ОДНОЙ ПАРТИИ ПОВТОРЯЛИСЬ ЗАДАЧИ. Партия — пять раундов, задача берётся
///    ПО ПОРЯДКУ (`screen.dart`, `puzzles[(round-1) % length]`). В прежней
///    выгрузке повтор внутри партии был на 12 уровнях из 20; на ПЕРВОМ — три
///    разных задачи из пяти, и четыре из пяти решались одним ходом.
///    ⚠️ «В наборе восемь задач, разнообразие есть» — не ответ: до шестой
///    человек не доходит никогда.
/// 2. ЛЕСТНИЦА НЕ РОСЛА. Цель ходов держалась на 8 с L7 по L20 — четырнадцать
///    ступеней подряд, а с L11 не менялись и параметры. Предел 8 был перенесён
///    из веба (`Math.min(8, 1 + lvl.level)`) и никем не мерен: у той же
///    конфигурации, что стоит с L11, ДИАМЕТР пространства 14 ходов.
///
/// Лестница пересобирается `tool/export_tol_levels.dart` (`dart run`), и он же
/// проверяет себя до записи. Эта проба смотрит ФАЙЛ, который уехал в сборку:
/// между генератором и файлом лежит запись, и она уже теряла данные молча.
void main() {
  late TolLevelSet set;

  setUpAll(() {
    // Читаем ТОТ ЖЕ файл и ТЕМ ЖЕ разбором, которым его читает экран: иначе
    // проба проверяла бы свою трактовку данных, а не данные.
    set = TolLevelSet.fromJsonString(
        File('assets/levels/tower_london.json').readAsStringSync());
  });

  /// Кратчайшие расстояния ЯДРОМ ИГРЫ: `legalMoves`/`move` — те же, которыми
  /// ходит человек. Спросить у выгрузки, верен ли её минимум, значит спросить
  /// её о ней самой.
  Map<String, int> distances(TolState from) {
    final dist = <String, int>{from.key: 0};
    final q = Queue<TolState>()..add(from);
    while (q.isNotEmpty) {
      final s = q.removeFirst();
      final d = dist[s.key]!;
      for (final m in s.legalMoves()) {
        final n = s.move(m.from, m.to)!;
        if (dist.containsKey(n.key)) continue;
        dist[n.key] = d + 1;
        q.add(n);
      }
    }
    return dist;
  }

  test('🔴 в одной партии все задачи РАЗНЫЕ', () {
    final bad = <String>[];
    for (final lv in set.levels) {
      final inGame = lv.puzzles.take(set.rounds).toList();
      final keys = inGame.map((p) => '${p.start.key}>${p.goal.key}').toSet();
      if (keys.length != inGame.length) {
        bad.add('L${lv.level}: ${keys.length} разных из ${inGame.length}');
      }
    }
    // ignore: avoid_print
    print('ПОВТОР ЗАДАЧ В ПАРТИИ: ${bad.length} уровней из ${set.levels.length}');
    expect(bad, isEmpty, reason: 'игрок решает одно и то же по нескольку раз: $bad');
  });

  test('🔴 заявленный минимум ходов совпадает с поиском по правилам игры', () {
    for (final lv in set.levels) {
      for (final p in lv.puzzles) {
        final d = distances(p.start)[p.goal.key];
        expect(d, p.minMoves,
            reason: 'L${lv.level}: заявлено ${p.minMoves}, поиск даёт $d');
      }
    }
  });

  test('🔴 лестница РАСТЁТ, а не стоит на месте', () {
    final settings = <String>{};
    for (final lv in set.levels) {
      settings.add('${lv.targetMoves}/${lv.balls}');
    }
    // ignore: avoid_print
    print('РАЗЛИЧИМЫХ НАСТРОЕК: ${settings.length} из ${set.levels.length} ступеней · '
        'планы ${set.levels.map((l) => l.targetMoves).join(', ')}');
    // ⚠️ Порог не круглый, а по замеру: прежняя лестница давала 8 настроек на
    // 20 ступеней (14 из них с планом 8). Требуем, чтобы каждая ступень
    // отличалась от всех прочих хотя бы одним параметром.
    expect(settings.length, set.levels.length,
        reason: 'есть ступени с одинаковой трудностью — лестница не растёт');
    expect(set.levels.last.targetMoves, greaterThanOrEqualTo(14),
        reason: 'верх лестницы ниже измеренного диаметра пространства');
  });

  test('🔴 у КАЖДОГО шара свой цвет — иначе два шара неотличимы', () {
    final used = <String>{};
    for (final lv in set.levels) {
      for (final p in lv.puzzles) {
        for (final peg in p.start.pegs) {
          used.addAll(peg);
        }
      }
    }
    // ignore: avoid_print
    print('ЦВЕТА В ЛЕСТНИЦЕ: ${(used.toList()..sort()).join(' ')}');
    final missing = used.where((c) => !ballColors.containsKey(c)).toList();
    expect(missing, isEmpty,
        reason: 'в лестнице есть шары без своего цвета: $missing — '
            'экран нарисует их запасным красным, и они сольются');
  });

  testWidgets('🔴 шестишаровая ступень РИСУЕТСЯ, а не падает', (tester) async {
    final six = set.levels.firstWhere((l) => l.balls >= 6, orElse: () => set.levels.last);
    expect(six.balls, greaterThanOrEqualTo(6), reason: 'шестишаровых ступеней нет');

    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_tower_london_level_nzt48': '${six.level}',
    });
    final state = await SharedState.open();
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: TowerLondonScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byType(TolBoard).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byType(TolBoard), findsOneWidget, reason: 'поле не появилось');

    // Собираем буквы шаров с ключей виджетов: `<prefix>-ball-<стержень>-<буква>`.
    final letters = <String>{};
    for (final e in find.byType(Container).evaluate()) {
      final k = e.widget.key;
      if (k is! ValueKey<String>) continue;
      final parts = k.value.split('-');
      if (parts.length >= 4 && parts[parts.length - 3] == 'ball') {
        letters.add(parts.last);
      }
    }
    // ignore: avoid_print
    print('НА ЭКРАНЕ L${six.level}: шары ${(letters.toList()..sort()).join(' ')}');
    expect(letters.length, greaterThanOrEqualTo(6),
        reason: 'на шестишаровой ступени нарисовано ${letters.length} разных шаров');
  });
}
