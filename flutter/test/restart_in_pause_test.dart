import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';

/// 🔴 «ЗАНОВО» В ПАУЗЕ ЕСТЬ У КАЖДОЙ ИГРЫ И НЕ ЗАСЧИТЫВАЕТСЯ ПРОИГРЫШЕМ (задача 1e21b974).
///
/// 📍 Отчёт 5be4998f (09.09.2026): «чтобы начать новую партию, тыкаю неправильные числа три
/// раза, чтобы жизни закончились». Замер 01.10.2026: своего «Заново» в паузе не было у 43
/// нативных экранов из 86. Теперь каркас добавляет пункт сам и пересоздаёт экран.
int _starts = 0;
int _fails = 0;

class _Game extends StatefulWidget {
  const _Game({this.ownRestart = false});
  final bool ownRestart;
  @override
  State<_Game> createState() => _GameState();
}

class _GameState extends State<_Game> {
  int _moves = 0;

  @override
  void initState() {
    super.initState();
    _starts++;
  }

  @override
  Widget build(BuildContext context) => GameShell(
        title: 'Проба',
        field: (_, _) => Center(
          child: TextButton(
            key: const Key('move'),
            onPressed: () => setState(() => _moves++),
            child: Text('ходов $_moves'),
          ),
        ),
        pauseActions: [
          if (widget.ownRestart)
            PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => _fails++),
        ],
      );
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    _starts = 0;
    _fails = 0;
  });

  Future<void> openPause(WidgetTester tester) async {
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 игра без своего «Заново»: пункт в паузе есть и начинает партию с нуля', (tester) async {
    await tester.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => const _Game())));
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byKey(const Key('move')));
    }
    await tester.pump();
    expect(find.text('ходов 3'), findsOneWidget);
    expect(_starts, 1);

    await openPause(tester);
    expect(find.text(L.t('restart')), findsOneWidget, reason: 'в паузе нет «Заново» — каркас его не добавил');
    await tester.tap(find.text(L.t('restart')));
    await tester.pumpAndSettle();

    expect(find.text('ходов 0'), findsOneWidget, reason: '«Заново» не начало партию с нуля');
    expect(_starts, 2, reason: 'экран пересоздан ровно один раз');
    expect(_fails, 0, reason: '«Заново» не проигрыш');
  });

  testWidgets('у игры со своим «Заново» пункт не задваивается', (tester) async {
    await tester.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => const _Game(ownRestart: true))));
    await openPause(tester);
    expect(find.text(L.t('restart')), findsOneWidget, reason: 'два пункта «Заново» в одном меню');
  });

  testWidgets('экран не из оболочки (настольная проба) — каркас пункт не выдумывает', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: _Game()));
    await openPause(tester);
    expect(find.text(L.t('restart')), findsNothing);
  });
}
