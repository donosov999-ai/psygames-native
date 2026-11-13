// Стенд ЭКРАНА «Числового забега» (задача 84bcf2c9): тот же NumberRunScreen, что в приложении (табло, руль,
// результат, финал), без прохода через каталог. Уровень — --dart-define=LEVEL=7 (пишется в его же ключ).
//
// Запуск: flutter run -t lib/number_run_screen_preview.dart --dart-define=LEVEL=7
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'games/number_run/screen.dart';
import 'shell/l10n.dart';
import 'shell/shared_state.dart';

const _level = int.fromEnvironment('LEVEL', defaultValue: 7);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await L.load('ru');
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('${SharedState.prefix}number_run_level_nzt48', '$_level');
  final state = await SharedState.open();
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData.dark(),
    home: Scaffold(body: SafeArea(child: NumberRunScreen(state: state, seed: 1))),
  ));
}
