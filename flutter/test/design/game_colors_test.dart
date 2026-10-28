import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_colors.dart';

/// 🎨 СМЫСЛОВЫЕ ЦВЕТА ИГР: classic = то, что игры рисуют сегодня; тема со своим набором — перекрашивает.
void main() {
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

  testWidgets('тема без расширения (сегодняшнее приложение) — classic', (t) async {
    expect(await colorsUnder(t, ThemeData(useMaterial3: true)), same(GameColors.classic));
  });

  testWidgets('тема со своим набором — игры берут его', (t) async {
    final other = GameColors.classic.copyWith(correct: const Color(0xFF00AA88));
    final got = await colorsUnder(t, ThemeData(useMaterial3: true, extensions: [other]));
    expect(got.correct, const Color(0xFF00AA88));
    expect(got.wrong, GameColors.classic.wrong);
  });

  test('classic — самые частые цвета игр сегодня: перевод на роли не меняет ни пикселя', () {
    // Замер по lib/games: каждая роль classic обязана совпасть с литералом, который игры уже рисуют.
    final counts = <int, int>{};
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      for (final m in RegExp(r'Color\(0x([0-9A-Fa-f]{8})\)').allMatches(f.readAsStringSync())) {
        final v = int.parse(m.group(1)!, radix: 16);
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    const c = GameColors.classic;
    for (final (name, color) in [
      ('correct', c.correct),
      ('wrong', c.wrong),
      ('warning', c.warning),
      ('selected', c.selected),
      ('highlight', c.highlight),
      ('muted', c.muted),
    ]) {
      expect(
        counts[color.toARGB32()] ?? 0,
        greaterThan(0),
        reason: '$name: такого цвета в играх нет — classic изменил бы вид',
      );
    }
    final top = (counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value))).first.key;
    expect(c.correct.toARGB32(), top, reason: '«верно» — самый частый цвет игр');
  });

  test('lerp — плавный переход между наборами, чужой тип не ломает', () {
    final b = GameColors.classic.copyWith(correct: const Color(0xFF000000));
    expect(GameColors.classic.lerp(b, 1).correct, const Color(0xFF000000));
    expect(GameColors.classic.lerp(null, 0.5), same(GameColors.classic));
  });
}
