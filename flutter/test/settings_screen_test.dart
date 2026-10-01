import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show debugDefaultTargetPlatformOverride;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/app_update.dart';
import 'package:psygames_flutter/shell/hub_screen.dart' show HubCardTap;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
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

  /// Нажатие, за которым идут каналы платформы (файлы, «Поделиться», выбор файла): их ответы
  /// приходят в настоящем времени, а не в поддельном — иначе цепочка не доходит до конца.
  Future<void> realTap(WidgetTester t, String key) async {
    await t.ensureVisible(find.byKey(Key(key)));
    await t.runAsync(() async {
      await t.tap(find.byKey(Key(key)));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
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

  group('профили (часть 2)', () {
    testWidgets('нажатие на карточку переключает профиль — тем же ключом, что веб, и тема следом', (t) async {
      await open(t, prefs: {'psygames_active_profile': 'nzt48'});
      expect(AppLook.mode.value, ThemeMode.light, reason: 'nzt48 — светлый');
      final before = AppLook.accent.value;
      await tap(t, 'profile-chess');
      expect(state.get('psygames_active_profile'), 'chess');
      // Проверяем то, что слушает MaterialApp, а не пересчёт из памяти: иначе забытый
      // AppLook.refresh проходит незамеченным (мутация P2 выжила на прежней проверке).
      expect(AppLook.mode.value, ThemeMode.dark, reason: 'chess — тёмный, а приложение осталось светлым');
      expect(AppLook.accent.value, isNot(before), reason: 'акцент профиля не сменился');
    });

    testWidgets('долгое нажатие — лист деталей: игры профиля и «переключиться»', (t) async {
      await open(t, prefs: {'psygames_active_profile': 'nzt48'});
      await t.ensureVisible(find.byKey(const Key('profile-kids')));
      await t.longPress(find.byKey(const Key('profile-kids')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('profile-details-kids')), findsOneWidget);
      final kids = Profiles.current.byId('kids')!;
      final first = Profiles.current.games[kids.games!.first]!;
      expect(find.text(L.t('${first['nameKey']}')), findsWidgets, reason: 'в листе нет игр профиля');
      await t.ensureVisible(find.byKey(const Key('profile-switch-kids')));
      await t.tap(find.byKey(const Key('profile-switch-kids')));
      await t.pumpAndSettle();
      expect(state.get('psygames_active_profile'), 'kids');
    });

    testWidgets('сброс разблокировок снимает ключ, как resetUnlocks веба', (t) async {
      await open(t, prefs: {'psygames_unlocked_themed': '["chess"]'});
      await tap(t, 'profile-reset-unlocks');
      await t.tap(find.text(L.t('btn_reset')).last);
      await t.pumpAndSettle();
      expect(state.get('psygames_unlocked_themed'), isNull);
    });

    test('🔴 коды в вебе выключены — иначе перенеси tryUnlock (unlock.ts) и спрячь ввод на iOS', () {
      final p = Profiles.parse(File('assets/profiles.json').readAsStringSync());
      expect(p.codesEnabled, isFalse,
          reason: 'UNLOCK_CODES_ENABLED включили: в нативных настройках нет ввода кода — перенеси tryUnlock и '
              'спрячь ввод на iOS (App Store 3.1.1)');
      expect(p.monetization, isFalse, reason: 'MONETIZATION_ENABLED включили: перенеси запрос кода в Telegram');
    });

    test('имена игр из листа деталей есть в словаре en и ru', () {
      final p = Profiles.parse(File('assets/profiles.json').readAsStringSync());
      for (final loc in const ['en', 'ru']) {
        final dict = jsonDecode(File('assets/l10n/$loc.json').readAsStringSync()) as Map;
        final missing = [for (final g in p.games.values) if (!dict.containsKey(g['nameKey'])) g['nameKey']];
        expect(missing, isEmpty, reason: '$loc: $missing');
      }
    });
  });

  group('перенос и копия (часть 3)', () {
    String? clip;
    setUp(() {
      clip = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') clip = (call.arguments as Map)['text'] as String?;
        if (call.method == 'Clipboard.getData') return {'text': clip};
        return null;
      });
    });
    tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    testWidgets('«Получить код» — код раскладывается в прогресс этого телефона', (t) async {
      await open(t, prefs: {'psygames_sudoku_level_free': '12'});
      await tap(t, 'settings-export');
      final code = t.widget<SelectableText>(find.byKey(const Key('settings-export-code'))).data!;
      final data = jsonDecode(utf8.decode(base64Decode(code)))['data'] as Map;
      expect(data['psygames_sudoku_level_free'], '12');
      await t.tap(find.byKey(const Key('settings-export-copy')));
      await t.pumpAndSettle();
      expect(clip, code, reason: '«Копировать» не положило код в буфер');
    });

    testWidgets('«Вставить код» с кодом ВЕБА переносит прогресс и просит перезагрузить веб', (t) async {
      final ref = jsonDecode(File('test/fixtures/settings-transfer-reference.json').readAsStringSync()) as Map;
      await open(t);
      SettingsScreen.webDirty = false;
      await tap(t, 'settings-import');
      await t.enterText(find.byKey(const Key('settings-import-field')), ref['code'] as String);
      await t.tap(find.byKey(const Key('settings-import-apply')));
      await t.pumpAndSettle();
      expect(state.get('psygames_sudoku_level_odv999'), '92');
      expect(SettingsScreen.takeWebDirty(), isTrue, reason: 'после переноса веб остался бы со старым прогрессом');
      expect(find.text(L.t('storyDone')), findsOneWidget);
    });

    testWidgets('плохой код — «не удалось» с меткой причины, прогресс не тронут', (t) async {
      await open(t);
      await tap(t, 'settings-import');
      await t.enterText(find.byKey(const Key('settings-import-field')), base64Encode(utf8.encode('{"x":1}')));
      await t.tap(find.byKey(const Key('settings-import-apply')));
      await t.pumpAndSettle();
      expect(find.textContaining('(bad-format)'), findsOneWidget);
    });

    testWidgets('«Сохранить копию» без «Поделиться» — весь JSON в буфер, как резерв веба', (t) async {
      await open(t, prefs: {'psygames_active_profile': 'kids'});
      await realTap(t, 'settings-backup-save');
      expect(clip, contains('"app": "PsyGames-Backup"'));
      expect(find.text(L.t('alert_backup_copied')), findsOneWidget);
    });

    testWidgets('«Восстановить копию» без выбора файла — из буфера; копия веба принимается', (t) async {
      final ref = jsonDecode(File('test/fixtures/settings-transfer-reference.json').readAsStringSync()) as Map;
      await open(t);
      clip = ref['backup'] as String;
      await realTap(t, 'settings-backup-restore');
      expect(state.get('psygames_pet_name'), 'Синапс 🐾');
      expect(find.text(L.t('alert_backup_restored')), findsOneWidget);
    });
  });

  group('состав профилей из файла — только владелец (часть 5)', () {
    String? clip;
    String? lastJs;
    setUp(() {
      clip = null;
      lastJs = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.getData') return {'text': clip};
        return null;
      });
    });
    tearDown(() {
      SettingsScreen.webEval = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null);
    });

    testWidgets('у обычного профиля строк состава нет', (t) async {
      await open(t, prefs: {'psygames_active_profile': 'kids'});
      expect(find.byKey(const Key('settings-playlists-load')), findsNothing);
    });

    testWidgets('владелец: файл разбирает страница, состав ложится ключом веба, веб перезагружается', (t) async {
      final saved = jsonEncode({'профили': {'kids': {}, 'free': {}}, 'наборы': []});
      // Android отдаёт строку ещё раз в кавычках — проверяем самый неудобный случай.
      SettingsScreen.webEval = (js) async {
        lastJs = js;
        return jsonEncode(jsonEncode({'ok': true, 'saved': saved, 'n': 2, 'dropped': ['zzz']}));
      };
      await open(t, prefs: {'psygames_active_profile': 'odv999'});
      clip = '{"app":"PsyGames-Playlists"}';
      SettingsScreen.webDirty = false;
      await realTap(t, 'settings-playlists-load');
      expect(lastJs, contains('__psyPlaylistsParse'));
      expect(lastJs, contains(jsonEncode(clip)), reason: 'текст файла не дошёл до разборщика страницы');
      expect(state.get(SettingsScreen.playlists), saved);
      expect(SettingsScreen.takeWebDirty(), isTrue);
      await t.tap(find.text(L.t('close')).last);
      await t.pumpAndSettle();
      expect(find.byKey(const Key('settings-playlists-reset')), findsOneWidget);
      await realTap(t, 'settings-playlists-reset');
      expect(state.get(SettingsScreen.playlists), isNull, reason: 'сброс не вернул заводской состав');
    });

    testWidgets('страница не приняла файл — ключ не тронут, причина на экране', (t) async {
      SettingsScreen.webEval = (js) async => jsonEncode({'ok': false, 'error': 'не тот файл'});
      await open(t, prefs: {'psygames_active_profile': 'odv999'});
      clip = '{"app":"Другое"}';
      await realTap(t, 'settings-playlists-load');
      expect(state.get(SettingsScreen.playlists), isNull);
      expect(find.text('не тот файл'), findsOneWidget);
    });
  });

  group('проверка обновлений (часть 4)', () {
    tearDown(() => AppUpdate.fetchLatest = () async => null);

    test('isNewer — как у веба', () {
      expect(AppUpdate.isNewer('2.56.5', '2.56.4'), isTrue);
      expect(AppUpdate.isNewer('2.56.4', '2.56.4'), isFalse);
      expect(AppUpdate.isNewer('2.54.24', '2.56.4'), isFalse, reason: 'застывший version.json не должен звать «обновиться»');
      expect(AppUpdate.isNewer('3', '2.99.99'), isTrue);
      expect(AppUpdate.isNewer('beta', '1.0.0'), isFalse);
    });

    test('«Скачать» ведёт в магазин своей платформы', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      expect(AppUpdate.storeUrl(), contains('apps.apple.com/app/id6779208225'));
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      expect(AppUpdate.storeUrl(), contains('details?id=com.psygames.app'));
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('свежая версия — диалог со «Скачать»; та же — «последняя»; нет сети — «не удалось»', (t) async {
      AppUpdate.fetchLatest = () async => '9.0.0';
      await open(t);
      await realTap(t, 'settings-update');
      expect(find.byKey(const Key('settings-update-download')), findsOneWidget);
      await t.tap(find.text(L.t('updLater')));
      await t.pumpAndSettle();
      AppUpdate.fetchLatest = () async => '2.56.4';
      await realTap(t, 'settings-update');
      expect(find.textContaining(L.t('updLatest')), findsOneWidget);
      await t.tap(find.text(L.t('close')).last);
      await t.pumpAndSettle();
      AppUpdate.fetchLatest = () async => null;
      await realTap(t, 'settings-update');
      expect(find.text(L.t('updCheckFailed')), findsOneWidget);
    });
  });
}
