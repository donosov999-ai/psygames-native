import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/hub_routes.dart';

/// 🔴 ПЕРЕПИСЬ РАЗБОРА: КТО ИЗ НАШИХ ЭКРАНОВ УЖЕ УМЕЕТ УЧИТЬ.
///
/// Цель Дениса 24.09.2026: «решатель и учитель для наших игр, чтобы был у всех
/// хабов и игр». Считать это по одной пробе на игру — сто проб руками, ровно то,
/// от чего он и отказался. Поэтому проба ОБХОДИТ карту нативных адресов
/// (`HybridApp.native`) и сама поднимает каждый экран.
///
/// ⚠️ Мерится ПОВЕДЕНИЕ, а не исходник: экран поднимается и у него ищется кнопка
/// `game-lesson`. Чтение файлов глазами показало бы `onLesson:` и там, где он
/// приходит `null` и кнопки нет.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  /// 🔴 КТО УЖЕ УЧИТ — ПОИМЁННО. Список только растёт: игра, у которой разбор
  /// однажды появился, потерять его молча не может. Счёт по цели «разбор у всех
  /// игр» на 24.09.2026: 50 наших адресов из 50 + 37 режимов Тэтхэма (их считает
  /// `lesson_from_solver_test.dart`). Осталось трое: маджонг, товары и «Лица и
