import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/pet_model.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/training_history.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПИТОМЕЦ»: МОДЕЛЬ DART = МОДЕЛЬ ВЕБА НА ТОМ ЖЕ ХРАНИЛИЩЕ (задача d6a60b02, вариант Б).
///
/// Эталоны выгружает веб-проба `pet-dart-model.test.tsx`: настоящий экран с провайдерами профиля,
/// темы, языка и уровня игрока на подготовленном хранилище при замороженных часах — модель и всё
/// хранилище после монтирования. Здесь то же хранилище кладётся в общую память, и Dart собирает модель
/// сам. Реплика в пузыре случайна у обоих — её Dart сверяет с пулом языка.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  Map<String, Object?> obj(String f) => (json(f)! as Map).cast<String, Object?>();
  final data = PetData(
    j: obj('assets/pet.json'),
    ladder: [for (final l in (obj('assets/home_inputs.json')['ladder']! as List)) (l as Map).cast<String, Object?>()],
    games: [for (final g in (obj('assets/catalog.json')['games']! as List)) (g as Map).cast<String, Object?>()],
    profilesJson: obj('assets/profiles.json'),
    legacy: StatsRules.fromJson(obj('assets/stats_rules.json')).legacyGameTypes,
  );
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());
  Wall wallOf(int offsetMinutes) =>
      (ms) => DateTime.fromMillisecondsSinceEpoch(ms - offsetMinutes * 60000, isUtc: true);

  for (final name in ['fresh', 'rich', 'fed']) {
    test('🔴 pet_dart_$name: модель Dart = модель веба на том же хранилище и часах', () async {
      final f = obj('test/fixtures/pet_dart_$name.json');
      final want = (f['model']! as Map).cast<String, Object?>();
      final language = f['language']! as String;
      SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
      final state = await SharedState.open();
      lang(language);
      final pool = ((data.j['simpleLines']! as Map)[language] as List).cast<String>();
      expect(pool, contains(want['bubble']), reason: 'реплика веба — из того же пула');
      final dart = petModelFrom(
        state,
        data,
        profiles: profiles,
        now: (f['now']! as num).toInt(),
        wall: wallOf((f['tzOffsetMinutes']! as num).toInt()),
        language: language,
        bubble: want['bubble']! as String,
      );
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
      }
      expect(got.keys.toSet(), want.keys.toSet());
    });
  }

  test('реплика пузыря — из пула языка, не повторяет последнюю; нет языка — английская', () {
    final ru = ((data.j['simpleLines']! as Map)['ru'] as List).cast<String>();
    final first = pickPetBubble(data, 'ru', random: Random(1));
    expect(ru, contains(first));
    for (var i = 0; i < 20; i++) {
      expect(pickPetBubble(data, 'ru', random: Random(i), last: first), isNot(first));
    }
    final en = ((data.j['simpleLines']! as Map)['en'] as List).cast<String>();
    expect(en, contains(pickPetBubble(data, 'xx', random: Random(2))));
  });

  test('нажатия страницы поверх своей модели: действие, лакомство, реплика, подпись запертого облика', () {
    final own = <String, Object?>{
      'bubble': 'своя',
      'portrait': {'state': 'idle', 'specs': {'idle': 1}, 'treat': null},
      'skins': [
        {'id': 'cat', 'label': 'Кот'},
        {'id': 'robot', 'label': 'Робот', 'locked': true},
      ],
      'total': '5',
    };
    expect(withPetPageEvents(own, null), same(own));
    final m = withPetPageEvents(own, {
      'bubble': 'Ням!',
      'portrait': {'state': 'eat', 'treat': {'emoji': '🐟'}},
      'skins': [
        {'id': 'robot', 'label': 'Откроется с 8'},
      ],
      'total': '999',
    });
    expect(m['bubble'], 'Ням!');
    expect(m['portrait'], {'state': 'eat', 'specs': {'idle': 1}, 'treat': {'emoji': '🐟'}});
    expect(m['skins'], [
      {'id': 'cat', 'label': 'Кот'},
      {'id': 'robot', 'label': 'Откроется с 8', 'locked': true},
    ]);
    expect(m['total'], '5', reason: 'своё остаётся своим');
  });

  testWidgets('🔴 экран считает сам: без страницы — имя и кормление из памяти; запись → пересчёт; нажатие страницы — поверх', (t) async {
    final f = obj('test/fixtures/pet_dart_rich.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('ru');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    final off = (f['tzOffsetMinutes']! as num).toInt();
    PetScreen.now = () => (f['now']! as num).toInt();
    PetScreen.wall = wallOf(off);
    addTearDown(() {
      PetScreen.now = () => DateTime.now().millisecondsSinceEpoch;
      PetScreen.wall = deviceWall;
    });
    t.view.physicalSize = const Size(780, 2400);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: PetScreen(origin: 'http://127.0.0.1:1', state: state))));
    Future<void> settle(bool Function() until) async {
      for (var i = 0; i < 60 && !until(); i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await t.pump();
      }
    }

    await settle(() => find.text('Мурзик').evaluate().isNotEmpty);
    expect(ScreenUi.model(PetScreen.route).value, isNull, reason: 'модель не от страницы');
    expect(find.text('Мурзик'), findsWidgets);
    final feed = (f['model']! as Map)['feed'] as Map;
    expect(find.text(feed['label'] as String), findsOneWidget);
    // Страница покормила — записала отметку дня: экран пересчитался сам.
    final day = PetScreen.wall(PetScreen.now());
    await t.runAsync(() => state.set('psygames_pet_fed', '${day.year}-${day.month}-${day.day}'));
    await settle(() => find.textContaining(L.t('petFedToday')).evaluate().isNotEmpty);
    expect(find.textContaining(L.t('petFedToday')), findsOneWidget);
    // Реплика после нажатия — со страницы, поверх своей модели.
    ScreenUi.model(PetScreen.route).value = {'bubble': 'Ням-ням!', 'portrait': {'state': 'eat'}};
    await settle(() => find.text('Ням-ням!').evaluate().isNotEmpty);
    expect(find.text('Ням-ням!'), findsOneWidget);
    expect(find.text('Мурзик'), findsWidgets, reason: 'своё остаётся своим');
  });
}
