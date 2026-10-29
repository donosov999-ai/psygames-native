import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fillwords/core/fillwords.dart';
import 'package:psygames_flutter/games/proofreading/fillwords_field.dart';
import 'package:psygames_flutter/games/proofreading/fillwords_round.dart';

/// 🔴 ПОСЛЕДНЕЕ СЛОВО ФИЛВОРДОВ ВЫДЕЛЯЕТСЯ ЖИВЫМ ПАЛЬЦЕМ.
///
/// 📍 Отчёт игрока e39ce923 (10.10.2026, 2.56.24, NZT-48, «Корректура: фокус», слова 8/9):
/// «не выделяется последнее чтобы финишировать». Модель тут ни при чём — протяжка по клеткам
/// разбирает 1200 полей из 1200. Виновато попадание пальца: на диагональном шаге палец проходит
/// угол и задевает соседнюю клетку ТОГО ЖЕ слова раньше времени, и линия сбивается.
/// Замер 29.10: с дрожью 15 % клетки без зоны не выделялось 35,1 % последних слов, с зоной — 0.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Каждое слово по очереди остаётся последним; палец ведётся от центра к центру с дрожью вбок.
  Future<({int tries, int fail})> lastWords({required bool inner}) async {
    final pool = await loadWordPool('ru');
    const cell = 40.0;
    var tries = 0, fail = 0;
    for (var level = 1; level <= 30; level += 3) {
      final cfg = fillwordsLevel(level);
      for (var seed = 1; seed <= 3; seed++) {
        final p = generateFillwords(
            FillwordsRequest(
                rows: cfg.rows,
                cols: cfg.cols,
                locale: 'ru',
                seed: seed * 100 + level,
                maxWordLen: cfg.maxWordLen,
                minWordLen: cfg.minWordLen),
            pool);
        Offset center(int c) => Offset((c % p.cols + 0.5) * cell, (c ~/ p.cols + 0.5) * cell);
        for (var last = 0; last < p.words.length; last++) {
          final r = FwRound(level: level, puzzle: p, order: SubmitOrder.free, hintsAllowed: 3, timeLimitSec: 0, nowMs: () => 0)
            ..begin();
          for (var i = 0; i < p.words.length; i++) {
            if (i == last) continue;
            r.touch(p.words[i].path.first);
            for (final c in p.words[i].path.skip(1)) {
              r.drag(c);
            }
            r.release();
          }
          final path = p.words[last].path;
          r.touch(path.first);
          for (var k = 1; k < path.length; k++) {
            final a = center(path[k - 1]), b = center(path[k]);
            final d = b - a;
            final perp = Offset(-d.dy, d.dx) / d.distance * (cell * 0.15 * (k.isEven ? 1 : -1));
            final n = (d.distance / 2).ceil();
            for (var s = 1; s <= n; s++) {
              final o = Offset.lerp(a, b, s / n)! + perp * sin(pi * s / n);
              final c = fwCellAt(o, cell: cell, rows: p.rows, cols: p.cols, inner: inner);
              if (c != null) r.drag(c);
            }
          }
          r.release();
          tries++;
          if (!r.cleared) fail++;
        }
      }
    }
    return (tries: tries, fail: fail);
  }

  test('🔴 последнее слово выделяется пальцем с дрожью — с серединой клетки ни одного сбоя', () async {
    final now = await lastWords(inner: true);
    expect(now.tries, greaterThan(200));
    expect(now.fail, 0, reason: '${now.fail} из ${now.tries} последних слов не выделились');
  });

  test('проба мерит: по старому правилу (вся клетка) сбои есть', () async {
    final old = await lastWords(inner: false);
    expect(old.fail, greaterThan(0), reason: 'без зоны сбоев нет — проба не воспроизводит отчёт');
  });

  testWidgets('🔴 сетка: палец через угол диагонали не задевает соседнюю клетку', (tester) async {
    final dragged = <int>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: FwGrid(
            rows: 3,
            cols: 3,
            cell: 40,
            letters: List.filled(9, 'А'),
            look: (_) => (bg: null, ink: null, bold: false),
            onTouch: dragged.add,
            onDrag: dragged.add,
          ),
        ),
      ),
    ));
    final origin = tester.getTopLeft(find.byKey(const Key('fw-grid')));
    // Из центра клетки 0 (20,20) в центр клетки 4 (60,60), с отклонением к клетке 1 у угла (40,40).
    final g = await tester.startGesture(origin + const Offset(20, 20));
    for (final o in const [Offset(30, 28), Offset(38, 34), Offset(42, 37), Offset(48, 44), Offset(60, 60)]) {
      await g.moveTo(origin + o);
    }
    await g.up();
    expect(dragged.toSet(), {0, 4}, reason: 'у угла засчитана чужая клетка: $dragged');
  });
}
