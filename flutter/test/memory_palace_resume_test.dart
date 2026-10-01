/// «ДВОРЕЦ ПАМЯТИ»: НЕДОИГРАННАЯ ПАРТИЯ — ОДНА ФОРМА С ВЕБОМ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/memory-palace/tools/record-flutter-resume.gen.ts`):
/// для 24 партий (3 уровня × 8 фаз) — действия, снимок `snapshotForResume` и подъём.
/// · Dart проигрывает те же действия на своей сессии → снимок обязан совпасть с веб-снимком;
/// · веб-снимок поднимается нативно → снимок поднятой партии тот же, часы заведены задним числом;
/// · поднятая партия ДОИГРЫВАЕТСЯ до итога — поднять и не дать играть было бы хуже, чем не поднять.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_palace/model.dart';
import 'package:psygames_flutter/games/memory_palace/resume.dart';

void main() {
  final content = MemoryPalaceContent.fromJsonString(File('assets/memory-palace.json').readAsStringSync());
  final ref = jsonDecode(File('test/fixtures/memory-palace-resume-reference.json').readAsStringSync()) as Map;
  final cases = (ref['cases'] as List).cast<Map>();

  void apply(MemoryPalaceSession s, List a) {
    switch (a[0] as String) {
      case 'start':
        s.start((a[1] as num).toInt());
      case 'toPlace':
        s.continueToPlacement();
      case 'item':
        s.selectItem(a[1] as String);
      case 'locus':
        s.selectLocus((a[1] as num).toInt());
      case 'confirm':
        s.confirmPlacements();
      case 'recall':
        s.startRecall();
      case 'answer':
        s.selectRecallItem(a[1] as String, (a[2] as num).toInt());
      case 'reverse':
        s.continueToReverse();
      case 'pause':
        s.pause((a[1] as num).toInt());
      default:
        throw StateError('неизвестное действие ${a[0]}');
    }
  }

  /// Через JSON — так же, как запись лежит в хранилище.
  Object? roundTrip(Object? x) => jsonDecode(jsonEncode(x));

  test('эталон есть и покрывает все фазы с чем терять', () {
    expect(cases, hasLength(24));
    expect(cases.where((c) => c['snapshot'] == null).map((c) => c['name']).toSet(), {'route'});
  });

  for (final c in cases) {
    final name = '${c['name']} · уровень ${c['level']}';

    test('🔴 те же действия → тот же снимок, что у веба: $name', () {
      final s = MemoryPalaceSession.create(content, c['seed'] as String, c['level'] as int);
      for (final a in c['actions'] as List) {
        apply(s, a as List);
      }
      expect(memoryPalacePhaseNames[s.phase], c['phaseBefore'], reason: 'партия разошлась ещё до снимка');
      final mine = memoryPalaceSnapshot(s, c['level'] as int, c['now'] as int);
      expect(roundTrip(mine), c['snapshot']);
    });

    final snap = c['snapshot'];
    if (snap == null) continue;

    test('🔴 веб-снимок поднимается нативно и доигрывается: $name', () {
      final at = c['restoredAt'] as int;
      final live = memoryPalaceRestore((snap as Map).cast<String, Object?>(), at)!;
      final want = (c['restored'] as Map)['session'] as Map;
      expect(live.seed, c['seed']);
      expect(live.session.startedAt, want['startedAt'], reason: 'часы заводятся задним числом на накопленное время');
      expect(memoryPalacePhaseNames[live.session.phase], want['phase']);
      expect(roundTrip(memoryPalaceSnapshot(live.session, live.level, at)), snap,
          reason: 'поднятая партия обязана давать тот же снимок');

      // Доиграть: расставить недостающее, вспомнить прямо и обратно.
      final s = live.session;
      final t = [for (final i in s.round.targetItems) i.id];
      if (s.phase == MemoryPalacePhase.place) {
        // Выбранное место веб сохраняет (это часть партии, в отличие от предмета «в руке») —
        // человек видит его подсвеченным; снимаем выбор тем же касанием.
        final picked = s.selectedLocusIndex;
        if (picked != null) s.selectLocus(picked);
        for (var i = 0; i < s.round.lociCount; i += 1) {
          if (s.placements[i] == t[i]) continue;
          s.selectItem(t[i]);
          s.selectLocus(i);
        }
        s.confirmPlacements();
      }
      if (s.phase == MemoryPalacePhase.study) s.startRecall();
      var guard = 0;
      while (s.phase != MemoryPalacePhase.result && guard < 100) {
        guard += 1;
        if (s.phase == MemoryPalacePhase.transition) {
          s.continueToReverse();
          continue;
        }
        final used = s.phase == MemoryPalacePhase.recallForward ? s.forwardResponses : s.reverseResponses;
        final next = s.round.recallCandidates.firstWhere((i) => !used.contains(i.id));
        s.selectRecallItem(next.id, at + guard * 1000);
      }
      expect(s.phase, MemoryPalacePhase.result, reason: 'поднятая партия обязана доигрываться');
      expect(s.result, isNotNull);
    });
  }

  test('терять нечего — снимка нет, и мусорный снимок не поднимается', () {
    final s = MemoryPalaceSession.create(content, 'memory-palace-l1-x', 1);
    expect(memoryPalaceSnapshot(s, 1, 1000), isNull, reason: 'правила — терять нечего');
    s.start(1000);
    expect(memoryPalaceSnapshot(s, 1, 2000), isNull, reason: 'маршрут — терять нечего');
    expect(memoryPalaceRestore({'session': {'phase': 'place'}}, 5000), isNull);
    expect(memoryPalaceRestore(null, 5000), isNull);
  });

  test('зерно свежее на каждый заход, форма — как у веба', () {
    final a = memoryPalaceSeed(3, 1_700_000_000_000, 0.25);
    final b = memoryPalaceSeed(3, 1_700_000_000_001, 0.25);
    expect(a, isNot(b));
    expect(a, startsWith('memory-palace-l3-'));
  });
}
