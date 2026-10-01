// Уровни раннера «Поиска»: главы, станции, единственность ответа, порог 70 %.
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/object_tracker/model.dart' as tracker;
import 'package:psygames_flutter/games/schulte/model.dart' as schulte;
import 'package:psygames_flutter/games/search_runner/level.dart';

void main() {
  const g = SearchStation.gates, w = SearchStation.windows, t = SearchStation.tracker;

  test('главы вводят станции по одной, как «Числовой забег»', () {
    expect([for (var l = 1; l <= 3; l += 1) searchStationPlan(l)], [[], [], []]);
    expect(searchStationPlan(4), [g, g, g], reason: 'первый уровень главы — три новых');
    expect(searchStationPlan(5), [g, g, g, g], reason: 'прежних станций ещё нет');
    expect(searchStationPlan(7), [w, w, w]);
    expect(searchStationPlan(8), [w, w, g, w, w], reason: 'четыре новых и одна прежняя');
    expect(searchStationPlan(10), [t, t, t]);
    expect(searchStationPlan(11), [t, t, g, t, t]);
    expect(searchMixFrom, 13);
    expect(searchStationPlan(13).toSet(), {g, w, t}, reason: 'смесь — все введённые');
    expect(searchStationPlan(13), hasLength(6));
  });

  test('письменность ворот — та же, что у Шульте', () {
    expect(searchAlphabet('ru'), 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ');
    expect(searchAlphabet('en'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  test('уровень упражнения на станции: первая встреча — первый уровень', () {
    expect(searchStationLevel(g, 4), 1);
    expect(searchStationLevel(w, 7), 1, reason: 'три окна на L7 = зрительный поиск L1 (схема §3)');
    expect(searchStationLevel(w, 30), 24);
    expect(searchStationLevel(t, 10), 1);
  });

  test('🔴 у каждой станции ровно одна верная арка — уровни 1–30, по 8 зёрен', () {
    for (var level = 1; level <= 30; level += 1) {
      for (var seed = 0; seed < 8; seed += 1) {
        final lv = makeSearchLevel(level, seed);
        expect(lv.rows, hasLength(searchLevelSlots));
        expect(lv.rows.first, isA<TokenRow>(), reason: 'L$level/$seed: первый ряд — разгон');
        expect(lv.rows.last, isA<TokenRow>(), reason: 'L$level/$seed: последний ряд — финиш');
        for (var i = 0; i < lv.rows.length; i += 1) {
          final row = lv.rows[i];
          final where = 'L$level/$seed ряд $i';
          expect(row.answer, inInclusiveRange(0, 2), reason: where);
          expect(lv.course.rows[i].correct, row.answer, reason: '$where: дорога и станция спорят о верной полосе');
          switch (row) {
            case GatesRow():
              expect(row.arches.toSet(), hasLength(3), reason: '$where: одинаковые знаки в арках');
              final p = schulte.LevelParams.of(row.level);
              final seq = schulte.schulteSequence(
                size: p.gridSize,
                contentMode: p.contentMode,
                direction: p.direction,
                alphabet: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ',
              ).sequence.map((c) => '$c').toList();
              // Верный — тот, что идёт в ряду сразу за показанными двумя; у Горбова начало
              // бывает и с буквы, поэтому ряд строится обоими способами.
              final seq2 = p.contentMode == schulte.ContentMode.mixed
                  ? schulte.schulteSequence(
                      size: p.gridSize,
                      contentMode: p.contentMode,
                      direction: p.direction,
                      alphabet: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ',
                      lettersFirst: true,
                    ).sequence.map((c) => '$c').toList()
                  : seq;
              String? next(List<String> s) {
                for (var k = 1; k + 1 < s.length; k += 1) {
                  if (s[k - 1] == row.shown[0] && s[k] == row.shown[1]) return s[k + 1];
                }
                return null;
              }
              final truth = next(seq) ?? next(seq2);
              expect(truth, isNotNull, reason: '$where: показанной пары нет в ряду');
              expect([for (final a in row.arches) a == truth].where((x) => x).length, 1,
                  reason: '$where: следующий знак стоит не в одной арке');
              expect(row.arches[row.answer], truth, reason: '$where: верная арка — не та');
            case WindowsRow():
              final withTarget = [
                for (var lane = 0; lane < 3; lane += 1)
                  if (row.arches[lane].any((it) => it.isTarget)) lane,
              ];
              expect(withTarget, [row.answer], reason: '$where: цель не ровно в одной арке');
              expect(row.arches[row.answer].where((it) => it.decoy), isEmpty,
                  reason: '$where: приманка в верной арке');
            case TrackerRow():
              expect(row.ringed.toSet(), hasLength(3), reason: '$where: одна фигура в двух кольцах');
              final targets = [for (final id in row.ringed) row.round.targetIds.contains(id)];
              expect(targets.where((x) => x).length, 1, reason: '$where: цель не ровно в одном кольце');
              expect(targets[row.answer], isTrue, reason: '$where: верная арка — не кольцо цели');
              // Движение и решение укладываются в дорогу от старта до ответа.
              final need = searchSpeed * (trackerFlashMs + row.round.durationMs + trackerDecideMs) / 1000;
              expect(lv.course.rows[i].z - row.startZ, greaterThanOrEqualTo(need - 1e-9),
                  reason: '$where: слежению не хватает дороги');
              expect(lv.rows[i - 2], isA<TokenRow>().having((r) => r.trackerStart, 'старт', true),
                  reason: '$where: старт слежения не за два ряда');
            case TokenRow():
              break;
          }
        }
      }
    }
  });

  test('🔴 порог 70 %: идеальный проходит, стоящий на любой полосе — нет', () {
    for (var level = 1; level <= 30; level += 1) {
      for (var seed = 0; seed < 8; seed += 1) {
        final lv = makeSearchLevel(level, seed);
        final ideal = {for (var i = 0; i < lv.rows.length; i += 1) i: true};
        expect(lv.passed(ideal), isTrue, reason: 'L$level/$seed');
        for (final lane in [0, 1, 2]) {
          final stand = {for (var i = 0; i < lv.rows.length; i += 1) i: lv.rows[i].answer == lane};
          expect(lv.passed(stand), isFalse, reason: 'L$level/$seed: стоящий на полосе $lane проходит');
        }
      }
    }
  });

  test('в порог идут станции; на уровнях без станций и на обучающем — все ряды', () {
    expect(makeSearchLevel(2, 1).scored, hasLength(searchLevelSlots));
    expect(makeSearchLevel(4, 1).scored, hasLength(searchLevelSlots), reason: 'L4 — первый уровень главы');
    final l5 = makeSearchLevel(5, 1);
    expect(l5.scored, [for (var i = 0; i < l5.rows.length; i += 1) if (l5.rows[i] is GatesRow) i]);
    expect(l5.needed, 3, reason: '70 % от четырёх станций — три');
  });

  test('раздача по зерну повторяется', () {
    String sig(SearchLevel l) => [for (final r in l.rows) '${r.runtimeType}:${r.answer}'].join(',');
    expect(sig(makeSearchLevel(12, 5)), sig(makeSearchLevel(12, 5)));
    expect(sig(makeSearchLevel(12, 5)), isNot(sig(makeSearchLevel(12, 6))));
  });

  test('станция трекера берёт раунд упражнения того же уровня', () {
    final lv = makeSearchLevel(10, 3);
    final tr = lv.rows.whereType<TrackerRow>().first;
    expect(tr.round.level, 1);
    expect(tr.round.objectCount, tracker.objectCountForLevel(1));
  });
}
