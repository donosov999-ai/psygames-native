import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВЫХОД И «ЗАНОВО» СПРАШИВАЮТ, КОГДА В ПАРТИИ ЕСТЬ ЧТО ТЕРЯТЬ — «САМУРАЙ» И «ФРАКТАЛ».
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.2: веб спрашивает (`confirmExit`),
/// натив уходил молча — стрелка «назад», «Выйти из игры» в паузе и значок «Заново» стирали
/// партию одним касанием. Пробы играют нажатиями: ход → выход спрашивает, «Продолжить игру»
/// оставляет партию, «Выйти» уводит; пустая доска уходит без вопроса.
void main() {
  late SharedState state;

  setUpAll(() async => L.load('ru'));
  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    state = await SharedState.open();
  });

  /// Экран открыт поверх «развилки» — чтобы выход было куда сделать и видно, что он случился.
  Future<void> open(WidgetTester tester, Widget screen, Key ready) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (c) => Scaffold(
            body: Center(
              child: ElevatedButton(
                key: const Key('hub'),
                onPressed: () => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => screen)),
                child: const Text('hub'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('hub')));
      for (var i = 0; i < 100; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(ready).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
  }

  bool empty(WidgetTester tester, Finder cell) =>
      find.descendant(of: cell, matching: find.byType(Text)).evaluate().every((e) => ((e.widget as Text).data ?? '').trim().isEmpty);

  /// Ход: первая пустая клетка с этим префиксом ключа и цифра 1.
  Future<String> move(WidgetTester tester, String prefix, int size) async {
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        final f = find.byKey(Key('$prefix${r}_$c'));
        if (f.evaluate().isEmpty || !empty(tester, f)) continue;
        await tester.tap(f, warnIfMissed: false);
        await tester.pump();
        await tester.tap(find.byKey(const Key('digit1')), warnIfMissed: false);
        await tester.pump();
        return '$prefix${r}_$c';
      }
    }
    fail('пустой клетки не нашлось');
  }

  Future<void> back(WidgetTester tester) async {
    await tester.tap(find.byTooltip(L.t('back')));
    await tester.pumpAndSettle();
  }

  Future<void> pauseLeave(WidgetTester tester) async {
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pause-leave')));
    await tester.pumpAndSettle();
  }

  bool onScreen(Key ready) => find.byKey(ready).evaluate().isNotEmpty;

  /// 🔴 В ДИАЛОГЕ — ТЕКСТ, А НЕ СЫРЫЕ КЛЮЧИ. 02.10.2026: заголовок выбирался тернарником внутри
  /// L.t(…), embed-l10n его не видел, и на экране стояло «exitConfirmTitle». Проба искала диалог
  /// по ключу виджета и была зелёной.
  void expectDialogText(WidgetTester tester) {
    final texts = [
      for (final e in find.descendant(of: find.byKey(const Key('confirm-loss')), matching: find.byType(Text)).evaluate())
        (e.widget as Text).data ?? '',
    ];
    expect(texts, isNotEmpty);
    expect(texts.where((t) => RegExp(r'^[a-z]+[A-Z][A-Za-z]+$').hasMatch(t)).toList(), isEmpty,
        reason: 'в диалоге сырой ключ словаря: $texts');
  }

  testWidgets('🔴 «Самурай»: пустая доска уходит без вопроса, после хода — спрашивает', (tester) async {
    const ready = Key('cell_0_0');
    await open(tester, SamuraiScreen(state: state), ready);
    await back(tester);
    expect(find.byKey(const Key('confirm-loss')), findsNothing, reason: 'терять нечего — вопроса нет');
    expect(onScreen(ready), isFalse, reason: 'пустая доска закрылась сразу');

    await open(tester, SamuraiScreen(state: state), ready);
    await move(tester, 'cell_', 21);
    await back(tester);
    expect(find.byKey(const Key('confirm-loss')), findsOneWidget, reason: 'стрелка после хода спрашивает');
    expectDialogText(tester);
    expect(find.text(L.t('exitConfirmSaved')), findsOneWidget, reason: 'самурай хранит партию — вопрос обещает сохранение');
    await tester.tap(find.byKey(const Key('confirm-stay')));
    await tester.pumpAndSettle();
    expect(onScreen(ready), isTrue, reason: '«Продолжить игру» оставляет партию');

    await pauseLeave(tester);
    expect(find.byKey(const Key('confirm-loss')), findsOneWidget, reason: '«Выйти из игры» в паузе тоже спрашивает');
    await tester.tap(find.byKey(const Key('confirm-go')));
    await tester.pumpAndSettle();
    expect(onScreen(ready), isFalse, reason: '«Выйти» уводит с экрана');
  });

  testWidgets('🔴 «Самурай»: «Заново» после хода спрашивает, «Продолжить» сохраняет ход', (tester) async {
    const ready = Key('cell_0_0');
    await open(tester, SamuraiScreen(state: state), ready);
    final cell = await move(tester, 'cell_', 21);
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-loss')), findsOneWidget, reason: '«Заново» спрашивает');
    expectDialogText(tester);
    await tester.tap(find.byKey(const Key('confirm-stay')));
    await tester.pumpAndSettle();
    expect(empty(tester, find.byKey(Key(cell))), isFalse, reason: 'ход на месте — партия не стёрта');
  });

  testWidgets('🔴 «Фрактал»: после хода выход спрашивает, «Выйти» уводит', (tester) async {
    const ready = Key('tile0');
    await open(tester, FractalScreen(state: state), ready);
    await back(tester);
    expect(find.byKey(const Key('confirm-loss')), findsNothing, reason: 'терять нечего — вопроса нет');
    expect(onScreen(ready), isFalse);

    await open(tester, FractalScreen(state: state), ready);
    await tester.tap(find.byKey(const Key('tile0')), warnIfMissed: false);
    await tester.pump();
    await move(tester, 'cell_', 9);
    await back(tester);
    expect(find.byKey(const Key('confirm-loss')), findsOneWidget, reason: 'стрелка после хода спрашивает');
    expectDialogText(tester);
    expect(find.text(L.t('exitConfirmLost')), findsOneWidget, reason: 'у фрактала снимка пока нет — вопрос честно говорит о потере');
    await tester.tap(find.byKey(const Key('confirm-go')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hub')), findsOneWidget, reason: '«Выйти» вернул в развилку');
  });
}
