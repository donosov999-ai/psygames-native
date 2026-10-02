import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hidden_character/model.dart';
import 'package:psygames_flutter/games/monster_traits/model.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЧЕТЫРЕ ИГРЫ MINDLAB ВЛЕЗАЮТ В МАЛЫЙ ЭКРАН — МЕРОЙ ГРАНИЦ, А НЕ ОТСУТСТВИЕМ ОШИБОК.
///
/// Поля здесь на `Wrap`, а `Wrap` о переполнении молчит: карточки просто уезжают под
/// кнопки, и проба без замера была бы зелёной. Поэтому меряется геометрия: последняя
/// карточка кончается выше кнопок, доска — внутри экрана. Экран поднимается тем же
/// путём, что у человека (карта перехвата гибрида), на самой тяжёлой ступени.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  const sizes = [Size(320, 568), Size(360, 640), Size(390, 844)];

  Future<void> open(WidgetTester tester, Size size, String route, Map<String, Object> prefs) async {
    tester.view.physicalSize = Size(size.width * 2, size.height * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids', ...prefs});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: HybridApp.native[route]!(state)));
    // Банк досок и лестница грузятся НАСТОЯЩИМ вводом-выводом: поддельное время пробы
    // его не ждёт, и без runAsync экран оставался на спиннере через раз.
    for (var i = 0; i < 20 && find.byType(CircularProgressIndicator).evaluate().isNotEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 50));
    }
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Ошибка кадра — с полной диагностикой в причине: «переполнено на 10 px» без имени
  /// виджета не чинится.
  void noError(WidgetTester tester) {
    final e = tester.takeException();
    expect(e, isNull, reason: e is FlutterError ? e.toStringDeep() : '$e');
  }

  Rect rectOf(WidgetTester tester, String key) => tester.getRect(find.byKey(ValueKey(key)));

  for (final size in sizes) {
    final tag = '${size.width.toInt()}×${size.height.toInt()}';

    testWidgets('«Найди признак» $tag, 15 карточек: последняя выше кнопки «Проверить»', (tester) async {
      await open(tester, size, '/games/monster-traits', {'psygames_monster_traits_level_kids': '9'});
      noError(tester);
      final last = traitCardsFor(9) - 1;
      final card = rectOf(tester, 'mt-card-$last');
      final check = rectOf(tester, 'mt-check');
      expect(card.bottom, lessThanOrEqualTo(check.top), reason: 'карточка $card уехала под кнопку $check');
      expect(card.width, greaterThanOrEqualTo(40), reason: 'карточка меньше пальца');
    });

    // Самая тесная раскладка — вершина лестницы: 28 персонажей, 6 вопросов и «или…».
    testWidgets('«Кто спрятался?» $tag, вершина: 28 персонажей и вопросы с «или» — сетка выше кнопок', (tester) async {
      await open(tester, size, '/games/hidden-character', {'psygames_hidden_character_level_kids': '$hiddenStepCount'});
      noError(tester);
      final n = hiddenStep(hiddenStepCount).suspects;
      expect(find.byKey(const ValueKey('hc-or')), findsOneWidget, reason: 'на вершине есть «или…»');
      final card = rectOf(tester, 'hc-suspect-${n - 1}');
      final firstAsk = tester.getRect(find.byType(OutlinedButton).first);
      final confirm = rectOf(tester, 'hc-confirm');
      expect(card.bottom, lessThanOrEqualTo(firstAsk.top), reason: 'персонаж $card под вопросами $firstAsk');
      expect(confirm.bottom, lessThanOrEqualTo(size.height), reason: '«Это он!» за краем экрана');
      expect(card.width, greaterThanOrEqualTo(36));
    });

    testWidgets('«Освободи путь» $tag: доска целиком на экране', (tester) async {
      await open(tester, size, '/games/traffic-jam', {});
      noError(tester);
      final board = rectOf(tester, 'tj-board');
      expect(board.left, greaterThanOrEqualTo(0));
      expect(board.right, lessThanOrEqualTo(size.width));
      expect(board.bottom, lessThanOrEqualTo(size.height));
      expect(board.width, greaterThanOrEqualTo(220), reason: 'клетка меньше пальца');
    });

    testWidgets('«Рискни и сохрани» $tag: кубик и обе кнопки на экране', (tester) async {
      await open(tester, size, '/games/roll-and-bank', {});
      noError(tester);
      final die = rectOf(tester, 'rb-die');
      final roll = rectOf(tester, 'rb-roll');
      expect(die.bottom, lessThanOrEqualTo(roll.top));
      expect(roll.bottom, lessThanOrEqualTo(size.height));
      expect(rectOf(tester, 'rb-bank').bottom, lessThanOrEqualTo(size.height));
    });
  }
}
