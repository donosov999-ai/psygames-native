import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/grade.dart';

/// ЗАМЕР (не гейт): распределение меры «Кошек» по размеру поля и росту областей — из него
/// собрана таблица `lib/games/cats/ladder.dart`. В обычном прогоне пропускается (печать в CI —
/// шум); запуск: `CATS_MEASURE=1 flutter test test/cats_grade_measure_test.dart`.
void main() {
  test('замер меры по конфигурациям', skip: Platform.environment['CATS_MEASURE'] == null ? 'замер — CATS_MEASURE=1' : null, () {
    for (final n in [6, 7, 8, 9, 10]) {
      for (final balance in [0.0, 0.5, 1.0]) {
        final tiers = <int, int>{};
        final costs = <int>[];
        final byTier = <int, List<int>>{};
        final uses = <CatsStep, int>{for (final s in CatsStep.values) s: 0};
        var made = 0, ms = 0;
        for (var i = 0; i < 80; i++) {
          final t = DateTime.now().millisecondsSinceEpoch;   // wall-clock: замер
          final p = generateCats(n, 'm|$n|$balance|$i', balance: balance);
          ms += DateTime.now().millisecondsSinceEpoch - t;   // wall-clock: замер
          if (p == null) continue;
          made++;
          final g = gradeCats(p.board);
          tiers[g.tier] = (tiers[g.tier] ?? 0) + 1;
          costs.add(g.cost);
          (byTier[g.tier] ??= <int>[]).add(g.cost);
          for (final s in CatsStep.values) {
            uses[s] = uses[s]! + g.uses[s]!;
          }
        }
        costs.sort();
        final keys = tiers.keys.toList()..sort();
        // ignore: avoid_print
        print('n=$n balance=$balance: карт $made/80, ступени ${[for (final k in keys) '$k×${tiers[k]}'].join(' ')}, '
            'цена p10 ${costs[costs.length ~/ 10]} p50 ${costs[costs.length ~/ 2]} p90 ${costs[costs.length * 9 ~/ 10]}, '
            '${ms ~/ made} мс/карта');
        for (final k in keys) {
          final c = byTier[k]!..sort();
          // ignore: avoid_print
          print('   ступень $k: ${c.length} карт, цена ${c.first}…${c.last}, p25 ${c[c.length ~/ 4]} p50 ${c[c.length ~/ 2]} p75 ${c[c.length * 3 ~/ 4]}');
        }
      }
    }
  });

  test('замер окон перебора: частота ступени 5 и её цена', skip: Platform.environment['CATS_MEASURE'] == null ? 'замер — CATS_MEASURE=1' : null, () {
    for (final n in [6, 7, 8]) {
      for (final balance in [0.5, 0.75, 1.0]) {
        final five = <int>[];
        var made = 0;
        for (var i = 0; i < 2000; i++) {
          final p = generateCats(n, 'п5|$n|$balance|$i', balance: balance);
          if (p == null) continue;
          made++;
          final g = gradeCats(p.board);
          if (g.tier == 5) five.add(g.cost);
        }
        five.sort();
        String share(bool Function(int) f) => '${(100 * five.where(f).length / made).toStringAsFixed(1)} %';
        // ignore: avoid_print
        print('n=$n balance=$balance: ступень 5 у ${five.length}/$made (${share((_) => true)}); '
            'цена ≤44 ${share((c) => c <= 44)}, 45–54 ${share((c) => c >= 45 && c <= 54)}, ≥55 ${share((c) => c >= 55)}, '
            '≥65 ${share((c) => c >= 65)}; макс ${five.isEmpty ? '—' : five.last}');
      }
    }
  });
}
