import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_matrix/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Партия играется ТЫЧКАМИ по клеткам, а не вызовом правил.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: MemoryMatrixScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('🔴 уровень проходится тычками: показ, пауза, отметки', (tester) async {
    await boot(tester);
    expect(find.text('Матрица памяти'), findsOneWidget);

    await tester.tap(find.text('Показать'));
    await tester.pump();

    // Клетки, которые горят прямо сейчас, — их и надо отметить.
    final lit = <int>[];
    for (var i = 0; i < 36; i++) {
      final f = find.byKey(Key('клетка$i'));
      if (f.evaluate().isEmpty) continue;
      final m = tester.widget<Material>(
          find.ancestor(of: f, matching: find.byType(Material)).first);
      final scheme = Theme.of(tester.element(f)).colorScheme;
      if (m.color == scheme.primary) lit.add(i);
    }
    expect(lit, isNotEmpty, reason: 'на показе клетки обязаны гореть');

    // Ждём конца показа и паузы.
    await tester.pump(const Duration(milliseconds: 2500));
    for (final c in lit) {
      await tester.tap(find.byKey(Key('клетка$c')));
      await tester.pump();
    }
    expect(find.text('Следующий уровень'), findsOneWidget,
        reason: 'отмечены ровно горевшие клетки — это победа');
  });

  testWidgets('🔴 до конца показа клетки не нажимаются', (tester) async {
    await boot(tester);
    await tester.tap(find.text('Показать'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('клетка0')));
    await tester.pump();
    expect(find.text('Следующий уровень'), findsNothing);
    await tester.pump(const Duration(milliseconds: 2500));
  });

  testWidgets('🔴 уход с экрана гасит таймер', (tester) async {
    await boot(tester);
    await tester.tap(find.text('Показать'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 5));
  });
}
