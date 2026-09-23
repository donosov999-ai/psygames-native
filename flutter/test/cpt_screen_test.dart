import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cpt/model.dart';
import 'package:psygames_flutter/games/cpt/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В CPT ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает букву И ЦВЕТ с экрана и решает по правилу уровня — как
/// человек. Буква видна 250 мс, а окно ответа длится полный ISI: проба, как и
/// человек, отвечает по памяти о только что мелькнувшей букве.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_cpt_level_nzt48';

void main() {
  late SharedState state;

  /// 🔴 ЧАСЫ ПАРТИИ — ТЕ ЖЕ, ЧТО У ТАЙМЕРОВ ПРОБЫ. Без этого модель смотрит на
  /// НАСТОЯЩЕЕ время, а pump двигает только поддельное: «девяносто секунд» не
  /// истекают никогда, и партия не кончается вовсе.
  int Function() fakeClock(WidgetTester tester) =>
      () => tester.binding.clock.now().millisecondsSinceEpoch;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Что сейчас на экране: буква и цвет, прочитанные по ключу.
  ({String letter, String color})? letterOnScreen() {
    final f = find.byWidgetPredicate((w) =>
        w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('cpt-letter-'));
    final e = f.evaluate();
    if (e.isEmpty) return null;
    final parts = (e.first.widget.key! as ValueKey<String>).value.split('-');
    return (letter: parts[2], color: parts[3]);
  }

  /// Прожить одну пробу целиком: дождаться буквы, решить, дождаться конца окна.
  /// Возвращает букву пробы или null, если партия кончилась.
  Future<({String letter, String color})?> playTrial(
    WidgetTester tester,
    int level, {
    required bool Function(String letter, String color, String? prev) decide,
    required String? prev,
  }) async {
    ({String letter, String color})? seen;
    // Ждём появления буквы: пауза между пробами дрожит ±15 %.
    for (var i = 0; i < 80 && seen == null; i++) {
      seen = letterOnScreen();
      if (seen == null) await tester.pump(const Duration(milliseconds: 25));
    }
    if (seen == null) return null;
    if (decide(seen.letter, seen.color, prev)) {
      await tester.tap(find.byKey(const Key('cpt-tap')));
      await tester.pump();
    }
    // ⚠️ Ждём СОБЫТИЯ, а не времени: сперва пока буква погаснет (250 мс от
    // показа), потом остаток окна. Ровный pump(isiMs) копил бы сдвиг и через
    // несколько проб начал бы перепрыгивать целые пробы — а вместе с ними
    // уехала бы и «предыдущая буква», на которой держится всё правило AX.
    for (var i = 0; i < 40 && letterOnScreen() != null; i++) {
      await tester.pump(const Duration(milliseconds: 25));
    }
    await tester.pump(Duration(milliseconds: CptLevel.of(level).isiMs - cptStimDurationMs + 40));
    return seen;
  }

  testWidgets('🔴 буква видна 250 мс, а окно ответа длится полный ISI', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: CptScreen(key: const ValueKey('t'), state: state, rnd: Random(3), durationSec: 8, clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    // ⚠️ Проверяется ТЕКСТ, а не наличие узла: пустая строка с тем же ключом
    // «есть» ровно так же, а человек не узнает правила уровня вовсе.
    final rules = (find.byKey(const Key('cpt-rules')).evaluate().first.widget as Text).data!;
    expect(rules.trim(), isNotEmpty, reason: 'правило уровня не названо');
    expect(rules, L.t('cptLvlParamsX'), reason: 'на L1 обязана быть строка X-CPT');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Ждём первую букву.
    ({String letter, String color})? seen;
    for (var i = 0; i < 80 && seen == null; i++) {
      seen = letterOnScreen();
      if (seen == null) await tester.pump(const Duration(milliseconds: 25));
    }
    expect(seen, isNotNull, reason: 'буква не появилась');
    // Через 300 мс буква уже погасла...
    await tester.pump(const Duration(milliseconds: 300));
    expect(letterOnScreen(), isNull, reason: 'буква висит дольше 250 мс');
    // ...а нажатие всё ещё засчитывается: окно ответа — полный ISI.
    await tester.tap(find.byKey(const Key('cpt-tap')));
    await tester.pump();
    final flashed = find.byKey(const Key('cpt-right')).evaluate().isNotEmpty ||
        find.byKey(const Key('cpt-wrong')).evaluate().isNotEmpty;
    expect(flashed, isTrue, reason: 'нажатие после погасшей буквы не засчитано');
  });

  testWidgets('🔴 X-режим: жмём на каждую X — партия проходится', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: CptScreen(key: const ValueKey('x'), state: state, rnd: Random(11), durationSec: 90, clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    String? prev;
    var trials = 0, targets = 0;
    for (var i = 0; i < 40; i++) {
      final seen = await playTrial(tester, 1,
          prev: prev, decide: (l, c, p) => l == 'X');
      if (seen == null) break;
      if (seen.letter == 'X') targets++;
      prev = seen.letter;
      trials++;
      if (find.byKey(const Key('cpt-verdict')).evaluate().isNotEmpty) break;
    }
    expect(trials, greaterThanOrEqualTo(cptMinTrialsForLevel),
        reason: 'проб меньше порога зачёта: $trials');
    expect(targets, greaterThan(0), reason: 'ни одной цели за партию');
    // ⚠️ Точная доля целей проверяется в пробе МОДЕЛИ по 120 000 проб: на партии
    // в три десятка проб разброс ±2σ это ±0,15, и сверка здесь ловила бы шум, а
    // не дефект. Здесь достаточно, что цель РЕДКА.
    expect(targets / trials, lessThan(0.5), reason: 'цель перестала быть редкой: ${targets / trials}');
  });

  testWidgets('🔴 AX-режим: X без подсказки A — НЕ цель, и нажатие на неё ошибка', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '6'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: CptScreen(key: const ValueKey('ax'), state: state, rnd: Random(1), durationSec: 90, clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    expect(CptLevel.of(6).mode, CptMode.ax);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Сид подобран прогоном генератора: на нём в первых 45 пробах есть и
    // пары A→X, и одиночные X. На случайном сиде одиночных могло не оказаться
    // вовсе — замер: при их доле 0,108 на трёх десятках проб пустая выборка
    // выпадает примерно в 3 % прогонов, и проба то краснела бы, то нет.
    String? prev;
    var bxLures = 0, axTargets = 0;
    for (var i = 0; i < 45; i++) {
      // Жмём на ЛЮБУЮ мишенную букву — и на парную, и на одиночную.
      final seen = await playTrial(tester, 6, prev: prev, decide: (l, c, p) => l == 'X');
      if (seen == null) break;
      if (seen.letter == 'X') {
        if (prev == 'A') {
          axTargets++;
        } else {
          bxLures++;
        }
      }
      prev = seen.letter;
      if (find.byKey(const Key('cpt-verdict')).evaluate().isNotEmpty) break;
    }
    // ⚠️ Нужны ОБА вида: без пар A→X правило не проверено, без одиночных X не
    // проверена ловушка. Если чего-то не набралось — проба ничего не сторожит.
    expect(axTargets + bxLures, greaterThan(3), reason: 'мишенных букв не набралось');
    expect(axTargets, greaterThan(0), reason: 'пар A→X не встретилось');
    expect(bxLures, greaterThan(0), reason: 'одиночных X не встретилось');
  });

  testWidgets('🔴 составное правило L13: мишень — только КРАСНАЯ буква', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '13'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: CptScreen(key: const ValueKey('color'), state: state, rnd: Random(9), durationSec: 90, clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    final p = CptLevel.of(13);
    expect(p.colorRule, isTrue);
    expect(p.target, 'T');
    // Правило названо ДО начала: иначе человек узнал бы о цвете только по ошибке.
    expect(find.byKey(const Key('cpt-color-rule')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    String? prev;
    var redTargets = 0, colorLures = 0;
    for (var i = 0; i < 40; i++) {
      final seen = await playTrial(tester, 13,
          prev: prev, decide: (l, c, pr) => l == p.target && c == 'red' && pr == 'A');
      if (seen == null) break;
      if (seen.letter == p.target) {
        if (seen.color == 'red' && prev == 'A') {
          redTargets++;
        } else if (seen.color != 'red') {
          colorLures++;
        }
      }
      prev = seen.letter;
      if (find.byKey(const Key('cpt-verdict')).evaluate().isNotEmpty) break;
    }
    expect(redTargets, greaterThan(0), reason: 'красных мишеней не встретилось');
    expect(colorLures, greaterThan(0), reason: 'цветовых ловушек не встретилось');
    // Играли по правилу — ложных тревог нет.
    expect(find.text('0'), findsWidgets);
  });

  testWidgets('🔴 оборванная партия исхода НЕ выдаёт — ни «взято», ни «ещё раз»', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '4'});
    state = await SharedState.open();
    // Партия на восемь секунд: проб выйдет меньше порога зачёта.
    await tester.pumpWidget(MaterialApp(
        home: CptScreen(key: const ValueKey('abort'), state: state, rnd: Random(2), durationSec: 8, clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    String? prev;
    for (var i = 0; i < 20; i++) {
      final seen = await playTrial(tester, 4, prev: prev, decide: (l, c, p) => l == 'X');
      if (seen == null) break;
      prev = seen.letter;
      if (find.byKey(const Key('cpt-verdict')).evaluate().isNotEmpty) break;
    }
    // Итог приходит по цепочке таймеров: даём ей дойти явным временем.
    for (var i = 0; i < 40 && find.byKey(const Key('cpt-verdict')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 300));
    }
    expect(find.byKey(const Key('cpt-verdict')), findsOneWidget);
    // 🔴 Ни «уровень взят», ни «ещё раз»: «СТОП» был бесплатным левел-апом.
    expect(find.text(L.t('levelDone').replaceAll('{n}', '4')), findsNothing,
        reason: 'оборванная партия засчитана проходом');
    expect(find.text(L.t('sameLevelRetry')), findsNothing,
        reason: 'оборванная партия засчитана провалом');
    expect(state.get(_levelKey), '4', reason: 'оборванная партия подвинула лестницу');
  });
}
