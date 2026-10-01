/// «STORY RECALL» (пересказ рассказа) — правила на Flutter.
///
/// Перенос `frontend/app/games/story-recall.tsx` (`storyStem`, `storyKeys`,
/// `countStoryMatches`) и `frontend/src/services/storyRecallLevels.ts`.
/// Сверка — с ИСПОЛНЕНИЕМ живого TS: `test/fixtures/story-recall-reference.json`,
/// прибор `frontend/scripts/flutter-story-recall-reference.test.ts`. Тексты
/// рассказов — ассетом `assets/vocab/story-recall.json` оттуда же.
library;

import 'dart:math';

/// Потолок лестницы: на пятнадцатом чтение на 40 % короче, помеха вдвое длиннее.
const int storyMaxLevel = 15;

/// Помеха перед немедленным пересказом и перед отложенным — базовые секунды.
const int storyDistractor1Sec = 30;
const int storyDistractor2Sec = 90;

class Story {
  const Story({required this.ru, required this.en, required this.keywordsRu, required this.keywordsEn, required this.readSeconds});

  factory Story.fromJson(Map<dynamic, dynamic> j) => Story(
        ru: '${j['ru']}',
        en: '${j['en']}',
        keywordsRu: [for (final k in (j['keywords_ru'] as List)) '$k'],
        keywordsEn: [for (final k in (j['keywords_en'] as List)) '$k'],
        readSeconds: (j['read_seconds'] as num).toInt(),
      );

  final String ru;
  final String en;
  final List<String> keywordsRu;
  final List<String> keywordsEn;
  final int readSeconds;

  /// Рассказ есть на двух языках: русский — русскому интерфейсу, остальным английский.
  String textFor(String lang) => lang == 'ru' ? ru : en;
  List<String> keywordsFor(String lang) => lang == 'ru' ? keywordsRu : keywordsEn;
}

/// Стем ключа — то, по чему идёт сравнение с пересказом: 4–5 первых знаков.
String storyStem(String kw) {
  final lower = kw.toLowerCase();
  return lower.substring(0, min(lower.length, max(4, min(kw.length, 5))));
}

/// Ключи, которые реально можно набрать ПОРОЗНЬ: с одинаковым или вложенным стемом
/// оставляется первый — иначе одно слово засчитывалось бы дважды.
List<String> storyKeys(List<String> keywords) {
  final kept = <String>[];
  final stems = <String>[];
  for (final kw in keywords) {
    final st = storyStem(kw);
    if (stems.any((prev) => prev == st || st.startsWith(prev) || prev.startsWith(st))) continue;
    stems.add(st);
    kept.add(kw);
  }
  return kept;
}

final RegExp _split = RegExp(r'[\s,;.!?]+');

/// Сколько ключей рассказа названо в пересказе. Сравнение по стему.
int countStoryMatches(String text, List<String> keywords) {
  final words = [for (final w in text.toLowerCase().split(_split)) if (w.isNotEmpty) w];
  final matched = <String>{};
  for (final kw in storyKeys(keywords)) {
    final stem = storyStem(kw);
    for (final w in words) {
      if (w.startsWith(stem)) {
        matched.add(stem);
        break;
      }
    }
  }
  return matched.length;
}

int clampStoryLevel(int level) => max(1, min(storyMaxLevel, level));

double _round2(double v) => (v * 100).round() / 100;

/// Секунды на чтение: множитель 1,0 → 0,6 по уровням, не меньше 15 с.
int readSecondsFor(int baseSeconds, int level) {
  final k = (clampStoryLevel(level) - 1) / (storyMaxLevel - 1);
  final mul = _round2(1.0 + k * (0.6 - 1.0));
  return max(15, (baseSeconds * mul).round());
}

/// Секунды помехи: множитель 1,0 → 2,0 по уровням.
int distractorSecondsFor(int baseSeconds, int level) {
  final k = (clampStoryLevel(level) - 1) / (storyMaxLevel - 1);
  final mul = _round2(1.0 + k * (2.0 - 1.0));
  return (baseSeconds * mul).round();
}

/// Пример помехи: a ± b, оба от 1 до 19.
class StoryMath {
  const StoryMath(this.a, this.b, this.plus);
  final int a;
  final int b;
  final bool plus;
  int get answer => plus ? a + b : a - b;
  String get text => '$a ${plus ? '+' : '-'} $b = ?';
}

/// Три случайных числа — в том же порядке, что в вебе: a, b, знак.
StoryMath nextStoryMath(double Function() rng) {
  final a = 1 + (rng() * 19).floor();
  final b = 1 + (rng() * 19).floor();
  final plus = rng() < 0.5; // `Math.random() < 0.5 ? '+' : '-'`
  return StoryMath(a, b, plus);
}
