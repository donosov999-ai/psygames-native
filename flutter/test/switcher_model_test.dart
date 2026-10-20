import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/playlist_fields.dart';
import 'package:psygames_flutter/shell/profile_switcher.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/switcher_model.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ: МОДЕЛЬ DART = МОДЕЛЬ ВЕБА НА ТОМ ЖЕ ХРАНИЛИЩЕ (задача d6a60b02, вариант Б).
///
/// Эталоны выгружает веб-проба `switcher-dart-model.test.tsx`: настоящий `ProfileSwitcherModal` с
/// провайдерами профиля, темы и языка на подготовленном хранилище. Здесь то же хранилище кладётся в общую
/// память, и Dart собирает модель сам. Ввод кода — платформенный: образец хранит, на какой платформе снят.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = SwitcherData(
    j: obj('assets/switcher.json'),
    profilesJson: obj('assets/profiles.json'),
    games: [for (final g in (obj('assets/catalog.json')['games']! as List)) (g as Map).cast<String, Object?>()],
  );
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());

  for (final name in ['ru', 'en']) {
    test('🔴 switcher_dart_$name: модель Dart = модель веба на том же хранилище', () async {
      final f = obj('test/fixtures/switcher_dart_$name.json');
      final want = (f['model']! as Map).cast<String, Object?>();
      final language = f['language']! as String;
      SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
      final state = await SharedState.open();
      lang(language);
      final dart = switcherModelFrom(state, data, profiles: profiles, language: language, codeEntry: f['codeEntry']! as bool);
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        if (k == 'details') continue;
        expect(got[k], want[k], reason: 'поле $k');
      }
      final wd = (want['details']! as Map).cast<String, Object?>(), gd = (got['details']! as Map).cast<String, Object?>();
      expect(gd.keys.toList(), wd.keys.toList(), reason: 'карточки — те же профили в том же порядке');
      for (final id in wd.keys) {
        expect(gd[id], wd[id], reason: 'карточка $id');
      }
      expect(got.keys.toSet(), want.keys.toSet());
    });
  }

  test('порядок профилей: названные — первыми, остальные — заводским порядком; битый файл — заводской', () async {
    SharedPreferences.setMockInitialValues({
      'psygames_playlists_override': jsonEncode({
        PlaylistFields.profiles: {},
        PlaylistFields.order: ['polyglot', 'nope', 'kids'],
      }),
    });
    final ids = [for (final p in byOrder(profiles.list, switcherOrder(await SharedState.open()))) p.id];
    expect(ids.take(2), ['polyglot', 'kids']);
    expect(ids.length, profiles.list.length);
    SharedPreferences.setMockInitialValues({'psygames_playlists_override': '{битый'});
    expect(switcherOrder(await SharedState.open()), isNull);
    SharedPreferences.setMockInitialValues({
      'psygames_playlists_override': jsonEncode({
        PlaylistFields.order: ['kids'],
      }),
    });
    expect(switcherOrder(await SharedState.open()), isNull, reason: 'без раздела «профили» состава нет вовсе');
  });

  test('ошибка кода и счётчик разблокировок — со страницы, остальное своё', () {
    final own = <String, Object?>{
      'activeId': 'women',
      'code': {'title': 'T', 'error': null, 'redeemed': 0},
    };
    expect(withSwitcherPageEvents(own, null), same(own));
    final m = withSwitcherPageEvents(own, {
      'activeId': 'kids',
      'code': {'title': 'X', 'error': 'Неверный код', 'redeemed': 2},
    });
    expect(m['activeId'], 'women');
    expect(m['code'], {'title': 'T', 'error': 'Неверный код', 'redeemed': 2});
  });

  Future<SharedState> openSheet(WidgetTester t, {required bool codeEntry}) async {
    final f = obj('test/fixtures/switcher_dart_ru.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('ru');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    final was = SwitcherFeed.codeEntry;
    SwitcherFeed.codeEntry = () => codeEntry;
    addTearDown(() => SwitcherFeed.codeEntry = was);
    t.view.physicalSize = const Size(780, 4000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (c) => TextButton(
              onPressed: () => openProfileSwitcher(c, 'http://127.0.0.1:1', state: state),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await t.tap(find.text('open'));
    for (var i = 0; i < 60 && find.byKey(const ValueKey('switcher-profile-kids')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    return state;
  }

  testWidgets('🔴 лист считает сам: без страницы — профили в порядке файла и кошельки; на iOS кнопки кода нет', (t) async {
    await openSheet(t, codeEntry: false);
    expect(ScreenUi.model('#switcher').value, isNull, reason: 'модель не от страницы');
    final kids = t.getTopLeft(find.byKey(const ValueKey('switcher-profile-kids')));
    final women = t.getTopLeft(find.byKey(const ValueKey('switcher-profile-women')));
    expect(kids.dx < women.dx || kids.dy < women.dy, isTrue, reason: 'порядок файла: дети раньше');
    expect(find.text('⭐ 4500'), findsOneWidget);
    expect(find.byKey(const ValueKey('switcher-code')), findsNothing, reason: 'App Store 3.1.1');
  });

  testWidgets('кнопка кода — где ввод кода есть', (t) async {
    await openSheet(t, codeEntry: true);
    expect(find.byKey(const ValueKey('switcher-code')), findsOneWidget);
  });

  testWidgets('своя модель листа: ошибка кода — со страницы; смена профиля — пересчёт без страницы', (t) async {
    final f = obj('test/fixtures/switcher_dart_ru.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('ru');
    Profiles.useForTest(profiles);
    ScreenUi.reset();
    final feed = SwitcherFeed(state);
    addTearDown(feed.close);
    Future<void> settle(bool Function() until) async {
      for (var i = 0; i < 60 && !until(); i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      }
    }

    await settle(() => feed.value != null);
    expect(feed.value!['activeId'], 'women');
    ScreenUi.model('#switcher').value = {
      'activeId': 'nzt48',
      'code': {'error': 'Неверный код', 'redeemed': 1},
    };
    await settle(() => (feed.value!['code'] as Map)['error'] != null);
    expect((feed.value!['code'] as Map)['error'], 'Неверный код');
    expect((feed.value!['code'] as Map)['redeemed'], 1);
    expect(feed.value!['activeId'], 'women', reason: 'активный — из памяти, не со страницы');
    await t.runAsync(() => state.set(Profiles.activeKey, 'kids'));
    await settle(() => feed.value!['activeId'] == 'kids');
    expect(feed.value!['activeId'], 'kids');
    expect((feed.value!['code'] as Map)['error'], 'Неверный код', reason: 'ошибка страницы держится до её снятия');
  });
}
