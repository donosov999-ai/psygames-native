import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_colors.dart';

/// 🎨 СМЫСЛОВЫЕ ЦВЕТА ИГР (ed1cc06d): Classic не сдвигает доску; роли исхода — цвета, которые игры уже
/// рисуют; «Аврора» — читаемые цифры на клетке и одинаковое поле стимулов в обеих темах.
void main() {
  // Тема приложения сегодня (`main.dart`): seed `#7F7FD5`, Material 3.
  ThemeData app(Brightness b) => ThemeData(colorSchemeSeed: const Color(0xFF7F7FD5), brightness: b, useMaterial3: true);

  Future<GameColors> colorsUnder(WidgetTester t, ThemeData theme) async {
    late GameColors got;
    await t.pumpWidget(
      MaterialApp(
        theme: theme,
        home: Builder(
          builder: (c) {
            got = GameColors.of(c);
            return const SizedBox();
          },
        ),
      ),
    );
    return got;
  }

  for (final b in Brightness.values) {
    testWidgets('${b.name}: тема без расширения — Classic, доска ровно из ColorScheme (поля судоку не сдвигаются)', (
      t,
    ) async {
      final theme = app(b);
      final s = theme.colorScheme;
      final got = await colorsUnder(t, theme);
      expect(got.cell, s.surface);
      expect(got.cellAlt, s.surfaceContainerHighest);
      expect(got.boardLine, s.outlineVariant);
      expect(got.boardLineStrong, s.onSurface);
      expect(got.onCell, s.onSurface);
      expect(got.inkPlaced, s.primary);
      expect(got.notesInk, s.onSurfaceVariant);
      expect(got.correct, const Color(0xFF22C55E));
    });
  }

  testWidgets('тема со своим набором (шаблон «Аврора») — игры берут его', (t) async {
    final got = await colorsUnder(t, app(Brightness.dark).copyWith(extensions: [GameColors.auroraDark]));
    expect(got, same(GameColors.auroraDark));
    expect(GameColors.aurora(Brightness.light), same(GameColors.auroraLight));
  });

  test('Classic: постоянные роли — прежние цвета игр (замер 28.10 по main f14f402e2), Classic не уплывает', () {
    // Откуда каждое значение: «верно» — 67 мест в играх, «ошибка» — 39, «внимание» — 19 (замер по lib/games);
    // выбор, подсветка и ошибка клетки — «Судоку» (`highlight.dart` до перевода на роли); подсказка,
    // связь, награда, поле стимулов — описи разделов `aurora_v1/inventory/sudoku.md`, `search-counting.md`.
    const before = <String, int>{
      'correct': 0xFF22C55E,
      'wrong': 0xFFEF4444,
      'warning': 0xFFF59E0B,
      'wrongFill': 0xFFFECACA,
      'wrongInk': 0xFFB91C1C,
      'selected': 0xFF5B4FD1,
      'highlight': 0xFF7F7FD5,
      'onStrong': 0xFFFFFFFF,
      'stimulusField': 0xFF1F2937,
      'hint': 0xFFB45309,
      'link': 0xFFA89FDB,
      'reward': 0xFFEF9F27,
      'muted': 0xFF94A3B8,
    };
    final c = GameColors.classicFor(app(Brightness.light).colorScheme).roles;
    expect({for (final k in before.keys) k: c[k]!.toARGB32()}, before);
  });

  group('«Аврора»: читаемость (≥ 4,5:1 для цифр и текста, ≥ 3:1 для значков и линий блока)', () {
    for (final (name, g) in [('тёмная', GameColors.auroraDark), ('светлая', GameColors.auroraLight)]) {
      test(name, () {
        final bad = <String>[
          for (final (fg, bg, min) in [
            ('onCell', 'cell', 4.5),
            ('onCell', 'cellAlt', 4.5),
            ('inkPlaced', 'cell', 4.5),
            ('notesInk', 'cell', 4.5),
            ('wrongInk', 'wrongFill', 4.5),
            ('onStrong', 'selected', 4.5),
            ('onStrong', 'highlight', 4.5),
            ('correct', 'cell', 3.0),
            ('wrong', 'cell', 3.0),
            ('selected', 'cell', 3.0),
            ('boardLineStrong', 'cell', 3.0),
          ])
            if (_contrast(g.roles[fg]!, g.roles[bg]!) < min)
              '$fg на $bg: ${_contrast(g.roles[fg]!, g.roles[bg]!).toStringAsFixed(2)} < $min',
        ];
        expect(bad, isEmpty);
      });
    }

    test('поле стимулов одинаково в обеих темах — цвета стимулов читаются одинаково (лист 23)', () {
      expect(GameColors.auroraLight.stimulusField, GameColors.auroraDark.stimulusField);
    });
  });

  test('copyWith и lerp покрывают все роли — новая роль без них не пройдёт', () {
    final a = GameColors.auroraLight;
    final b = GameColors.auroraDark;
    expect(a.roles.length, 20);
    expect(a.lerp(b, 1).roles, b.roles);
    expect(a.copyWith().roles, a.roles);
    expect(a.lerp(null, 0.5), same(a));
  });
}

/// Контраст по WCAG 2.x.
double _contrast(Color a, Color b) {
  double lum(Color c) {
    double ch(double v) => v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  final x = lum(a), y = lum(b);
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}
