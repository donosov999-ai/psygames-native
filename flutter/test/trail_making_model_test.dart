import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/trail_making/model.dart';

/// «СОЕДИНИ ЦЕПОЧКУ»: ПРАВИЛА НА DART — ТЕ ЖЕ, ЧТО У ЖИВОГО TS.
///
/// Лестница и неслучайная часть раскладки сверяются с эталоном `test/fixtures/trail-making-reference.json`
/// (экспортёр `frontend/src/games/trail-making/tools/record-flutter-reference.gen.ts`). Точки веб ставит
/// `Math.random` без зерна, поэтому для них — свойства из веб-пробы `trail-nodes-dont-overlap.test.ts`,
/// перенесённые один в один: те же канвы, те же наборы узлов, по 60 раскладок.
void main() {
  final ref = jsonDecode(File('test/fixtures/trail-making-reference.json').readAsStringSync()) as Map<String, dynamic>;

  test('🔴 лестница: каждая из 20 ступеней — та же, что у веба', () {
    final levels = ref['levels'] as List;
    expect(levels, hasLength(20));
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = trailLevelParams(e['level'] as int);
      final at = 'ступень ${e['level']}';
      expect(p.mode.wire, e['mode'], reason: '$at: режим');
      expect(p.count, e['count'], reason: '$at: число');
      expect(p.totalNodes, e['totalNodes'], reason: '$at: узлов');
      expect(p.timeLimitSec, e['timeLimitSec'], reason: '$at: лимит времени');
    }
  });

  test('🔴 раскладка без случайности — подписи, ячейка, диаметр, дрожание — как у веба', () {
    final c = ref['constants'] as Map<String, dynamic>;
    expect([trailJitterMax, trailLayoutPad, trailNodeMax, trailNodeMin],
        [c['JITTER_MAX'], c['LAYOUT_PAD'], c['NODE_MAX'], c['NODE_MIN']]);
    final layouts = ref['layouts'] as List;
    expect(layouts, hasLength(105));
    for (final raw in layouts) {
      final e = raw as Map<String, dynamic>;
      final mode = e['mode'] == 'A' ? TrailMode.a : TrailMode.b;
      final l = trailMakeNodes(mode, e['n'] as int, e['lang'] as String, (e['w'] as num).toDouble(),
          (e['h'] as num).toDouble(), math.Random(1));
      final at = '${e['mode']}/${e['n']} ${e['lang']} ${e['w']}×${e['h']}';
      expect(l.nodes.map((n) => n.label).toList(), e['labels'], reason: '$at: подписи по порядку');
      expect(l.size, e['size'], reason: '$at: диаметр');
      expect(l.cell, e['cell'], reason: '$at: ячейка');
      expect(l.jitter, e['jitter'], reason: '$at: дрожание');
    }
  });

  // Канвы и наборы — из веб-пробы: `playW = min(ширина−32, 600)`, `playH = min(высота·0.55, 460)`.
  const canvases = [(240.0, 260.0), (288.0, 312.0), (328.0, 352.0), (358.0, 460.0), (398.0, 460.0), (600.0, 460.0)];
  const runs = [(TrailMode.a, 15), (TrailMode.a, 22), (TrailMode.a, 25), (TrailMode.b, 8), (TrailMode.b, 11), (TrailMode.b, 13)];

  test('🔴 ни в одной раскладке два узла не ближе своего диаметра, и узел целиком в канве', () {
    final bad = <String>[];
    var seed = 0;
    for (final (w, h) in canvases) {
      for (final (mode, count) in runs) {
        for (var k = 0; k < 60; k++) {
          final l = trailMakeNodes(mode, count, 'ru', w, h, math.Random(seed++));
          final n = l.nodes;
          for (var i = 0; i < n.length; i++) {
            final a = n[i];
            if (a.x - l.size / 2 < 0 || a.y - l.size / 2 < 0 || a.x + l.size / 2 > w || a.y + l.size / 2 > h) {
              if (bad.length < 3) bad.add('$w×$h ${mode.wire}/$count: узел ${a.label} за краем');
            }
            for (var j = i + 1; j < n.length; j++) {
              final d = math.sqrt((a.x - n[j].x) * (a.x - n[j].x) + (a.y - n[j].y) * (a.y - n[j].y));
              if (d < l.size && bad.length < 3) bad.add('$w×$h ${mode.wire}/$count: $d при диаметре ${l.size}');
            }
          }
        }
      }
    }
    expect(bad, isEmpty);
  });

  test('ячейка — самая крупная из возможных, кружок в пределах 30–44, подписи не повторяются', () {
    for (final (w, h) in canvases) {
      for (final (mode, count) in runs) {
        final l = trailMakeNodes(mode, count, 'ru', w, h, math.Random(7));
        final gw = math.max(1.0, w - trailLayoutPad * 2), gh = math.max(1.0, h - trailLayoutPad * 2);
        var best = 0.0;
        for (var k = 1; k <= l.nodes.length; k++) {
          best = math.max(best, math.min(gw / k, gh / (l.nodes.length / k).ceil()));
        }
        expect(l.cell, best, reason: '$w×$h ${mode.wire}/$count');
        expect(l.size, inInclusiveRange(trailNodeMin, trailNodeMax));
        final want = mode == TrailMode.a ? count : count * 2;
        expect(l.nodes.length, want);
        expect(l.nodes.map((n) => n.label).toSet(), hasLength(want));
      }
    }
  });

  test('⚠️ разброс сохранён: узлы не встают решёткой', () {
    // Встречная сторона разведения: дрожание в ноль тоже убирает наложения, но поиск идёт рядами.
    final l = trailMakeNodes(TrailMode.b, 11, 'ru', 358, 460, math.Random(3));
    final xs = l.nodes.map((n) => n.x.round()).toSet();
    expect(l.jitter, greaterThan(0));
    expect(xs.length, greaterThan(l.nodes.length ~/ 2), reason: 'координаты почти все свои, а не по колонкам');
  });

  TrailLayout line(List<(double, double)> points) => TrailLayout(
        nodes: [for (var i = 0; i < points.length; i++) TrailNode('${i + 1}', points[i].$1, points[i].$2)],
        size: 44,
        cell: 100,
        jitter: 0.2,
      );

  test('тап: верный — вперёд, дальний — ошибка, пройденный — ничего', () {
    final g = TrailGame(line([(50, 50), (150, 50), (250, 50)]));
    expect(g.tap(1), TrailStep.miss);
    expect(g.errors, 1);
    expect(g.tap(0), TrailStep.advanced);
    expect(g.tap(0), TrailStep.ignored, reason: 'пройденный узел ошибкой не считается');
    expect(g.tap(1), TrailStep.advanced);
    expect(g.tap(2), TrailStep.done);
    expect(g.finished, isTrue);
    expect(g.tap(2), TrailStep.ignored);
  });

  test('🔴 протяжка: неверный узел — одна ошибка на ОДИН вход, выход и повторный вход — ещё одна', () {
    final g = TrailGame(line([(50, 50), (150, 50), (250, 50)]));
    expect(g.dragAt(250, 50), TrailStep.miss);
    expect(g.dragAt(252, 51), TrailStep.ignored, reason: 'палец ещё в том же узле — вторая ошибка не считается');
    expect(g.errors, 1);
    expect(g.dragAt(200, 120), TrailStep.ignored, reason: 'вышел из узла');
    expect(g.dragAt(250, 50), TrailStep.miss, reason: 'вошёл снова — новая ошибка');
    expect(g.errors, 2);
    expect(g.dragAt(50 + 25, 50), TrailStep.advanced, reason: 'в радиусе 30 от центра — узел пройден');
    expect(g.dragAt(150 + 31, 50), TrailStep.ignored, reason: 'за радиусом захвата — ничего');
    expect(g.nodeAt(99, 50), -1);
  });

  test('проход ступени и счёт — как у веба', () {
    expect(trailPassed(seconds: 16, timeLimitSec: 16, errors: 2), isTrue, reason: 'ровно лимит и две ошибки — проход');
    expect(trailPassed(seconds: 16.01, timeLimitSec: 16, errors: 0), isFalse);
    expect(trailPassed(seconds: 5, timeLimitSec: 16, errors: 3), isFalse);
    expect(trailPassed(seconds: 5, timeLimitSec: 0, errors: 0), isFalse, reason: 'шаг зарядки без лимита — прохода нет');
    expect(trailScore(0.1, 0), 1000, reason: '999,5 — половина вверх, как Math.round');
    expect(trailScore(10, 2), 890);
    expect(trailScore(300, 0), 0);
  });
}
