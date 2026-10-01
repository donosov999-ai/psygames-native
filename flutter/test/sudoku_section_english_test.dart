import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/games/hidden_character/screen.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЭКРАНЫ РАЗДЕЛА «СУДОКУ» НА АНГЛИЙСКОМ — БЕЗ ЕДИНОЙ РУССКОЙ БУКВЫ.
///
/// Решение Дениса 01.10.2026: основной язык — английский, русский — вспомогательный. А
/// нативные экраны раздела с переноса держали полосу счётчиков, кнопки и имена правил
/// русскими литералами в коде («Уровень», «Ошибки», «Правило: термометры», «Отменить»…):
/// человек с английским телефоном видел их по-русски. Пробы этого не замечали — каждая
/// искала русский текст и потому была зелёной именно на дефекте.
///
/// Здесь каждый экран раздела открывается с языком `en`, и весь текст для человека (`Text`,
/// `RichText`, подписи для чтеца экрана, `Tooltip`) проверяется на кириллицу. Новая русская строка в коде — проба красная.
///
/// ⚠️ Единственное исключение — имена ступеней головоломок: они приходят ДАННЫМИ из веба
/// (`assets/puzzles/modes.json`, 78 из 88 по-русски) и переводятся отдельной задачей 92e1b615.
final _cyrillic = RegExp('[А-Яа-яЁё]');

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'language': 'en',
      // Уровень с правилом варианта: в полосе счётчиков видно имя правила.
      'psygames_sudoku_level_nzt48': '42',
    });
    state = await SharedState.open();
    await L.load('en');
  });

  Future<void> open(WidgetTester tester, Widget screen, {bool Function()? ready}) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (ready != null && ready()) break;
      }
    });
    await tester.pump();
  }

  /// Весь текст экрана, который получает человек: видимый (`Text`, `RichText`), для чтеца
  /// экрана (`Semantics.label` — так полоса счётчиков отдаёт подписи «Уровень»/«Ошибки»: на
  /// поле от них видны только значок и число) и подсказки `Tooltip`.
  List<String> visibleText(WidgetTester tester) => [
        for (final w in tester.allWidgets)
          if (w is Text)
            w.data ?? w.textSpan?.toPlainText() ?? ''
          else if (w is RichText)
            w.text.toPlainText()
          else if (w is Semantics)
            w.properties.label ?? ''
          else if (w is Tooltip)
            w.message ?? '',
      ];

  Future<void> expectEnglish(WidgetTester tester, String name, Widget screen,
      {bool Function()? ready, Set<String> fromData = const {}, void Function()? also}) async {
    await open(tester, screen, ready: ready);
    final texts = visibleText(tester);
    expect(texts, isNotEmpty, reason: '$name: экран пуст — проба мерить нечего');
    final russian = texts.where((t) => _cyrillic.hasMatch(t) && !fromData.contains(t)).toSet();
    expect(russian, isEmpty, reason: '$name на английском показывает русский: $russian');
    also?.call();
    // Снять экран, чтобы следующий не унаследовал состояние того же места дерева.
    await tester.pumpWidget(const SizedBox());
  }

  bool cell() => find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty;

  testWidgets('🔴 «Судоку»: лестница, ступень с правилом варианта', (tester) async {
    await expectEnglish(tester, 'Судоку', SudokuScreen(state: state), ready: cell, also: () {
      expect(find.text(L.t('sdkRule_thermo')), findsOneWidget, reason: 'имя правила на ступени 42 — по-английски');
      expect(L.t('sdkRule_thermo'), 'thermometers');
    });
  });

  testWidgets('🔴 «Судоку»: режимы небоскрёбов и неравенств', (tester) async {
    await expectEnglish(tester, 'Небоскрёбы', SudokuScreen(state: state, mode: SideMode.towers), ready: cell);
    await expectEnglish(tester, 'Неравенства', SudokuScreen(state: state, mode: SideMode.unequal), ready: cell);
  });

  testWidgets('🔴 «Самурай», «Фрактал», «Бездна»', (tester) async {
    await expectEnglish(tester, 'Самурай', SamuraiScreen(state: state), ready: cell);
    await expectEnglish(tester, 'Фрактал', FractalScreen(state: state));
    await expectEnglish(tester, 'Бездна', DeepScreen(state: state));
  });

  testWidgets('🔴 «Кошки» и «Кто спрятался?»', (tester) async {
    await expectEnglish(tester, 'Кошки', CatsScreen(state: state));
    await expectEnglish(tester, 'Кто спрятался?', HiddenCharacterScreen(state: state));
  });

  testWidgets('🔴 «Головоломки»: полоса и подсказка ввода (имя ступени — данные, см. шапку)', (tester) async {
    await open(tester, PuzzlesScreen(state: state, mode: 'Unruly'));
    final stepTitles = {
      for (final w in tester.allWidgets)
        if (w is Text && (w.data ?? '').contains('×')) w.data!,
    };
    final russian = visibleText(tester).where((t) => _cyrillic.hasMatch(t) && !stepTitles.contains(t)).toSet();
    expect(russian, isEmpty, reason: '«Головоломки» на английском показывают русский: $russian');
  });
}
