import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
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
  setUpAll(() async {
    await loadRoboto();
    // Значки Material — в пробах по умолчанию квадраты; для кадров приёмки нужен настоящий шрифт значков.
    final icons = File(
      '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    );
    await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())))).load();
  });

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

  testWidgets('победа и поражение различаются: картинка, пояснение, показатели; заголовок — цвет текста', (t) async {
    await show(t, panel(won: true));
    final wonSub = textColor(t, 'game-result-subtitle');
    expect(wonSub, GameColors.auroraDark.selected, reason: '«Отличная работа!» — голубым, как на листе');
    expect(textColor(t, 'game-result-title'), auroraToken('text', dark: true));
    expect(find.byKey(const Key('game-result-hero-won')), findsOneWidget);
    expect(find.byKey(const Key('game-result-stats')), findsOneWidget);
    await show(t, panel(won: false));
    expect(textColor(t, 'game-result-subtitle'), isNot(wonSub));
    expect(textColor(t, 'game-result-title'), auroraToken('text', dark: true));
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
    // Флаг «значок справа» доходит от действия до кнопки (лист 15: «Следующий уровень ›»).
    await show(t, _sheetLike(won: true, dark: true));
    final next = t.widgetList<AuroraButton>(find.byType(AuroraButton)).firstWhere((b) => b.primary);
    expect(next.trailing, isTrue);
    final label = t.getTopLeft(find.text('Следующий уровень')).dx;
    expect(t.getTopLeft(find.byIcon(Icons.chevron_right)).dx, greaterThan(label), reason: 'стрелка справа от подписи');
  });

  // Кадры для приёмки в три колонки (лист 15 / сборка / наложение): только с
  // --dart-define=RESULT_EVIDENCE_DIR=<папка>; в обычном прогоне ничего не пишет.
  const evidence = String.fromEnvironment('RESULT_EVIDENCE_DIR');
  if (evidence.isNotEmpty) {
    for (final b in Brightness.values) {
      for (final won in [true, false]) {
        testWidgets('кадр ${b.name} ${won ? 'won' : 'lost'}', (t) async {
          final key = GlobalKey();
          await show(
            t,
            RepaintBoundary(
              key: key,
              child: _sheetLike(won: won, dark: b == Brightness.dark),
            ),
            b: b,
          );
          await t.runAsync(() async {
            final img = await (key.currentContext!.findRenderObject()! as RenderRepaintBoundary).toImage(pixelRatio: 2);
            final png = await img.toByteData(format: ui.ImageByteFormat.png);
            await Directory(evidence).create(recursive: true);
            await File('$evidence/result-${b.name}-${won ? 'won' : 'lost'}.png')
                .writeAsBytes(png!.buffer.asUint8List());
            img.dispose();
          });
        });
      }
    }
  }

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
        '«Отличная работа!»': _contrast(g.selected, bg),
        'причина поражения': _contrast(auroraToken('textSecondary', dark: dark)!, bg),
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

/// Экран как на листе 15: те же подписи и простое поле 9×9 ролями доски — только для кадров приёмки.
Widget _sheetLike({required bool won, required bool dark}) {
  final g = GameColors.aurora(dark ? Brightness.dark : Brightness.light);
  const digits = '123456789456789123789123456214365897365897214897214365531642978642978531978531642';
  final board = SizedBox(
    width: 300,
    height: 300,
    child: GridView.count(
      crossAxisCount: 9,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        for (var i = 0; i < 81; i++)
          Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: g.cell,
              border: Border.all(color: g.boardLine, width: 0.5),
            ),
            child: Text(digits[i], style: TextStyle(fontSize: 15, color: g.onCell)),
          ),
      ],
    ),
  );
  void none() {}
  return GameResultPanel(
    won: won,
    title: won ? 'Уровень пройден!' : 'Попробуем ещё раз',
    subtitle: won ? 'Отличная работа!' : 'Лимит ошибок исчерпан',
    stats: won
        ? const [
            GameResultStat(icon: Icons.star_rounded, label: 'Уровень', value: '24 → 25'),
            GameResultStat(icon: Icons.local_fire_department_rounded, label: 'Получено', value: '+ 24 балла'),
          ]
        : const [],
    board: board,
    primary: won
        ? GameResultAction(label: 'Следующий уровень', icon: Icons.chevron_right, onTap: none, trailing: true)
        : GameResultAction(label: 'Повторить', icon: Icons.replay, onTap: none),
    pair: won
        ? [
            GameResultAction(label: 'Ещё раз', icon: Icons.replay, onTap: none),
            GameResultAction(label: 'К играм', icon: Icons.sports_esports_outlined, onTap: none),
          ]
        : const [],
    extra: won
        ? const []
        : [
            GameResultAction(label: 'Разобрать с учителем', icon: Icons.school_outlined, onTap: none),
            GameResultAction(label: 'К играм', icon: Icons.sports_esports_outlined, onTap: none),
          ],
  );
}
