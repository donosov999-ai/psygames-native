/// СВЕРКА ПЕРЕНОСА «ЛИЦ И ИМЁН» С ЖИВЫМ TS.
///
/// 🔴 ПОЧЕМУ ЭТАЛОН, А НЕ «ПРОВЕРИТЬ ФОРМУЛЫ». Проверять перенос той же
/// формулой, которой переносил, нельзя: такая проба зелена всегда. Числа в
/// `fixtures/faces-names-reference.json` сняты прогоном настоящих модулей
/// `frontend/src/games/faces-names/core/*` (прибор
/// `frontend/scripts/flutter-faces-names-reference.test.ts`), и Dart обязан
/// повторить их до знака: тот же seed — тот же расклад, те же варианты ответа,
/// та же сложность, те же метрики.
///
/// ⚠️ САМОЕ ХРУПКОЕ МЕСТО — ПОРЯДОК ВАРИАНТОВ. Он рождается перемешиванием и
/// УСТОЙЧИВОЙ сортировкой: в JS сортировка устойчива по стандарту, в Dart нет.
/// Неустойчивая сортировка не роняет ничего — она молча подставляет другие
/// ложные лица, то есть другую сложность под тем же номером уровня.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/faces_names/model.dart';

void main() {
  late FacesNamesLibrary lib;
  late Map<String, dynamic> ref;

  setUpAll(() {
    lib = FacesNamesLibrary.fromJsonString(File('assets/faces-names.json').readAsStringSync());
    ref = jsonDecode(File('test/fixtures/faces-names-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('есть что сверять: библиотека и эталон на месте', () {
    expect(lib.people, hasLength(48));
    expect(lib.facts, hasLength(48));
    expect((ref['puzzles'] as List), hasLength(11));
    expect((ref['plays'] as List), hasLength(5));
  });

  test('🔴 расстояния до знака: на них держится вся сложность', () {
    for (final row in ref['distances'] as List) {
      final m = row as Map<String, dynamic>;
      final a = lib.person(m['a'] as String)!;
      final b = lib.person(m['b'] as String)!;
      expect(faceDistance(a, b), closeTo((m['face'] as num).toDouble(), 1e-12),
          reason: 'лицо ${m['a']}↔${m['b']}');
      expect(nameDistance(a, b), closeTo((m['name'] as num).toDouble(), 1e-12),
          reason: 'имя ${m['a']}↔${m['b']}');
    }
  });

  test('🔴 расклад уровня совпадает с вебом целиком', () {
    for (final row in ref['puzzles'] as List) {
      final m = row as Map<String, dynamic>;
      final level = m['level'] as int;
      final p = generateFacesNamesPuzzle(lib, ref['meta']['seed'] as String, level);
      final spot = 'уровень $level';

      expect(p.id, m['id'], reason: spot);
      expect(p.difficulty, m['difficulty'], reason: 'сложность, $spot');
      expect(p.studiedPersonIds, m['studiedPersonIds'], reason: 'кого изучаем, $spot');
      expect([for (final x in p.people) x.id], m['peopleIds'], reason: 'все люди расклада, $spot');
      expect(p.factRecallEnabled, m['factRecallEnabled'], reason: spot);
      expect(p.immediateRecall, m['immediateRecall'], reason: spot);
      expect(p.meanFaceSimilarity, closeTo((m['meanFaceSimilarity'] as num).toDouble(), 1e-12),
          reason: 'похожесть лиц, $spot');
      expect(p.meanNameSimilarity, closeTo((m['meanNameSimilarity'] as num).toDouble(), 1e-12),
          reason: 'похожесть имён, $spot');
      expect(
        p.meanRecognitionDistractorSimilarity,
        closeTo((m['meanRecognitionDistractorSimilarity'] as num).toDouble(), 1e-12),
        reason: 'похожесть ложных лиц, $spot',
      );

      final trials = m['trials'] as List;
      expect(p.trials, hasLength(trials.length), reason: 'число разборов, $spot');
      for (var i = 0; i < trials.length; i += 1) {
        final t = trials[i] as Map<String, dynamic>;
        expect(p.trials[i].id, t['id'], reason: '$spot, разбор $i');
        expect(p.trials[i].targetPersonId, t['targetPersonId'], reason: '$spot, разбор $i');
        expect(p.trials[i].recognitionPersonIds, t['recognitionPersonIds'],
            reason: 'ложные лица, $spot, разбор $i');
        expect(p.trials[i].namePersonIds, t['namePersonIds'],
            reason: 'ложные имена, $spot, разбор $i');
        expect(p.trials[i].factIds, t['factIds'], reason: 'ложные факты, $spot, разбор $i');
      }

      final prompts = m['interferencePrompts'] as List;
      expect(p.interferencePrompts, hasLength(prompts.length), reason: 'помехи, $spot');
      for (var i = 0; i < prompts.length; i += 1) {
        final q = prompts[i] as Map<String, dynamic>;
        expect(p.interferencePrompts[i].id, q['id'], reason: '$spot, помеха $i');
        expect(p.interferencePrompts[i].left, q['left'], reason: '$spot, помеха $i');
        expect(p.interferencePrompts[i].right, q['right'], reason: '$spot, помеха $i');
        expect(p.interferencePrompts[i].answer, q['answer'], reason: '$spot, помеха $i');
        expect(p.interferencePrompts[i].options, q['options'],
            reason: 'варианты помехи, $spot, помеха $i');
      }
    }
  });

  test('🔴 сыгранная партия даёт те же метрики, что в вебе', () {
    for (final row in ref['plays'] as List) {
      final m = row as Map<String, dynamic>;
      final level = m['level'] as int;
      final kind = m['kind'] as String;
      final firstOption = kind == 'first-option';
      final now = firstOption ? 45000 : 60000;

      final s = FacesNamesSession.create(lib, ref['meta']['seed'] as String, level);
      s.start(0);
      while (s.phase == FacesNamesPhase.study) {
        s.advanceStudy();
      }
      while (s.phase == FacesNamesPhase.interference) {
        final p = s.currentPrompt!;
        s.answerInterference(firstOption ? p.options.first : p.answer);
      }
      var guard = 0;
      while (s.phase != FacesNamesPhase.result && guard < 200) {
        guard += 1;
        final t = s.currentTrial!;
        if (s.phase == FacesNamesPhase.recognition) {
          s.selectRecognizedFace(firstOption ? t.recognitionPersonIds.first : t.targetPersonId);
        } else if (s.phase == FacesNamesPhase.nameRecall) {
          s.selectRecalledName(firstOption ? t.namePersonIds.first : t.targetPersonId, now);
        } else if (s.phase == FacesNamesPhase.factRecall) {
          final target = s.puzzle.person(t.targetPersonId)!;
          s.selectRecalledFact(firstOption ? t.factIds.first : target.factId, now);
        } else {
          break;
        }
      }

      final spot = '$kind, уровень $level';
      expect(facesNamesPhaseNames[s.phase], m['phase'], reason: spot);
      final r = m['result'] as Map<String, dynamic>;
      final got = s.result!;
      expect(got.accuracy, closeTo((r['accuracy'] as num).toDouble(), 1e-12), reason: 'точность, $spot');
      expect(got.score, r['score'], reason: 'счёт, $spot');
      expect(got.errors, r['errors'], reason: 'ошибки, $spot');
      expect(got.durationMs, r['durationMs'], reason: 'время, $spot');
      expect(got.difficulty, r['difficulty'], reason: 'сложность, $spot');
      final sp = r['specific'] as Map<String, dynamic>;
      expect(got.personCount, sp['personCount'], reason: spot);
      expect(got.faceRecognitionCorrect, sp['faceRecognitionCorrect'], reason: spot);
      expect(got.nameRecallCorrect, sp['nameRecallCorrect'], reason: spot);
      expect(got.factRecallCorrect, sp['factRecallCorrect'], reason: spot);
      expect(got.factRecallTotal, sp['factRecallTotal'], reason: spot);
      expect(got.interferenceRounds, sp['interferenceRounds'], reason: spot);
      expect(got.interferenceCorrect, sp['interferenceCorrect'], reason: spot);
      expect(got.invalidInteractions, sp['invalidInteractions'], reason: spot);
      expect(
        got.factRecallAccuracy == null,
        sp['factRecallAccuracy'] == null,
        reason: 'факты: есть или нет, $spot',
      );
    }
  });

  test('🔴 чужое нажатие не проходит молча, а считается промахом инструмента', () {
    final s = FacesNamesSession.create(lib, 'invalid', 8);
    s.start(0);
    while (s.phase == FacesNamesPhase.study) {
      s.advanceStudy();
    }
    final before = s.interferenceIndex;
    s.answerInterference(-999);
    expect(s.interferenceIndex, before, reason: 'шаг не должен сдвинуться');
    expect(s.invalidInteractions, 1, reason: 'но промах обязан быть посчитан');
  });

  test('пауза не крадёт время партии', () {
    final s = FacesNamesSession.create(lib, 'pause', 3);
    s.start(0);
    s.pause(1000);
    expect(facesNamesPhaseNames[s.phase], 'paused');
    s.resume(4000);
    expect(facesNamesPhaseNames[s.phase], 'study');
    expect(s.pausedMs, 3000);
  });
}
