import 'dart:math' as math;

import '../languages/fresh_pool.dart';

/// «ОБЪЁМ ПРИ ЧТЕНИИ» — правила, перенесённые с `app/games/reading-span.tsx` ДО ЗНАКА.
///
/// Набор предложений идёт по одному: каждое оценить — есть смысл или бессмыслица — и
/// запомнить его последнее слово. После набора — набрать последние слова в порядке показа.
/// Уровень взят, если все слова на своих местах.
///
/// 🔴 СВЕРЯЕТСЯ С ЭТАЛОНОМ ЖИВОГО TS, А НЕ С САМИМ СОБОЙ: `test/fixtures/reading-span-reference.json`
/// и сами предложения `assets/reading_span/sentences.json` пишет экспортёр
/// `frontend/src/games/reading-span/tools/record-flutter-reference.gen.ts`. Второй копии
/// предложений в коде нет — правятся в вебе, сюда приезжают перезапуском экспортёра.

/// Правило уровня: с этого уровня набор длиннее, чем удерживается подряд.
const rspanLoadFromLevel = 5;

/// Пауза удержания на каждый уровень сверх ёмкости словаря — как в вебе.
const rspanHoldStepMs = 700;

/// Одно предложение: текст на двух языках, осмысленно ли оно и его последнее слово.
class RspanSentence {
  const RspanSentence({required this.ru, required this.en, required this.ok, required this.lastRu, required this.lastEn});

  factory RspanSentence.fromJson(Map<String, Object?> j) => RspanSentence(
        ru: j['ru']! as String,
        en: j['en']! as String,
        ok: j['ok']! as bool,
        lastRu: j['lastRu']! as String,
        lastEn: j['lastEn']! as String,
      );

  final String ru;
  final String en;
  final bool ok;
  final String lastRu;
  final String lastEn;

  /// Предложения есть на двух языках: русский — для русского интерфейса, остальным английский
  /// (веб: `language !== 'ru' ? en : ru`).
  String text(String language) => language != 'ru' ? en : ru;
  String last(String language) => language != 'ru' ? lastEn : lastRu;
}

/// Правила уровня: размер набора и удержание перед вводом (ось 3).
///
/// Набор растёт на одно предложение за уровень, пока хватает словаря; дальше уровни стали бы
/// клонами — их различает задержка между последним предложением и вводом. Потолка нет.
class RspanLevelParams {
  const RspanLevelParams({required this.setSize, required this.holdMs});

  final int setSize;
  final int holdMs;

  static RspanLevelParams of(int level, int poolSize) => RspanLevelParams(
        setSize: math.min(poolSize, 2 + level),
        holdMs: math.max(0, level - (poolSize - 2)) * rspanHoldStepMs,
      );
}

/// Проверка воспоминания — веб `recallScore`: последние слова в ПОРЯДКЕ показа против
/// набранного через пробел, запятую или точку с запятой; регистр не важен. Слово на своём
/// месте — попадание, не то слово или пропуск — ошибка.
({int hits, int errors, List<String> expected}) rspanRecallScore(
  List<RspanSentence> seq,
  String language,
  String input,
) {
  final expected = [for (final s in seq) s.last(language).toLowerCase().trim()];
  final given = [
    for (final w in input.toLowerCase().split(RegExp(r'[\s,;]+')))
      if (w.isNotEmpty) w.trim(),
  ];
  var hits = 0, errors = 0;
  for (var i = 0; i < expected.length; i++) {
    if (i < given.length && given[i] == expected[i]) {
      hits++;
    } else {
      errors++;
    }
  }
  return (hits: hits, errors: errors, expected: expected);
}

/// Метка трудности партии по размеру набора — как её пишет веб-отчёт.
String rspanDifficulty(int setSize) => setSize <= 3 ? 'easy' : (setSize <= 5 ? 'medium' : 'hard');

/// Счёт партии: слова дороже суждений, ошибка стоит половину слова.
int rspanScore(int hits, int judgeHits, int errors) => math.max(0, hits * 100 + judgeHits * 30 - errors * 50);

/// Раздача набора — тот же отбор невиданного, что у веба (`pickFresh` по ключу `en`).
({List<RspanSentence> picked, List<String> seen}) rspanDeal(
  List<RspanSentence> pool,
  int size,
  List<String> seen,
  double Function() rng,
) {
  final res = pickFreshWeb<RspanSentence>(pool, size, seen, (s) => s.en, rng);
  return (picked: res.picked, seen: res.seen);
}

/// Партия: суждения по набору, затем воспоминание последних слов.
class ReadingSpanGame {
  ReadingSpanGame({required this.level, required this.seq});

  final int level;
  final List<RspanSentence> seq;

  int step = 0;
  int judgeHits = 0;
  final List<bool> judgments = [];

  /// Итог воспоминания; `null` — ещё не проверяли.
  ({int hits, int errors, List<String> expected})? recall;

  RspanSentence get current => seq[step];

  /// Все предложения оценены — дальше ввод слов.
  bool get judged => judgments.length >= seq.length;

  /// Оценка текущего предложения. Возвращает, верна ли она.
  bool judge(bool saysSense) {
    if (judged) return false;
    final correct = saysSense == seq[step].ok;
    if (correct) judgeHits++;
    judgments.add(saysSense);
    if (!judged) step++;
    return correct;
  }

  void check(String language, String input) => recall = rspanRecallScore(seq, language, input);

  int get hits => recall?.hits ?? 0;
  int get errors => recall?.errors ?? 0;

  /// Все слова на своих местах.
  bool get passed => recall != null && recall!.errors == 0;

  int get score => rspanScore(hits, judgeHits, errors);
}
