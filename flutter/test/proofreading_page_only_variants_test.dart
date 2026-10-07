import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// «КОРРЕКТУРА»: СЕРИЮ БЛОКОВ И ЗАДАНИЕ «ФИЛВОРДЫ» НАТИВ ПОКА НЕ УМЕЕТ.
///
/// Перехват открывал вместо них одну обычную партию с буквами — молча: вход «Блоки
/// корректуры» в зарядке и шаг шахматной зарядки вели не туда. До переноса обоих
/// вариантов (задачи f4bb47dc, caaa1596) такие адреса остаются на странице, а голый
/// адрес и обычный шаг зарядки — по-прежнему в натив.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const origin = 'http://127.0.0.1:54321';

  test('🔴 адреса — те, что шлёт веб: вход «Блоки корректуры» и шаг шахматной зарядки', () {
    // Переименует веб параметр — перехват станет промахиваться молча. Краснеет здесь.
    final entries = File('../frontend/src/services/warmupEntries.ts').readAsStringSync();
    expect(
        RegExp(r"'proofreading-blocks'\)\s*return\s*\{\s*pathname:\s*'/games/proofreading',\s*params:\s*\{[^}]*series:\s*'1'")
            .hasMatch(entries),
        isTrue,
        reason: 'вход «Блоки корректуры» больше не шлёт series: 1');
    final chess = File('../frontend/src/services/chessWarmup.ts').readAsStringSync();
    expect(RegExp(r"game_route:\s*'/games/proofreading'[^\n]*taskMode:\s*'fillwords'").hasMatch(chess), isTrue,
        reason: 'шаг шахматной зарядки больше не шлёт taskMode: fillwords');
    final web = File('../frontend/app/games/proofreading.tsx').readAsStringSync();
    expect(web, contains("bool('series')"), reason: 'страница читает серию иначе — сверить правило перехвата');
    expect(web, contains("str('taskMode', 'letters') === 'fillwords'"),
        reason: 'страница читает задание иначе — сверить правило перехвата');
  });

  test('🔴 серия и филворды остаются на странице', () {
    for (final url in [
      '$origin/games/proofreading?auto=1&series=1',
      '$origin/games/proofreading.html?auto=1&series=1',
      '$origin/games/proofreading?series=true',
      '$origin/games/proofreading?wu=1&level=7&taskMode=fillwords',
      '$origin/games/proofreading.html?wu=1&level=7&taskMode=fillwords#top',
      '/games/proofreading?auto=1&series=1', // так адрес приходит с карточки развилки
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('голый адрес и обычный шаг зарядки — по-прежнему натив', () {
    for (final url in [
      '$origin/games/proofreading',
      '$origin/games/proofreading.html',
      '$origin/games/proofreading?wu=1&level=7&cols=8',
      '$origin/games/proofreading?auto=1',
      // Веб читает `bool('series')`: «0» — не серия. И буквы — обычное задание.
      '$origin/games/proofreading?series=0',
      '$origin/games/proofreading?wu=1&taskMode=letters',
      // Битый хвост не роняет разбор и не уводит на страницу.
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
