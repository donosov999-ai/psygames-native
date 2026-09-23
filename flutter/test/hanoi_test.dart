import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/model.dart';

/// СВЕРКА «ХАНОЯ» С ЖИВЫМ TS.
///
/// Минимум ходов для 4+ стержней считается формулой Фрейма-Стюарта, а не
/// степенью двойки; звёзды и счёт меряются от него. Ответы выгружены прогоном
/// живого TS.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/hanoi-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 минимум ходов совпадает с живым TS на 60 сочетаниях', () {
    final bad = <String>[];
    for (final raw in ref['optimal'] as List) {
      final c = raw as Map<String, dynamic>;
      final got = frameStewart(c['n'] as int, c['pegs'] as int);
      if (got != c['moves']) bad.add('${c['n']} дисков на ${c['pegs']} стержнях: TS ${c['moves']}, Dart $got');
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 то, ради чего формула: на четырёх стержнях решение КОРОЧЕ степени двойки', () {
    // Поставь 2ⁿ−1 для четырёх стержней — и эта проба покраснеет.
    expect(frameStewart(9, 3), 511);
    expect(frameStewart(9, 4), 41);
    expect(frameStewart(9, 5), 27);
    expect(frameStewart(12, 5), 47);
  });

  test('🔴 лестница уровней совпадает: диски и число стержней', () {
    for (final raw in ref['levels'] as List) {
      final l = raw as Map<String, dynamic>;
      final p = levelParams(l['level'] as int);
      expect(p.discs, l['discs'], reason: 'дисков на L${l['level']}');
      expect(p.pegs, l['pegs'], reason: 'стержней на L${l['level']}');
      expect(frameStewart(p.discs, p.pegs), l['optimal'], reason: 'минимум на L${l['level']}');
    }
  });

  test('🔴 звёзды и счёт совпадают', () {
    for (final raw in ref['stars'] as List) {
      final s = raw as Map<String, dynamic>;
      expect(hanoiStars(s['moves'] as int, s['min'] as int), s['stars'],
          reason: 'ходов ${s['moves']} при минимуме ${s['min']}');
    }
    for (final raw in ref['scores'] as List) {
      final s = raw as Map<String, dynamic>;
      expect(hanoiScore(s['moves'] as int, s['min'] as int, s['seconds'] as int), s['score'],
          reason: 'счёт: ходов ${s['moves']}, минимум ${s['min']}, секунд ${s['seconds']}');
    }
  });

  test('🔴 правило хода: меньший диск на больший, и никогда наоборот', () {
    final s = HanoiState.start(1);
    expect(s.discs, 3);
    expect(s.pegs[0], [3, 2, 1], reason: 'снизу самый широкий');
    expect(s.pegs.length, 3);

    expect(s.canMove(0, 1), isTrue, reason: 'единицу на пустой — можно');
    expect(s.canMove(1, 0), isFalse, reason: 'с пустого брать нечего');
    final a = s.move(0, 1)!;               // 1 → второй
    final b = a.move(0, 2)!;               // 2 → третий
    expect(b.canMove(1, 2), isTrue, reason: 'единицу на двойку — можно');
    expect(b.canMove(2, 1), isFalse, reason: 'двойку на единицу — нельзя');
    expect(b.move(2, 1), isNull, reason: 'незаконный ход не меняет положение');
  });

  test('🔴 победа — когда все диски на ПОСЛЕДНЕМ стержне', () {
    // Три диска, три стержня: классическая последовательность из семи ходов.
    var s = HanoiState.start(1);
    const moves = [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]];
    for (final m in moves) {
      final next = s.move(m[0], m[1]);
      expect(next, isNotNull, reason: 'ход ${m[0]}→${m[1]} обязан быть законным');
      s = next!;
    }
    expect(s.solved, isTrue);
    expect(moves.length, frameStewart(3, 3), reason: 'и ровно за минимум');
    // Башня, собранная на СРЕДНЕМ стержне, победой не считается.
    final wrong = HanoiState([<int>[], [3, 2, 1], <int>[]], 3);
    expect(wrong.solved, isFalse);
  });
}
