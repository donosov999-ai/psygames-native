import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stop_signal/model.dart';
import 'package:psygames_flutter/games/stop_signal/screen.dart';
import 'package:psygames_flutter/games/stop_signal/strings.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «СТОП-СИГНАЛ» ИГРАЕТСЯ НАЖАТИЯМИ ПО ПОЛЮ.
///
/// 🔴 Главное, что стережёт проба: лестница задержки лежит под ОБЩИМ с веб-версией
/// ключом и переживает партию, а вместо недостоверного SSRT экран показывает причину.
void main() {
  late SharedState state;
  late StopSignalStrings text;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
    text = await StopSignalStrings.load();
  });

  bool goShown() => find.byKey(const Key('stopsignal-go')).evaluate().isNotEmpty;
  bool stopShown() => find.byKey(const Key('stopsignal-stop')).evaluate().isNotEmpty;

  Future<void> waitGo(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (goShown() || stopShown()) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<bool> waitFlash(WidgetTester tester, String key) async {
    for (var i = 0; i < 120; i++) {
      if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return false;
  }

  testWidgets('🔴 без стоп-проб экран показывает ПРИЧИНУ, а не число', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StopSignalScreen(state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('stopsignal-no-ssrt')), findsOneWidget);
    expect(find.byKey(const Key('stopsignal-ssrt')), findsNothing);
    expect(find.textContaining(text.t('doubtNoData')), findsOneWidget,
        reason: 'причина названа словами, а не «—»');
  });

  testWidgets('🔴 лестница живёт в ОБЩЕМ с вебом ключе и двигается по итогу стоп-проб', (tester) async {
    // Кладём в хранилище лестницу, как её оставила веб-версия.
    await state.set(ladderKey, serializeLadder(const LadderState(ssdMs: 300, trials: [])));
    await tester.pumpWidget(MaterialApp(
      home: StopSignalScreen(state: state, clock: () => 0, rnd: Random(1)),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('${text.t('ssdLabel')}: 300'), findsOneWidget,
        reason: 'экран обязан продолжить лестницу веб-версии, а не начать свою');

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    // Играем партию целиком: молчим везде — GO пропускаем, стоп-пробы удерживаем.
    for (var i = 0; i < 12; i++) {
      await waitGo(tester);
      for (var k = 0; k < 60; k++) {
        if (find.byKey(const Key('stopsignal-inhibited')).evaluate().isNotEmpty ||
            find.byKey(const Key('stopsignal-miss')).evaluate().isNotEmpty) {
          break;
        }
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pump(const Duration(milliseconds: 900));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(text.t('goRtLabel')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    final saved = parseLadder(state.get(ladderKey));
    expect(saved.trials.isNotEmpty, isTrue, reason: 'пробы партии обязаны долиться в общее окно');
    expect(saved.ssdMs >= 300, isTrue,
        reason: 'удержания ведут лестницу вверх, а ни одного срыва не было');
    expect(saved.ssdMs <= ssdMaxMs, isTrue);
  });

  testWidgets('🔴 нажатие в стоп-пробе — срыв, и лестница идёт вниз', (tester) async {
    await state.set(ladderKey, serializeLadder(const LadderState(ssdMs: 400, trials: [])));
    await tester.pumpWidget(MaterialApp(home: StopSignalScreen(state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 0; i < 12; i++) {
      await waitGo(tester);
      // Ждём, пока появится знак «стоп» (он приходит через ступень после GO).
      var isStop = false;
      for (var k = 0; k < 20; k++) {
        if (stopShown()) { isStop = true; break; }
        await tester.pump(const Duration(milliseconds: 50));
      }
      if (isStop) {
        await tester.tap(find.byKey(const Key('stopsignal-field')));
        await tester.pump();
        expect(await waitFlash(tester, 'stopsignal-failed'), isTrue,
            reason: 'нажал при знаке «стоп» — это срыв');
        return;
      }
      await tester.pump(const Duration(milliseconds: 1600));
    }
    fail('за 12 проб стоп-проба не выпала — проверять было нечего');
  });
}
