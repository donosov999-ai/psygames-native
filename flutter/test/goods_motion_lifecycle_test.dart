import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/motion.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'goods_sort_outcome_test.dart' show boot;

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() { SharedPreferences.setMockInitialValues({}); resetGameClock(); });

  testWidgets('opt-in actual screen: legal move, rapid taps, Undo, hold and exit cancel flight', (t) async {
    final state = await SharedState.open();
    await boot(t, state);
    GoodsField field() => t.widget<GoodsField>(find.byType(GoodsField));
    final motion = field().motion!;
    await t.tap(find.byKey(const ValueKey('item-5-1')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('niche-1')));
    await t.pump();
    expect(motion.busy, isTrue);
    expect(field().board.cells[1], [37]);
    await t.tap(find.byKey(const ValueKey('item-0-1')));
    await t.tap(find.byKey(const ValueKey('niche-4')));
    await t.pump();
    expect(field().board.cells[4], isEmpty, reason: 'rapid taps must not duplicate a move');
    await t.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
    await t.pump();
    expect(motion.busy, isFalse);
    expect(field().board.cells[1], isEmpty);
    await t.pump(const Duration(seconds: 1));
    expect(field().board.cells[1], isEmpty, reason: 'late animation cannot restore an undone move');
    await t.tap(find.byKey(const ValueKey('item-5-1')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('niche-1')));
    await t.pump();
    final release = holdGame();
    await t.pump();
    expect(motion.busy, isFalse);
    release();
    await t.pumpWidget(const SizedBox.shrink());
    await t.pump(const Duration(seconds: 2));
    expect(t.takeException(), isNull);
  }, skip: !goodsMotionPilot);

  testWidgets('disabled motion is immediate and schedules no completion', (t) async {
    final motion = GoodsMotion();
    var landed = 0;
    expect(motion.begin(0, 0, 1, 1, onLand: () => landed++), isFalse);
    await t.pump(const Duration(seconds: 2));
    expect(landed, 0);
    expect(motion.busy, isFalse);
    motion.dispose();
  });
}
