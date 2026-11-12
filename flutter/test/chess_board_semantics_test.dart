import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_common/board.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// ДОСКА ДЛЯ ЭКРАННОГО ЧТЕЦА (VoiceOver/TalkBack) — задача 6fbbff14.
/// Веб подписывал клетки и фигуры, нативная доска была немой.
void main() {
  setUpAll(() async => L.load('ru'));

  Future<void> boardOf(
    WidgetTester t, {
    bool masked = false,
    Set<int> revealed = const {},
    String Function(int)? squareName,
    void Function(int)? onTap,
  }) async {
    await t.pumpWidget(
      MaterialApp(
        home: Center(
          child: ChessBoardView(
            side: 320,
            pieces: const {
              60: BoardPiece('n', white: true), // e1 при белых внизу
              4: BoardPiece('k', white: false), // e8
            },
            masked: masked,
            revealed: revealed,
            squareName: squareName,
            onTapSquare: onTap,
          ),
        ),
      ),
    );
  }

  String label(WidgetTester t, int index) =>
      t.getSemantics(find.byKey(Key('sq-$index'))).label;

  testWidgets('🔴 клетка называет поле и фигуру: «e1, белый конь»', (t) async {
    final h = t.ensureSemantics();
    await boardOf(t, onTap: (_) {});
    expect(label(t, 60), 'e1, ${L.t('chessPcWN')}');
    expect(label(t, 4), 'e8, ${L.t('chessPcBK')}');
    expect(label(t, 0), 'a8', reason: 'пустая клетка — только поле');
    h.dispose();
  });

  testWidgets(
    '🔴 «Доска в уме»: скрытую маской фигуру чтец не называет, открытую — называет',
    (t) async {
      final h = t.ensureSemantics();
      await boardOf(t, masked: true, onTap: (_) {});
      expect(label(t, 60), 'e1');
      await boardOf(t, masked: true, revealed: const {60}, onTap: (_) {});
      expect(label(t, 60), 'e1, ${L.t('chessPcWN')}');
      h.dispose();
    },
  );

  testWidgets(
    'доска, перевёрнутая к чёрным, подписывает по своему имени поля',
    (t) async {
      final h = t.ensureSemantics();
      await boardOf(t, squareName: (i) => 'x$i');
      expect(label(t, 60), 'x60, ${L.t('chessPcWN')}');
      h.dispose();
    },
  );

  testWidgets('клетка с нажатием — кнопка, без нажатия — нет', (t) async {
    final h = t.ensureSemantics();
    await boardOf(t, onTap: (_) {});
    expect(
      t.getSemantics(find.byKey(const Key('sq-0'))).flagsCollection.isButton,
      isTrue,
    );
    await boardOf(t);
    expect(
      t.getSemantics(find.byKey(const Key('sq-0'))).flagsCollection.isButton,
      isFalse,
    );
    h.dispose();
  });
}
