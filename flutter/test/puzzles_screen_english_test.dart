import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН ГОЛОВОЛОМОК НА АНГЛИЙСКОМ НЕ ГОВОРИТ ПО-РУССКИ, А НА РУССКОМ ГОВОРИТ КАК РАНЬШЕ.
///
/// Замер координатора 01.10.2026 (релиз 2.56.1, эмулятор en-US): подпись счётчика ступени,
/// подпись доски, кнопка победы, подсказка про тычок и тексты сбоев были зашиты по-русски.
/// Подпись счётчика на главном экране видна только скринридеру (`Semantics`) и на экране
/// паузы, поэтому проверяется там. Кнопка победы и подсказка про тычок живут в приватной
/// панели, и достать их без правки кода нельзя — их сторожит последняя проба файла.
/// Русским остаются названия ступеней из `assets/puzzles/modes.json` («Случайная 5×5»):
/// их чинит отдельная задача.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  Map<String, String> dict(String locale) =>
      (jsonDecode(File('assets/l10n/$locale.json').readAsStringSync()) as Map).cast<String, String>();

  final stepTitles = <String>{
    for (final card in (jsonDecode(File('assets/puzzles/modes.json').readAsStringSync()) as Map).values)
      for (final s in (card as Map)['steps'] as List? ?? const []) (s as Map)['title'] as String,
  };

  setUpAll(() {
    if (!File(libPath).existsSync()) {
      final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
      if (!File(libPath).existsSync()) {
        fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
      }
    }
  });

  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, String mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  List<String> shownTexts(WidgetTester tester) => [
        for (final t in tester.widgetList<Text>(find.byType(Text))) t.data ?? t.textSpan?.toPlainText() ?? '',
      ];

  final cyrillic = RegExp(r'[А-Яа-яЁё]');

  testWidgets('🔴 en: подписи счётчика по-английски, русских строк на экране нет (кроме названий ступеней)',
      (tester) async {
    final semantics = tester.ensureSemantics();
    L.useForTest('en', dict('en'));
    await boot(tester, 'Solo');
    expect(find.bySemanticsLabel(RegExp(r'Step: 1/5')), findsWidgets);
    expect(find.bySemanticsLabel(RegExp(r'Board: ')), findsWidgets);
    final russian = shownTexts(tester).where((s) => cyrillic.hasMatch(s) && !stepTitles.contains(s)).toList();
    expect(russian, isEmpty, reason: 'на английском экране осталась кириллица');
    semantics.dispose();
  });

  testWidgets('🔴 en: неизвестный режим — сбой по-английски, с названием режима', (tester) async {
    L.useForTest('en', dict('en'));
    await boot(tester, 'Nope');
    expect(find.text('the engine does not know the mode Nope'), findsOneWidget);
  });

  testWidgets('🔴 ru: те же места говорят так же, как до переноса в словарь', (tester) async {
    final semantics = tester.ensureSemantics();
    L.useForTest('ru', dict('ru'));
    await boot(tester, 'Solo');
    expect(find.bySemanticsLabel(RegExp(r'Ступень: 1/5')), findsWidgets);
    expect(find.bySemanticsLabel(RegExp(r'Доска: ')), findsWidgets);
    semantics.dispose();
  });

  testWidgets('🔴 ru: сбой про неизвестный режим читается дословно как прежде', (tester) async {
    L.useForTest('ru', dict('ru'));
    await boot(tester, 'Nope');
    expect(find.text('режим Nope движку неизвестен'), findsOneWidget);
  });

  test('🔴 в screen.dart нет зашитых русских строк: ни кнопки победы, ни подсказки, ни сбоев', () {
    final src = File('lib/games/puzzles/screen.dart')
        .readAsStringSync()
        .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
        .replaceAll(RegExp(r'//.*$', multiLine: true), '');
    final literals = RegExp(r"'[^'\n]*[А-Яа-яЁё][^'\n]*'").allMatches(src).map((m) => m.group(0)).toList();
    expect(literals, isEmpty, reason: 'русский текст — только через L.t / L.f');
  });
}
