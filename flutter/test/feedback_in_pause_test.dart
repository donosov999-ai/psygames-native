import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';

void main() {
  setUpAll(() => L.load('en'));
  tearDown(() => GameExit.feedback = null);

  testWidgets('feedback opens above pause; closing it preserves the game', (tester) async {
    var moves = 0;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      GameExit.feedback = () => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => Scaffold(body: Center(child: TextButton(
          onPressed: () => Navigator.of(context).pop(), child: const Text('Close report'),
        ))),
      ));
      return GameShell(title: 'Game', field: (_, _) => TextButton(
        onPressed: () => moves++, child: const Text('Move'),
      ));
    })));
    await tester.tap(find.text('Move'));
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pause-feedback')));
    await tester.pumpAndSettle();
    expect(find.text('Close report'), findsOneWidget);
    await tester.tap(find.text('Close report'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-resume')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pumpAndSettle();
    expect(find.text('Move'), findsOneWidget);
    expect(moves, 1);
  });
}
