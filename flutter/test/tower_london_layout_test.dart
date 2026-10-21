import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/tower_london/board.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «БАШНЯ ЛОНДОНА»: РАБОЧАЯ ДОСКА В ЦЕНТРЕ, ОБРАЗЕЦ МЕЛКО НАД НЕЙ.
///
/// 📍 Отзыв b7bce17c (11.10.2026): «подними в центр что решаем и пример мелко
/// под ним или над ним». Было: образец слева на треть ширины, обе доски у нижнего
/// края поля, две трети экрана пустые. Проба мерит прямоугольники, а не наличие
/// виджетов: раскладку видно только по координатам.
Future<void> _boot(WidgetTester tester, Size size, {double textScale = 1}) async {
  tester.view.physicalSize = size * 2;
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final state = await SharedState.open();
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: TowerLondonScreen(state: state),
    ));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(TolBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  setUpAll(() async => L.load('en'));

  for (final (size, scale) in const [(Size(390, 844), 1.0), (Size(360, 640), 1.0), (Size(390, 844), 1.6)]) {
    testWidgets('🔴 образец сверху и мельче, рабочая доска в центре · ${size.width.toInt()}×${size.height.toInt()} шрифт ×$scale',
        (tester) async {
      await _boot(tester, size, textScale: scale);
      final board = tester.getRect(find.byType(TolBoard));
      final goal = tester.getRect(find.byKey(const ValueKey('tol-goal-panel')));
      final work = tester.getRect(find.byKey(const ValueKey('tol-work-panel')));

      expect(goal.bottom, lessThanOrEqualTo(work.top), reason: 'образец обязан стоять НАД рабочей доской');
      expect(goal.height, lessThan(work.height / 2), reason: 'образец — мелко: $goal против $work');
      expect(work.bottom, lessThanOrEqualTo(board.bottom + 0.5), reason: 'рабочая доска вылезла за поле');

      // Стержни рабочей доски — по центру поля по горизонтали, а сама доска
      // занимает середину высоты, а не жмётся к низу, как было.
      final first = tester.getRect(find.byKey(const ValueKey('peg-0')));
      final pegs = find.byWidgetPredicate((w) => w.key is ValueKey<String> && RegExp(r'^peg-\d+$').hasMatch((w.key! as ValueKey<String>).value));
      final last = tester.getRect(pegs.last);
      expect(((first.left + last.right) / 2 - board.center.dx).abs(), lessThan(4), reason: 'рабочие стержни не по центру');
      expect(work.center.dy, greaterThan(board.top + board.height * 0.35), reason: 'рабочая доска не в центре по высоте');
      expect(work.center.dy, lessThan(board.top + board.height * 0.8));

      // Образец — мелкий не только панелью: его стержни у́же рабочих.
      final goalPeg = tester.getRect(find.byKey(const ValueKey('goal-0')));
      expect(goalPeg.width, lessThan(first.width), reason: 'стержень образца не мельче рабочего');
      expect(tester.takeException(), isNull, reason: 'переполнение раскладки');
    });
  }
}
