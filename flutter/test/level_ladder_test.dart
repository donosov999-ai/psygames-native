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

  /*
   * 🔴 ПЕРЕИГРОВКА НЕ ПИШЕТ ЛИЧНЫЙ УРОВЕНЬ (задача c3f27cd6). Веб `usePersistentLevel.pick` держит выбор
   * в памяти на один раунд; натив писал его в ключ, который зарядка берёт как освоенный, — «Уровень
   * проще» и карта уровней навсегда опускали уровень у всех игр с лестницей.
   */
  group('переигровка пройденного (pick ниже достигнутого)', () {
    late MemoryLevelStore store;
    Future<LevelLadder> fresh() async {
      final lad = LevelLadder(gameId: 'probe', store: store);
      await lad.load();
      return lad;
    }

    setUp(() async {
      LevelLadder.newScreen();
      store = MemoryLevelStore();
      await store.writeInt('probe.level', 5);
      await store.writeInt('probe.best', 5);
    });

    test('выбор не пишется в хранилище и переживает перезапуск экрана', () async {
      final a = await fresh();
      await a.pick(2);
      expect(a.level, 2);
      expect(await store.readInt('probe.level'), 5, reason: 'личный уровень не опущен');
      final b = await fresh(); // «Заново» после выбора создаёт новую лестницу
      expect(b.level, 2, reason: 'новая партия — на выбранном');
    });

    test('победа на переигровке: звёзды за сыгранный уровень, личный уровень на месте, выбор снят', () async {
      final a = await fresh();
      await a.pick(2);
      expect(await a.win(errors: 0), isTrue);
      expect(a.level, 5);
      expect(await store.readInt('probe.level'), 5);
      expect((await a.stars())[2], 3);
      expect((await fresh()).level, 5, reason: 'следующий заход — снова достигнутое');
    });

    test('провал на переигровке не копит провалов и не опускает уровень', () async {
      final a = await fresh();
      for (var i = 0; i < 3; i++) {
        await a.pick(2);
        await a.fail();
      }
      expect(a.level, 5);
      expect(a.failStreak, 0);
      expect(await store.readInt('probe.level'), 5);
    });

    test('открыта другая игра — выбор прежней снят', () async {
      await (await fresh()).pick(2);
      LevelLadder.newScreen();
      expect((await fresh()).level, 5);
    });

    test('выбор на достигнутом и выше пишется как раньше (сложнее до лучшего, «Мишени»)', () async {
      await store.writeInt('probe.level', 3);
      final a = await fresh();
      await a.pick(4);
      expect(await store.readInt('probe.level'), 4);
      expect(a.best, 5, reason: 'лучшее не срезается');
    });

    test('«↺ 1» — setLevel пишет личный уровень', () async {
      final a = await fresh();
      await a.setLevel(1);
      expect(await store.readInt('probe.level'), 1);
      expect(a.best, 5);
      expect((await fresh()).level, 1);
    });
  });
}
