import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/digit_span/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ТРЕТЬЕГО ЭКРАНА — и первого, где есть ТАЙМЕР.
///
/// Она не зовёт правила, а играет партию так же, как человек: жмёт «Показать
/// ряд», СМОТРИТ цифры по мере появления и набирает их клавишами. Значит
/// проверяются заодно темп показа, гашение клавиш и итог.
///
/// ⚠️ Ряд случаен, и подсмотреть его в правилах было бы обманом: тогда проба
/// прошла бы даже при сломанном показе. Цифры читаются с экрана.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    // Подписи берутся из ТОГО ЖЕ словаря, что и в сборке: проба заодно проверяет,
    // что `assets/l10n/ru.json` собран и читается. Тексты ниже — через L.t(), а не
    // переписаны строками: сменится формулировка в словаре — проба не развалится.
    await L.load('ru');
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: DigitSpanScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Читает цифры, пока идёт показ. Повтор цифры подряд законен, поэтому новая
  /// цифра засчитывается только после паузы — так же её различает и человек.
  Future<List<int>> watch(WidgetTester tester) async {
    final seen = <int>[];
    var afterGap = true;
    for (var i = 0; i < 400; i++) {
      final f = find.byKey(const Key('показ'));
      if (f.evaluate().isNotEmpty) {
        final txt = tester.widget<Text>(f).data ?? '';
        if (txt.isEmpty) {
          afterGap = true;
        } else {
          if (afterGap) seen.add(int.parse(txt));
          afterGap = false;
        }
      }
      if (find.byKey(const Key('набрано')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return seen;
  }

  testWidgets('🔴 партия проходится целиком: показ по таймеру и набор клавишами', (tester) async {
    await boot(tester);
    expect(find.text(L.t('digitSpan')), findsOneWidget);

    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final seen = await watch(tester);
    expect(seen.length, 4, reason: 'на первом уровне ряд из четырёх цифр');
    expect(find.byKey(const Key('набрано')), findsOneWidget, reason: 'показ кончился — пора вводить');

    for (final d in seen) {
      await tester.tap(find.byKey(Key('клавиша$d')));
      await tester.pump();
    }

    expect(find.byKey(const Key('итог')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('итог'))).data, 'Верно');
    expect(find.text(L.t('nextLabel')), findsOneWidget);
  });

  testWidgets('🔴 ошибка показывает, каким ряд был на самом деле', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = await watch(tester);

    for (final d in seen) {
      await tester.tap(find.byKey(Key('клавиша${(d + 1) % 10}')));
      await tester.pump();
    }
    final result = tester.widget<Text>(find.byKey(const Key('итог'))).data ?? '';
    expect(result.startsWith('Было: '), isTrue, reason: 'после ошибки показывается верный ряд');
    expect(result, contains(seen.join(' ')));
  });

  testWidgets('🔴 во время показа клавиатуры нет — набрать вперёд нельзя', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('клавиша1')).evaluate().isEmpty, isTrue);
    await watch(tester);
    expect(tester.widget<OutlinedButton>(find.byKey(const Key('клавиша1'))).onPressed, isNotNull,
        reason: 'после показа клавиши живые');
  });

  testWidgets('🔴 уход с экрана гасит таймер — иначе он тикает в пустоту', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    // Переживи таймер экран — flutter_test уронит пробу на «pending timer».
    await tester.pump(const Duration(seconds: 5));
  });
}
