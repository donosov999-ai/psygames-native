import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗВИЛКА ПОКАЗЫВАЕТ ТО ЖЕ, ЧТО И ВЕБ, — ПРИ ЛЮБОМ ПРОФИЛЕ.
///
/// ПОЙМАНО 24.09.2026 отчётом Дениса: «в хабах лагает — то старый хаб без Тэтхэма,
/// то новый с Тэтхэмом». Мигания не было: составов было ДВА, и человек попадал то
/// на один, то на другой. Замер по профилю nzt48:
///   Сортировка 8 против 17 · Пространство 9 против 17 · Счёт 7 против 14
///   Поиск 8 против 13 · Судоку 5 против 12 · Головоломки 40 против 4.
/// Сорок режимов Тэтхэма давно разнесены по тематическим развилкам решениями
/// Дениса, а натив показывал заводской список.
///
/// ⚠️ ПРОБА ИДЁТ ПО ВСЕМ ПРОФИЛЯМ, А НЕ ПО ТОМУ, НА КОТОРОМ ПРОВЕРЯЛИ. Первый мой
/// замер охватил шесть профилей и не увидел `nzt48` — ровно тот, на котором играет
/// Денис. Считать надо все.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final bundle = jsonDecode(
    File('${Directory.current.path}/assets/hubs.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  setUpAll(() async => L.load('ru'));

  /// ⚠️ Развилка грузится асинхронно: она читает ассет и уровень КАЖДОЙ карточки
  /// из общей памяти. Без ожидания проба видит ноль карточек и врёт про состав.
  Future<void> bootHub(WidgetTester tester, SharedState state) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: HubScreen(
          state: state,
          hubRoute: '/games/sorting-hub',
          icon: Icons.filter_alt_outlined,
          gradient: const [Color(0xFFF7971E), Color(0xFF0EA5E9)],
        ),
      ));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 15));
        if (find.byType(ListView).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  test('🔴 раскладки выгружены для КАЖДОГО профиля файла состава', () {
    final web = jsonDecode(
      File('${Directory.current.path}/../frontend/src/constants/defaultPlaylists.json')
          .readAsStringSync(),
    ) as Map<String, dynamic>;
    final wantProfiles = (web['профили'] as Map<String, dynamic>).entries
        .where((e) => (e.value as Map<String, dynamic>)['хабы'] != null)
        .map((e) => e.key)
        .toSet();
    final got = (bundle['layouts'] as Map<String, dynamic>).keys.toSet();
    expect(wantProfiles.difference(got), isEmpty, reason: 'профили без раскладки');
    expect(got, isNotEmpty);
  });

  test('🔴 у каждого профиля состав развилки совпадает с веб-файлом по числу карточек', () {
    final web = jsonDecode(
      File('${Directory.current.path}/../frontend/src/constants/defaultPlaylists.json')
          .readAsStringSync(),
    ) as Map<String, dynamic>;
    final bad = <String>[];
    for (final e in (web['профили'] as Map<String, dynamic>).entries) {
      final hubs = (e.value as Map<String, dynamic>)['хабы'] as Map<String, dynamic>?;
      if (hubs == null) continue;
      final mine = (bundle['layouts'] as Map<String, dynamic>)[e.key] as Map<String, dynamic>;
      for (final h in hubs.entries) {
        final want = (h.value as List).length;
        final got = (mine[h.key] as List?)?.length ?? -1;
        if (want != got) bad.add('${e.key} ${h.key}: файл $want, у нас $got');
      }
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 «Сортировка» у профиля nzt48 показывает 17 карточек, а не 8', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await bootHub(tester, state);

    /*
     * ⚠️ СЧИТАТЬ ВИДИМЫЕ КАРТОЧКИ НЕЛЬЗЯ — И ЭТО НЕ ПРИДИРКА. Список ленивый:
     * `ListView` не строит то, что за краем экрана, и первый вариант этой пробы
     * насчитал ровно восемь — столько же, сколько в заводском списке. То есть
     * проба показала бы «дефект на месте» и при исправном коде.
     * Поэтому ищем карточку, которой в ЗАВОДСКОМ списке нет вовсе, — она может
     * прийти только из раскладки.
     */
    final onlyFromLayout = find.byKey(
      const ValueKey('hub-card-/games/puzzles?mode=Bridges'),
      skipOffstage: false,
    );
    await tester.scrollUntilVisible(onlyFromLayout, 200,
        scrollable: find.byType(Scrollable).first);
    expect(onlyFromLayout, findsOneWidget,
        reason: 'нативная развилка снова показывает заводской список, а не состав профиля');
  });

  testWidgets('🔴 сохранённый на устройстве состав ГЛАВНЕЕ выгруженного', (tester) async {
    // Так устроен веб: `профили[id].хабы` из сохранённого состава — первое звено.
    // Без этого правка состава редактором плейлистов до натива не доезжала бы.
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_playlists_override': jsonEncode({
        'профили': {
          'nzt48': {
            'хабы': {
              '/games/sorting-hub': ['/games/hanoi', '/games/tower-london'],
            },
          },
        },
      }),
    });
    final state = await SharedState.open();
    await bootHub(tester, state);
    // Сохранённый состав оставил ровно две карточки — значит его и взяли.
    expect(find.byKey(const ValueKey('hub-card-/games/hanoi'), skipOffstage: false), findsOneWidget);
    expect(find.byKey(const ValueKey('hub-card-/games/goods-sort'), skipOffstage: false), findsNothing,
        reason: 'взяли не сохранённый состав, а какой-то другой');
  });
}