/// имена» — им нужен не показ правила, а свой решатель или описание черты.
  const mustTeach = <String>[
    '/games/dots-connect',
    '/games/one-line',
    '/games/digit-span',
    '/games/memory-matrix',
    '/games/schulte',
    '/games/math-slider',
    '/games/object-tracker',
    '/games/quick-count',
    '/games/pattern',
    '/games/math-sprint',
    '/games/number-bonds',
    '/games/ospan',
    '/games/stroop',
    '/games/flanker',
    '/games/simon',
    '/games/sudoku',
    '/games/sudoku-samurai',
    '/games/sudoku-fractal',
    '/games/sudoku-fractal-deep',
    '/games/go-no-go',
    '/games/mental-rotation',
    '/games/spatial-span',
    '/games/spatial-lab',
    '/games/water-sort',
    '/games/ball-sort',
    '/games/nut-sort',
    '/games/cake-sort',
    '/games/pizza-sort',
    '/games/hanoi',
    '/games/tower-london',
    '/games/choice-rt',
    '/games/stop-signal',
    '/games/posner',
    '/games/stroop-emotional',
    '/games/switching-task',
    '/games/targets',
    '/games/inhibition',
    '/games/memory-palace',
    '/games/rmet',
    '/games/mnemonics',
    '/games/ant',
    '/games/iowa',
    '/games/prl',
    '/games/bart',
    '/games/wcst',
    '/games/cpt',
    '/games/proofreading',
    '/games/word-pairs',
    '/games/mahjong',
    '/games/goods-sort',
    '/games/faces-names',
    '/games/anagrams',
    '/games/anagrams?mode=classic',
    '/games/anagrams?mode=all',
    '/games/anagrams?mode=cross',
    '/games/anagrams?mode=square',
    '/games/kids-find',
    '/games/submarines',
    '/games/monster-traits?mode=missing',
    '/games/search-runner',
    '/games/number-run',
    // Экраны «Поиска», у которых разбор был, но в храповик они не попали (замер 01.10.2026).
    '/games/find-differences',
    '/games/sdmt',
    '/games/set-game',
    '/games/visual-search',
  ];


  /// 🔴 БЕЗ РАЗБОРА — ПО РЕШЕНИЮ ВЕБ-РЕЕСТРА, А НЕ СВОИМ СПИСКОМ. Практики ведут
  /// сами (дыхание, гимнастика для глаз), «Пауза» — хаб практик, не игра: у них в
  /// вебе разбора нет с причиной поимённо (`БЕЗ_РАЗБОРА` в
  /// `frontend/src/__tests__/lesson-everywhere.test.ts`). Список читается оттуда,
  /// чтобы решение жило в одном месте: снимут исключение в вебе — нативная
  /// перепись потребует разбор и здесь.
  final noLessonByWeb = () {
    final web = File('../frontend/src/__tests__/lesson-everywhere.test.ts').readAsStringSync();
    final start = web.indexOf('const БЕЗ_РАЗБОРА');
    final block = web.substring(start, web.indexOf('};', start));
    return RegExp(r"^\s*'?([\w-]+)'?\s*:", multiLine: true).allMatches(block).map((m) => m.group(1)!).toSet();
  }();

  test('исключения веб-реестра прочитаны — иначе перепись молча требовала бы разбор от практик', () {
    expect(noLessonByWeb, containsAll(['pause', 'breathing', 'eye-gym']));
  });

  testWidgets('🔴 разбор не пропал ни у одной игры, где он уже был', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    final has = <String>[];
    final no = <String>[];
    final broke = <String, String>{};

    for (final e in HybridApp.native.entries) {
      // Развилки — не игры, разбирать там нечего. Что такое развилка — одно
      // определение на все пробы: `test/support/hub_routes.dart` (по реестру, а не
      // по имени на `-hub`: две развилки из 13 называются иначе).
      if (isHubRoute(e.key)) continue;
      // Головоломки Тэтхэма считает свой гейт: их разбор держит движок через ffi,
      // а он в `flutter test` не поднимается.
      //
      // 🔴 НО НЕ ВСЁ С `?` — ТЭТХЭМ. Режимы анаграмм (`/games/anagrams?mode=…`) —
      // четыре самостоятельные игры с разбором на Dart, без движка. Пропуская их
      // вместе с Тэтхэмом, перепись писала «51 из 51», не глядя на три игры, у
      // которых разбора не было вовсе (замер 30.09.2026, задача 17d894f7). Теперь
      // они считаются, как обычные экраны.
      // Так же считается режим «Найди признак» — «Кого не хватает»: свой экран на Dart.
      if (e.key.contains('?') &&
          !e.key.startsWith('/games/anagrams?') &&
          !e.key.startsWith('/games/monster-traits?')) {
        continue;
      }
      // 🔴 `/games/puzzles` — НЕ ИГРА, а один экран на 42 режима: разбор там
      // живёт у РЕЖИМА, и считать его как «экран без разбора» значит держать в
      // остатке строку, которую нечем закрыть. Так же устроен веб-реестр
      // (`frontend/src/__tests__/lesson-everywhere.test.ts`, список БЕЗ_РАЗБОРА).
      if (e.key == '/games/puzzles') continue;
      if (noLessonByWeb.contains(e.key.replaceFirst('/games/', '').split('?').first)) continue;
      try {
        await tester.runAsync(() async {
          await tester.pumpWidget(MaterialApp(home: e.value(state)));
          for (var i = 0; i < 20; i++) {
            await tester.pump(const Duration(milliseconds: 30));
            await Future<void>.delayed(const Duration(milliseconds: 10));
            if (e.key == '/games/sudoku-fractal-deep' &&
                find.byKey(const Key('deep-start')).evaluate().isNotEmpty) {
              // New first-entry settings require the user's explicit Start.
              await tester.pumpAndSettle();
              await tester.tap(find.byKey(const Key('deep-start')));
              await tester.pumpAndSettle();
            }
            if (find.byKey(const Key('game-lesson')).evaluate().isNotEmpty) break;
          }
        });
        await tester.pump();
        (find.byKey(const Key('game-lesson')).evaluate().isNotEmpty ? has : no).add(e.key);
      } catch (err) {
        broke[e.key] = '$err'.split('\n').first;
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    }

    // Экран, который вообще не поднимается, — отдельная беда, и молчать о ней
    // нельзя: в переписи он выглядел бы просто «без разбора».
    expect(broke, isEmpty, reason: 'экраны не поднялись: $broke');

    final lost = mustTeach.where(no.contains).toList();
    expect(lost, isEmpty, reason: 'разбор пропал у: ${lost.join(', ')}');

    // 🔴 ЦЕЛЬ ВЗЯТА 24.09.2026: учат ВСЕ. Поэтому проба требует уже не «не меньше
    // прежнего», а ПУСТОЙ остаток: новый экран без разбора красит гейт сразу, а
    // не ждёт, пока кто-нибудь вспомнит дописать его в список.
    expect(no, isEmpty, reason: 'без разбора остались: ${no.join(', ')}');
    expect(has.length, greaterThanOrEqualTo(mustTeach.length),
        reason: 'учат ${has.length} из ${has.length + no.length}, а список требует ${mustTeach.length}');

    // ignore: avoid_print
    print('РАЗБОР: ${has.length} из ${has.length + no.length} наших экранов. '
        'Осталось (${no.length}): ${no.join(', ')}');
    // Полный список — чтобы следующий заход не собирал его руками.
    // ignore: avoid_print
    print('СПИСОК: ${has.join(' ')}');
  });
}
