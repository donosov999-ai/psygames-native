import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/hub_screen.dart' show HubCardTap;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/settings_screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НАТИВНЫЕ НАСТРОЙКИ ПИШУТ ТЕ ЖЕ КЛЮЧИ И В ТОМ ЖЕ ВИДЕ, ЧТО ВЕБ (задача eae0879c).
///
/// Веб-половина читает эти ключи сама (`feedback.ts`, `pet.ts`, `appFeedback.ts`,
/// `ThemeContext.tsx`). Значение в другом виде веб прочтёт молча НЕ ТАК: `'1'` вместо
/// `'true'` у звука — это «выключено». Проба нажимает настоящие тумблеры и читает хранилище.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;

  Future<void> open(WidgetTester t, {Map<String, Object> prefs = const {}}) async {
    SharedPreferences.setMockInitialValues(prefs);
    PackageInfo.setMockInitialValues(
        appName: 'PsyGames', packageName: 'com.psygames.app', version: '2.56.4', buildNumber: '1', buildSignature: '');
    state = await SharedState.open();
    await t.runAsync(() async {
      await L.load('en');
      await AppLook.load(state);
    });
    await t.binding.setSurfaceSize(const Size(390, 844));
    await t.pumpWidget(MaterialApp(home: SettingsScreen(state: state)));
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await t.pumpAndSettle();
  }

  Future<void> tap(WidgetTester t, String key) async {
    await t.ensureVisible(find.byKey(Key(key)));
    await t.tap(find.byKey(Key(key)));
    await t.pumpAndSettle();
  }

  testWidgets('умолчания — как у веба: звук и вибрация вкл, музыка выкл, громкость 80, питомец 100 %', (t) async {
    await open(t);
    Switch sw(String k) => t.widget<Switch>(find.byKey(Key('settings-$k')));
    expect(sw('sound').value, isTrue);
    expect(sw('haptic').value, isTrue);
    expect(sw('music').value, isFalse);
    expect(sw('devchat').value, isTrue);
    expect(sw('pet').value, isTrue);
    expect(sw('colorblind').value, isFalse);
    expect(find.text('80%'), findsOneWidget);
    expect(find.text('100%'), findsOneWidget);
  });

  testWidgets('тумблеры пишут ровно то, что пишет веб', (t) async {
    await open(t);
    await tap(t, 'settings-sound');
    expect(state.get(SettingsScreen.sound), 'false', reason: 'feedback.ts: String(v)');
    await tap(t, 'settings-haptic');
    expect(state.get(SettingsScreen.haptic), 'false');
    await tap(t, 'settings-music');
    expect(state.get(SettingsScreen.music), 'true');
    await tap(t, 'settings-colorblind');
    expect(state.get(SettingsScreen.colorblind), 'true', reason: 'ThemeContext: String(v)');
    await tap(t, 'settings-devchat');
    expect(state.get(SettingsScreen.devChat), '0', reason: "appFeedback.ts: on ? '1' : '0'");
    await tap(t, 'settings-pet');
    expect(state.get(SettingsScreen.pet), '0', reason: "pet.ts: on ? '1' : '0'");
    await tap(t, 'settings-theme');
    expect(state.get(AppLook.overrideKey), anyOf('dark', 'light'));
  });

  testWidgets('громкость: ±10 в пределах 0…100, ползунок спрятан при выключенном звуке', (t) async {
    await open(t, prefs: {SettingsScreen.volume: '95'});
    await tap(t, 'settings-volume-up');
    expect(state.get(SettingsScreen.volume), '100', reason: 'выше 100 не уходит');
    await tap(t, 'settings-volume-down');
    expect(state.get(SettingsScreen.volume), '90');
    await tap(t, 'settings-sound');
    expect(find.byKey(const Key('settings-volume')), findsNothing, reason: 'две ручки на одно молчание (fe7f2020)');
  });

  testWidgets('язык: выбор пишет общий ключ и сразу переводит экран', (t) async {
    await open(t);
    expect(find.text('Settings'), findsOneWidget);
    await tap(t, 'settings-lang-ru');
    expect(state.get('language'), 'ru');
    expect(L.locale, 'ru');
    expect(find.text('Settings'), findsNothing, reason: 'экран остался на английском после выбора русского');
  });

  testWidgets('переходы уходят оболочке маршрутом, а не открывают веб сами', (t) async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await t.runAsync(() async {
      await L.load('en');
      await AppLook.load(state);
    });
    await t.binding.setSurfaceSize(const Size(390, 844));
    Object? result;
    await t.pumpWidget(MaterialApp(home: Builder(builder: (c) => TextButton(
          onPressed: () async => result = await Navigator.of(c).push(MaterialPageRoute(builder: (_) => SettingsScreen(state: state))),
          child: const Text('open'),
        ))));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    await tap(t, 'settings-link-/achievements');
    expect(result, isA<HubCardTap>());
    expect((result as HubCardTap).route, '/achievements');
  });

  test('тема — правилом веба: профиль задаёт базу, ручной выбор перебивает, косметика — акцент', () {
    final look = jsonDecode(File('assets/look.json').readAsStringSync()) as Map<String, dynamic>;
    AppLook.useForTest(look);
    Future<SharedState> s(Map<String, Object> p) async {
      SharedPreferences.setMockInitialValues(p);
      return SharedState.open();
    }

    return Future(() async {
      final nzt = await s({'psygames_active_profile': 'nzt48'});
      expect(AppLook.isDark(nzt), isFalse, reason: 'nzt48 в PROFILE_THEME — светлый');
      expect(AppLook.accentOf(nzt), AppLook.hexColor(look['profiles']['nzt48']['accent'] as String));
      final over = await s({'psygames_active_profile': 'nzt48', AppLook.overrideKey: 'dark'});
      expect(AppLook.isDark(over), isTrue, reason: 'ручной выбор главнее профиля');
      final worn = await s({
        'psygames_active_profile': 'odv999',
        AppLook.equippedKey('odv999'): jsonEncode({'accent': 'accent_rose'}),
      });
      expect(AppLook.accentOf(worn), AppLook.hexColor(look['accents']['accent_rose'] as String));
      final unknown = await s({'psygames_active_profile': 'нет-такого'});
      expect(AppLook.isDark(unknown), isTrue, reason: 'веб: профиля нет в таблице — тёмная');
    });
  });

  test('число питомца — как String(n) в JS: целое без «.0»', () {
    expect(SettingsScreen.jsNumber(1.0), '1');
    expect(SettingsScreen.jsNumber(1.25), '1.25');
    expect(SettingsScreen.jsNumber(0.6), '0.6');
  });

  test('🔴 у каждого ключа экрана есть строка в en и ru', () {
    final src = File('lib/shell/settings_screen.dart').readAsStringSync();
    final keys = {
      for (final m in RegExp(r"L\.t\('([A-Za-z0-9_]+)'\)").allMatches(src)) m.group(1)!,
      ...settingsProfileKeys,
    };
    for (final loc in const ['en', 'ru']) {
      final dict = jsonDecode(File('assets/l10n/$loc.json').readAsStringSync()) as Map;
      final missing = keys.where((k) => !dict.containsKey(k)).toList();
      expect(missing, isEmpty, reason: '$loc: нет $missing — на экране был бы сырой ключ');
    }
  });
}
