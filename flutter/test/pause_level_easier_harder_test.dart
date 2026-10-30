import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';

/// 🔴 «УРОВЕНЬ ПРОЩЕ / СЛОЖНЕЕ» В ПАУЗЕ ИГРЫ С ЛЕСТНИЦЕЙ (задача 654b5a60, жалоба 1be7fd33).
///
/// Веб показывает эти пункты с 10.09; нативная пауза их не знала. Каркас берёт лестницу открытой игры
/// ([LevelLadder.current]) — правки в каждой игре не нужно. «Проще» — с уровня > 1, «сложнее» — пока
/// уровень ниже достигнутого; выбор сохраняется, партия раздаётся заново.
class _Store implements LevelStore {
  final m = <String, int>{};
  @override
  Future<int?> readInt(String key) async => m[key];
  @override
  Future<void> writeInt(String key, int value) async => m[key] = value;
}

class _Game extends StatefulWidget {
  const _Game(this.store);
  final _Store store;
  static int builds = 0;
  @override
  State<_Game> createState() => _GameState();
}

class _GameState extends State<_Game> {
  late final ladder = LevelLadder(gameId: 'probe', store: widget.store);
  bool ready = false;

  @override
  void initState() {
    super.initState();
    _Game.builds++;
    ladder.load().then((_) => setState(() => ready = true));
  }

  @override
  Widget build(BuildContext context) => GameShell(
    title: 'Проба',
    hud: [HudItem(label: L.t('level'), value: '${ladder.level}')],
    field: (_, _) => const SizedBox.expand(),
  );
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<_Store> open(WidgetTester t, {required int level, required int best}) async {
    final store = _Store()
      ..m['probe.level'] = level
      ..m['probe.best'] = best;
    LevelLadder.newScreen();
    await t.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => _Game(store))));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip(L.t('teachPause')));
    await t.pumpAndSettle();
    return store;
  }

  setUp(() => GamePreset.clear());

  testWidgets('🔴 уровень 3 из достигнутых 5: оба пункта; «проще» — уровень 2 и новая партия', (t) async {
    final store = await open(t, level: 3, best: 5);
    expect(find.text(L.t('pauseEasier')), findsOneWidget);
    expect(find.text(L.t('pauseHarder')), findsOneWidget);
    final before = _Game.builds;
    await t.tap(find.text(L.t('pauseEasier')));
    await t.pumpAndSettle();
    expect(store.m['probe.level'], 2, reason: 'выбор уровня сохранён');
    expect(store.m['probe.best'], 5, reason: 'достигнутое не срезается');
    expect(_Game.builds, greaterThan(before), reason: 'партия раздана заново');
  });

  testWidgets('«сложнее» — на шаг выше, но не выше достигнутого', (t) async {
    final store = await open(t, level: 4, best: 5);
    await t.tap(find.text(L.t('pauseHarder')));
    await t.pumpAndSettle();
    expect(store.m['probe.level'], 5);
  });

  testWidgets('уровень 1 и достигнутый 1 — пунктов нет', (t) async {
    await open(t, level: 1, best: 1);
    expect(find.text(L.t('pauseEasier')), findsNothing);
    expect(find.text(L.t('pauseHarder')), findsNothing);
  });

  testWidgets('лестница прошлой игры не подхватывается: открыта новая игра без лестницы — пунктов нет', (t) async {
    await open(t, level: 3, best: 5);
    expect(LevelLadder.current, isNotNull, reason: 'лестница первой игры была текущей');
    await t.pumpWidget(const SizedBox()); // первая игра закрыта
    LevelLadder.newScreen();
    expect(LevelLadder.current, isNull, reason: 'новая игра — лестница прошлой больше не текущая');
    await t.pumpWidget(
      MaterialApp(
        home: RestartScope(
          builder: (_) => GameShell(title: 'Без лестницы', hud: const [], field: (_, _) => const SizedBox()),
        ),
      ),
    );
    await t.tap(find.byTooltip(L.t('teachPause')));
    await t.pumpAndSettle();
    expect(find.text(L.t('pauseEasier')), findsNothing);
  });

  testWidgets('в зарядке уровень задан снаружи — пунктов нет', (t) async {
    GamePreset.set({'wu': '1'});
    addTearDown(GamePreset.clear);
    await open(t, level: 3, best: 5);
    expect(find.text(L.t('pauseEasier')), findsNothing);
  });
}
