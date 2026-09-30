/// СВЕРКА ПЕРЕНОСА «ДВОРЦА ПАМЯТИ» С ЖИВЫМ TS.
///
/// 🔴 ЧТО СТОРОЖИТ. Не «работает ли», а «ТА ЖЕ ЛИ ЭТО ИГРА»: тот же seed обязан
/// дать тот же маршрут, те же предметы, тот же порядок вариантов и те же метрики.
/// Числа сняты прогоном настоящих модулей `frontend/src/games/memory-palace/core/*`
/// (прибор `frontend/scripts/flutter-memory-palace-reference.test.ts`).
///
/// ⚠️ ОСОБО — ДВЕ ВЕТКИ СЛУЧАЙНОСТИ. Маршрут крутит отдельная ветка `:route:`.
/// Слей их в одну — и предметы поменяются на всех уровнях разом, включая первые
/// пять, где маршрут вообще не трогают. Проба сверяет и маршрут, и предметы.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_palace/model.dart';

void main() {
  late MemoryPalaceContent content;
  late Map<String, dynamic> ref;

  setUpAll(() {
    content = MemoryPalaceContent.fromJsonString(
        File('assets/memory-palace.json').readAsStringSync());
    ref = jsonDecode(File('test/fixtures/memory-palace-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('есть что сверять: содержимое и эталон на месте', () {
    expect(content.route.length, greaterThanOrEqualTo(12));
    expect(content.items.length, greaterThanOrEqualTo(16));
    expect((ref['rounds'] as List), hasLength(9));
    expect((ref['plays'] as List), hasLength(3));
  });

  test('🔴 расклад уровня совпадает с вебом: маршрут, предметы, порядок вариантов', () {
    for (final row in ref['rounds'] as List) {
      final m = row as Map<String, dynamic>;
      final level = m['level'] as int;
      final r = generateMemoryPalaceRound(content, ref['meta']['seed'] as String, level);
      final spot = 'уровень $level';
      expect(r.id, m['id'], reason: spot);
      expect(r.difficulty, m['difficulty'], reason: 'сложность, $spot');
      expect(r.lociCount, m['lociCount'], reason: 'мест, $spot');
      expect(memoryPalaceRouteIsShuffled(level), m['routeShuffled'], reason: 'маршрут, $spot');
      expect([for (final l in r.loci) l.id], m['lociIds'], reason: 'порядок мест, $spot');
      expect([for (final l in r.loci) l.order], m['lociOrder'], reason: 'нумерация мест, $spot');
      expect([for (final i in r.targetItems) i.id], m['targetItemIds'], reason: 'предметы, $spot');
      expect([for (final i in r.distractorItems) i.id], m['distractorItemIds'],
          reason: 'чужие предметы, $spot');
      expect([for (final i in r.recallCandidates) i.id], m['recallCandidateIds'],
          reason: 'порядок вариантов на припоминании, $spot');
    }
  });

  test('🔴 маршрут постоянен до пятого уровня и перемешан с шестого', () {
    final five = generateMemoryPalaceRound(content, 'ladder', 5);
    final six = generateMemoryPalaceRound(content, 'ladder', 6);
    expect([for (final l in five.loci) l.id],
        [for (final l in content.route.take(five.lociCount)) l.id],
        reason: 'до пятого — дорога, которую человек уже знает');
    expect([for (final l in six.loci) l.id],
        isNot([for (final l in content.route.take(six.lociCount)) l.id]),
        reason: 'с шестого порядок обязан стать заданием, а не декорацией');
  });

  test('🔴 сыгранная партия даёт те же метрики, что в вебе', () {
    for (final row in ref['plays'] as List) {
      final m = row as Map<String, dynamic>;
      final level = m['level'] as int;
      final shift = m['shift'] as int;
      final now = 60000;
      final s = MemoryPalaceSession.create(content, ref['meta']['seed'] as String, level);
      s.start(0);
      s.continueToPlacement();
      for (var i = 0; i < s.round.lociCount; i += 1) {
        s.selectItem(s.round.targetItems[i].id);
        s.selectLocus(i);
      }
      s.confirmPlacements();
      final placements = [...s.finalizedPlacements!];
      expect(placements, m['placements'], reason: 'укладка, уровень $level');
      s.startRecall();
      for (var i = 0; i < s.round.lociCount; i += 1) {
        s.selectRecallItem(placements[(i + shift) % placements.length], 30000);
      }
      s.continueToReverse();
      final back = [...placements.reversed];
      for (var i = 0; i < s.round.lociCount; i += 1) {
        s.selectRecallItem(back[(i + shift) % back.length], now);
      }

      final spot = 'уровень $level, сдвиг $shift';
      expect(memoryPalacePhaseNames[s.phase], m['phase'], reason: spot);
      final r = m['result'] as Map<String, dynamic>;
      final got = s.result!;
      expect(got.accuracy, closeTo((r['accuracy'] as num).toDouble(), 1e-12), reason: 'точность, $spot');
      expect(got.score, r['score'], reason: 'счёт, $spot');
      expect(got.errors, r['errors'], reason: 'ошибки, $spot');
      expect(got.difficulty, r['difficulty'], reason: 'сложность, $spot');
      final sp = r['specific'] as Map<String, dynamic>;
      expect(got.lociCount, sp['lociCount'], reason: spot);
      expect(got.locationHits, sp['locationHits'], reason: 'попаданий по местам, $spot');
      expect(got.itemKnowledgeHits, sp['itemKnowledgeHits'], reason: 'узнано предметов, $spot');
      expect(got.locationAccuracy, closeTo((sp['locationAccuracy'] as num).toDouble(), 1e-12),
          reason: 'точность по местам, $spot');
      expect(got.orderAccuracy, closeTo((sp['orderAccuracy'] as num).toDouble(), 1e-12),
          reason: 'точность порядка, $spot');
      expect(got.forwardLocationAccuracy,
          closeTo((sp['forwardLocationAccuracy'] as num).toDouble(), 1e-12), reason: spot);
      expect(got.reverseLocationAccuracy,
          closeTo((sp['reverseLocationAccuracy'] as num).toDouble(), 1e-12), reason: spot);
      expect(got.placementChanges, sp['placementChanges'], reason: 'перекладываний, $spot');
    }
  });

  test('🔴 место можно выбрать ПЕРВЫМ, а не только предмет', () {
    final s = MemoryPalaceSession.create(content, 'order', 1);
    s.start(0);
    s.continueToPlacement();
    // Человек начинает с места: «вот сюда положу вазу».
    s.selectLocus(2);
    expect(s.selectedLocusIndex, 2, reason: 'касание места обязано что-то делать');
    s.selectItem(s.round.targetItems.first.id);
    expect(s.placements[2], s.round.targetItems.first.id, reason: 'предмет лёг на выбранное место');
    expect(s.selectedLocusIndex, isNull);
  });

  test('перекладывание считается, а полный набор открывает следующий шаг', () {
    final s = MemoryPalaceSession.create(content, 'swap', 1);
    s.start(0);
    s.continueToPlacement();
    for (var i = 0; i < s.round.lociCount; i += 1) {
      s.selectItem(s.round.targetItems[i].id);
      s.selectLocus(i);
    }
    expect(s.placementComplete, isTrue);
    expect(s.placementChanges, 0, reason: 'раскладка без правок — не перекладывание');
    s.selectItem(s.round.targetItems[0].id);
    s.selectLocus(1);
    expect(s.placementChanges, 1, reason: 'обмен местами — это правка');
    s.confirmPlacements();
    expect(memoryPalacePhaseNames[s.phase], 'study');
  });
}
