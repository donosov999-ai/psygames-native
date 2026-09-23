import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';

void main() {
  late LevelLadder l;

  setUp(() async {
    l = LevelLadder(gameId: 'dots_connect', store: MemoryLevelStore());
    await l.load();
  });

  test('победа поднимает уровень и достигнутое', () async {
    await l.win();
    await l.win();
    expect(l.level, 3);
    expect(l.best, 3);
  });

  test('один и два провала подряд уровень не опускают', () async {
    await l.win();
    await l.fail();
    await l.fail();
    expect(l.level, 2);
  });

  test('три провала подряд опускают уровень на один', () async {
    await l.win();
    await l.win();
    await l.fail();
    await l.fail();
    await l.fail();
    expect(l.level, 2);
  });

  test('🔴 достигнутое НЕ падает вместе с уровнем (отличие от React-версии)', () async {
    for (var i = 0; i < 5; i++) {
      await l.win();
    }
    expect(l.best, 6);
    for (var i = 0; i < 6; i++) {
      await l.fail();
    }
    expect(l.level, 4);
    expect(l.best, 6);
  });

  test('выбор уровня человеком не срезает достигнутое', () async {
    for (var i = 0; i < 4; i++) {
      await l.win();
    }
    await l.pick(2);
    expect(l.level, 2);
    expect(l.best, 5);
  });

  test('уровень не опускается ниже первого', () async {
    for (var i = 0; i < 9; i++) {
      await l.fail();
    }
    expect(l.level, 1);
  });
}
