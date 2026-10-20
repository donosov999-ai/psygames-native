import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/friends_model.dart';
import 'package:psygames_flutter/shell/friends_screen.dart';
import 'package:psygames_flutter/shell/friends_service.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ДРУЗЬЯ»: ЛОГИКА И МОДЕЛЬ DART = ЭКРАН ВЕБА (задача d6a60b02, вариант Б).
///
/// Эталоны выгружает `friends-dart-model.test.tsx`: настоящий экран веба, сервер подменён ответами случая,
/// действия — те, что шлёт оболочка. Здесь `FriendsController` получает те же ответы и те же действия, и
/// модель обязана совпасть целиком. Форматы очков сверяются с печатью `FORMAT` веба на неудобных числах.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = FriendsData(j: obj('assets/friends.json'), theme: obj('assets/web_theme.json'));
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());

  for (final name in ['loading', 'offline', 'noFriends', 'rows', 'nobodyAdd', 'added', 'sending']) {
    test('🔴 friends_dart_$name: та же логика и та же модель', () async {
      final f = obj('test/fixtures/friends_dart_$name.json');
      final want = (f['model']! as Map).cast<String, Object?>();
      final language = f['language']! as String;
      lang(language);
      final c = FriendsController(_Fake((f['server']! as Map).cast<String, Object?>()), data);
      unawaited(c.load());
      await _settle();
      for (final a in (f['acts']! as List).cast<List<Object?>>()) {
        unawaited(c.act(a.first! as String, a.sublist(1)));
        await _settle();
      }
      // Профиль образца — nzt48 со светлой темой: акцент и палитра те же, что у веба.
      final dart = friendsModelFrom(data, c.ui, language: language, primary: want['primary']! as String, dark: false);
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
      }
      expect(got.keys.toSet(), want.keys.toSet());
    });
  }

  testWidgets('🔴 экран живёт на Dart: вход — код и круг с сервера; набор — в поле; «Добавить» — итог; страница не нужна', (t) async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    lang('ru');
    Profiles.useForTest(Profiles.parse(File('assets/profiles.json').readAsStringSync()));
    AppLook.useForTest(obj('assets/look.json').cast<String, dynamic>());
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    final js = <String>[];
    ScreenUi.run = (s) async => js.add(s);
    addTearDown(() => ScreenUi.run = null);
    final server = _Fake({
      'myCode': 'K7Q2ZP',
      'friends': [
        {'id': 'f1', 'name': 'Валя', 'since': '2026-10-01'},
      ],
      'top': {'*': <Object?>[]},
      'add': {'kind': 'self'},
    });
    t.view.physicalSize = const Size(780, 4000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FriendsScreen(state: state, server: server),
        ),
      ),
    );
    enterFriends();
    Future<void> settle(bool Function() until) async {
      for (var i = 0; i < 60 && !until(); i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await t.pump();
      }
    }

    await settle(() => find.text('K7Q 2ZP').evaluate().isNotEmpty);
    expect(find.text('K7Q 2ZP'), findsOneWidget);
    expect(find.textContaining('Валя'), findsWidgets);
    expect(ScreenUi.model(FriendsScreen.route).value, isNull, reason: 'модель не от страницы');
    await t.enterText(find.byType(TextField), ' k7q-2zp');
    await settle(() => find.text('K7Q2ZP').evaluate().isNotEmpty);
    expect(find.text('K7Q2ZP'), findsOneWidget, reason: 'код в поле — нормализован');
    // Поле встаёт сразу (слушатель модели), кнопка оживает следующим кадром.
    await t.pump();
    await t.tap(find.byKey(const ValueKey('friends-add-btn')));
    await settle(() => find.text(L.t('friendsSelfCode')).evaluate().isNotEmpty);
    expect(find.text(L.t('friendsSelfCode')), findsOneWidget);
    expect(js.where((s) => !s.contains('.back(')), isEmpty, reason: 'вебу ничего, кроме «назад»');
  });

  test('очко — та же печать, что FORMAT веба, на неудобных числах', () {
    final kinds = {for (final g in data.games) g['id']: g['format']! as String};
    for (final e in (data.j['samples']! as Map).entries) {
      for (final pair in (e.value as List)) {
        final p = pair as List;
        expect(friendsScore(kinds[e.key]!, p[0] as num), p[1], reason: '${e.key}(${p[0]})');
      }
    }
  });

  test('верхний регистр — как у JS: «ß» → «SS»', () => expect(jsUpper('Straße'), 'STRASSE'));

  test('тёмная тема — свои цвета ошибки и успеха', () {
    expect(data.paletteColor(true, 'error'), isNot(data.paletteColor(false, 'error')));
  });
}

Future<void> _settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

/// Сервер случая: те же ответы, что подставлял веб; `pending` — не отвечает никогда.
class _Fake implements FriendsServer {
  _Fake(this.s);
  final Map<String, Object?> s;

  Future<T> _answer<T>(Object? v, T Function(Object? v) parse) => v == 'pending' ? Completer<T>().future : Future.value(parse(v));

  @override
  Future<String?> myInviteCode() => _answer(s['myCode'], (v) => v as String?);

  @override
  Future<List<Friend>?> list() => _answer(
    s['friends'],
    (v) => v == null
        ? null
        : [
            for (final x in (v as List).cast<Map<String, Object?>>())
              Friend(id: x['id']! as String, name: x['name']! as String, since: x['since']! as String),
          ],
  );

  @override
  Future<List<FriendScore>?> top(String gameId) {
    final t = (s['top']! as Map).cast<String, Object?>();
    return _answer(
      t.containsKey(gameId) ? t[gameId] : t['*'],
      (v) => v == null
          ? null
          : [
              for (final x in (v as List).cast<Map<String, Object?>>())
                FriendScore(
                  id: x['id']! as String,
                  name: x['name']! as String,
                  score: x['score']! as num,
                  updatedAt: x['updatedAt']! as String,
                  isMe: x['isMe'] == true,
                ),
            ],
    );
  }

  @override
  Future<FriendAdd> add(String code) => _answer(s['add'], (v) {
    final m = (v! as Map).cast<String, Object?>();
    final fr = (m['friend'] as Map?)?.cast<String, Object?>();
    return FriendAdd(m['kind']! as String, id: fr?['id'] as String?, name: fr?['name'] as String?, max: m['max'] as num?);
  });

  @override
  Future<bool> remove(String friendId) => _answer(s['remove'], (v) => v == true);
}
