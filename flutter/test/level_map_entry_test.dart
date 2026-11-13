import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «КАРТА УРОВНЕЙ» НА ЭКРАНЕ НАСТРОЙКИ ДО СТАРТА (задача 15686620, 13.11.2026).
///
/// В вебе тропинка стояла прямо в настройках; во Flutter с 11.11 карта открывалась только из паузы
/// партии. Вход теперь один, в шапке каркаса: меню справки «Авроры» и кнопка классики, у любой игры с
/// лестницей — и до старта, пока человек ещё на настройках. Игра ничего для этого не передаёт.
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
        onLesson: () {},
        onRules: () {},
        field: (_, _) => const SizedBox.expand(),
      );
}

Finder key(String k) => find.byKey(Key(k));

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
    await LevelRules.load();
  });
  setUp(GamePreset.clear);

  Future<MemoryLevelStore> open(WidgetTester t, {required int level, required int best, bool levelMap = true, bool aurora = false}) async {
    final store = MemoryLevelStore();
    await store.writeInt('probe.level', level);
    await store.writeInt('probe.best', best);
    LevelLadder.newScreen();
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final screen = RestartScope(builder: (_) => _Game(store, levelMap: levelMap));
    await t.pumpWidget(aurora
        ? MaterialApp(
            theme: applyUiTemplate(classicShellTheme(Brightness.dark), UiTemplate.aurora),
            home: AuroraGameScope(route: '/games/probe', child: screen),
          )
        : MaterialApp(home: screen));
    await t.pumpAndSettle();
    return store;
  }

  group('классика', () {
    testWidgets('🔴 до старта, без паузы: вход в шапке, карта открывается, выбор пройденного уровня — партия на нём', (t) async {
      final store = await open(t, level: 4, best: 4);
      expect(key('game-level-map'), findsOneWidget, reason: 'вход есть на экране настройки');
      final before = _Game.builds;
      await t.tap(key('game-level-map'));
      await t.pumpAndSettle();
      expect(key('level-map'), findsOneWidget);
      await t.ensureVisible(key('level-node-2'));
      await t.tap(key('level-node-2'));
      await t.pumpAndSettle();
      expect(await store.readInt('probe.level'), 4, reason: 'личный уровень не опущен (как из паузы после #481)');
      expect(await store.readInt('probe.best'), 4, reason: 'достигнутое не срезается');
      expect(LevelLadder.current?.level, 2, reason: 'партия идёт на выбранном уровне');
      expect(_Game.builds, greaterThan(before), reason: 'партия раздана заново');
    });

    testWidgets('закрыл карту, ничего не выбрав, — игра цела, уровень прежний', (t) async {
      final store = await open(t, level: 4, best: 4);
      final before = _Game.builds;
      await t.tap(key('game-level-map'));
      await t.pumpAndSettle();
      Navigator.of(t.element(key('level-map'))).pop();   // закрыл, ничего не выбрав
      await t.pumpAndSettle();
      expect(key('level-map'), findsNothing);
      expect(_Game.builds, before, reason: 'партию не пересоздавали');
      expect(await store.readInt('probe.level'), 4);
    });

    testWidgets('достигнутый 1 — выбирать нечего, входа нет', (t) async {
      await open(t, level: 1, best: 1);
      expect(key('game-level-map'), findsNothing);
    });

    testWidgets('у партии нет лестницы (levelMap: false) — входа нет', (t) async {
      await open(t, level: 3, best: 5, levelMap: false);
      expect(key('game-level-map'), findsNothing);
    });

    testWidgets('в зарядке уровень задан снаружи — входа нет', (t) async {
      GamePreset.set({'wu': '1'});
      addTearDown(GamePreset.clear);
      await open(t, level: 3, best: 5);
      expect(key('game-level-map'), findsNothing);
    });
  });

  group('«Аврора»', () {
    testWidgets('🔴 вход — третий пункт меню «Обучение и справка»: открывает ту же карту', (t) async {
      final store = await open(t, level: 4, best: 4, aurora: true);
      expect(key('game-help-menu'), findsOneWidget);
      await t.tap(key('game-help-menu'));
      await t.pumpAndSettle();
      expect(key('game-lesson'), findsOneWidget);
      expect(key('game-rules'), findsOneWidget);
      expect(key('game-level-map'), findsOneWidget, reason: 'пункт «Карта уровней» в меню');
      await t.tap(key('game-level-map'));
      await t.pumpAndSettle();
      expect(key('level-map'), findsOneWidget);
      await t.ensureVisible(key('level-node-3'));
      await t.tap(key('level-node-3'));
      await t.pumpAndSettle();
      expect(LevelLadder.current?.level, 3);
      expect(await store.readInt('probe.level'), 4, reason: 'личный уровень не опущен');
    });

    testWidgets('нет лестницы с достигнутым выше 1 — в меню только «Разбор» и «Правила»', (t) async {
      await open(t, level: 1, best: 1, aurora: true);
      await t.tap(key('game-help-menu'));
      await t.pumpAndSettle();
      expect(key('game-lesson'), findsOneWidget);
      expect(key('game-level-map'), findsNothing);
    });
  });

  group('настоящие игры раздела — вход есть без правки самих игр', () {
    for (final (route, id) in [
      ('/games/reading-span', 'reading_span'),
      ('/games/memory-matrix', 'memory_matrix'),
      ('/games/n-back', 'n_back'),
    ]) {
      testWidgets('$id: на экране настройки в шапке «Карта уровней», по нажатию открывается', (t) async {
        SharedPreferences.setMockInitialValues({
          'psygames_active_profile': 'nzt48',
          'psygames_${id}_level_nzt48': '5',
          'psygames_${id}_best_nzt48': '5',
        });
        final state = await SharedState.open();
        LevelLadder.newScreen();
        // В приложении оболочка кладёт игру под RestartScope — без него раздавать выбранный уровень нечем.
        await t.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => HybridApp.native[route]!(state))));
        // Экраны грузят ассеты настоящим вводом-выводом, поддельное время пробы его не ждёт.
        for (var i = 0; i < 40 && key('game-level-map').evaluate().isEmpty; i++) {
          await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
          await t.pump(const Duration(milliseconds: 100));
        }
        expect(key('game-level-map'), findsOneWidget, reason: '$id: вход в шапке');
        await t.tap(key('game-level-map'));
        await t.pumpAndSettle();
        expect(key('level-map'), findsOneWidget, reason: '$id: карта открылась до старта партии');
        await t.pumpWidget(const SizedBox());
      });
    }
  });
}
