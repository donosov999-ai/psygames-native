// «Операция в запасе» — глава «Числового забега» с L19 (решение Дениса 11.11.2026, вариант Б):
// в одной полосе ряда лежит «×2», оно ложится в единственный слот, а «Применить» игрок жмёт сам —
// в любой момент забега. Здесь: план главы, играбельность раздач, ядро (подобрать, применить,
// слот занят, повторное нажатие) и решатель, который откладывает удвоение на большее число.
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_run/level.dart';
import 'package:psygames_flutter/games/runner/road.dart';
import 'package:psygames_flutter/games/runner/solver.dart';

RoadRow _pickups(int id, double z, List<RoadItem> items) =>
    RoadRow.of(kind: 'pickups', id: id, z: z, window: 3, items: items);

RoadRow _finish(int id, double z) =>
    RoadRow.of(kind: 'gate', id: id, z: z, checkpoint: true, rules: const [RoadRule.any], stageEnd: true);

RoadCourse _course(List<RoadRow> rows) => RoadCourse(levelId: 1, seed: 1, rows: rows, start: 1, speed: 8, gates: 1);

/// Прогнать забег в полосе [lane] до [z], без руления.
RoadState _run(RoadCourse c, double lane, double z) {
  var s = roadResume(roadSetTarget(roadInitial(c), lane));
  s = roadSetTarget(s, lane);
  while (s.status == RoadStatus.running && s.z < z) {
    s = roadAdvanceFrame(s, 1 / 60, c);
  }
  return s;
}

void main() {
  test('глава: L19 — три запаса, L20 — четыре и одна прежняя станция, смесь — с L22', () {
    expect(reserveFrom, 19);
    expect(stationPlan(19, false), ['reserve', 'reserve', 'reserve']);
    expect(stationPlan(20, false).where((s) => s == 'reserve').length, 4);
    expect(stationPlan(18, isBossLevel(18)).contains('reserve'), isFalse, reason: 'до главы запаса нет');
    expect(stationPlan(22, false), hasLength(6));
    expect(stationPlan(22, false), contains('reserve'));
  });

  test('раздачи L19–40 играбельны, на L19–21 есть «×2» в запас, а эталон его применяет', () {
    for (var level = 19; level <= 40; level++) {
      for (var seed = 1; seed <= 4; seed++) {
        final course = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        final reserves = [
          for (final r in course.rows)
            for (final i in r.items)
              if (i.reserve != null) i,
        ];
        if (level <= 21) expect(reserves, isNotEmpty, reason: 'L$level/$seed');
        for (final i in reserves) {
          expect(i.reserve, '×2');
          expect(i.value, 0, reason: 'запас число не меняет');
        }
        expect(solveCourse(course), isNotNull, reason: 'L$level/$seed');
      }
    }
  });

  test('ядро: подобрать «×2» — число то же, слот полон; «Применить» удваивает, второй раз — ничего', () {
    final c = _course([
      _pickups(0, 20, const [RoadItem(x: 0, value: 0, half: .5, reserve: '×2'), RoadItem(x: 1, value: 5)]),
      _pickups(1, 44, const [RoadItem(x: 0, value: 9)]),
      _finish(2, 70),
    ]);
    var s = _run(c, 0, 30);
    expect(s.reserve, '×2');
    expect(s.sum, 1);
    expect(s.events.where((e) => e.type == 'reserve' && e.data['action'] == 'pick'), hasLength(1));
    s = _run(c, 0, 50);
    expect(s.sum, 10, reason: '1 + 9, запас ещё не применён');
    s = roadApplyReserve(s, c);
    expect(s.sum, 20);
    expect(s.reserve, isNull);
    expect(s.reserveUsed, 1);
    final apply = s.events.lastWhere((e) => e.type == 'reserve');
    expect(apply.data['action'], 'apply');
    expect([apply.data['before'], apply.data['after']], [10.0, 20.0]);
    final again = roadApplyReserve(s, c);
    expect(identical(again, s), isTrue, reason: 'повторное нажатие множитель не применяет');
  });

  test('ядро: слот один — второй «×2» при полном слоте остаётся на дороге', () {
    final c = _course([
      _pickups(0, 20, const [RoadItem(x: 0, value: 0, half: .5, reserve: '×2')]),
      _pickups(1, 44, const [RoadItem(x: 0, value: 0, half: .5, reserve: '×2')]),
      _finish(2, 70),
    ]);
    final s = _run(c, 0, 60);
    expect(s.reserve, '×2');
    expect(s.events.where((e) => e.type == 'reserve'), hasLength(1));
    expect(s.collected.contains(0), isFalse, reason: 'второй ряд: предмет не взят');
  });

  test('ядро: «Применить» вне забега (пауза, готовность) не срабатывает', () {
    final c = _course([
      _pickups(0, 20, const [RoadItem(x: 0, value: 0, half: .5, reserve: '×2')]),
      _finish(1, 70),
    ]);
    final s = roadPause(_run(c, 0, 30), 'user');
    expect(s.reserve, '×2');
    expect(identical(roadApplyReserve(s, c), s), isTrue);
  });

  test('решатель откладывает удвоение: взять «×2», собрать числа, удвоить перед финишем', () {
    final c = _course([
      _pickups(0, 20, const [RoadItem(x: 0, value: 0, half: .5, reserve: '×2'), RoadItem(x: 1, value: 3)]),
      _pickups(1, 44, const [RoadItem(x: 0, value: 10), RoadItem(x: 1, value: 10)]),
      _finish(2, 70),
    ]);
    final path = solveCourse(c)!;
    // 1 → запас → +10 = 11 → ×2 = 22 (а удвоить сразу: 1×2 + 10 = 12; взять «3»: 1 + 3 + 10 = 14).
    expect(path.last.sum, 22);
  });
}
