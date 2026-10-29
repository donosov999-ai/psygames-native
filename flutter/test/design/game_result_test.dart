import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/ui_kit/aurora_button.dart';
import 'package:psygames_flutter/shell/ui_kit/game_result.dart';

import '../support/real_fonts.dart';

/// 🏁 Общий экран итога «Авроры» (46dc791d, лист 15): победа ≠ поражение, действия срабатывают,
/// ничего не вылезает на узких экранах и при крупном шрифте, текст читается в обеих темах.
void main() {
  setUpAll(loadRoboto);

  final taps = <String>[];
  GameResultAction act(String id, IconData icon) =>
      GameResultAction(key: Key(id), label: 'Действие с длинной подписью $id', icon: icon, onTap: () => taps.add(id));

  Widget panel({required bool won}) => GameResultPanel(
    won: won,
    title: won ? 'Уровень пройден!' : 'Попробуем ещё раз',
    subtitle: won ? 'Отличная работа!' : 'Лимит ошибок исчерпан',
    stats: won
        ? const [
            GameResultStat(icon: Icons.star_rounded, label: 'Уровень', value: '24 → 25'),
            GameResultStat(icon: Icons.local_fire_department_rounded, label: 'Получено', value: '+24 балла'),
          ]
        : const [],
    board: Container(key: const Key('board'), width: 280, height: 280, color: Colors.black12),
    primary: act(won ? 'next' : 'retry', won ? Icons.chevron_right : Icons.replay),
    pair: won ? [act('again', Icons.replay), act('games', Icons.sports_esports)] : const [],
    extra: won ? const [] : [act('teacher', Icons.school), act('games', Icons.sports_esports)],
  );

  Future<void> show(
    WidgetTester t,
    Widget w, {
    Brightness b = Brightness.dark,
    double width = 390,
    double scale = 1,
  }) async {
    t.view.physicalSize = Size(width, 844) * 2;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        theme: applyUiTemplate(
          classicShellTheme(b),
          UiTemplate.aurora,
        ).copyWith(textTheme: classicShellTheme(b).textTheme.apply(fontFamily: 'Roboto')),
        builder: (c, child) => MediaQuery(
          data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(scale)),
          child: DefaultTextStyle.merge(
            style: const TextStyle(fontFamily: 'Roboto'),
            child: child!,
          ),
        ),
        home: Scaffold(body: w),
      ),
    );
  }

  Color textColor(WidgetTester t, String key) => t.widget<Text>(find.byKey(Key(key))).style!.color!;

  testWidgets('победа и поражение различаются: цвет заголовка, пояснение, значок, показатели', (t) async {
    await show(t, panel(won: true));
    final wonTitle = textColor(t, 'game-result-title');
    expect(find.byKey(const Key('game-result-hero-won')), findsOneWidget);
    expect(find.byKey(const Key('game-result-stats')), findsOneWidget);
    await show(t, panel(won: false));
    expect(textColor(t, 'game-result-title'), isNot(wonTitle));
    expect(
      textColor(t, 'game-result-subtitle'),
      GameColors.auroraDark.wrong,
      reason: 'причина поражения — цветом ошибки',
    );
    expect(find.byKey(const Key('game-result-hero-lost')), findsOneWidget);
    expect(find.byKey(const Key('game-result-stats')), findsNothing);
  });

  testWidgets('действия срабатывают; главная — одна оранжевая', (t) async {
    taps.clear();
    await show(t, panel(won: true));
    for (final id in ['next', 'again', 'games']) {
      await t.ensureVisible(find.byKey(Key(id)));
      await t.tap(find.byKey(Key(id)));
    }
    expect(taps, ['next', 'again', 'games']);
    expect(t.widgetList<AuroraButton>(find.byType(AuroraButton)).where((b) => b.primary).length, 1);
  });

  for (final b in Brightness.values) {
    for (final width in const [320.0, 390.0, 430.0]) {
      for (final scale in const [1.0, 2.0]) {
        testWidgets('${b.name} ${width.toInt()} pt, шрифт ×$scale: ничего не вылезает', (t) async {
          for (final won in [true, false]) {
            await show(
              t,
              panel(won: won),
              b: b,
              width: width,
              scale: scale,
            );
            expect(t.takeException(), isNull, reason: won ? 'победа' : 'поражение');
          }
        });
      }
    }

    test('${b.name}: текст читается (≥ 4,5:1)', () {
      final dark = b == Brightness.dark;
      final bg = auroraToken('background', dark: dark)!;
      final raised = auroraToken('raised', dark: dark)!;
      final g = GameColors.aurora(b);
      final pairs = <String, double>{
        'заголовок победы': _contrast(g.correct, bg),
        'причина поражения': _contrast(g.wrong, bg),
        'заголовок поражения': _contrast(auroraToken('text', dark: dark)!, bg),
        'подпись показателя': _contrast(auroraToken('textSecondary', dark: dark)!, raised),
        'текст главной кнопки': _contrast(AuroraButton.onAction, AuroraButton.action),
      };
      expect({
        for (final e in pairs.entries)
          if (e.value < 4.5) e.key: e.value.toStringAsFixed(2),
      }, isEmpty);
    });
  }
}

double _contrast(Color a, Color b) {
  double lum(Color c) {
    double ch(double v) => v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  final x = lum(a), y = lum(b);
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}
