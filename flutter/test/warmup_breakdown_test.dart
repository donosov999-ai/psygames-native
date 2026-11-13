// РАЗБОР ЗАРЯДКИ ПО НАВЫКАМ — что именно здесь ломается молча.
//
// Зеркало `frontend/src/__tests__/warmup-breakdown.test.ts` (отчёт 0660eb0a). Блок такого рода
// выглядит рабочим при трёх дефектах, и ни один не виден на экране:
//  1. сложить очки разных игр (шкалы разные — выдаст масштаб за вывод);
//  2. сравнить игру саму с собой (сегодняшние партии лежат в истории — отклонение всегда ≈ 0);
//  3. вывод по одному замеру («просел» после первой в жизни партии — шум).
// Сегодняшние партии из истории отсекает ВЫЗЫВАЮЩИЙ: здесь они приходят отдельным списком.
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/warmup_breakdown.dart';

String? skillOf(String id) => const {
      'schulte': 'skillFocus',
      'stroop': 'skillFocus',
      'hanoi': 'skillPlanning',
    }[id];

void main() {
  test('🔴 шкалы игр не смешиваются: считается отклонение каждой от своего прошлого', () {
    // «Ханой» набирает сотни, «Шульте» — десятки. Сегодня обе выросли ровно вдвое.
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 20), const BreakdownGame('hanoi', 2000)],
      [
        const BreakdownGame('schulte', 10),
        const BreakdownGame('schulte', 10),
        const BreakdownGame('hanoi', 1000),
        const BreakdownGame('hanoi', 1000),
      ],
      skillOf,
    );
    final by = {for (final s in r.skills) s.skillKey: s.delta.round()};
    expect(by, {'skillFocus': 100, 'skillPlanning': 100}, reason: 'рост одинаковый, несмотря на разницу шкал в сто раз');
  });

  test('🔴 без истории вывода нет: одна прошлая партия — не среднее', () {
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 100)],
      [const BreakdownGame('schulte', 10)],
      skillOf,
    );
    expect(r.skills, isEmpty);
    expect(r.noHistory, 1);
    expect(kMinGames, greaterThanOrEqualTo(2));
  });

  test('🔴 мелкое колебание не называется ни ростом, ни провалом', () {
    final r = skillBreakdown(
      [BreakdownGame('schulte', 100 + kThresholdPercent - 3)],
      [const BreakdownGame('schulte', 100), const BreakdownGame('schulte', 100)],
      skillOf,
    );
    expect(r.skills, hasLength(1));
    expect(r.best, isNull);
    expect(r.worst, isNull);
  });

  test('🔴 провал называется провалом, когда он перешагнул порог', () {
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 50), const BreakdownGame('hanoi', 1000)],
      [
        const BreakdownGame('schulte', 100),
        const BreakdownGame('schulte', 100),
        const BreakdownGame('hanoi', 1000),
        const BreakdownGame('hanoi', 1000),
      ],
      skillOf,
    );
    expect(r.worst?.skillKey, 'skillFocus');
    expect(r.worst!.delta.round(), -50);
    expect(r.best, isNull, reason: 'планирование — ровно 0 %, это не рост');
  });

  test('рост называется ростом и стоит первым', () {
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 150), const BreakdownGame('hanoi', 1000)],
      [
        const BreakdownGame('schulte', 100),
        const BreakdownGame('schulte', 100),
        const BreakdownGame('hanoi', 1000),
        const BreakdownGame('hanoi', 1000),
      ],
      skillOf,
    );
    expect(r.best?.skillKey, 'skillFocus');
    expect(r.skills.first.skillKey, 'skillFocus');
    expect(r.skills.last.skillKey, 'skillPlanning');
  });

  test('🔴 игра без известного навыка не портит расчёт, а честно выпадает', () {
    final r = skillBreakdown(
      [const BreakdownGame('неизвестная', 10)],
      [const BreakdownGame('неизвестная', 1), const BreakdownGame('неизвестная', 1)],
      skillOf,
    );
    expect(r.skills, isEmpty);
    expect(r.noHistory, 1);
  });

  test('нулевое и неконечное прошлое не делит на ноль и не ломает среднее', () {
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 10), const BreakdownGame('hanoi', 10)],
      [
        const BreakdownGame('schulte', 0),
        const BreakdownGame('schulte', 0),
        const BreakdownGame('hanoi', double.nan),
        const BreakdownGame('hanoi', 5),
      ],
      skillOf,
    );
    expect(r.skills, isEmpty, reason: 'среднее ≤ 0 и «одна годная прошлая» — без истории');
    expect(r.noHistory, 2);
  });

  test('несколько игр одного навыка усредняются в проценты навыка', () {
    final r = skillBreakdown(
      [const BreakdownGame('schulte', 120), const BreakdownGame('stroop', 100)],
      [
        const BreakdownGame('schulte', 100),
        const BreakdownGame('schulte', 100),
        const BreakdownGame('stroop', 100),
        const BreakdownGame('stroop', 100),
      ],
      skillOf,
    );
    expect(r.skills.single.games, 2);
    expect(r.skills.single.delta.round(), 10, reason: '(+20 % и 0 %) / 2');
  });
}
