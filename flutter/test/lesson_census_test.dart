import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  /// игр» на 24.09.2026: 17 наших адресов + 37 режимов Тэтхэма (их считает
  /// `lesson_from_solver_test.dart`).
  const mustTeach = <String>[
    '/games/dots-connect',
    '/games/one-line',
    '/games/water-sort',
    '/games/ball-sort',
    '/games/nut-sort',
    '/games/cake-sort',
    '/games/pizza-sort',
    '/games/hanoi',
    '/games/tower-london',
    // Второй генератор — показ правила на примерах (`shell/demo_lesson.dart`),
    // для игр на реакцию, где решать нечего.
    '/games/stroop',
    '/games/flanker',
    '/games/go-no-go',
    '/games/choice-rt',
    '/games/simon',
    '/games/posner',
    '/games/stroop-emotional',
    '/games/switching-task',
  ];

  testWidgets('🔴 разбор не пропал ни у одной игры, где он уже был', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    final has = <String>[];
    final no = <String>[];
    final broke = <String, String>{};

    for (final e in HybridApp.native.entries) {
      // Развилки — не игры, разбирать там нечего.
      if (e.key.endsWith('-hub')) continue;
      // Головоломки Тэтхэма считает свой гейт: их разбор держит движок через ffi,
      // а он в `flutter test` не поднимается.
      if (e.key.contains('?')) continue;
      try {
        await tester.runAsync(() async {
          await tester.pumpWidget(MaterialApp(home: e.value(state)));
          for (var i = 0; i < 20; i++) {
            await tester.pump(const Duration(milliseconds: 30));
            await Future<void>.delayed(const Duration(milliseconds: 10));
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
    expect(has.length, greaterThanOrEqualTo(mustTeach.length),
        reason: 'учат ${has.length} из ${has.length + no.length}, а список требует ${mustTeach.length}');

    // ignore: avoid_print
    print('РАЗБОР: ${has.length} из ${has.length + no.length} наших экранов. '
        'Осталось (${no.length}): ${no.join(', ')}');
  });
}
