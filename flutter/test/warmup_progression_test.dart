import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() {
    GamePreset.clear();
    LessonUsed.reset();
  });

  Future<LevelLadder> open(LevelStore store, {String game = 'probe'}) async {
    final l = LevelLadder(gameId: game, store: store, maxLevel: 20);
    await l.load();
    return l;
  }

  void training() => GamePreset.set({'wu': '1', 'progress': '1', 'auto': '1'});

  test(
    'training autostarts but plays the full level, not an abbreviated preset',
    () {
      training();
      expect(GamePreset.isWarmup, isTrue);
      expect(GamePreset.autostart, isTrue);
      expect(GamePreset.isPreset, isFalse);
    },
  );

  test(
    'L1 win survives closing and opens L2 tomorrow; personal ladder unchanged',
    () async {
      training();
      final store = MemoryLevelStore();
      final first = await open(store);
      expect(first.level, 1);
      expect(await first.win(), isTrue);
      expect(first.level, 2);
      GamePreset.clear();
      expect((await open(store)).level, 1);
      training();
      expect((await open(store)).level, 2);
    },
  );

  test(
    'bootstraps existing personal L7; then persists training L8 independently',
    () async {
      final store = MemoryLevelStore();
      await store.writeInt('probe.level', 7);
      training();
      final l = await open(store);
      expect(l.level, 7);
      await l.win();
      expect((await open(store)).level, 8);
      expect(await store.readInt('probe.level'), 7);
    },
  );

  test('duplicate completion earns only one training level', () async {
    training();
    final l = await open(MemoryLevelStore());
    await l.win();
    expect(await l.win(), isFalse);
    expect(l.level, 2);
  });

  test(
    'late training completion after leaving the route cannot advance',
    () async {
      training();
      final store = MemoryLevelStore();
      final old = await open(store);
      GamePreset.clear();
      expect(await old.win(), isFalse);
      await old.fail();
      training();
      expect((await open(store)).level, 1);
    },
  );

  test(
    'failure, revealed lesson and non-advancing completion do not promote',
    () async {
      training();
      final store = MemoryLevelStore();
      final l = await open(store);
      await l.fail();
      await l.fail();
      await l.fail();
      expect(l.level, 1);
      LessonUsed.mark();
      expect(await l.win(), isFalse);
      expect(l.level, 1);
      expect(await l.win(advance: false), isFalse);
      expect((await open(store)).level, 1);
    },
  );

  test('fixed measurement preset stays unchanged', () async {
    GamePreset.set({'wu': '1', 'trials': '8'});
    final l = await open(MemoryLevelStore());
    expect(await l.win(), isFalse);
    expect(l.level, 1);
  });

  test(
    'training keys survive reopening storage and isolate game/mode and profile',
    () async {
      SharedPreferences.setMockInitialValues({
        'psygames_active_profile': 'nzt48',
      });
      training();
      var state = await SharedState.open();
      final a = await open(SharedLevelStore(state), game: 'digit_span_audio');
      await a.win();
      state = await SharedState.open();
      expect(
        (await open(SharedLevelStore(state), game: 'digit_span_audio')).level,
        2,
      );
      expect(
        (await open(SharedLevelStore(state), game: 'digit_span')).level,
        1,
      );
      await state.set('psygames_active_profile', 'kids');
      expect(
        (await open(SharedLevelStore(state), game: 'digit_span_audio')).level,
        1,
      );
      expect(state.get('psygames_digit_span_audio_warmup_level_nzt48'), '2');
    },
  );
}
