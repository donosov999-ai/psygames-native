import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/games/puzzles/undead_glyph.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «НЕЖИТЬ»: НА КЛАВИШАХ ТЕ ЖЕ ЧУДОВИЩА, ЧТО НА ДОСКЕ (отзыв 91967288, задача 36a019e5).
///
/// В вебе клавиши рисовали чудовищ движка с 23.09, во Flutter остались эмодзи 👻🧛🧟 — два разных
/// набора на одном экране. Проба: у «Нежити» на трёх клавишах рисунок движка с палитрой ЭТОГО
/// движка и именем для чтеца; у другой головоломки клавиши — по-прежнему текст.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, String mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath, seed: 1)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('digit1')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  test('клавиша → чудовище движка: 1 призрак, 2 вампир, 3 зомби (у движка 4)', () {
    expect([for (var k = 0; k <= 4; k++) undeadMonsterForKey(k)], [0, 1, 2, 4, 0]);
  });

  testWidgets('🔴 «Нежить»: три клавиши — рисунки движка с его палитрой и именем для чтеца, эмодзи нет', (tester) async {
    final semantics = tester.ensureSemantics();
    await boot(tester, 'Undead');
    for (final (v, name) in [(1, 'puzzleUndeadGhost'), (2, 'puzzleUndeadVampire'), (3, 'puzzleUndeadZombie')]) {
      final glyph = find.byKey(Key('undead-glyph-$v'));
      expect(glyph, findsOneWidget, reason: 'клавиша $v рисует чудовище');
      final w = tester.widget<UndeadMonsterGlyph>(glyph);
      expect(w.monster, undeadMonsterForKey(v));
      expect(w.palette.length, greaterThanOrEqualTo(9), reason: 'палитра движка «Нежити» дошла до клавиши (COL_VAMPIRE = 8)');
      expect(find.descendant(of: find.byKey(Key('digit$v')), matching: find.bySemanticsLabel(L.t(name))), findsOneWidget,
          reason: 'чтец называет чудовище');
    }
    for (final e in ['👻', '🧛', '🧟']) {
      expect(find.text(e), findsNothing, reason: 'эмодзи на клавишах больше нет');
    }
    semantics.dispose();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('другая головоломка с цифрами («Судоку Тэтхэма») — клавиши по-прежнему текстом', (tester) async {
    await boot(tester, 'Solo');
    expect(find.byType(UndeadMonsterGlyph), findsNothing);
    expect(find.descendant(of: find.byKey(const Key('digit1')), matching: find.text('1')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
