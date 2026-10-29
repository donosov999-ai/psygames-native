import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
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
/// память, и Dart собирает модель сам.
///
/// 🔴 Сторож монетизации (d5e5814a, решение Дениса 21.10.2026): на ru и en, на iOS и Android в модели нет
/// замка, «Скоро», цены, «/год», кода, Telegram и «PRO». Слова — `test/fixtures/no_monetization_words.json`
/// (их выгружает веб-проба `profile-switcher-host-model.test.tsx`, тот же список у обоих).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = SwitcherData(j: obj('assets/switcher.json'));
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
      final dart = switcherModelFrom(state, data, profiles: profiles);
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
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

  for (final language in ['ru', 'en']) {
    test('$language: в листе нет неподставленных шаблонов «{…}» (ODV999 «Все игры ({n})», 09c3ded8)', () async {
      SharedPreferences.setMockInitialValues({'language': language});
      lang(language);
      final m = switcherModelFrom(await SharedState.open(), data, profiles: profiles);
      final odv = (m['profiles']! as List).cast<Map>().firstWhere((p) => p['id'] == 'odv999');
      expect(odv['desc'], contains('${profiles.publicGameCount}'));
      expect(jsonEncode(m), isNot(contains('{n}')));
    });
  }

  group('🔴 сторож монетизации (d5e5814a)', () {
    final words = [
      for (final w in (obj('test/fixtures/no_monetization_words.json')['patterns']! as List).cast<Map>())
        RegExp(w['source'] as String, caseSensitive: w['caseSensitive'] as bool, unicode: true),
    ];

    /// Все строки модели с путём — кроме значков, цветов и id: там слов человек не видит. Значок 🔒 — везде.
    List<String> sold(Object? v, [String at = 'switcher']) {
      if (v is String) {
        final hidden = RegExp(r'(^|\.)(badge|color|id|activeId)$').hasMatch(at);
        return [
          if (v.contains('🔒')) '$at: 🔒',
          if (!hidden)
            for (final re in words)
              if (re.hasMatch(v)) '$at: ${re.pattern} ← $v',
        ];
      }
      if (v is List) return [for (final (i, x) in v.indexed) ...sold(x, '$at[$i]')];
      if (v is Map) return [for (final e in v.entries) ...sold(e.value, '$at.${e.key}')];
      return const [];
    }

    test('сторож видит каждый признак продажи — проверка самого сторожа', () {
      const samples = ['Reaction PRO', 'Скорочтение PRO', '990 ₽ / год', r'$9.99/year', 'Скоро', 'Coming soon',
        'Enter access code', 'Ввести код доступа', 'Купить в Telegram', 'Годовой доступ'];
      expect([for (final v in samples) if (sold({'desc': v}).isEmpty) v], isEmpty);
      expect(sold({'badge': '🔒'}), hasLength(1));
      expect(sold({'name': 'Скорочтение', 'desc': 'Reaction · Students · Programs'}), isEmpty);
    });

    for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
      for (final language in ['ru', 'en']) {
        test('${platform.name}/$language: в модели нет замка, «Скоро», цены, «/год», кода, Telegram и «PRO»', () async {
          debugDefaultTargetPlatformOverride = platform;
          addTearDown(() => debugDefaultTargetPlatformOverride = null);
          SharedPreferences.setMockInitialValues({'language': language});
          lang(language);
          final m = switcherModelFrom(await SharedState.open(), data, profiles: profiles);
          expect((m['profiles']! as List).length, profiles.list.length, reason: 'все профили');
          expect(sold(m), isEmpty);
          // Мутация: замок одному профилю — сторож обязан покраснеть.
          final locked = jsonDecode(jsonEncode(m)) as Map;
          ((locked['profiles'] as List).first as Map)['badge'] = '🔒';
          expect(sold(locked), isNotEmpty);
        });
      }
    }
  });

  Future<SharedState> openSheet(WidgetTester t) async {
    final f = obj('test/fixtures/switcher_dart_ru.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('ru');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
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

  testWidgets('🔴 лист считает сам: без страницы — профили в порядке файла и кошельки; кода и замка нет', (t) async {
    await openSheet(t);
    expect(ScreenUi.model('#switcher').value, isNull, reason: 'модель не от страницы');
    final kids = t.getTopLeft(find.byKey(const ValueKey('switcher-profile-kids')));
    final women = t.getTopLeft(find.byKey(const ValueKey('switcher-profile-women')));
    expect(kids.dx < women.dx || kids.dy < women.dy, isTrue, reason: 'порядок файла: дети раньше');
    expect(find.text('⭐ 4500'), findsOneWidget);
    expect(find.byKey(const ValueKey('switcher-code')), findsNothing);
    expect(find.byKey(const ValueKey('switcher-profile-odv999')), findsOneWidget, reason: 'все профили открыты');
  });

  testWidgets('своя модель листа: модель страницы не нужна; смена профиля — пересчёт без страницы', (t) async {
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
    ScreenUi.model('#switcher').value = {'activeId': 'nzt48'};
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    expect(feed.value!['activeId'], 'women', reason: 'активный — из памяти, не со страницы');
    await t.runAsync(() => state.set(Profiles.activeKey, 'kids'));
    await settle(() => feed.value!['activeId'] == 'kids');
    expect(feed.value!['activeId'], 'kids');
  });
}
