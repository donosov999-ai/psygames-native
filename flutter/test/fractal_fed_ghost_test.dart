import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КЛЕТКА-ВХОД КОРНЯ «ПРОСВЕЧИВАЕТ» СЛЕДУЮЩИЙ УРОВЕНЬ (отзыв 170e9f46, 10.10: «должны были
/// просвечивать следующий уровень»; задача f141bd18).
///
/// Перенос 02.10 взял у кормящей клетки только серый фон: центр каждого квадрата корня выглядел
/// пустой клеткой, а касание по нему не делало ничего. Веб (sudoku-fractal.tsx, `fedRing`, `fedTag`,
/// `ghost`) рисует рамку, номер сетки и миниатюру того, что идёт под клеткой, и ведёт касанием в
/// сетку. Проба — нажатиями на живом экране.
void main() {
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_fractal_level_nzt48': '1'});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  /// Сетка призрака из живого рисовальщика — то, что видит человек, а не модель.
  List<List<int>> ghostGrid(WidgetTester tester, String cell) {
    final paint = tester.widget<CustomPaint>(
        find.descendant(of: find.byKey(Key('fed_ghost_$cell')), matching: find.byType(CustomPaint)));
    return ((paint.painter as dynamic).ghost.grid as List<List<int>>);
  }

  testWidgets('🔴 у каждой из девяти кормящих клеток — пунктир, номер своей сетки и призрак', (tester) async {
    await boot(tester);
    for (var i = 0; i < 9; i++) {
      final at = rootCellForChild(i);
      final cell = 'root_${at[0]}_${at[1]}';
      expect(find.byKey(Key('fed_ring_$cell')), findsOneWidget, reason: 'сетка ${i + 1}: рамки нет');
      expect(tester.widget<Text>(find.byKey(Key('fed_tag_$cell'))).data, '${i + 1}', reason: 'номер сетки');
      expect(find.byKey(Key('fed_ghost_$cell')), findsOneWidget, reason: 'сетка ${i + 1}: призрака нет');
    }
    expect(find.byKey(const Key('fed_ring_root_0_0')), findsNothing, reason: 'обычная клетка — без рамки');
    expect(find.byKey(const Key('fed_ring_root_4_3')), findsNothing, reason: 'соседняя с центром — без рамки');
  });

  testWidgets('🔴 касание кормящей клетки ведёт в её сетку, призрак показывает поставленную там цифру',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await boot(tester);
    final at = rootCellForChild(4);
    final cell = 'root_${at[0]}_${at[1]}';
    final before = ghostGrid(tester, cell).expand((r) => r).where((v) => v != 0).length;

    await tap(tester, find.byKey(Key(cell)));
    expect(find.byKey(const Key('root_0_0')), findsNothing, reason: 'касание открыло сетку');
    expect(find.bySemanticsLabel(RegExp('${RegExp.escape(L.t('fractalChildN'))} 5')), findsWidgets,
        reason: 'открылась именно пятая сетка — та, что кормит центр');

    // Любая цифра в первую пустую клетку сетки — призрак обязан её показать.
    var placed = false;
    for (var r = 0; r < 9 && !placed; r++) {
      for (var c = 0; c < 9 && !placed; c++) {
        final f = find.byKey(Key('cell_${r}_$c'));
        final text = find.descendant(of: f, matching: find.byType(Text));
        if (text.evaluate().isNotEmpty && (tester.widget<Text>(text.first).data ?? '').isNotEmpty) continue;
        await tap(tester, f);
        await tap(tester, find.byKey(const Key('digit5')));
        placed = true;
      }
    }
    expect(placed, isTrue);
    await tap(tester, find.byTooltip('На карту'));
    final after = ghostGrid(tester, cell).expand((r) => r).where((v) => v != 0).length;
    expect(after, before + 1, reason: 'поставленная внизу цифра видна в призраке');
    semantics.dispose();
  });
}
