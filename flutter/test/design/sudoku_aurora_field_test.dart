import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/keypad.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОЛЕ «СУДОКУ» ПОД «АВРОРОЙ» — ПО ЛИСТУ 11 (задача 6016f895, приёмка 29.10 на эмуляторе).
///
/// Снимок сборки под «Авророй» (main d86bb2852 + маршрут в auroraReadyRoutes) разошёлся с листом в двух
/// местах зоны раздела: клавиши цифр были залиты акцентом профиля (на листе — тёмные плитки с белыми
/// цифрами), выбранная клетка — сплошной заливкой (на листе — кольцо без заливки, цифра цветом выбора).
/// Classic при этом не меняется. Роли сверяются с `GameColors.aurora(b)` ЯВНО: `GameColors.of` без
/// расширения темы молча отдаёт Classic, и проба на нём зеленела бы на неверных цветах.
void main() {
  setUpAll(() async => L.load('ru'));

  ThemeData themeOf(Brightness b, UiTemplate t) => applyUiTemplate(classicShellTheme(b), t);

  for (final b in Brightness.values) {
    testWidgets('${b.name}: «Аврора» — клавиши цифр тёмные плитки поля (cell / onCell / boardLine)', (t) async {
      await t.pumpWidget(MaterialApp(
        theme: themeOf(b, UiTemplate.aurora),
        home: Scaffold(body: SudokuKeys(n: 9, onDigit: (_) {}, onErase: () {}, onPaint: (_) {})),
      ));
      final want = GameColors.aurora(b);
      final style = t.widget<FilledButton>(find.byKey(const Key('digit1'))).style;
      expect(style, isNotNull, reason: 'под «Авророй» у клавиши свой стиль');
      expect(style!.backgroundColor?.resolve(<WidgetState>{}), want.cell);
      expect(style.foregroundColor?.resolve(<WidgetState>{}), want.onCell);
      expect(style.side?.resolve(<WidgetState>{})?.color, want.boardLine);
      expect(t.widget<OutlinedButton>(find.byKey(const Key('erase'))).style?.backgroundColor?.resolve(<WidgetState>{}),
          want.cell, reason: '«Стереть» — та же плитка');
    });

    testWidgets('${b.name}: Classic — клавиши как были (своего стиля нет)', (t) async {
      await t.pumpWidget(MaterialApp(
        theme: themeOf(b, UiTemplate.classic),
        home: Scaffold(body: SudokuKeys(n: 9, onDigit: (_) {}, onErase: () {}, onPaint: (_) {})),
      ));
      final style = t.widget<FilledButton>(find.byKey(const Key('digit1'))).style;
      expect(style?.backgroundColor, isNull, reason: 'Classic не трогаем: цвет кнопки — из темы, как до «Авроры»');
    });

    for (final tpl in UiTemplate.values) {
      testWidgets('${b.name} · ${tpl.name}: выбранная клетка — ${tpl == UiTemplate.aurora ? 'кольцо' : 'заливка'}', (t) async {
        SharedPreferences.setMockInitialValues({'language': 'ru'});
        late SharedState state;
        await t.runAsync(() async => state = await SharedState.open());
        await t.runAsync(() async {
          await t.pumpWidget(MaterialApp(theme: themeOf(b, tpl), home: SudokuScreen(state: state)));
          for (var i = 0; i < 80; i++) {
            await t.pump(const Duration(milliseconds: 50));
            await Future<void>.delayed(const Duration(milliseconds: 20));
            if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
          }
        });
        await t.pump();
        // Первая клетка, которую экран выбирает (заданные не выбираются).
        String? picked;
        for (var r = 0; r < 9 && picked == null; r++) {
          for (var c = 0; c < 9 && picked == null; c++) {
            final f = find.byKey(Key('cell_${r}_$c'));
            if (f.evaluate().isEmpty) continue;
            await t.tap(f, warnIfMissed: false);
            await t.pump();
            final fill = t.widget<Material>(find.ancestor(of: f, matching: find.byType(Material)).first).color;
            final selected = tpl == UiTemplate.aurora ? GameColors.aurora(b).selected : GameColors.classicFor(themeOf(b, tpl).colorScheme).selected;
            final ring = find.byKey(Key('aurora-ring_${r}_$c')).evaluate().isNotEmpty;
            if (ring || fill == selected) {
              picked = '${r}_$c';
              if (tpl == UiTemplate.aurora) {
                expect(ring, isTrue, reason: 'под «Авророй» выбор — кольцо');
                expect(fill, isNot(selected), reason: 'и без сплошной заливки цветом выбора');
              } else {
                expect(ring, isFalse, reason: 'в Classic кольца нет');
                expect(fill, selected, reason: 'в Classic выбор — заливка, как было');
              }
            }
          }
        }
        expect(picked, isNotNull, reason: 'на доске нашлась выбираемая клетка');
        await t.pumpWidget(const SizedBox());
      });
    }
  }
}
