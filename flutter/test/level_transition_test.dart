import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_transition.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

/// 🔴 СТУПЕНЬ-ПЕРЕХОД: НАЖАТИЯМИ, ОТ СТУПЕНИ ДО ВОЗВРАТА (задача 4e3d3443).
///
/// Приёмка задачи: «уровень-переход открывает игру, победа ведёт обратно и номер лестницы
/// +1; прогресс самой игры не портится». Чужая игра здесь — поддельная, но зовёт ту же
/// [LevelLadder], что и все нативные экраны: итог ступени берётся ровно там.
///
/// Что сторожит каждая проба — в её имени. Мутации, которыми проверено, что пробы кусаются,
/// перечислены в описании PR.
late MemoryLevelStore store;
late List<Map<String, Object?>> sessions;
late SharedState shared;

/// Поддельная чужая игра: своя лестница в том же хранилище, кнопки исхода.
class _FakeGame extends StatefulWidget {
  const _FakeGame({this.resultDialog = false});
  final bool resultDialog;
  @override
  State<_FakeGame> createState() => _FakeGameState();
}

class _FakeGameState extends State<_FakeGame> {
  final _ladder = LevelLadder(gameId: 'fake', store: store);
  bool _ready = false;
  bool? _counted;

  @override
  void initState() {
    super.initState();
    _ladder.load().then((_) => setState(() => _ready = true));
  }

  Future<void> _win() async {
    final c = await _ladder.win(score: 42, timeSeconds: 7);
    setState(() => _counted = c);
    if (widget.resultDialog && mounted) {
      showDialog<void>(context: context, builder: (_) => const AlertDialog(content: Text('итог')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          Text(_ready ? 'чужая L${_ladder.level}' : '…'),
          Text('режим ${GamePreset.str('mode', '-')}'),
          if (_counted != null) Text('засчитано $_counted'),
          TextButton(onPressed: _win, child: const Text('выиграть')),
          TextButton(onPressed: () => _ladder.fail(score: 1), child: const Text('проиграть')),
          TextButton(
            onPressed: () {
              LessonUsed.mark();
              _win();
            },
            child: const Text('с разбором'),
          ),
        ]),
      );
}

/// Чужая игра без лестницы — как «Бездна»: партию шлёт сама, итог — [LevelLadder.reportOutcome].
class _NoLadderGame extends StatelessWidget {
  const _NoLadderGame();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: TextButton(
          onPressed: () async {
            await SessionReport.send(gameType: 'deep', score: 5, timeSeconds: 3);
            LevelLadder.reportOutcome(true);
          },
          child: const Text('собрать корень'),
        ),
      );
}

/// Ступень хозяина: кнопка открывает переход и показывает итог.
class _Host extends StatefulWidget {
  const _Host({required this.ladder, required this.step});
  final LevelLadder ladder;
  final LadderTransit step;
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  TransitOutcome? _out;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          Text('хозяин L${widget.ladder.level} провалов ${widget.ladder.failStreak}'),
          if (_out != null) Text('итог ${_out!.name}'),
          TextButton(
            onPressed: () async {
              final o = await LevelTransition.play(context,
                  state: shared, host: widget.ladder, step: widget.step);
              setState(() => _out = o);
            },
            child: const Text('ступень'),
          ),
        ]),
      );
}

Future<LevelLadder> _host(int level) async {
  await store.writeInt('host.level', level);
  final l = LevelLadder(gameId: 'host', store: store);
  await l.load();
  return l;
}

Future<void> _open(WidgetTester t, LevelLadder host, LadderTransit step) async {
  await t.pumpWidget(MaterialApp(home: _Host(ladder: host, step: step)));
  await t.tap(find.text('ступень'));
  await t.pumpAndSettle();
}

