import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/bilingual_game.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/options.dart';
import 'package:psygames_flutter/games/anagrams/screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    await L.load('ru');
  });

  test('тройка идёт от родного к двум разным иностранным языкам', () async {
    final game = await BilingualGame.create(
      nativeLang: 'ru',
      firstLang: 'en',
      secondLang: 'es',
      triples: 2,
      rnd: Random(1),
    );
    expect(game.steps, hasLength(6));
    expect(game.steps.map((s) => s.lang).toSet(), {'ru', 'en', 'es'});
    expect(game.steps.take(3).map((s) => s.lang), ['ru', 'en', 'es']);
    for (final step in game.steps) {
      expect(step.word.runes.length, inInclusiveRange(3, 12));
    }

    final english = await BilingualGame.create(
      nativeLang: 'en',
      firstLang: 'es',
      secondLang: 'de',
      triples: 1,
      rnd: Random(2),
    );
    expect(english.steps.map((s) => s.lang).toSet().length, 3);
  });

  test('темы берутся из канонического anagramWords.json и фильтруют банк', () async {
    final themes = await AnagramWordThemes.load('ru');
    expect(themes['арбуз'], 'food');
    expect(themes['осёл'], 'animals');
    expect(await AnagramWordThemes.load('de'), isEmpty);

    final bank = await WordBank.load('ru');
    final game = ClassicGame(
      bank: bank,
      level: AnagramLevel.of(1),
      words: ['АБАК', 'БАБА', 'ВАГО', 'ГАДА'],
    );
    expect(game.acceptedCount, 4);
    expect(game.accepts('абак'), isTrue);
    expect(game.next().target, isIn(['АБАК', 'БАБА', 'ВАГО', 'ГАДА']));
  });

  Future<SharedState> state() => SharedState.open();

  Future<void> boot(WidgetTester tester, SharedState state) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: AnagramsScreen(state: state, locale: 'ru')));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.text(L.t('start')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> pick(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.tap(find.byKey(Key(key)));
    await tester.pump();
  }

  Future<void> start(WidgetTester tester) async {
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await tester.runAsync(() async {
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(AnagramBoard).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byType(AnagramBoard), findsOneWidget);
  }

  Future<void> spell(WidgetTester tester, String word) async {
    final board = tester.widget<AnagramBoard>(find.byType(AnagramBoard));
    final used = <int>{};
    for (final ch in word.runes.map(String.fromCharCode)) {
      var index = -1;
      for (var i = 0; i < board.letters.length; i++) {
        if (!used.contains(i) && board.letters[i] == ch) {
          index = i;
          break;
        }
      }
      expect(index, isNonNegative, reason: '$ch в ${board.letters} для $word');
      used.add(index);
      await tester.tap(find.byKey(ValueKey('letter-$index')));
      await tester.pump();
    }
  }

  testWidgets('тема фильтрует слово, а выключатель убирает подсказку', (tester) async {
    await boot(tester, await state());
    await pick(tester, 'anagram-theme-animals');
    await pick(tester, 'anagram-hints-off');
    await start(tester);
    final board = tester.widget<AnagramBoard>(find.byType(AnagramBoard));
    final themes = await AnagramWordThemes.load('ru');
    expect(themes[board.target.toLowerCase()], 'animals');
    expect(find.byTooltip(L.t('btn_hint')), findsNothing);
  });

  testWidgets('двуязычие: 12 шагов, родной первый, затем иностранный', (tester) async {
    await boot(tester, await state());
    await pick(tester, 'anagram-bilingual-on');
    await start(tester);
    final first = tester.widget<AnagramBoard>(find.byType(AnagramBoard));
    expect(first.target.runes.every((r) => RegExp(r'[А-ЯЁ]').hasMatch(String.fromCharCode(r))), isTrue);
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    expect(hud.firstWhere((h) => h.label == L.t('round')).value, '1/12');

    await spell(tester, first.target);
    await tester.pump();
    final second = tester.widget<AnagramBoard>(find.byType(AnagramBoard));
    expect(second.target, isNot(first.target));
    expect(second.target, matches(RegExp(r'^[A-Z ]+$')), reason: second.target);
    expect(
      tester.widget<GameShell>(find.byType(GameShell)).hud.firstWhere((h) => h.label == L.t('round')).value,
      '2/12',
    );
  });
}
