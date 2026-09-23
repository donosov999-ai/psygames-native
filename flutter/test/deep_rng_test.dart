import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/rng.dart';

/// 🔴 ЖРЕБИЙ СОВПАДАЕТ С ЖИВЫМ JS ДО ПОСЛЕДНЕГО БИТА.
///
/// Это необходимое условие всего переноса «Бездны»: дерево не хранится, узлы рождаются
/// от (зерно, путь). Разойдётся жребий — разойдутся доски, и рука человека в старой
/// партии встанет на клетки, которых в новой доске нет пустыми.
void main() {
  final data = jsonDecode(File('test/fixtures/deep-reference.json').readAsStringSync())
      as Map<String, Object?>;
  final probes = (data['rng'] as List).cast<Map<String, Object?>>();

  test('🔴 хеш зерна и первые пять чисел совпадают на каждом зерне', () {
    expect(probes.length, greaterThan(3));
    for (final p in probes) {
      final seed = p['seed'] as String;
      expect(hashSeed(seed), (p['hash'] as num).toInt(), reason: 'хеш зерна «$seed»');
      final rng = Rng(seed);
      final want = (p['first'] as List).cast<num>();
      for (var i = 0; i < want.length; i++) {
        expect(rng.next(), closeTo(want[i].toDouble(), 1e-12),
            reason: 'зерно «$seed», число ${i + 1}');
      }
    }
  });

  test('одна строка — одна и та же последовательность', () {
    final a = Rng('бездна-abyss-0');
    final b = Rng('бездна-abyss-0');
    for (var i = 0; i < 20; i++) {
      expect(a.next(), b.next());
    }
  });

  test('приведение зерна: пробелы, подчёркивания и края', () {
    expect(normalizeSeed('  Бездна __ Тест  '), 'бездна-тест');
    expect(normalizeSeed('a--b'), 'a-b');
    expect(normalizeSeed('-край-'), 'край');
  });
}
