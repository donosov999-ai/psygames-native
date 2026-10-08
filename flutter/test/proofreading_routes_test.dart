import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// «КОРРЕКТУРА»: ВСЕ ЕЁ АДРЕСА — В НАТИВ.
///
/// До переноса серии (задача f4bb47dc) вход «Блоки корректуры» (`auto=1&series=1`) временно
/// уходил на страницу (PR #285): натив серии не знал и молча давал одну обычную партию. С
/// нативной серией таблица страничных вариантов снята: адрес с серией открывает натив, а
/// экран сам начинает серию по `series` (как веб `seriesPreset ? beginSeries() : startGame()`).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const origin = 'http://127.0.0.1:54321';

  test('🔴 отправители и читатель серии — те, на которых стоит перехват', () {
    final entries = File('../frontend/src/services/warmupEntries.ts').readAsStringSync();
    expect(
        RegExp(r"'proofreading-blocks'\)\s*return\s*\{\s*pathname:\s*'/games/proofreading',\s*params:\s*\{[^}]*series:\s*'1'")
            .hasMatch(entries),
        isTrue,
        reason: 'вход «Блоки корректуры» больше не шлёт series: 1');
    // Натив читает серию сам — иначе адрес снова надо уводить на страницу.
    final screen = File('lib/games/proofreading/screen.dart').readAsStringSync();
    expect(screen, contains("GamePreset.flag('series')"), reason: 'нативный экран не читает серию');
  });

  test('🔴 серия, шаги зарядки и голый адрес — натив', () {
    for (final url in [
      '$origin/games/proofreading',
      '$origin/games/proofreading.html',
      '$origin/games/proofreading?auto=1&series=1',
      '$origin/games/proofreading.html?auto=1&series=1#top',
      '/games/proofreading?auto=1&series=1', // так адрес приходит с карточки развилки
      '$origin/games/proofreading?wu=1&level=7&cols=8',
      '$origin/games/proofreading?wu=1&level=7&taskMode=fillwords',
      '$origin/games/proofreading?cols=%zz',
    ]) {
      expect(HybridApp.routeOf(url), '/games/proofreading', reason: url);
    }
  });

  test('⚠️ битая кодировка в хвосте не роняет перехват и у игр с режимами', () {
    // `Uri.splitQueryString` на `%zz` бросает ArgumentError, а не FormatException:
    // до 07.10.2026 разбор режимов ловил только второе, и переход падал.
    for (final url in [
      '$origin/games/anagrams?mode=cross&lang=%zz',
      '$origin/games/proofreading?series=%zz',
    ]) {
      expect(() => HybridApp.routeOf(url), returnsNormally, reason: url);
    }
  });
}
