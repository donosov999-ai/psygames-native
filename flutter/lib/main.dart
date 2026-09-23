import 'package:flutter/material.dart';

import 'games/dots_connect/screen.dart';
import 'games/digit_span/screen.dart';
import 'games/one_line/screen.dart';
import 'shell/asset_server.dart';
import 'shell/hybrid_app.dart';
import 'shell/shared_state.dart';
import 'shell/web_game_screen.dart';

/// Пилот переезда PsyGames на Flutter (задачи 6ec9bd56 и 4a24281a).
///
/// Здесь уже не только перенесённые игры: список показывает ОБЕ половины будущего
/// приложения — перенесённые экраны рисует Flutter, непереносённые открываются
/// нынешней сборкой в WebView. Прогресс у половин общий (lib/shell/shared_state.dart).
///
/// Адрес непереносённой части задаётся при сборке:
///   flutter run -d macos --dart-define=PSY_WEB=http://localhost:8471
/// Раздача берётся из нынешнего проекта:
///   cd ~/dev/psygames/frontend && node scripts/serve-dist.mjs dist 8471
const webBase = String.fromEnvironment('PSY_WEB', defaultValue: 'http://localhost:8471');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = await SharedState.open();
  final server = await AssetServer.start();
  runApp(PsyGamesPilotApp(state: state, server: server));
}

class PsyGamesPilotApp extends StatelessWidget {
  const PsyGamesPilotApp({super.key, required this.state, required this.server});

  final SharedState state;
  final AssetServer server;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'PsyGames — пилот Flutter',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF7F7FD5), useMaterial3: true),
        darkTheme: ThemeData(
          colorSchemeSeed: const Color(0xFF7F7FD5),
          brightness: Brightness.dark,
          useMaterial3: true,
        ),
        home: HybridApp(state: state, server: server),
      );
}

/// Список того, что есть. Настоящей главной у пилота нет.
class PilotHome extends StatelessWidget {
  const PilotHome({super.key, required this.state});

  final SharedState state;

  void _openWeb(BuildContext context, String title, String path) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => WebGameScreen(title: title, url: '$webBase/$path', state: state),
    ));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('PsyGames — пилот Flutter')),
        body: ListView(
          children: [
            const _Divider('Перенесено на Flutter'),
            ListTile(
              leading: const Icon(Icons.grid_4x4),
              title: const Text('Соедини точки'),
              subtitle: const Text('40 уровней и тренировка'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => DotsConnectScreen(state: state)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.timeline),
              title: const Text('Одна линия'),
              subtitle: const Text('30 уровней'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => OneLineScreen(state: state)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.pin_outlined),
              title: const Text('Цифровой ряд'),
              subtitle: const Text('показ по таймеру, ввод цифрами'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => DigitSpanScreen(state: state)),
              ),
            ),
            const _Divider('Ещё не перенесено — открывается нынешней сборкой'),
            ListTile(
              leading: const Icon(Icons.public),
              title: const Text('Таблицы Шульте'),
              subtitle: const Text('WebView · прогресс общий с Flutter-частью'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _openWeb(context, 'Таблицы Шульте', 'games/schulte'),
            ),
            ListTile(
              leading: const Icon(Icons.public),
              title: const Text('Соедини точки (веб-версия)'),
              subtitle: const Text('та же игра старой сборкой — для сверки прогресса'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _openWeb(context, 'Соедини точки — веб', 'games/dots-connect'),
            ),
          ],
        ),
      );
}

class _Divider extends StatelessWidget {
  const _Divider(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
        child: Text(text,
            style: Theme.of(context)
                .textTheme
                .labelMedium
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      );
}
