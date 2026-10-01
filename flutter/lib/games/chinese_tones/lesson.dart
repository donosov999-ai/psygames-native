library;

import '../../shell/lesson.dart';
import 'model.dart';

/// 🎓 РАЗБОР «ТОНОВ КИТАЙСКОГО»: СЛУШАТЬ ДВИЖЕНИЕ ГОЛОСА, А НЕ СЛОГ.
///
/// Перенос веб-учителя (`frontend/src/games/chinese-tones/teach.ts`, задача d651a95c) вместе с
/// ключами текстов. Слог тот же, линия голоса другая — и слово другое (七 qī, 骑 qí, 起 qǐ, 气 qì).
/// До 30.09.2026 нативные «Тоны» показывали вместо этого одну общую демо-карточку.
///
/// ШАГИ: приём → ОДИН слог в четырёх тонах (четыре настоящих слова банка, у каждого своя линия) →
/// пара «второй против третьего» на двух словах одного слога (оба кончаются вверх, разница в начале) →
/// итог.
///
/// 🔴 СЛОВА — ТОЛЬКО ИЗ БАНКА ИГРЫ, и тон у каждого — тот, который игра засчитает. Звучит иероглиф,
/// как в самой партии. Сверка — эталон `flutter/test/fixtures/chinese-tones-lesson-reference.json`
/// (прибор `frontend/src/games/chinese-tones/tools/record-flutter-lesson.gen.ts`).
///
/// ⚠️ СЛОГ ТЕКУЩЕГО ЗАДАНИЯ В РАЗБОР НЕ ПОПАДАЕТ: разбор открывается и посреди партии.

typedef CtLessonSyll = ({String zh, String pinyin, int tone});

/// Карточка: вид, ключ словаря, подстановки, какую линию подсветить, что произнести, какие слова на поле.
typedef CtCard = ({
  String kind,
  String key,
  Map<String, String> fields,
  int? tone,
  List<String> speak,
  List<CtLessonSyll> sylls,
});

/// Линии тонов по пятиступенчатой шкале Чжао Юаньжэня (1 — низ, 5 — верх): 55, 35, 214, 51.
const Map<int, List<int>> ctToneContours = {
  1: [5, 5],
  2: [3, 5],
  3: [2, 1, 4],
  4: [5, 1],
};

/// Слоги банка по основе (без знака тона) в порядке веба: основа → тон → слова этого тона.
Map<String, Map<int, List<ZhSyllable>>> _byBase(Map<int, List<ZhSyllable>> bank) {
  final out = <String, Map<int, List<ZhSyllable>>>{};
  for (final tone in const [1, 2, 3, 4]) {
    for (final s in bank[tone] ?? const <ZhSyllable>[]) {
      out.putIfAbsent(stripTone(s.pinyin), () => {}).putIfAbsent(tone, () => []).add(s);
    }
  }
  return out;
}

/// Основы, у которых в банке есть все четыре тона.
List<String> ctBasesAllTones(Map<int, List<ZhSyllable>> bank) =>
    [for (final e in _byBase(bank).entries) if (e.value.length == 4) e.key];

/// Основы, у которых есть и второй, и третий тон.
List<String> ctBasesPair23(Map<int, List<ZhSyllable>> bank) =>
    [for (final e in _byBase(bank).entries) if (e.value.containsKey(2) && e.value.containsKey(3)) e.key];

({List<CtCard> cards, String base}) ctLessonCards({
  required Map<int, List<ZhSyllable>> bank,
  String? exclude,
  required double Function() rnd,
}) {
  final map = _byBase(bank);
  bool notCurrent(String base) => !map[base]!.values.any((ws) => ws.any((s) => s.pinyin == exclude));
  T pick<T>(List<T> list) => list[(rnd() * list.length).floor()];

  final full = ctBasesAllTones(bank).where(notCurrent).toList();
  final base = pick(full);
  final set = [
    for (final t in const [1, 2, 3, 4]) (zh: map[base]![t]!.first.zh, pinyin: map[base]![t]!.first.pinyin, tone: t),
  ];
  final pairs = ctBasesPair23(bank).where((o) => o != base && notCurrent(o)).toList();
  final pb = pick(pairs);
  final second = (zh: map[pb]![2]!.first.zh, pinyin: map[pb]![2]!.first.pinyin, tone: 2);
  final third = (zh: map[pb]![3]!.first.zh, pinyin: map[pb]![3]!.first.pinyin, tone: 3);

  final cards = <CtCard>[
    (kind: 'intro', key: 'teachZhIntro', fields: const {}, tone: null, speak: const [], sylls: set),
    for (final s in set)
      (kind: 'tone', key: 'teachZhTone${s.tone}', fields: {'zh': s.zh, 'py': s.pinyin}, tone: s.tone, speak: [s.zh], sylls: set),
    (
      kind: 'pair',
      key: 'teachZhPair23',
      fields: {'a': second.zh, 'pa': second.pinyin, 'b': third.zh, 'pb': third.pinyin},
      tone: null,
      speak: [second.zh, third.zh],
      sylls: [second, third],
    ),
    (kind: 'done', key: 'teachZhDone', fields: const {}, tone: null, speak: const [], sylls: set),
  ];
  return (cards: cards, base: base);
}

List<LessonStep> ctLessonSteps(
  List<CtCard> cards,
  String Function(String key, Map<String, String> args) say,
) =>
    [for (final c in cards) LessonStep(text: say(c.key, c.fields), payload: c)];
