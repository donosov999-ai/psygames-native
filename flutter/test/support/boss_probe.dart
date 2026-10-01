// Общая проба вехи «бой с боссом» для экранов, где он был в вебе.
//
// Экран доигрывается НАЖАТИЯМИ (своим помощником из пробы экрана), а проверяется то, что
// видит человек: после победы на 3-м уровне открылся бой нужного типа, его итог встал
// в итог партии, а после победы на 2-м боя нет. Условие «не пресет и не разбор» держит
// лестница (`LevelLadder.win` возвращает, засчитана ли победа) — его мерит
// test/boss_round_test.dart.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// [play] открывает экран на уровне и играет партию победой; [won] находит в итоге партии
/// признак взятого уровня. Порядок как в вебе: сначала бой, потом итог — поэтому признак
/// проверяется после закрытия боя.
Future<void> expectBossAfterWin(
  WidgetTester tester, {
  required Future<void> Function(int level) play,
  required Finder won,
  required String hudKey,
}) async {
  await play(3);
  await tester.pump(const Duration(milliseconds: 500));
  expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: 'после победы на 3-м уровне боя нет');
  await tester.pump(BossRound.introTime);
  expect(tester.widget<Text>(find.byKey(const Key('boss-hud'))).data, '⚔️ ${L.t(hudKey)}',
      reason: 'открылся не тот бой, что у веб-экрана игры');
  // Время вышло — «босс устоял»: итог мягкий, уровень уже засчитан.
  await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
  await tester.pump(BossRound.doneTime);
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой не закрылся');
  expect(won, findsWidgets, reason: 'после боя нет итога взятого уровня');
  expect(find.byKey(const Key('boss-outcome')), findsOneWidget, reason: 'итог боя не показан в итоге партии');
  expect(find.text(L.t('bossSurvived')), findsOneWidget);

  await play(2);
  await tester.pump(const Duration(seconds: 3));
  expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой после 2-го уровня — веха каждый третий');
  expect(won, findsWidgets, reason: 'уровень 2 не взят — проба вехи стоит не там');
  expect(find.byKey(const Key('boss-outcome')), findsNothing);
}
