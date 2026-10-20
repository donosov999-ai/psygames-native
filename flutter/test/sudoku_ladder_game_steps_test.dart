import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_transition.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 СТУПЕНИ ЛЕСТНИЦЫ «СУДОКУ» В ДРУГИХ ИГРАХ ОТКРЫВАЮТСЯ (задача a72d652a, 20.10.2026).
///
/// 📍 Замер по опубликованному 2.56.31: 32 ступени 181–212 («Кошки» и семь сеток Тэтхэма) лежали
/// в `sudoku-ladder-transit.json` только данными — экран их не открывал, а потолок лестницы был
/// последней доской (180). Пробы — нажатиями: карточка ступени, «Начать», чужая игра (заглушка
/// через `LevelTransition.resolve`) сообщает исход так же, как настоящие экраны.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const ladderKey = 'psygames_sudoku_level_nzt48';
  setUpAll(() async => L.load('ru'));

  late SharedState state;
  final opened = <String>[];
  final presets = <Map<String, String>>[];

  setUp(() {
    opened.clear();
    presets.clear();
    LevelTransition.closeDelay = const Duration(milliseconds: 10);
    LevelTransition.resolve = (url) => url.startsWith('/games/cats') ||
            url.startsWith('/games/puzzles') ||
            url.startsWith('/games/sudoku-samurai')
        ? (s) {
            opened.add(url);
            presets.add(Map.of(GamePreset.params));
            return const _FakeGame();
          }
        : null;
  });
  tearDown(() => LevelTransition.resolve = (_) => null);

  Future<void> boot(WidgetTester tester, int level) async {
    SharedPreferences.setMockInitialValues({ladderKey: '$level', 'language': 'ru'});
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('ladderstep-card')).evaluate().isNotEmpty ||
            find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) {
          break;
        }
      }
    });
    await tester.pump();
  }

  /// «Начать» → чужая игра → её исход → человек снова на экране «Судоку».
  Future<void> playStep(WidgetTester tester, {required bool win}) async {
    await tester.tap(find.byKey(const Key('ladderstep-go')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(win ? 'fake-win' : 'fake-fail')));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();
  }

  String text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  test('потолок лестницы — последняя ступень в другой игре, доски — до 180', () async {
    final levels = await SudokuLevels.load();
    expect(levels.lastLevel, 180);
    expect(levels.lastStep, 212);
  });

  testWidgets('🔴 181: вместо доски — «Кошки», уровень 1; победа там → 182, «Кошки» уровень 2', (tester) async {
    await boot(tester, 181);
    expect(find.byKey(const Key('ladderstep-card')), findsOneWidget);
    expect(find.byKey(const Key('cell_0_0')), findsNothing, reason: 'доска 180-й не раздаётся поверх ступени-игры');
    expect(text(tester, 'ladderstep-game'), L.t('catsTitle'));
    expect(text(tester, 'ladderstep-level'), '${L.t('level')} 1');

    await playStep(tester, win: true);
    expect(opened, ['/games/cats']);
    expect(presets.single['lvl'], '1', reason: 'игра открыта на уровне ступени, а не на своём');
    expect(presets.single['ladderGame'], 'sudoku');
    expect(state.get(ladderKey), '182', reason: 'победа в «Кошках» — +1 лестнице «Судоку»');
    expect(text(tester, 'ladderstep-level'), '${L.t('level')} 2');
  });

  testWidgets('провал в чужой игре — ступень держит: остаёмся на 181', (tester) async {
    await boot(tester, 181);
    await playStep(tester, win: false);
    expect(state.get(ladderKey), '181');
    expect(find.byKey(const Key('ladderstep-card')), findsOneWidget);
  });

  testWidgets('🔴 184 — конец блока «Кошек»: после победы бой из мешка, затем 185 — «Небоскрёбы Тэтхэма»',
      (tester) async {
    await boot(tester, 184);
    await playStep(tester, win: true);
    expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: '184 — строка boss в файле лестницы');
    await tester.pump(BossRound.introTime);
    await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
    await tester.pump(BossRound.doneTime);
    await tester.pumpAndSettle();
    expect(state.get(ladderKey), '185');
    expect(text(tester, 'ladderstep-game'), L.t('puzzlesTowers'));
    await playStep(tester, win: true);
    expect(opened.last, '/games/puzzles?mode=Towers');
    expect(presets.last['mode'], 'Towers', reason: 'режим головоломки — из хвоста адреса');
  });

  testWidgets('192: большой босс после ступени-игры — приглашение «Самурая»', (tester) async {
    await boot(tester, 192);
    await playStep(tester, win: true);
    expect(find.byKey(const Key('ladderboss-offer')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ladderboss-later')));
    await tester.pumpAndSettle();
    expect(state.get(ladderKey), '193');
  });

  testWidgets('212 — последняя ступень: «Заполнение областей», уровень 4; дальше потолок', (tester) async {
    await boot(tester, 212);
    expect(text(tester, 'ladderstep-game'), L.t('puzzlesFilling'));
    expect(text(tester, 'ladderstep-level'), '${L.t('level')} 4');
    await playStep(tester, win: true);
    if (find.byKey(const Key('boss-round')).evaluate().isNotEmpty) {
      await tester.pump(BossRound.introTime);
      await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
    }
    expect(state.get(ladderKey), '212');
    expect(find.byKey(const Key('ladderstep-card')), findsOneWidget);
  });
}

/// Чужая игра ступени: сообщает исход так же, как настоящие экраны (`LevelLadder.win/fail`).
class _FakeGame extends StatelessWidget {
  const _FakeGame();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          FilledButton(key: const Key('fake-win'), onPressed: () => LevelLadder.reportOutcome(true), child: const Text('win')),
          FilledButton(key: const Key('fake-fail'), onPressed: () => LevelLadder.reportOutcome(false), child: const Text('fail')),
        ]),
      );
}
