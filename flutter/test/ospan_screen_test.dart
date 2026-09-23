import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ospan/model.dart';
import 'package:psygames_flutter/games/ospan/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// КРУГ ИГРАЕТСЯ НАЖАТИЯМИ И ВВОДОМ. Равенство и букву проба читает С ЭКРАНА —
/// как человек, а не из состояния игры.
void main() {
  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, String seed = 'проба'}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}ospan_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: OspanScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  String textOf(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  /// Проходит круг: отвечает на равенства и собирает показанные буквы.
  Future<List<String>> playRound(WidgetTester tester, OspanParams p, {bool truthful = true}) async {
    final seen = <String>[];
    for (var i = 0; i < p.setSize; i += 1) {
      final shown = textOf(tester, 'равенство');
      // Считаем сами по показанному: проба решает задачу, а не спрашивает ответ.
      final parts = shown.split(' = ');
      final right = int.parse(parts[1]);
      final left = parts[0];
      int? real;
      if (left.contains(' + ')) {
        final ab = left.split(' + ');
        real = int.parse(ab[0]) + int.parse(ab[1]);
      } else if (left.contains(' - ')) {
        final ab = left.split(' - ');
        real = int.parse(ab[0]) - int.parse(ab[1]);
      } else if (left.contains(' × ')) {
        final ab = left.split(' × ');
        real = int.parse(ab[0]) * int.parse(ab[1]);
      }
      final saysCorrect = truthful ? (real == right) : !(real == right);
      await tester.tap(find.byKey(Key(saysCorrect ? 'верно' : 'неверно')));
      await tester.pump();
      seen.add(textOf(tester, 'буква'));
      await tester.pump(Duration(milliseconds: p.letterMs + 20));
    }
    return seen;
  }

  testWidgets('🔴 круг играется нажатиями: равенство → буква, потом буквы по порядку', (tester) async {
    await open(tester);
    final p = levelParams(1);
    expect(find.text('Счёт и память'), findsOneWidget);
    expect(find.byKey(const Key('равенство')), findsOneWidget);

    final seen = await playRound(tester, p);
    expect(seen.length, p.setSize, reason: 'букв показано столько, сколько обещает уровень');
    expect(find.byKey(const Key('ввод')), findsOneWidget, reason: 'после набора спрашивают буквы');

    await tester.enterText(find.byKey(const Key('ввод')), seen.join());
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pump();
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'все буквы по порядку — уровень взят');
  });

  testWidgets('🔴 порядок букв важен: та же строка задом наперёд уровень не берёт', (tester) async {
    await open(tester, seed: 'порядок');
    final p = levelParams(1);
    final seen = await playRound(tester, p);
    await tester.enterText(find.byKey(const Key('ввод')), seen.reversed.join());
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pump();
    // Если буквы совпали случайно (палиндром) — проба бессмысленна, проверяем это явно.
    if (seen.join() != seen.reversed.join()) {
      expect(find.text('Ещё раз'), findsOneWidget, reason: 'порядок нарушен — уровень не взят');
    }
  });

  testWidgets('🔴 буква показывается СТОЛЬКО, сколько обещает уровень, и не дольше', (tester) async {
    await open(tester, level: 8, seed: 'скорость');
    final p = levelParams(8);
    expect(p.letterMs < 1100, isTrue, reason: 'на восьмом показ уже быстрее начального');
    await tester.tap(find.byKey(const Key('верно')));
    await tester.pump();
    expect(find.byKey(const Key('буква')), findsOneWidget);
    await tester.pump(Duration(milliseconds: p.letterMs - 50));
    expect(find.byKey(const Key('буква')), findsOneWidget, reason: 'до срока буква ещё на экране');
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('буква')), findsNothing, reason: 'после срока буква ушла');
  });

  testWidgets('🔴 РАСКЛАДКА: равенство и кнопки помещаются на 360×640', (tester) async {
    await open(tester, level: 24, screen: const Size(360, 640), seed: 'раскладка');
    final eq = tester.getRect(find.byKey(const Key('равенство')));
    expect(eq.left >= 0 && eq.right <= 360, isTrue, reason: 'длинное равенство не вылезает: $eq');
    for (final k in ['верно', 'неверно']) {
      final r = tester.getRect(find.byKey(Key(k)));
      expect(r.height >= 48, isTrue, reason: 'кнопка «$k» ниже пальца: ${r.height}');
      expect(r.left >= 0 && r.right <= 360, isTrue, reason: 'кнопка «$k» за экраном: $r');
    }
  });
}
