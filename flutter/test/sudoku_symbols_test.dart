import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЗНАЧКИ ВМЕСТО ЦИФР — задача f1e1ff9c (пункт 1 «Усложнений», решение Дениса 30.09).
///
/// Что меряется: буквы стоят ВЕЗДЕ, где человек видит цифру (клетка, клавиша, пометка),
/// и везде ОДНИ И ТЕ ЖЕ — клавиша, подписанная иначе, чем клетка, превращает партию в
/// игру вслепую. Спрятанное слово читается в решённой доске. Буквы не появляются там,
/// где у цифры числовой смысл (термометры и т. п.): там это был бы шифр, а не оформление.
/// Партии играются нажатиями; связь «буква → цифра» проба берёт с надписей клавиш,
/// как человек, а не из кода экрана.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const ladderKey = 'psygames_sudoku_level_nzt48';
  const skinKey = 'psygames_sudoku_skin_nzt48';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });

  Future<void> boot(WidgetTester tester, Map<String, Object> prefs) async {
    // Язык закреплён: без выбора приложение с 01.10 берёт язык телефона (в CI —
    // английский), а проба сверяет русские буквы и русские подписи.
    SharedPreferences.setMockInitialValues({'language': 'ru', ...prefs});
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> openPause(WidgetTester tester) async {
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
  }

  /// Пауза → «Стиль цифр» → лист выбора.
  Future<void> openStyles(WidgetTester tester) async {
    await openPause(tester);
    await tester.tap(find.text(L.t('digitStyle')));
    await tester.pumpAndSettle();
  }

  Future<void> pickSkin(WidgetTester tester, Key option) async {
    await openStyles(tester);
    await tester.ensureVisible(find.byKey(option));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(option));
    await tester.pumpAndSettle();
  }

  /// Картинки внутри виджета: путь ассета и подпись для чтеца (сама цифра).
  List<({String asset, String label})> imagesIn(WidgetTester tester, Finder f) => [
        for (final e in find.descendant(of: f, matching: find.byType(Image)).evaluate())
          (
            asset: ((e.widget as Image).image as AssetImage).assetName,
            label: (e.widget as Image).semanticLabel ?? '',
          ),
      ];

  String textIn(WidgetTester tester, Finder f) => find
      .descendant(of: f, matching: find.byType(Text))
      .evaluate()
      .map((e) => (e.widget as Text).data ?? '')
      .join();

  /// Надписи клавиш: значок каждой цифры, как его видит человек.
  Map<int, String> keyLabels(WidgetTester tester) =>
      {for (var v = 1; v <= 9; v++) v: textIn(tester, find.byKey(Key('digit$v')))};

  List<List<String>> cells(WidgetTester tester) =>
      [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) textIn(tester, find.byKey(Key('cell_${r}_$c')))]];

  Future<void> put(WidgetTester tester, int r, int c, int v) async {
    await tester.tap(find.byKey(Key('cell_${r}_$c')), warnIfMissed: false);
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$v')), warnIfMissed: false);
    await tester.pump();
  }

  List<List<int>> solve(List<List<int>> g) {
    bool ok(int r, int c, int v) {
      for (var i = 0; i < 9; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r ~/ 3 * 3, c0 = c ~/ 3 * 3;
      for (var i = r0; i < r0 + 3; i++) {
        for (var j = c0; j < c0 + 3; j++) {
          if (g[i][j] == v) return false;
        }
      }
      return true;
    }

    bool step(int k) {
      if (k == 81) return true;
      final r = k ~/ 9, c = k % 9;
      if (g[r][c] != 0) return step(k + 1);
      for (var v = 1; v <= 9; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        if (step(k + 1)) return true;
        g[r][c] = 0;
      }
      return false;
    }

    if (!step(0)) fail('перебор пробы не нашёл решения — доска прочитана неверно');
    return g;
  }

  test('🔴 у каждого слова Wordoku ровно n РАЗНЫХ букв', () {
    expect(WordokuWords.all.keys, containsAll(['ru', 'en']), reason: 'слова не загрузились');
    for (final lang in WordokuWords.all.entries) {
      for (final size in lang.value.entries) {
        for (final w in size.value) {
          expect(w.length, size.key, reason: '${lang.key}: «$w» — не ${size.key} букв');
          expect(w.split('').toSet().length, size.key,
              reason: '${lang.key}: в «$w» повтор — две цифры получили бы одну букву');
        }
      }
    }
  });

  test('🔴 слово читается в своей строке решения; значки разные', () {
    const solution = [
      [5, 3, 4, 6, 7, 8, 9, 1, 2],
      [6, 7, 2, 1, 9, 5, 3, 4, 8],
      [1, 9, 8, 3, 4, 2, 5, 6, 7],
      [8, 5, 9, 7, 6, 1, 4, 2, 3],
      [4, 2, 6, 8, 5, 3, 7, 9, 1],
      [7, 1, 3, 9, 2, 4, 8, 5, 6],
      [9, 6, 1, 5, 3, 7, 2, 8, 4],
      [2, 8, 7, 4, 1, 9, 6, 3, 5],
      [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ];
    for (var row = 0; row < 9; row++) {
      final s = SudokuSymbols.wordoku(solution, row, 'ЗЕМЛЯНИКА');
      expect([for (final v in solution[row]) s.glyph(v)].join(), 'ЗЕМЛЯНИКА', reason: 'строка $row');
      expect({for (var v = 1; v <= 9; v++) s.glyph(v)}.length, 9);
      expect(s.glyph(0), '');
    }
  });

  test('🔴 звери: картинки и значки разные, файлы на месте; на 4, 6 и 9 — свои наборы', () {
    for (final n in [4, 6, 9]) {
      final s = SudokuSymbols.animals(n);
      expect(s.isDigits, isFalse, reason: 'поле $n');
      final imgs = [for (var v = 1; v <= n; v++) s.image(v)!];
      expect(imgs.toSet().length, n, reason: 'поле $n: картинки повторяются');
      expect({for (var v = 1; v <= n; v++) s.glyph(v)}.length, n, reason: 'поле $n: значки пометок повторяются');
      for (final a in imgs) {
        expect(File(a).existsSync(), isTrue, reason: 'нет ассета $a');
      }
    }
    expect(SudokuSymbols.animals(5).isDigits, isTrue, reason: 'на поле без набора — цифры');
    expect(SkinChoice.parse('animals').skin, SudokuSkin.animals);
    expect(SkinChoice.parse('animals').name, 'animals', reason: 'выбор переживает запись');
  });

  test('🔴 звери только там, где у цифры нет числового смысла', () {
    const solution = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
    for (final v in ['thermo', 'arrow', 'kropki', 'sandwich', 'evenodd', 'nonconsec', 'killerdiag']) {
      final s = symbolsFor(skin: SudokuSkin.animals, variant: v, solution: solution, language: 'ru', seed: 3);
      expect(s.isDigits, isTrue, reason: '$v: зверь спрятал бы правило');
    }
    for (final v in symbolicVariants) {
      final s = symbolsFor(skin: SudokuSkin.animals, variant: v, solution: solution, language: 'ru', seed: 3);
      expect(s.images, isNotNull, reason: '$v: звери положены');
    }
  });

  test('🔴 буквы только там, где у цифры нет числового смысла', () {
    const solution = [[1, 2], [2, 1]];
    for (final v in ['thermo', 'arrow', 'kropki', 'sandwich', 'evenodd', 'nonconsec', 'thermocage',
        'thermoknight', 'sandparity', 'killerdiag']) {
      final s = symbolsFor(skin: SudokuSkin.letters, variant: v, solution: solution, language: 'ru', seed: 7);
      expect(s.isDigits, isTrue, reason: '$v: буква спрятала бы правило — это шифр, не оформление');
    }
    for (final v in symbolicVariants) {
      final s = symbolsFor(skin: SudokuSkin.letters, variant: v, solution: solution, language: 'de', seed: 7);
      expect(s.isDigits, isFalse, reason: '$v: буквы положены');
    }
  });

  testWidgets('🔴 буквы на доске, на клавишах и в пометках — одни и те же; слово после победы',
      (tester) async {
    await boot(tester, {ladderKey: '5'});
    await pickSkin(tester, const Key('skin-letters'));
    expect(state.get(skinKey), 'letters', reason: 'выбор значков помнится у профиля');

    final labels = keyLabels(tester);
    expect(labels.values.toSet().length, 9, reason: 'девять разных надписей клавиш');
    expect(labels.values.every((l) => RegExp(r'^[А-ЯЁ]$').hasMatch(l)), isTrue,
        reason: 'на клавишах буквы, а не цифры: $labels');
    final byGlyph = {for (final e in labels.entries) e.value: e.key};
    final seen = cells(tester);
    for (final row in seen) {
      for (final t in row) {
        expect(t.isEmpty || byGlyph.containsKey(t), isTrue,
            reason: 'в клетке «$t» — значок, которого нет на клавишах');
      }
    }

    // Пометка карандашом — тем же значком.
    late int er, ec;
    outer:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (seen[r][c].isEmpty) {
          er = r;
          ec = c;
          break outer;
        }
      }
    }
    await tester.tap(find.byKey(Key('cell_${er}_$ec')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit3')));
    await tester.pump();
    expect(textIn(tester, find.byKey(Key('marks_${er}_$ec'))), labels[3],
        reason: 'пометка показана тем же значком, что клавиша 3');
    await tester.tap(find.byKey(const Key('digit3')));   // снять пометку
    await tester.pump();
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();

    // Решаем: доска читается через надписи клавиш, ход — клавишами.
    final givens = [for (final row in seen) [for (final t in row) t.isEmpty ? 0 : byGlyph[t]!]];
    final solved = solve([for (final row in givens) [...row]]);
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (givens[r][c] == 0) await put(tester, r, c, solved[r][c]);
      }
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();

    final note = find.byKey(const Key('hidden-word'));
    expect(note, findsOneWidget, reason: 'после победы показано спрятанное слово');
    final word = (tester.widget<Text>(note).data ?? '').split(': ').last;
    expect(WordokuWords.of('ru', 9), contains(word));
    final rows = [for (final row in cells(tester)) row.join()];
    expect(rows, contains(word), reason: 'слово читается в строке решённой доски');
    expect(state.get(ladderKey), '6', reason: 'значки не мешают лестнице: победа засчитана');
  });

  testWidgets('🔴 на термометрах буквы не предлагаются и не ставятся', (tester) async {
    await boot(tester, {ladderKey: '42', skinKey: 'letters'});
    final labels = keyLabels(tester);
    expect(labels.values.join(), '123456789',
        reason: 'на термометрах цифры — порядок чисел и есть правило');
    await openStyles(tester);
    expect(find.byKey(const Key('skin-letters')), findsNothing,
        reason: 'буквы, которые ничего не сделают, не предлагаются');
    expect(find.byKey(const Key('skin-drawn-candy')), findsOneWidget,
        reason: 'рисованные — это всё ещё цифры, на термометрах положены');
  });

  testWidgets('🔴 звери: на клавишах и на доске — картинки «Пар» своей цифры, выбор помнится', (tester) async {
    await boot(tester, {ladderKey: '5'});
    await pickSkin(tester, const Key('skin-animals'));
    expect(state.get(skinKey), 'animals', reason: 'выбор значков помнится у профиля');
    final picks = animalPicks[9]!;
    for (var v = 1; v <= 9; v++) {
      expect(imagesIn(tester, find.byKey(Key('digit$v'))).map((i) => i.asset), [animalImage(picks[v - 1])],
          reason: 'клавиша $v — свой зверь');
    }
    var pictured = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        for (final i in imagesIn(tester, find.byKey(Key('cell_${r}_$c')))) {
          expect(i.asset, animalImage(picks[int.parse(i.label) - 1]), reason: 'клетка $r,$c: зверь не той цифры');
          pictured++;
        }
      }
    }
    expect(pictured, greaterThan(20), reason: 'подсказки задания нарисованы зверями');
  });

  testWidgets('🔴 рисованные цифры веба: на доске и на клавишах — картинки набора', (tester) async {
    await boot(tester, {ladderKey: '5'});
    await pickSkin(tester, const Key('skin-drawn-candy'));
    expect(state.get(skinKey), 'drawn:candy');
    for (var v = 1; v <= 9; v++) {
      final im = imagesIn(tester, find.byKey(Key('digit$v')));
      expect(im.map((i) => i.asset), ['assets/digits/candy/d$v.webp'], reason: 'клавиша $v — картинка набора');
    }
    var pictured = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        for (final i in imagesIn(tester, find.byKey(Key('cell_${r}_$c')))) {
          expect(i.asset, 'assets/digits/candy/d${i.label}.webp',
              reason: 'клетка $r,$c: картинка не той цифры');
          pictured++;
        }
      }
    }
    expect(pictured, greaterThan(20), reason: 'подсказки задания нарисованы картинками');
  });

  testWidgets('🔴 некупленный набор — с замком и не выбирается; купленный — выбирается', (tester) async {
    // У профиля nzt48 свой набор — «неон» (бесплатный), «элегант» — только купленный.
    await boot(tester, {ladderKey: '5'});
    await openStyles(tester);
    // Все пункты видны сразу, без прокрутки: по умолчанию лист режется на 9/16 экрана,
    // и последние наборы уходили за край (замер 30.09).
    final screenH = tester.view.physicalSize.height / tester.view.devicePixelRatio;
    for (final st in digitStyles) {
      expect(tester.getRect(find.byKey(Key('skin-drawn-$st'))).bottom, lessThanOrEqualTo(screenH),
          reason: 'набор «$st» за краем листа — его надо искать прокруткой');
    }
    ListTile tile(String st) => tester.widget<ListTile>(find.byKey(Key('skin-drawn-$st')));
    expect(tile('candy').enabled, isTrue, reason: 'конфетные бесплатны всем');
    expect(tile('neon').enabled, isTrue, reason: 'набор своего профиля бесплатен');
    expect(tile('elegant').enabled, isFalse, reason: 'не купленный — под замком');
    await tester.tap(find.byKey(const Key('skin-drawn-elegant')));
    await tester.pumpAndSettle();
    expect(state.get(skinKey), isNull, reason: 'замок не пропускает выбор');

    // Покупка в магазине веба — запись в общую память; владение читается при КАЖДОМ
    // открытии выбора, а не один раз при запуске экрана.
    await tester.tapAt(const Offset(8, 8));   // закрыть лист выбора
    await tester.pumpAndSettle();
    state.set('psygames_cosmetics_unlocked_nzt48', '["digits_elegant"]');
    await openStyles(tester);
    expect(tile('elegant').enabled, isTrue, reason: 'после покупки замок снят');
    await tester.ensureVisible(find.byKey(const Key('skin-drawn-elegant')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('skin-drawn-elegant')));
    await tester.pumpAndSettle();
    expect(state.get(skinKey), 'drawn:elegant', reason: 'купленный в магазине веба — выбирается');
  });

  testWidgets('🔴 на термометрах клетка берёт текст: под цифрой рисунок (правило веба)', (tester) async {
    await boot(tester, {ladderKey: '42', skinKey: 'drawn:candy'});
    expect(imagesIn(tester, find.byKey(const Key('digit1'))), isNotEmpty,
        reason: 'клавиши — картинками');
    var pictured = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        pictured += imagesIn(tester, find.byKey(Key('cell_${r}_$c'))).length;
      }
    }
    expect(pictured, 0, reason: 'на доске с термометрами цифра — текстом: контраст важнее вида');
  });
}
