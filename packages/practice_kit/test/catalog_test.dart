import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// Каталог практик — один на оба приложения. Здесь проверяется, что он целый:
/// объявлен ассетом пакета, грузится движком и каждая программа собирается в план.
void main() {
  final raw = jsonDecode(File('assets/practices.json').readAsStringSync()) as Json;
  final engine = Practices(raw);

  test('каталог объявлен ассетом пакета и путь для приложений с ним сходится', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/practices.json'));
    expect(practiceCatalogAsset, 'packages/practice_kit/assets/practices.json');
  });

  test('каждая программа каждого набора собирается в план с шагами', () {
    var programs = 0;
    for (final set in engine.catalog) {
      for (final program in objects(set['programs'])) {
        programs++;
        final selections = [
          {'setId': set['id'], 'programId': program['id']},
        ];
        final plan = engine.plan({
          'mode': 'solo',
          'durationMs': 120000,
          'locale': 'ru',
          'selections': selections,
          'guideMode': 'visual',
          'context': 'home',
          'acknowledgedWarnings': engine.requiredWarnings(selections),
          // Как зовут приложения: экспериментальное — предупреждение, не отказ.
          'advisory': true,
        });
        expect(objects(plan['timeline']), isNotEmpty, reason: '${set['id']}/${program['id']}');
      }
    }
    expect(programs, greaterThanOrEqualTo(51));
  });
}