/// После итога чужой игры — пауза [LevelTransition.closeDelay] и возврат.
Future<void> _back(WidgetTester t) async {
  await t.pump(LevelTransition.closeDelay);
  await t.pumpAndSettle();
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    shared = SharedState(await SharedPreferences.getInstance());
    store = MemoryLevelStore();
    sessions = [];
    SessionReport.sink = (json) async => sessions.add(jsonDecode(json) as Map<String, Object?>);
    LevelTransition.resolve = (route) => switch (route) {
          '/games/fake' => (_) => const _FakeGame(),
          '/games/fake-dialog' => (_) => const _FakeGame(resultDialog: true),
          '/games/fake?mode=Towers' => (_) => const _FakeGame(),
          '/games/deep' => (_) => const _NoLadderGame(),
          _ => null,
        };
    GamePreset.clear();
    LessonUsed.reset();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelTransition.resolve = (_) => null;
    GamePreset.clear();
  });

  testWidgets('🔴 победа: игра открыта на ЕЁ уровне, человек вернулся, хозяин +1', (t) async {
    await store.writeInt('fake.level', 9);
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    expect(find.text('чужая L4'), findsOneWidget, reason: 'уровень ступени, а не сохранённый 9');

    await t.tap(find.text('выиграть'));
    await t.pump();
    expect(find.text('засчитано false'), findsOneWidget,
        reason: 'чужая лестница не засчитывает: иначе на «вехе» открылся бы её босс');
    await _back(t);

    expect(find.text('итог passed'), findsOneWidget);
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
    expect(await store.readInt('host.level'), 4, reason: 'ступень хозяина сохранена');
  });

  testWidgets('🔴 прогресс чужой игры не тронут ни победой, ни провалами', (t) async {
    await store.writeInt('fake.level', 9);
    final host = await _host(3);
    for (var i = 0; i < 3; i++) {
      await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 2));
      await t.tap(find.text('проиграть'));
      await _back(t);
    }
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 2));
    await t.tap(find.text('выиграть'));
    await _back(t);
    expect(await store.readInt('fake.level'), 9, reason: 'три провала и победа — уровень «чужой» стоит');
    expect(await store.readInt('fake.best'), isNull, reason: 'достигнутое тоже не записано');
  });

  testWidgets('🔴 одна партия в статистику — чужая, с меткой ступени; у хозяина второй нет', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    await t.tap(find.text('выиграть'));
    await _back(t);
    expect(sessions, hasLength(1), reason: 'хозяин не пишет нулевую партию поверх чужой');
    expect(sessions.single['game_type'], 'fake');
    expect(sessions.single['score'], 42);
    expect(sessions.single['difficulty'], '4');
    expect(sessions.single['details'], {'ladderGame': 'host', 'ladderLevel': 3});
  });

  testWidgets('🔴 провал: хозяин записал провал, уровень стоит', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    await t.tap(find.text('проиграть'));
    await _back(t);
    expect(find.text('итог failed'), findsOneWidget);
    expect(find.text('хозяин L3 провалов 1'), findsOneWidget);
    expect(sessions, hasLength(1));
  });

  const boss = LadderTransit(game: '/games/fake', gameLevel: 4, boss: true, blocks: false);

  testWidgets('🔴 босс не держит: +1 и при проигрыше', (t) async {
    final host = await _host(3);
    await _open(t, host, boss);
    await t.tap(find.text('проиграть'));
    await _back(t);
    expect(find.text('итог failed'), findsOneWidget, reason: 'экран хозяина пишет «устоял»');
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
  });

  testWidgets('🔴 босс не держит: +1 и при уходе (у «Самурая» и «Фрактала» проигрыша нет)', (t) async {
    final host = await _host(3);
    await _open(t, host, boss);
    t.state<NavigatorState>(find.byType(Navigator)).pop();
    await t.pumpAndSettle();
    expect(find.text('итог left'), findsOneWidget);
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
  });

  testWidgets('🔴 игра без лестницы («Бездна») тоже отдаёт итог и метку ступени', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/deep', boss: true, blocks: true));
    await t.tap(find.text('собрать корень'));
    await _back(t);
    expect(find.text('итог passed'), findsOneWidget);
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
    expect(sessions.single['details'], {'ladderGame': 'host', 'ladderLevel': 3},
        reason: 'партия мимо лестницы — с меткой ступени тоже');
  });

  testWidgets('🔴 хвост адреса доезжает до экрана режима', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake?mode=Towers', gameLevel: 2));
    expect(find.text('режим Towers'), findsOneWidget);
    expect(find.text('чужая L2'), findsOneWidget);
    t.state<NavigatorState>(find.byType(Navigator)).pop();
    await t.pumpAndSettle();
    expect(GamePreset.params, isEmpty, reason: 'хвост чужого адреса не остался хозяину');
  });

  testWidgets('без уровня — игра на СВОЁМ уровне человека, и он не меняется', (t) async {
    await store.writeInt('fake.level', 9);
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake'));
    expect(find.text('чужая L9'), findsOneWidget);
    await t.tap(find.text('выиграть'));
    await _back(t);
    expect(await store.readInt('fake.level'), 9);
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
  });

  testWidgets('🔴 ушёл до итога — ничего не записано', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    final nav = t.state<NavigatorState>(find.byType(Navigator));
    nav.pop();
    await t.pumpAndSettle();
    expect(find.text('итог left'), findsOneWidget);
    expect(find.text('хозяин L3 провалов 0'), findsOneWidget);
    expect(sessions, isEmpty);
  });

  testWidgets('🔴 победа с разбором ступень не засчитывает — ни вверх, ни вниз', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    await t.tap(find.text('с разбором'));
    await _back(t);
    expect(find.text('итог lesson'), findsOneWidget);
    expect(find.text('хозяин L3 провалов 0'), findsOneWidget);
  });

  testWidgets('🔴 окно итога поверх партии не держит человека в чужой игре', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake-dialog', gameLevel: 4));
    await t.tap(find.text('выиграть'));
    await t.pumpAndSettle();
    expect(find.text('итог'), findsOneWidget, reason: 'окно итога успели показать');
    await _back(t);
    expect(find.text('итог passed'), findsOneWidget);
    expect(find.text('чужая L4'), findsNothing);
  });

  testWidgets('🔴 «ещё раз» в чужой игре — уже не ступень: берётся ПЕРВЫЙ итог', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    await t.tap(find.text('выиграть'));
    await t.pump();
    await t.tap(find.text('проиграть'));
    await _back(t);
    expect(find.text('итог passed'), findsOneWidget);
    expect(find.text('хозяин L4 провалов 0'), findsOneWidget);
  });

  testWidgets('🔴 настройки хозяина вернулись: шаг зарядки остаётся шагом', (t) async {
    GamePreset.set({'wu': '1', 'mode': 'x'});
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/fake', gameLevel: 4));
    expect(GamePreset.isTransit, isTrue);
    expect(GamePreset.isPreset, isFalse, reason: 'чужая партия — обычная, не шаг зарядки');
    await t.tap(find.text('выиграть'));
    await _back(t);
    expect(GamePreset.params, {'wu': '1', 'mode': 'x'});
    expect(LevelLadder.onOutcome, isNull, reason: 'слушатель снят — следующая партия хозяина ничья');
    expect(find.text('хозяин L3 провалов 0'), findsOneWidget, reason: 'хозяин в зарядке лестницу не двигает');
  });

  testWidgets('игры нет в сборке — ступень остаётся своей', (t) async {
    final host = await _host(3);
    await _open(t, host, const LadderTransit(game: '/games/none', gameLevel: 4));
    expect(find.text('итог unavailable'), findsOneWidget);
    expect(GamePreset.params, isEmpty);
  });

  test('🔴 ступень и босс — из строк ladder-80-204.json как они есть', () {
    // Строки дословно из файла раздела sudoku-levels (02.10.2026).
    const towers = {'level': 150, 'kind': 'game', 'game': '/games/puzzles?mode=Towers', 'blockStep': 2, 'blockSize': 4};
    const keenBoss = {
      'level': 160, 'kind': 'game', 'game': '/games/puzzles?mode=Keen', 'blockStep': 4, 'blockSize': 4,
      'boss': true, 'bossGame': '/games/sudoku-fractal', 'bossBlocks': false,
    };
    const board = {'level': 96, 'kind': 'board', 'variant': 'whisper', 'blockStep': 4, 'blockSize': 4,
      'boss': true, 'bossGame': '/games/sudoku-samurai', 'bossBlocks': false};
    final s = LadderTransit.levelOf(towers)!;
    expect([s.game, s.gameLevel, s.boss, s.blocks], ['/games/puzzles?mode=Towers', 2, false, true]);
    expect(LadderTransit.levelOf(keenBoss)!.gameLevel, 4);
    final b = LadderTransit.bossOf(keenBoss)!;
    expect([b.game, b.gameLevel, b.boss, b.blocks], ['/games/sudoku-fractal', null, true, false]);
    expect(LadderTransit.levelOf(board), isNull, reason: 'доска играется своей игрой');
    expect(LadderTransit.bossOf(board)!.game, '/games/sudoku-samurai');
    expect(LadderTransit.bossOf(towers), isNull);
    expect(LadderTransit.levelOf({'kind': 'game', 'game': 'cats'}), isNull);
    expect(LadderTransit.levelOf({...towers, 'gameLevel': 7})!.gameLevel, 7, reason: 'явный уровень главнее');
    expect(LadderTransit.bossOf({...board, 'bossBlocks': true})!.blocks, isTrue);
  });

  test('🔴 вне перехода `lvl` уровень не подменяет (шаг зарядки свой уровень не задаёт)', () async {
    await store.writeInt('fake.level', 9);
    GamePreset.set({'wu': '1', 'lvl': '2'});
    final l = LevelLadder(gameId: 'fake', store: store);
    await l.load();
    expect(l.level, 9);
  });
}
