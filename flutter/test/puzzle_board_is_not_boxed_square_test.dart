import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ДОСКА НЕ ЗАПЕРТА В КВАДРАТНОЙ КОРОБКЕ (решение Дениса 25.09.2026).
///
/// Общий экран головоломок отводил доске КВАДРАТ со стороной `min(высота, ширина)`.
/// Для квадратных сеток (а их у Тэтхэма большинство) это ровно то, что нужно. Но
/// «Снос групп» после переворота лестницы стоит, а не лежит: холст движка 190×350
/// на второй ступени. В квадрате 382×382 такая доска масштабируется по ВЫСОТЕ
/// квадрата, и клетки выходят мельче, чем позволяет экран, а две трети ширины
/// остаются пустыми.
///
/// Проба спрашивает не «красиво ли», а ОТНОШЕНИЕ СТОРОН коробки: она обязана
/// совпадать с отношением холста движка. Совпало — значит пустых полей вокруг
/// доски нет ни по ширине, ни по высоте, и клетка получила всё, что можно.
///
/// ⚠️ И КОНТРОЛЬ С ДРУГОЙ СТОРОНЫ: у квадратного режима коробка обязана остаться
/// квадратной. Иначе «починка» просто меняла бы один перекос на другой.
///
/// 📍 ЧТО ДАЛА ПРАВКА, ЧИСЛАМИ (телефон 390×844):
///   до:    коробка 382×382, доска в ней 207×382, клетка 38,2 пт
///   после: коробка 349,6×644,0, клетка 64,4 пт — ПЛЮС 69 % на сторону
///   контроль «Судоку» 382×382 → 382×382, не изменилось
///
/// 📍 КОГО ЕЩЁ ЭТО КАСАЕТСЯ — ЗАМЕР ПО ВСЕМ 42 РЕЖИМАМ (первая ступень каждого,
/// холст из `psy_draw`): неквадратных ДЕСЯТЬ — Guess 1,60 (стоя) · Range 1,43 ·
/// Map 1,29 · Filling 1,25 · Inertia 1,20 · Sokoban 1,20 · Dominosa 1,18 ·
/// Undead 1,15 (стоя) · Slide 1,14 · Magnets 1,14. Остальные 32 квадратные, и
/// для них правка не меняет ничего (у квадратного холста оба множителя равны).
/// ⚠️ Замер по ПЕРВОЙ ступени и потому НЕ полон: у «Сноса групп» первая как раз
/// квадратная (5×5), а стоячими становятся следующие четыре.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  /// Телефон стоя — та геометрия, на которой живёт игра.
  Future<SharedState> phone(WidgetTester tester, Map<String, Object> prefs) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(prefs);
    return SharedState.open();
  }

  Future<Size> boardBox(WidgetTester tester, SharedState state, String mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath),
      ));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byKey(const Key('board')), findsOneWidget, reason: 'доска $mode не появилась');
    final paint = tester.widget<CustomPaint>(find.descendant(
      of: find.byKey(const Key('board')),
      matching: find.byType(CustomPaint),
    ));
    return paint.size;
  }

  testWidgets('🔴 стоячая доска «Сноса групп» получает СТОЯЧУЮ коробку', (tester) async {
    // Вторая ступень лестницы — `5x10c3s2`, холст движка 190×350.
    final state = await phone(tester, {
      'psygames_active_profile': 'nzt48',
      'psygames_puzzles_same game_level_nzt48': '2',
    });
    final box = await boardBox(tester, state, 'Same Game');
    final engineRatio = 350 / 190;          // высота к ширине у холста движка
    final boxRatio = box.height / box.width;
    // ignore: avoid_print
    print('КОРОБКА «Сноса групп» L2: ${box.width.toStringAsFixed(1)}×'
        '${box.height.toStringAsFixed(1)} · отношение ${boxRatio.toStringAsFixed(2)} '
        'при нужных ${engineRatio.toStringAsFixed(2)} · клетка '
        '${(box.height / 10).toStringAsFixed(1)} пт');
    expect((boxRatio - engineRatio).abs() < 0.03, isTrue,
        reason: 'коробка ${box.width.toStringAsFixed(1)}×${box.height.toStringAsFixed(1)} '
            'не по форме доски: отношение ${boxRatio.toStringAsFixed(2)} вместо '
            '${engineRatio.toStringAsFixed(2)} — доска масштабируется по меньшей стороне '
            'и клетки выходят мельче, чем позволяет экран');
  });

  testWidgets('🔴 контроль: у квадратного режима коробка ОСТАЛАСЬ квадратной', (tester) async {
    final state = await phone(tester, {
      'psygames_active_profile': 'nzt48',
      'psygames_puzzles_solo_level_nzt48': '1',
    });
    final box = await boardBox(tester, state, 'Solo');
    // ignore: avoid_print
    print('КОРОБКА «Судоку» L1: ${box.width.toStringAsFixed(1)}×${box.height.toStringAsFixed(1)}');
    expect((box.height / box.width - 1).abs() < 0.03, isTrue,
        reason: 'квадратная сетка получила неквадратную коробку '
            '${box.width.toStringAsFixed(1)}×${box.height.toStringAsFixed(1)}');
  });
}
