import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';

/// 🔴 ТРОПИНКА УРОВНЕЙ И ЗВЁЗДЫ — ОБЩИМ СЛОЕМ (задачи 8e90ac74, a5fe49c9; 11.11.2026).
///
/// В вебе тропинка (`LevelProgressMap`) стояла у 76 игр, а звёзды писал `LevelCleared` каждой игры.
/// После переезда на Flutter карта осталась у трёх «Судоку», звёзды — у них же. Теперь звёзды пишет
/// [LevelLadder.win], а карту открывает пауза каркаса у любой игры с лестницей.
class _Game extends StatefulWidget {
  const _Game(this.store, {this.levelMap = true});
  final MemoryLevelStore store;
  final bool levelMap;
  static int builds = 0;
  @override
  State<_Game> createState() => _GameState();
}

class _GameState extends State<_Game> {
  late final ladder = LevelLadder(gameId: 'probe', store: widget.store);

  @override
  void initState() {
    super.initState();
    _Game.builds++;
    ladder.load().then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) => GameShell(
    title: 'Проба',
    hud: [HudItem(label: L.t('level'), value: '${ladder.level}')],
    levelMap: widget.levelMap,
    field: (_, _) => const SizedBox.expand(),
  );
}

/// Звёзды лестница пишет не дожидаясь (как прежде игры): дать записи завершиться.
Future<void> settle() => Future<void>.delayed(Duration.zero);

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  setUp(GamePreset.clear);

  group('звёзды пишет лестница', () {
    test('по ошибкам, как веб по умолчанию: 0 → 3, до двух → 2, больше → 1, неизвестно → 3', () {
      expect([null, 0, 1, 2, 3, 9].map(LevelLadder.starsForErrors), [3, 3, 2, 2, 1, 1]);
    });

    test('победа пишет звёзды ПРОЙДЕННОГО уровня и держит лучшее', () async {
      final store = MemoryLevelStore();
      final l = LevelLadder(gameId: 'probe', store: store);
      await l.load();
      await l.win(errors: 4, report: false);
      await settle(); // уровень 1 → 1 звезда
      await l.win(errors: 0, report: false);
      await settle(); // уровень 2 → 3 звезды
      expect(await l.stars(), {1: 1, 2: 3});
      await l.pick(1);
      await l.win(errors: 1, report: false);
      await settle(); // переиграл первый: 2 > 1
      await l.pick(2);
      await l.win(errors: 5, report: false);
      await settle(); // хуже прежнего — лучшее остаётся
      expect(await l.stars(), {1: 2, 2: 3});
    });

    test('своя формула игры (аргумент stars) главнее ошибок', () async {
      final store = MemoryLevelStore();
      final l = LevelLadder(gameId: 'probe', store: store);
      await l.load();
      await l.win(errors: 0, stars: 2, report: false);
      await settle();
      expect(await l.stars(), {1: 2});
    });

    test('незасчитанная победа (разбор, вторая жизнь, пресет) звёзд не пишет', () async {
      final store = MemoryLevelStore();
      final l = LevelLadder(gameId: 'probe', store: store);
      await l.load();
      LessonUsed.mark();
      await l.win(report: false);
      await settle();
      await l.win(advance: false, report: false);
      await settle();
      expect(await l.stars(), isEmpty);
      GamePreset.set({'wu': '1'});
      addTearDown(GamePreset.clear);
      final p = LevelLadder(gameId: 'probe', store: store);
      await p.load();
      await p.win(report: false);
      await settle();
      expect(await p.stars(), isEmpty);
    });
  });

  group('карта уровней в паузе каркаса', () {
    Future<MemoryLevelStore> open(WidgetTester t, {required int level, required int best, bool levelMap = true}) async {
      final store = MemoryLevelStore();
      await store.writeInt('probe.level', level);
      await store.writeInt('probe.best', best);
      await store.writeStars('probe', {1: 3, 2: 1});
      LevelLadder.newScreen();
      await t.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => _Game(store, levelMap: levelMap))));
      await t.pumpAndSettle();
      await t.tap(find.byTooltip(L.t('teachPause')));
      await t.pumpAndSettle();
      return store;
    }

    testWidgets('🔴 игра с лестницей: пункт есть, узел пройденного уровня — уровень выбран и партия заново', (t) async {
      final store = await open(t, level: 4, best: 4);
      expect(find.text(L.t('levelMap')), findsOneWidget);
      await t.tap(find.text(L.t('levelMap')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('level-map')), findsOneWidget);
      expect(find.byKey(const Key('level-stars-1')), findsOneWidget, reason: 'звёзды из общей записи');
      expect(find.text('${L.t('level')} 4'), findsOneWidget, reason: 'лестница без потолка — без «из 999»');
      final before = _Game.builds;
      await t.tap(find.byKey(const Key('level-node-2')));
      await t.pumpAndSettle();
      expect(await store.readInt('probe.level'), 2);
      expect(await store.readInt('probe.best'), 4, reason: 'достигнутое не срезается');
      expect(_Game.builds, greaterThan(before), reason: 'партия раздана заново');
    });

    testWidgets('достигнутый 1 — выбирать нечего, пункта нет', (t) async {
      await open(t, level: 1, best: 1);
      expect(find.text(L.t('levelMap')), findsNothing);
    });

    testWidgets('у партии нет лестницы (levelMap: false — «Свободно», малыши) — пункта нет', (t) async {
      await open(t, level: 3, best: 5, levelMap: false);
      expect(find.text(L.t('levelMap')), findsNothing);
    });

    testWidgets('в зарядке уровень задан снаружи — карты нет', (t) async {
      GamePreset.set({'wu': '1'});
      addTearDown(GamePreset.clear);
      await open(t, level: 3, best: 5);
      expect(find.text(L.t('levelMap')), findsNothing);
    });
  });
}
