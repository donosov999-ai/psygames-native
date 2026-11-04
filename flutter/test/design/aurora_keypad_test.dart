import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_sprint/model.dart' as sprint;
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/games/pattern/model.dart' as pattern;
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/games/quick_count/screen.dart';
import 'package:psygames_flutter/games/sdmt/model.dart' as sdmt;
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// КЛАВИАТУРА И ОТВЕТЫ ПОД «АВРОРОЙ» — НЕЙТРАЛЬНЫЕ ПЛИТКИ (листы 23, 24 и 27, приёмка 29a06aa2).
/// Сборка 29.10 показала цифры SDMT и «Математического спринта», залитые акцентом профиля,
/// а на листах это тёмные плитки `cell` с цифрой `onCell`. В Classic клавиша остаётся прежней:
/// стиль без своего цвета, то есть цвет темы.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, UiTemplate template, Widget Function(SharedState) screen,
      {bool start = true}) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      home: screen(state),
    ));
    await tester.pump();
    await tester.pump();
    if (!start) return;
    // Клавиатура появляется с началом партии — как у человека, по кнопке «Начать».
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
  }

  final screens = <String, (String, Widget Function(SharedState))>{
    'SDMT': ('цифра1', (s) => SdmtScreen(state: s, rnd: sdmt.createRng('клавиши'), seconds: 10)),
    'Математический спринт': (
      'клавиша1',
      (s) => MathSprintScreen(state: s, rnd: sprint.createRng('клавиши'), seconds: 10),
    ),
  };

  for (final MapEntry(key: name, value: (keyName, build)) in screens.entries) {
    testWidgets('$name: под «Авророй» клавиша — плитка cell с цифрой onCell', (tester) async {
      await open(tester, UiTemplate.aurora, build);
      final key = find.byKey(Key(keyName));
      expect(key, findsOneWidget);
      final style = tester.widget<FilledButton>(key).style!;
      // Явно набор «Авроры», а не GameColors.of: тот при пустой теме молча отдаёт classicFor (29.10).
      final roles = GameColors.auroraDark;
      expect(style.backgroundColor?.resolve({}), roles.cell);
      expect(style.foregroundColor?.resolve({}), roles.onCell);
      expect(style.side?.resolve({})?.color, roles.boardLine);
    });

    testWidgets('$name: в Classic клавиша без своего цвета — прежний цвет темы', (tester) async {
      await open(tester, UiTemplate.classic, build);
      final style = tester.widget<FilledButton>(find.byKey(Key(keyName))).style!;
      expect(style.backgroundColor, isNull);
      expect(style.foregroundColor, isNull);
      expect(style.side, isNull);
    });
  }

  // «Паттерны» начинаются сразу, а ключ кнопки — сам вариант ответа: берём первую.
  final answer = find.byWidgetPredicate((w) => w is FilledButton && '${w.key}'.contains('ответ')).first;
  Widget patternScreen(SharedState s) => PatternScreen(state: s, rnd: pattern.createRng('ответы'));

  testWidgets('Паттерны: под «Авророй» ответ — плитка cell с цифрой onCell', (tester) async {
    await open(tester, UiTemplate.aurora, patternScreen, start: false);
    final style = tester.widget<FilledButton>(answer).style!;
    // Явно набор «Авроры», а не GameColors.of: тот при пустой теме молча отдаёт classicFor (29.10).
    final roles = GameColors.auroraDark;
    expect(style.backgroundColor?.resolve({}), roles.cell);
    expect(style.foregroundColor?.resolve({}), roles.onCell);
    expect(style.side?.resolve({})?.color, roles.boardLine);
  });

  testWidgets('Паттерны: в Classic ответ без своего стиля — прежний вид', (tester) async {
    await open(tester, UiTemplate.classic, patternScreen, start: false);
    expect(tester.widget<FilledButton>(answer).style, isNull);
  });

  // «Быстрый счёт»: ответы появляются после показа точек — ждём показ и задержку с запасом.
  Widget quickCount(SharedState s) => QuickCountScreen(state: s, rnd: math.Random(7));
  Future<Finder> quickAnswer(WidgetTester tester, UiTemplate template) async {
    await open(tester, template, quickCount);
    // Показ точек, промежуток и задержка — с запасом; поштучно, чтобы таймеры раунда сработали.
    for (var i = 0; i < 12; i += 1) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    await tester.pump();
    return answer;
  }

  testWidgets('Быстрый счёт: под «Авророй» ответ — плитка cell с обводкой boardLine', (tester) async {
    final a = await quickAnswer(tester, UiTemplate.aurora);
    final style = tester.widget<FilledButton>(a).style!;
    final roles = GameColors.auroraDark;
    expect(style.backgroundColor?.resolve({}), roles.cell);
    expect(style.foregroundColor?.resolve({}), roles.onCell);
    expect(style.side?.resolve({})?.color, roles.boardLine);
  });

  testWidgets('Быстрый счёт: в Classic ответ без своего цвета', (tester) async {
    final a = await quickAnswer(tester, UiTemplate.classic);
    final style = tester.widget<FilledButton>(a).style!;
    expect(style.backgroundColor, isNull);
    expect(style.side, isNull);
  });
}
