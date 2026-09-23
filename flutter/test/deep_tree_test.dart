import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/tree.dart';

/// 🔴 УЗЕЛ В УЗЕЛ: МАТЕРИАЛИЗАЦИЯ СОВПАДАЕТ С ЖИВЫМ JS.
///
/// Дерево «Бездны» не хранится — узлы рождаются от (зерно, путь). Поэтому сверяется не
/// «похожесть досок», а КАЖДЫЙ ответ материализации: сама доска, её решение, число
/// дырок, порог открытия и список кормимых клеток. Разойдётся хоть один — человек,
/// продолжающий старую партию, получит другое дерево под уже наигранной рукой.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/deep-reference.json').readAsStringSync())
      as Map<String, Object?>;
  final nodes = (data['nodes'] as List).cast<Map<String, Object?>>();
  final presets = {
    for (final p in (data['presets'] as List).cast<Map<String, Object?>>())
      p['key'] as String: p,
  };
  final bands = (data['bands'] as List)
      .map((b) => ((b as Map)['rating'] as num).toDouble())
      .toList();

  late DeepBank bank;
  setUpAll(() async => bank = await DeepBank.load());

  String enc(List<List<int>> g) => g.map((row) => row.join()).join();

  DeepCfg cfgOf(Map<String, Object?> node) {
    final p = presets[node['preset']]!;
    final feed = p['feedCount'];
    return DeepCfg(
      depth: (p['depth'] as num).toInt(),
      rating: bands[(node['band'] as num).toInt()],
      feedCount: feed is num ? feed.toInt() : null,   // 'all' → null
      unlockShare: (p['unlockShare'] as num).toDouble(),
    );
  }

  test('есть что сверять: узлы трёх пресетов на двух полосах', () {
    expect(nodes.length, greaterThan(20), reason: 'узлов в эталоне: ${nodes.length}');
    expect(presets.length, 3);
    expect(bands.length, 6);
  });

  test('🔴 каждый узел рождается тем же: доска, решение, дырки, порог, кормимые клетки', () {
    final diffs = <String>[];
    var checked = 0;
    for (final want in nodes) {
      if (diffs.length >= 6) break;
      final cfg = cfgOf(want);
      final seed = want['seed'] as String;
      final path = want['path'] as String;
      final tag = '${want['preset']}/полоса${want['band']}/«$path»';

      if (path == '(pick)') {
        // Дешёвый узел без решения: им экран считает дерево и карточки.
        final pick = materializePick(bank, seed, '', cfg);
        checked++;
        if (enc(pick.puzzle) != want['puzzle']) diffs.add('$tag: доска разошлась');
        if (pick.blanks != (want['blanks'] as num).toInt()) diffs.add('$tag: дырок');
        if (pick.unlockCells != (want['unlockCells'] as num).toInt()) diffs.add('$tag: порог');
        continue;
      }

      final node = materializeChain(bank, seed, path, cfg).last;
      checked++;
      if (enc(node.puzzle) != want['puzzle']) diffs.add('$tag: доска разошлась');
      if (enc(node.solution) != want['solution']) diffs.add('$tag: решение разошлось');
      if (node.blanks != (want['blanks'] as num).toInt()) {
        diffs.add('$tag: дырок ${node.blanks}, у JS ${want['blanks']}');
      }
      if (node.unlockCells != (want['unlockCells'] as num).toInt()) {
        diffs.add('$tag: порог ${node.unlockCells}, у JS ${want['unlockCells']}');
      }
      final wantFeed = (want['feedCells'] as List)
          .map((e) => (e as List).map((x) => (x as num).toInt()).join(','))
          .join(' ');
      final gotFeed = node.feedCells.map((e) => e.join(',')).join(' ');
      if (gotFeed != wantFeed) {
        diffs.add('$tag: кормимых ${node.feedCells.length} против ${(want['feedCells'] as List).length}'
            '${gotFeed == wantFeed ? '' : ' (порядок или состав)'}');
      }
    }
    expect(diffs, isEmpty, reason: diffs.take(6).join(' · '));
    expect(checked, nodes.length, reason: 'проверено узлов: $checked из ${nodes.length}');
  });

  test('🔴 кормящая цифра доходит наверх: центр ребёнка равен клетке родителя', () {
    final cfg = DeepCfg(depth: 3, rating: bands[0], feedCount: 12, unlockShare: 0.24);
    const seed = 'проверка-кормления';
    final root = materializeChain(bank, seed, '', cfg).last;
    expect(root.feedCells, isNotEmpty, reason: 'у корня есть кормимые клетки');
    for (final cell in root.feedCells.take(4)) {
      final child = materializeChain(bank, seed, childPath('', cell[0], cell[1]), cfg).last;
      expect(child.solution[deepFeedCell[0]][deepFeedCell[1]], root.solution[cell[0]][cell[1]],
          reason: 'центр ребёнка под клеткой ${cell.join(',')}');
      // И сама клетка родителя выколота: цифру туда приносят снизу.
      expect(root.puzzle[cell[0]][cell[1]], 0);
    }
  });

  test('🔴 глубина кончилась — лист детей не заводит', () {
    final cfg = DeepCfg(depth: 2, rating: bands[0], feedCount: 9, unlockShare: 0.24);
    const seed = 'проверка-глубины';
    final root = materializeChain(bank, seed, '', cfg).last;
    expect(root.feedCells.length, 9);
    final leaf = materializeChain(
      bank, seed, childPath('', root.feedCells.first[0], root.feedCells.first[1]), cfg).last;
    expect(leaf.feedCells, isEmpty, reason: 'на дне обычная судоку с подсказками');
  });

  test('путь: складывается, разбирается и знает свою глубину', () {
    expect(childPath('', 3, 4), '3,4');
    expect(childPath('3,4', 0, 1), '3,4/0,1');
    expect(depthOf(''), 0);
    expect(depthOf('3,4/0,1'), 2);
    final p = parentOf('3,4/0,1')!;
    expect(p.parent, '3,4');
    expect(p.cell, [0, 1]);
    expect(parentOf(''), isNull);
  });
}
