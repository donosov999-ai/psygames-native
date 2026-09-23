import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 ИЗ ИГРЫ ОБЯЗАН БЫТЬ ВЫХОД — И ЭТО ПРОВЕРЯЕТСЯ НАЖАТИЕМ, А НЕ ЧТЕНИЕМ КОДА.
///
/// Повод — 23.09.2026, Денис на iPhone: «даже выйти сейчас нельзя из игры». В листе
/// паузы стояли «Начать заново», «Отменить ход», «Продолжить», и всё; системный свайп
/// от края нативный экран тоже не закрывал. Замер по коду: экранов на каркасе 38,
/// `onBack` передавал ОДИН.
///
/// ⚠️ Проба нарочно НЕ считает, сколько экранов передают `onBack`: такой счёт снова
/// поверил бы исходнику. Она поднимает каркас и ВЫХОДИТ из него нажатием — ровно то,
/// чего человек не смог сделать на телефоне.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));

  /// Два экрана: список и игра поверх него. Вышли — снова виден список.
  Future<void> openGame(WidgetTester tester, {VoidCallback? onBack}) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => GameShell(
                  title: 'Проба',
                  onBack: onBack,
                  hud: const [HudItem(label: 'Раунд', value: '3/10')],
                  field: (_, _) => const SizedBox.shrink(),
                  pauseActions: [
                    PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: () {}),
                  ],
                ),
              )),
              child: const Text('СПИСОК'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('СПИСОК'));
    await tester.pumpAndSettle();
    expect(find.text('Проба'), findsOneWidget, reason: 'экран игры не открылся — проверять нечего');
  }

  testWidgets('🔴 из игры выходят через паузу, даже когда раздел не дал onBack', (tester) async {
    await openGame(tester);
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-leave')), findsOneWidget, reason: 'в паузе нет выхода');
    await tester.tap(find.byKey(const Key('pause-leave')));
    await tester.pumpAndSettle();
    expect(find.text('СПИСОК'), findsOneWidget, reason: 'выход не вернул к списку');
    expect(find.text('Проба'), findsNothing);
  });

  testWidgets('🔴 кнопка в шапке есть всегда и тоже выводит', (tester) async {
    await openGame(tester);
    expect(find.byIcon(Icons.arrow_back), findsOneWidget,
        reason: 'без onBack шапка оставалась без кнопки — так и появилась ловушка');
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(find.text('СПИСОК'), findsOneWidget);
  });

  testWidgets('раздел может увести куда нужно ему — свой onBack зовётся вместо pop', (tester) async {
    var called = 0;
    await openGame(tester, onBack: () => called++);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(called, 1, reason: 'свой обработчик раздела обязан вызваться');
    expect(find.text('Проба'), findsOneWidget, reason: 'решает раздел: экран остался');
  });

  testWidgets('🔴 пауза — во весь экран, со счётчиками и подписями из словаря', (tester) async {
    await openGame(tester);
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    // Образец Дениса 23.09.2026: счётчики сверху, «Продолжить игру» главной кнопкой.
    expect(find.text('Раунд'), findsOneWidget, reason: 'счётчиков в паузе нет');
    expect(find.text('3/10'), findsOneWidget);
    expect(find.text(L.t('exitConfirmStay')), findsOneWidget);
    expect(find.text(L.t('pauseExitGame')), findsOneWidget);
    expect(find.byKey(const Key('pause-resume')), findsOneWidget);
    // Своё действие раздела на месте и уводит игру, а не экран.
    expect(find.text('Начать заново'), findsOneWidget);
  });

  testWidgets('🔴 «На главную» появляется только когда оболочка её знает', (tester) async {
    GameExit.home = null;
    await openGame(tester);
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-home')), findsNothing,
        reason: 'без оболочки главной нет — рисовать кнопку в никуда нельзя');
    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pumpAndSettle();

    var home = 0;
    GameExit.home = () => home++;
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pumpAndSettle();
    expect(find.text(L.t('goHome')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-home')));
    await tester.pumpAndSettle();
    expect(home, 1);
    GameExit.home = null;
  });
}
