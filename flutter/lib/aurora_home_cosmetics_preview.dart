// Стенд: Главная в «Авроре» с КУПЛЕННЫМ оформлением (задача 89517ae3) — фон под стеклом, кольцо рамки
// вокруг Синапса, налёт цвета. Модель и картинки отдаёт локальный сервер (ORIGIN). Только для снимков.
//   flutter run -t lib/aurora_home_cosmetics_preview.dart --dart-define=ORIGIN=http://127.0.0.1:8765 [--dart-define=LIGHT=true] [--dart-define=BOUGHT=false]
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

import 'shell/app_theme.dart';
import 'shell/catalog_kit.dart';
import 'shell/design_template.dart';
import 'shell/home_screen.dart';
import 'shell/l10n.dart';
import 'shell/screen_ui.dart';
import 'shell/shared_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const origin = String.fromEnvironment('ORIGIN', defaultValue: 'http://127.0.0.1:8765');
  await L.load('ru');
  final state = await SharedState.open();
  final kit = await CatalogKit.load();
  final req = await HttpClient().getUrl(Uri.parse('$origin/home_model_ru.json'));
  final body = await (await req.close()).transform(utf8.decoder).join();
  final m = (jsonDecode(body) as Map).cast<String, Object?>()..['goalSheet'] = null;
  const bought = bool.fromEnvironment('BOUGHT', defaultValue: true);
  m['auroraCosmetics'] = bought
      ? {'background': '/assets/images/profile-bg/kids.webp', 'frame': '#f5b50a', 'accent': true}
      : {'background': null, 'frame': null, 'accent': false};
  ScreenUi.run = (s) async {};
  ScreenUi.model(HomeScreen.route).value = m;
  const light = bool.fromEnvironment('LIGHT');
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: applyUiTemplate(classicShellTheme(light ? Brightness.light : Brightness.dark), UiTemplate.aurora),
    home: Scaffold(
      body: HomeScreen(state: state, origin: origin, kit: kit, onOpen: (_) {}, onTab: (_) {}, onSwitcher: () {}, ownModel: false),
    ),
  ));
}
