import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «КОРРЕКТУРУ» ИГРАЕТСЯ НАЖАТИЯМИ ПО КЛЕТКАМ.
///
/// 🔴 Проба читает поле С ЭКРАНА — знаки клеток и две цели из заголовка — и
/// жмёт по тем клеткам, где стоит цель. В модель она не заглядывает: покажи
/// экран не те знаки, и партия покраснеет.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_proofreading_level_nzt48';

void main() {
  late SharedState state;

  late String digits;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
    // Алфавиты — из эталона, снятого с живого TS: ассет в пробе не читаем.
    final ref = jsonDecode(File('test/fixtures/proofreading-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    digits = '${ref['digits']}';
    ProofScripts.useForTest(
        (ref['scripts'] as Map).map((k, v) => MapEntry('$k', '$v')), digits);
  });

  /// Часы партии — те же, что у таймеров пробы.
  int Function() fakeClock(WidgetTester tester) =>
      () => tester.binding.clock.now().millisecondsSinceEpoch;

  /// Две цели, прочитанные из заголовка над полем.
  List<String> targetsOnScreen(WidgetTester tester) {
    final t = tester.widget<Text>(find.byKey(const Key('proof-targets')));
    final after = t.data!.split(': ').last;
    return after.split('  ').where((s) => s.isNotEmpty).toList();
  }

  /// Знаки поля по порядку клеток.
  List<String> lettersOnScreen(WidgetTester tester, int cells) {
    final out = <String>[];
    for (var i = 0; i < cells; i++) {
      final f = find.descendant(of: find.byKey(Key('proof-cell-$i')), matching: find.byType(Text));
      final e = f.evaluate();
      out.add(e.isEmpty ? '' : (e.first.widget as Text).data!);
    }
    return out;
  }

  testWidgets('🔴 поле и цели читаются с экрана, все цели находятся нажатиями', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            key: const ValueKey('p'), state: state, rnd: Random(4), clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('proof-params')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final p = ProofLevel.of(1);
    final targets = targetsOnScreen(tester);
    expect(targets.length, 2, reason: 'целей на экране не две');
    expect(targets[0], isNot(targets[1]), reason: 'цели совпали');

    final letters = lettersOnScreen(tester, p.cells);
    expect(letters.where((l) => l.isNotEmpty).length, p.cells, reason: 'поле неполное');
    final places = [for (var i = 0; i < letters.length; i++) if (targets.contains(letters[i])) i];
    expect(places.length, greaterThanOrEqualTo(minTargetsFor(p.cells)),
        reason: 'целей на поле ${places.length} против минимума ${minTargetsFor(p.cells)}');

    for (var i = 0; i < places.length; i++) {
      await tester.tap(find.byKey(Key('proof-cell-${places[i]}')));
      await tester.pump();
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.byKey(const Key('proof-verdict')), findsOneWidget, reason: 'партия не кончилась');
    expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget);
    expect(find.textContaining('${L.t('hud_missed')}: 0%'), findsOneWidget, reason: 'пропуски есть при всех найденных');
    expect(state.get(_levelKey), '2', reason: 'лестница не шагнула');
  });

  testWidgets('🔴 нажатие мимо цели — ошибка, повтор по найденной — ничего', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            key: const ValueKey('err'), state: state, rnd: Random(9), clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final p = ProofLevel.of(1);
    final targets = targetsOnScreen(tester);
    final letters = lettersOnScreen(tester, p.cells);
    final hit = [for (var i = 0; i < letters.length; i++) if (targets.contains(letters[i])) i].first;
    final miss = [for (var i = 0; i < letters.length; i++) if (!targets.contains(letters[i])) i].first;

    /// Цвет клетки: найденная зелёная, вспышка ошибки красная, прочие прозрачные.
    Color cellColor(int i) {
      final c = tester.widget<Container>(find.byKey(Key('proof-cell-$i')));
      return (c.decoration! as BoxDecoration).color!;
    }

    expect(cellColor(hit), Colors.transparent);
    await tester.tap(find.byKey(Key('proof-cell-$hit')));
    await tester.pump();
    expect(cellColor(hit), const Color(0x3322C55E), reason: 'найденная клетка не отмечена');

    // Повтор по найденной клетке — ни попадание, ни ошибка: она так и остаётся
    // найденной, и красной вспышки не будет.
    await tester.tap(find.byKey(Key('proof-cell-$hit')));
    await tester.pump();
    expect(cellColor(hit), const Color(0x3322C55E), reason: 'повтор перекрасил найденную клетку');

    await tester.tap(find.byKey(Key('proof-cell-$miss')));
    await tester.pump();
    expect(cellColor(miss), const Color(0x33EF4444), reason: 'промах не подсвечен ошибкой');
    // ⚠️ Вспышка гаснет сама — это оформление, а не состояние партии.
    await tester.pump(const Duration(milliseconds: proofWrongFlashMs + 50));
    expect(cellColor(miss), Colors.transparent, reason: 'вспышка ошибки не погасла');
  });

  testWidgets('🔴 время вышло — партия кончается, найденное засчитано как есть', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            key: const ValueKey('time'), state: state, rnd: Random(6), clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final p = ProofLevel.of(1);
    final targets = targetsOnScreen(tester);
    final letters = lettersOnScreen(tester, p.cells);
    final places = [for (var i = 0; i < letters.length; i++) if (targets.contains(letters[i])) i];
    // Находим ОДНУ цель и ждём конца времени.
    await tester.tap(find.byKey(Key('proof-cell-${places.first}')));
    await tester.pump();
    for (var s = 0; s <= p.timeLimitSec + 1; s++) {
      await tester.pump(const Duration(seconds: 1));
      if (find.byKey(const Key('proof-verdict')).evaluate().isNotEmpty) break;
    }
    expect(find.byKey(const Key('proof-verdict')), findsOneWidget, reason: 'время вышло, а партия идёт');
    // Одна цель из многих — порога 80 % не хватает.
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'одна цель засчитана проходом');
    expect(state.get(_levelKey) ?? '1', '1', reason: 'лестница шагнула на одной цели');
  });

  testWidgets('🔴 поле L15 влезает ЦЕЛИКОМ: 192 клетки и ни одной прокрутки', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            key: const ValueKey('big'), state: state, rnd: Random(2), clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    final p = ProofLevel.of(15);
    expect(p.cells, 192);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Все 192 клетки обязаны быть НА ЭКРАНЕ: корректурная проба меряет обход
    // поля глазами, а прокручиваемое поле превращает её в «успеть пролистать».
    final letters = lettersOnScreen(tester, p.cells);
    expect(letters.where((l) => l.isNotEmpty).length, 192, reason: 'клеток на экране ${letters.where((l) => l.isNotEmpty).length}');
    final first = tester.getRect(find.byKey(const Key('proof-cell-0')));
    final last = tester.getRect(find.byKey(const Key('proof-cell-191')));
    expect(last.bottom, greaterThan(first.top), reason: 'последняя клетка выше первой');
    // И ни одна клетка не ушла за край поля.
    final screen = tester.getRect(find.byType(MaterialApp));
    expect(last.bottom, lessThanOrEqualTo(screen.bottom + 0.5), reason: 'поле вылезло за экран на ${last.bottom - screen.bottom}');
  });

  testWidgets('🔴 цифровое поле берёт цифры, а не буквы', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            key: const ValueKey('dig'), state: state, digits: true, rnd: Random(3), clock: fakeClock(tester))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final letters = lettersOnScreen(tester, ProofLevel.of(1).cells);
    for (final ch in letters) {
      expect(digits.contains(ch), isTrue, reason: 'в цифровом поле знак «$ch»');
    }
    for (final t in targetsOnScreen(tester)) {
      expect(digits.contains(t), isTrue, reason: 'цель «$t» не цифра');
    }
  });
}
