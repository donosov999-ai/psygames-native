import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/games/kids_find/model.dart';
import 'package:psygames_flutter/games/kids_find/screen.dart';
import 'package:psygames_flutter/shell/app_haptics.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// 📳 ВИБРООТКЛИК ХОДА — РАСКАТКА ПО ОБРАЗЦУ «МАТРИЦЫ ПАМЯТИ» (задача 792432f8).
///
/// Денис 08.10.2026: «в матрице памяти виброотклик хорошо зашёл — надо раскатывать где уместно».
///   · три события — три ощущения: ход принят — щелчок, раунд собран — толчок, ошибка — тяжёлый;
///   · тумблер «Вибрация» глушит всё;
///   · на настоящих экранах («Найди другую», «Ханойская башня») нажатие даёт свой толчок;
///   · реестр раскатки: экран из списка обязан звать свои события — правка, потерявшая отклик,
///     краснеет здесь, а не в руке человека.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  final buzz = <String>[];
  void listen(WidgetTester? t) {
    final messenger = t?.binding.defaultBinaryMessenger ?? TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
      if (c.method == 'HapticFeedback.vibrate') buzz.add('${c.arguments}');
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(SystemChannels.platform, null));
  }

  setUp(buzz.clear);

  test('🔴 три события — три толчка; тумблер выключен — тишина', () async {
    listen(null);
    SharedPreferences.setMockInitialValues({});
    final h = AppHaptics(await SharedState.open());
    await h.hit();
    await h.win();
    await h.miss();
    expect(buzz, ['HapticFeedbackType.selectionClick', 'HapticFeedbackType.mediumImpact', 'HapticFeedbackType.heavyImpact']);
    buzz.clear();
    SharedPreferences.setMockInitialValues({hapticKey: 'false'});
    final off = AppHaptics(await SharedState.open());
    await off.hit();
    await off.win();
    await off.miss();
    expect(buzz, isEmpty);
  });

  testWidgets('🔴 «Найди другую»: другая — щелчок, промах — тяжёлый; тумблер выключен — тишина', (t) async {
    listen(t);
    for (final on in [true, false]) {
      buzz.clear();
      SharedPreferences.setMockInitialValues({hapticKey: '$on'});
      final state = await SharedState.open();
      useFakeGameClock(t);
      await t.pumpWidget(
        MaterialApp(
          home: KidsFindScreen(key: UniqueKey(), state: state, seed: 3),
        ),
      );
      await t.pump();
      await t.pump();
      final b = FindBoard.deal(1, Random(3));
      await t.tap(find.byKey(ValueKey('kf-item-${b.target == 0 ? 1 : 0}')));
      await t.pump(const Duration(milliseconds: 400));
      await t.tap(find.byKey(ValueKey('kf-item-${b.target}')));
      await t.pump(const Duration(milliseconds: 500));
      expect(buzz, on ? ['HapticFeedbackType.heavyImpact', 'HapticFeedbackType.selectionClick'] : isEmpty, reason: 'тумблер $on');
      await t.pumpWidget(const SizedBox());
    }
  });

  testWidgets('«Ханойская башня»: разрешённый ход — щелчок, запрещённый — тяжёлый', (t) async {
    listen(t);
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await t.runAsync(() async {
      await t.pumpWidget(MaterialApp(home: HanoiScreen(state: state)));
      for (var i = 0; i < 40 && find.byType(HanoiBoard).evaluate().isEmpty; i++) {
        await t.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    });
    await t.pump();
    Future<void> move(int from, int to) async {
      await t.tap(find.byKey(ValueKey('peg-$from')));
      await t.pump();
      await t.tap(find.byKey(ValueKey('peg-$to')));
      await t.pump();
    }

    await move(0, 1); // верхний диск — на пустой стержень
    await move(0, 1); // больший — на меньший: запрещено
    expect(buzz, ['HapticFeedbackType.selectionClick', 'HapticFeedbackType.heavyImpact']);
  });

  /// Реестр раскатки: экран → события, которые он обязан звать. Список только растёт; экран из него не
  /// уходит, пока отклик не перенесён в другое место того же экрана.
  const rollout = <String, Set<String>>{
    'anagrams/screen.dart': {'hit', 'miss'},
    'anagrams/all_words_screen.dart': {'hit', 'miss', 'win'},
    'anagrams/crossword_screen.dart': {'hit', 'miss', 'win'},
    'anagrams/ring_screen.dart': {'hit', 'miss', 'win'},
    'animal_queue/screen.dart': {'hit', 'miss', 'win'},
    'chinese_tones/screen.dart': {'hit', 'miss'},
    'corsi/screen.dart': {'hit'},
    'counter/screen.dart': {'win', 'miss'},
    'digit_span/screen.dart': {'win', 'miss'},
    'find_differences/screen.dart': {'hit', 'win', 'miss'},
    'hanoi/screen.dart': {'hit', 'win', 'miss'},
    'kids_find/screen.dart': {'hit', 'miss'},
    'kids_sort/screen.dart': {'hit', 'miss'},
    'listening_span/screen.dart': {'hit', 'win', 'miss'},
    'mental_rotation/screen.dart': {'hit', 'miss'},
    'mnemonics/screen.dart': {'hit', 'miss'},
    'monster_traits/screen.dart': {'win', 'miss'},
    'monster_traits/missing_screen.dart': {'win', 'miss'},
    'sdmt/screen.dart': {'hit', 'miss'},
    'set_game/screen.dart': {'hit', 'miss'},
    'sort_tubes/screen.dart': {'hit', 'win', 'miss'},
    'spatial_span/screen.dart': {'hit', 'win', 'miss'},
    'submarines/screen.dart': {'hit', 'win', 'miss'},
    'targets/screen.dart': {'hit', 'miss'},
    'tower_london/screen.dart': {'hit', 'win', 'miss'},
    'trail_making/screen.dart': {'hit', 'win', 'miss'},
    'visual_search/screen.dart': {'hit', 'win', 'miss'},
    'wcst/screen.dart': {'hit', 'miss'},
  };

  test('🔴 реестр раскатки: каждый экран зовёт свои события через общий выключатель', () {
    final lost = <String>[];
    for (final MapEntry(key: file, value: events) in rollout.entries) {
      final src = File('lib/games/$file').readAsStringSync();
      if (!src.contains('AppHaptics(widget.state)')) lost.add('$file: нет AppHaptics');
      for (final e in events) {
        if (!RegExp('_haptics\\.$e\\(\\)').hasMatch(src)) lost.add('$file: нет $e');
      }
    }
    expect(lost, isEmpty);
    expect(rollout.length, greaterThanOrEqualTo(28), reason: 'раскатка только растёт');
  });
}
