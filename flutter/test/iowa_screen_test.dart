import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/iowa/model.dart';
import 'package:psygames_flutter/games/iowa/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В IGT ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Партия здесь ДЕТЕРМИНИРОВАНА: расписание потерь предзадано, случайности
/// нет вовсе. Поэтому сид не нужен, а числа можно проверять точно.
///
/// Где лежит счётчик пройденных партий: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_iowa_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  int liveBank() {
    final t = find.byKey(const Key('iowa-live-bank')).evaluate().first.widget as Text;
    return int.parse(t.data!.split(': ').last);
  }

  testWidgets('🔴 партия из 40 карт по колоде D: банк сходится с расписанием', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: IowaScreen(key: const ValueKey('d'), state: state, trials: 40)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('iowa-trials')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(liveBank(), 2000, reason: 'стартовый банк');

    for (var i = 1; i <= 40; i++) {
      await tester.tap(find.byKey(const Key('iowa-deck-d')));
      await tester.pump();
      // L1: задержки нет, но отклик всё равно приходит отдельным шагом.
      await tester.pump(const Duration(milliseconds: 10));
      expect(find.byKey(const Key('iowa-feedback')), findsOneWidget, reason: 'карта $i: исход не показан');
      expect(find.byKey(const Key('iowa-win')), findsOneWidget);
      // Потеря у D приходит каждой десятой картой.
      final expectLoss = i % 10 == 0;
      expect(find.byKey(const Key('iowa-loss')), expectLoss ? findsOneWidget : findsNothing,
          reason: 'карта $i: потеря ${expectLoss ? 'не показана' : 'показана зря'}');
      await tester.pump(const Duration(milliseconds: iowaFeedbackMs + 50));
    }
    await tester.pumpAndSettle();
    // 40·50 − 4·250 = +1000.
    expect(find.text('${L.t('hud_bank')}: 3000'), findsOneWidget, reason: 'банк не сошёлся с расписанием');
    expect(find.byKey(const Key('iowa-bank')), findsOneWidget);
    // Провала нет: счётчик партий двигается фактом завершения.
    expect(state.get(_levelKey), '2', reason: 'пройденная партия не засчитана');
  });

  testWidgets('🔴 на L15 исход приходит ЧЕРЕЗ 700 мс, а не сразу', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: IowaScreen(key: const ValueKey('slow'), state: state, trials: 40)));
    await tester.pumpAndSettle();
    final delay = IowaLevel.of(15).feedbackDelayMs;
    expect(delay, 700, reason: 'замер задержки L15 протух');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('iowa-deck-b')));
    await tester.pump();
    // ⚠️ Всю задержку банк стоит на месте: прыгнувшее число выдавало бы исход
    // до самой обратной связи, и задержка не нагружала бы ничего.
    await tester.pump(Duration(milliseconds: delay - 100));
    expect(find.byKey(const Key('iowa-waiting')), findsOneWidget, reason: 'исход показан раньше срока');
    expect(liveBank(), 2000, reason: 'банк двинулся до обратной связи');
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byKey(const Key('iowa-feedback')), findsOneWidget, reason: 'исход не пришёл в срок');
    expect(liveBank(), 2100, reason: 'банк не двинулся вместе с исходом');
  });

  testWidgets('🔴 замок: нажатия во время задержки не берут новых карт', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: IowaScreen(key: const ValueKey('lock'), state: state, trials: 40)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('iowa-deck-c')));
    await tester.pump();
    // ⚠️ Кнопки остаются нажимаемыми — гасить их значило бы подсказывать, что
    // ход принят. Держит замок модели, и без него можно было бы натыкать
    // несколько карт за один ход.
    for (final d in ['a', 'b', 'c', 'd']) {
      await tester.tap(find.byKey(Key('iowa-deck-$d')));
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.byKey(const Key('iowa-feedback')), findsOneWidget);
    // Взята ровно одна карта: +50 от колоды C, первая карта без потери.
    expect(liveBank(), 2050, reason: 'за один ход взято больше одной карты');
    await tester.pump(const Duration(milliseconds: iowaFeedbackMs + 50));
    // Ход закрыт — замок снят, следующая карта берётся.
    await tester.tap(find.byKey(const Key('iowa-deck-c')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    expect(liveBank(), 2050 + 50 - 50, reason: 'вторая карта C: +50 и потеря −50');
  });

  testWidgets('🔴 колода B: крупная потеря приходит ШЕСТОЙ картой, а не первой', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: IowaScreen(key: const ValueKey('b'), state: state, trials: 40)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 1; i <= 6; i++) {
      await tester.tap(find.byKey(const Key('iowa-deck-b')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));
      final big = i == 6;
      expect(find.byKey(const Key('iowa-loss')), big ? findsOneWidget : findsNothing,
          reason: 'карта $i: ${big ? 'потери нет' : 'потеря пришла не в свой черёд'}');
      await tester.pump(const Duration(milliseconds: iowaFeedbackMs + 50));
    }
    // 6·100 − 1250 = −650 от старта.
    expect(liveBank(), 1350);
  });
}
