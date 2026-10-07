import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// «КОРРЕКТУРА»: СЕРИЮ БЛОКОВ НАТИВ ПОКА НЕ УМЕЕТ.
///
/// Перехват открывал вместо неё одну обычную партию — молча: вход «Блоки корректуры»
/// в зарядке вёл не туда. До переноса серии (задача f4bb47dc) такой адрес остаётся на
/// странице, а голый адрес и обычный шаг зарядки — по-прежнему в натив.
///
/// ⚠️ Шаг языковой зарядки с филвордами — тоже натив: в зарядке страница филворды не
/// запускает и играет буквы, увод на страницу ничего бы не дал.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const origin = 'http://127.0.0.1:54321';

  test('🔴 адреса — те, что шлёт веб, и правило страницы — то, на котором стоит перехват', () {
    // Переименует веб параметр — перехват станет промахиваться молча. Краснеет здесь.
    final entries = File('../frontend/src/services/warmupEntries.ts').readAsStringSync();
    expect(
        RegExp(r"'proofreading-blocks'\)\s*return\s*\{\s*pathname:\s*'/games/proofreading',\s*params:\s*\{[^}]*series:\s*'1'")
            .hasMatch(entries),
        isTrue,
        reason: 'вход «Блоки корректуры» больше не шлёт series: 1');
    final web = File('../frontend/app/games/proofreading.tsx').readAsStringSync();
    expect(web, contains("bool('series')"), reason: 'страница читает серию иначе — сверить правило перехвата');
    // Шаг зарядки с филвордами остаётся нативным, ПОТОМУ ЧТО страница в зарядке их не
    // запускает. Начнёт запускать — этот шаг надо переводить: либо филворды в натив
    // (caaa1596), либо адрес — в таблицу страницы.
    final chess = File('../frontend/src/services/chessWarmup.ts').readAsStringSync();
    expect(RegExp(r"game_route:\s*'/games/proofreading'[^\n]*taskMode:\s*'fillwords'").hasMatch(chess), isTrue,
        reason: 'шаг языковой зарядки больше не просит филворды — сверить пробу');
    final warmup = File('../frontend/src/services/warmup.ts').readAsStringSync();
    expect(warmup, contains("const p: Record<string, string> = { wu: '1' };"),
        reason: 'шаг зарядки больше не ставит wu=1 — страница может запустить филворды');
    expect(RegExp(r"const fillwordsRound = !isPreset && taskMode === 'fillwords'").hasMatch(web), isTrue,
        reason: 'страница теперь запускает филворды и в зарядке — шаг с taskMode уже не равен нативу');
  });

  test('🔴 серия остаётся на странице', () {
    for (final url in [
      '$origin/games/proofreading?auto=1&series=1',
      '$origin/games/proofreading.html?auto=1&series=1',
      '$origin/games/proofreading?series=true',
      '$origin/games/proofreading.html?auto=1&series=1#top',
      '/games/proofreading?auto=1&series=1', // так адрес приходит с карточки развилки
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('голый адрес и шаги зарядки — по-прежнему натив', () {
    for (final url in [
      '$origin/games/proofreading',
      '$origin/games/proofreading.html',
      '$origin/games/proofreading?wu=1&level=7&cols=8',
      '$origin/games/proofreading?auto=1',
      // Шаг языковой зарядки: страница в зарядке играет буквы — как натив.
      '$origin/games/proofreading?wu=1&level=7&taskMode=fillwords',
      // Веб читает `bool('series')`: «0» — не серия.
      '$origin/games/proofreading?series=0',
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
