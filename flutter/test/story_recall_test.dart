import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/story_recall/model.dart';

/// СВЕРКА «STORY RECALL» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): стем всегда 4 знака; вложенные стемы не
/// отбрасываются; пересказ режется только пробелом; сравнение без нижнего регистра;
/// у чтения нет пола 15 с; помеха не растёт с уровнем.
///
/// 📍 «Стем всегда 5» — НЕ мутация: `max(4, min(длина, 5))` и есть «первые до пяти
/// знаков», срез короче длины. А пол 15 с у рассказов спит (базы 30–35 с, минимум
/// 18 с на 15-м уровне) — поэтому в эталоне есть база 20 с, где он работает.
void main() {
  final ref = jsonDecode(File('test/fixtures/story-recall-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final asset = jsonDecode(File('assets/vocab/story-recall.json').readAsStringSync()) as Map<String, dynamic>;
  final stories = [for (final s in (asset['stories'] as List)) Story.fromJson(s as Map)];

  test('лестница: секунды чтения и помехи по уровням, как в вебе', () {
    expect(storyMaxLevel, ref['maxLevel']);
    for (final raw in (ref['levels'] as List)) {
      final l = raw as Map<String, dynamic>;
      final level = (l['level'] as num).toInt();
      expect([for (final b in [30, 32, 35, 20]) readSecondsFor(b, level)], l['read'], reason: 'чтение, уровень $level');
      expect(distractorSecondsFor(storyDistractor1Sec, level), l['d1'], reason: 'помеха 1, уровень $level');
      expect(distractorSecondsFor(storyDistractor2Sec, level), l['d2'], reason: 'помеха 2, уровень $level');
    }
  });

  test('рассказы доехали целиком', () {
    expect(stories.length, (ref['stories'] as List).length);
  });

  for (final raw in (ref['stories'] as List)) {
    final s = raw as Map<String, dynamic>;
    final i = (s['index'] as num).toInt();
    for (final lang in ['ru', 'en']) {
      test('рассказ $i ($lang): стемы, ключи, совпадения пересказов', () {
        final want = s[lang] as Map<String, dynamic>;
        final story = stories[i];
        final kws = story.keywordsFor(lang);
        expect([for (final k in kws) storyStem(k)], want['stems'], reason: 'стемы');
        expect(storyKeys(kws), want['keys'], reason: 'ключи без двойного счёта');
        for (final m in (want['matches'] as List)) {
          final c = m as Map<String, dynamic>;
          expect(countStoryMatches('${c['text']}', kws), c['hits'], reason: 'пересказ «${'${c['text']}'.characters20}»');
        }
      });
    }
  }
}

extension on String {
  String get characters20 => length <= 20 ? this : '${substring(0, 20)}…';
}
