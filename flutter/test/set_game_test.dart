import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/set_game/model.dart';

/// СВЕРКА ПРАВИЛ SET С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/set-game-reference.json` выгружен прогоном веб-кода: колода
/// из 81 карты в том же порядке, параметры 20 уровней, по четыре расклада на
/// четырёх уровнях с одним зерном и ВСЕ 220 троек одного стола с вердиктом.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/set-game-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 колода та же: 81 карта в том же порядке', () {
    final deck = allCards();
    expect(deck.length, ref['deckSize']);
    expect(deck.map((c) => c.id).toList(), (ref['deckIds'] as List).cast<String>());
    expect(setBoardSize, ref['boardSize']);
    expect(setBossEvery, ref['bossEvery']);
    expect(setErrorsAllowed, ref['errorsAllowed']);
    expect(deck.map((c) => c.id).toSet().length, 81, reason: 'все карты разные');
  });

  test('🔴 20 уровней: раскладов в серии и лимит времени', () {
    for (final raw in ref['params'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.trials, e['trials'], reason: '$at раскладов');
      expect(p.timeLimit, e['timeLimit'], reason: '$at лимит');
    }
    expect(levelParams(10).timeLimit, 0, reason: 'до одиннадцатого давления временем нет');
    expect(levelParams(11).timeLimit, 26, reason: 'на одиннадцатом лимит появляется');
    expect(levelParams(15).timeLimit, 10);
    expect(levelParams(99).timeLimit, 8, reason: 'лимит не опускается ниже восьми секунд');
  });

  test('🔴 вердикт «сет или нет» совпадает на ВСЕХ 220 тройках одного стола', () {
    final board = (ref['tripleBoard'] as List).cast<String>();
    final byId = {for (final c in allCards()) c.id: c};
    var checked = 0;
    var sets = 0;
    for (final raw in ref['triples'] as List) {
      final e = raw as Map<String, dynamic>;
      final ids = (e['ids'] as List).cast<String>();
      final got = isSet(byId[ids[0]]!, byId[ids[1]]!, byId[ids[2]]!);
      expect(got, e['isSet'], reason: 'тройка $ids');
      if (got) sets += 1;
      checked += 1;
    }
    expect(board.length, setBoardSize);
    expect(checked, 220, reason: 'перебор, а не выборка: C(12,3) = 220');
    expect(sets > 0, isTrue, reason: 'на столе есть хотя бы один сет: $sets');
  });

  test('🔴 расклады раздаются те же — карты и первый найденный сет', () {
    for (final raw in ref['boards'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rnd = createRng('set|$level');
      for (final rawDeal in (e['deals'] as List)) {
        final want = rawDeal as Map<String, dynamic>;
        final got = buildBoard(rnd);
        expect(got.map((c) => c.id).toList(), (want['ids'] as List).cast<String>(),
            reason: 'L$level карты расклада');
        expect(findAnySet(got), (want['firstSet'] as List).cast<int>(),
            reason: 'L$level первый сет');
      }
    }
  });

  test('🔴 КАЖДЫЙ расклад решаем: сет есть, иначе игрок ищет то, чего нет', () {
    // Вопрос раскладу, а не генератору: сто столов подряд, в каждом ищем сет
    // перебором и проверяем, что найденная тройка действительно сет.
    final rnd = createRng('решаемость');
    for (var i = 0; i < 100; i += 1) {
      final board = buildBoard(rnd);
      expect(board.length, setBoardSize, reason: 'карт на столе ровно $setBoardSize');
      expect(board.map((c) => c.id).toSet().length, setBoardSize, reason: 'карты не повторяются');
      final found = findAnySet(board);
      expect(found, isNotNull, reason: 'расклад $i без единого сета');
      expect(isSet(board[found![0]], board[found[1]], board[found[2]]), isTrue,
          reason: 'найденная тройка обязана быть сетом');
    }
  });

  test('🔴 РАСКЛАДКА: карта не мельче пальца — проверено там, где граница включается', () {
    // ⚠️ Мутация «убрать нижнюю границу» не краснела на 360×640 и 390×844, и это
    // не дыра, а равносильность: там карта и так крупнее. Граница работает на
    // НИЗКОМ поле — его и берём, иначе правило держится на слово.
    final low = setTable(288, 300);
    expect((300 - 8 * 3) / 4 / 1.5 < setMinCard, isTrue,
        reason: 'без границы вышло бы ${(300 - 8 * 3) / 4 / 1.5}');
    expect(low.card, setMinCard, reason: 'граница подняла карту до пальца');
    expect(low.rows, 4, reason: 'двенадцать карт в три колонки — четыре ряда');

    // На просторном поле правило не вмешивается: карту задаёт ширина или высота.
    final roomy = setTable(360, 700);
    expect(roomy.card > setMinCard, isTrue, reason: 'на просторном поле карта крупнее пальца');
  });

  test('🔴 разбор по признакам говорит правду: у не-сета хотя бы один признак ломается', () {
    final rnd = createRng('разбор');
    final board = buildBoard(rnd);
    var nonSets = 0;
    for (var i = 0; i < board.length; i += 1) {
      for (var j = i + 1; j < board.length; j += 1) {
        for (var k = j + 1; k < board.length; k += 1) {
          final ok = isSet(board[i], board[j], board[k]);
          final parts = explainSet(board[i], board[j], board[k]);
          expect(parts.values.every((v) => v), ok,
              reason: 'все четыре признака сходятся тогда и только тогда, когда это сет');
          if (!ok) nonSets += 1;
        }
      }
    }
    expect(nonSets > 200, isTrue, reason: 'проверено $nonSets не-сетов');
  });
}
