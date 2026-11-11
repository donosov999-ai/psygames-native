// Стенд ОБЩЕЙ карты уровней каркаса (задача 8e90ac74): игра-проба с лестницей — уровень 8, достигнут 12,
// звёзды за пройденные; «Аврора» тёмная. Пауза → «Карта уровней». Только для снимков, в приложение не входит.
//   flutter run -t lib/level_map_preview.dart [--dart-define=LIGHT=true]
import 'package:flutter/material.dart';

import 'shell/app_theme.dart';
import 'shell/aurora_scope.dart';
import 'shell/design_template.dart';
import 'shell/game_shell.dart';
import 'shell/l10n.dart';
import 'shell/level_ladder.dart';
import 'shell/level_map.dart';
import 'shell/restart_scope.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await L.load(const String.fromEnvironment('LANG', defaultValue: 'ru'));
  final store = MemoryLevelStore();
  await store.writeInt('probe.level', 8);
  await store.writeInt('probe.best', 12);
  await store.writeStars('probe', {1: 3, 2: 3, 3: 2, 4: 3, 5: 1, 6: 2, 7: 3, 8: 2, 9: 3, 10: 1, 11: 2});
  const light = bool.fromEnvironment('LIGHT');
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: applyUiTemplate(classicShellTheme(light ? Brightness.light : Brightness.dark), UiTemplate.aurora),
    home: AuroraGameScope(route: '/games/probe', child: RestartScope(builder: (_) => _Probe(store))),
  ));
}

class _Probe extends StatefulWidget {
  const _Probe(this.store);
  final MemoryLevelStore store;
  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> {
  late final ladder = LevelLadder(gameId: 'probe', store: widget.store, maxLevel: 30);

  @override
  void initState() {
    super.initState();
    LevelLadder.newScreen();
    ladder.load().then((_) async {
      setState(() {});
      // OPEN_MAP=true — сразу открыть карту (для снимков без нажатий).
      if (!const bool.fromEnvironment('OPEN_MAP')) return;
      final stars = await ladder.stars();
      if (!mounted) return;
      showLevelMap(context, current: ladder.level, best: ladder.best, last: ladder.maxLevel, stars: stars);
    });
  }

  @override
  Widget build(BuildContext context) => GameShell(
    title: 'Schulte',
    hud: [HudItem(label: L.t('level'), value: '${ladder.level}', icon: Icons.trending_up)],
    field: (_, _) => const SizedBox.expand(),
  );
}
