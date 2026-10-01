/// ЯДРО «МНЕМОНИКИ» — ПЕРЕНОС, А НЕ ПЕРЕПИСЫВАНИЕ.
///
/// Источник: `frontend/src/games/mnemonics/{core,pegsQuiz}.ts`. Сверка —
/// `flutter/test/mnemonics_test.dart` против эталона, снятого прогоном ЖИВОГО TS
/// (`frontend/src/games/mnemonics/tools/record-flutter-reference.gen.ts`): тот же поток
/// случайных чисел обязан дать тот же ряд, тот же пример и ту же партию «Опор».
///
/// 🔴 ПОРЯДОК ОБРАЩЕНИЙ К `rnd` — ЧАСТЬ ПРАВИЛ. Поменяй местами два вызова — и эталон
/// разойдётся, хотя «по смыслу» ничего не изменилось. Поэтому каждая функция повторяет TS
/// строка в строку, включая короткое замыкание `bothWays && rnd() < 0.5`: до 4-го уровня
/// направление вопроса случайного числа НЕ берёт.
///
/// Данные игры (слова, код 00–99, подписи режима) — ассетом `assets/mnemonics.json`
/// от того же экспортёра, а не строками в коде.
library;

import 'dart:convert';

typedef Rnd = double Function();

/// Строка правила кода: цифра, её согласные и зацепка («у „н“ две ножки»).
class PegRuleRow {
  const PegRuleRow({required this.digit, required this.letters, required this.why});
  final int digit;
  final String letters;
  final String why;
}

/// Код 00–99 одного языка: слово-опора и разбор на каждое число, правило, подписи режима.
class PegTable {
  const PegTable({required this.words, required this.hints, required this.rule, required this.text});
  final List<String> words;
  final List<String> hints;
  final List<PegRuleRow> rule;
  final Map<String, String> text;

  /// Разбор без слова: «м=3 + д=1» (в ассете — «мёд: м=3 + д=1»).
  String why(int n) {
    final hint = hints[n];
    final at = hint.indexOf(': ');
    return at < 0 ? '' : hint.substring(at + 2);
  }
}

class MnemonicsContent {
  const MnemonicsContent({required this.words, required this.pegs});
  final Map<String, List<String>> words;
  final Map<String, PegTable> pegs;

  /// Слова ряда: русский — свой, остальные языки — английский (как в вебе).
  List<String> wordsFor(String locale) => words[locale == 'ru' ? 'ru' : 'en']!;

  /// Таблица опор есть только там, где есть код: русский и английский.
  PegTable? pegsFor(String locale) => hasPegTable(locale) ? pegs[locale] : null;

  static MnemonicsContent fromJsonString(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    final words = (j['words'] as Map).map((k, v) => MapEntry(k as String, [for (final w in v as List) w as String]));
    final pegs = (j['pegs'] as Map).map((k, v) {
      final p = v as Map<String, dynamic>;
      return MapEntry(
        k as String,
        PegTable(
          words: [for (final w in p['words'] as List) w as String],
          hints: [for (final h in p['hints'] as List) h as String],
          rule: [
            for (final r in p['rule'] as List)
              PegRuleRow(
                digit: (r as Map)['digit'] as int,
                letters: r['letters'] as String,
                why: r['why'] as String,
              ),
          ],
          text: (p['text'] as Map).map((a, b) => MapEntry(a as String, b as String)),
        ),
      );
    });
    return MnemonicsContent(words: words, pegs: pegs);
  }
}

bool hasPegTable(String lang) => lang == 'ru' || lang == 'en';

/// Лестница: длина ряда 5 → 15, пауза удержания с 5-го, примеры-помехи с 9-го.
({int itemCount, int gapMs, int mathTrials}) levelParams(int level) {
  final l = level.clamp(1, 15);
  return (
    itemCount: (4 + (l < 1 ? 1 : l)).clamp(0, 15),
    gapMs: l < 5 ? 0 : ((l - 4) * 350).clamp(0, 4000),
    mathTrials: l < 9 ? 0 : (l - 8).clamp(0, 3),
  );
}

/// Пример для окна удержания: сложение в пределах двадцати и четыре варианта.
({int a, int b, int answer, List<int> options}) newExample(Rnd rnd) {
  final a = 2 + (rnd() * 8).floor();
  final b = 2 + (rnd() * 8).floor();
  final answer = a + b;
  final set = <int>{answer};
  // Сторож цикла (см. веб): без выхода крупные сдвиги крутили бы цикл вечно.
  var guard = 0;
  while (set.length < 4 && guard < 40) {
    guard += 1;
    final shift = const [1, -1, 2, -2][(rnd() * 4).floor()];
    final v = answer + shift;
    if (v > 0) set.add(v);
  }
  for (var step = 1; set.length < 4; step += 1) {
    set.add(answer + step + 2);
  }
  final options = set.toList();
  for (var i = options.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = options[i];
    options[i] = options[j];
    options[j] = t;
  }
  return (a: a, b: b, answer: answer, options: options);
}

/// Ряд на запоминание: слова — перемешанный словарь языка, числа — разные 10–99.
List<String> dealRow(String mode, int count, List<String> words, Rnd rnd) {
  if (mode == 'words') {
    final list = [...words];
    for (var i = list.length - 1; i > 0; i -= 1) {
      final j = (rnd() * (i + 1)).floor();
      final t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list.take(count).toList();
  }
  final numbers = <String>[];
  final used = <int>{};
  while (numbers.length < count) {
    final n = (rnd() * 90).floor() + 10;
    if (used.add(n)) numbers.add('$n');
  }
  return numbers;
}

/// Лестница режима «Опоры»: диапазон, обе стороны, длина захода, время на ответ, варианты.
({int range, bool bothWays, int count, int limitMs, int options}) pegQuizParams(int level) {
  final l = level.clamp(1, 40);
  final range = l <= 2
      ? 10
      : l <= 5
          ? 30
          : l <= 9
              ? 50
              : 100;
  return (
    range: range,
    bothWays: l >= 4,
    count: (6 + ((l - 1) ~/ 2) * 2).clamp(0, 24),
    limitMs: l < 12 ? 0 : (12000 - (l - 12) * 500).clamp(4000, 1 << 30),
    options: l >= 35
        ? 6
        : l >= 29
            ? 5
            : 4,
  );
}

/// Отвлекающие числа: сперва похожие (тот же десяток или та же единица), потом прочие.
List<int> pegDistractors(int n, int range, Rnd rnd, [int count = 3]) {
  final all = [for (var x = 0; x < range; x += 1) if (x != n) x];
  final similar = [for (final x in all) if (x ~/ 10 == n ~/ 10 || x % 10 == n % 10) x];
  final other = [for (final x in all) if (!similar.contains(x)) x];
  List<int> pick(List<int> from, int howMany) {
    final copy = [...from];
    final taken = <int>[];
    while (taken.length < howMany && copy.isNotEmpty) {
      taken.add(copy.removeAt((rnd() * copy.length).floor()));
    }
    return taken;
  }

  final set = pick(similar, count - 1 > 2 ? count - 1 : 2);
  set.addAll(pick(other, count - set.length));
  if (set.length < count) {
    set.addAll(pick([for (final x in all) if (!set.contains(x)) x], count - set.length));
  }
  return set.take(count).toList();
}

enum PegDirection { toWord, toNumber }

class PegQuestion {
  const PegQuestion({
    required this.n,
    required this.direction,
    required this.prompt,
    required this.options,
    required this.answer,
  });
  final int n;
  final PegDirection direction;
  final String prompt;
  final List<String> options;
  final String answer;
}

String twoDigits(int x) => x.toString().padLeft(2, '0');

/// Вопрос «Опор»: число → слово или (с 4-го уровня) слово → число.
PegQuestion makePegQuestion(int level, PegTable table, Rnd rnd, [List<int> avoid = const []]) {
  final p = pegQuizParams(level);
  final free = [for (var x = 0; x < p.range; x += 1) if (!avoid.contains(x)) x];
  final pool = free.isNotEmpty ? free : [for (var x = 0; x < p.range; x += 1) x];
  final n = pool[(rnd() * pool.length).floor()];
  final direction = p.bothWays && rnd() < 0.5 ? PegDirection.toNumber : PegDirection.toWord;
  final word = table.words[n];
  final others = pegDistractors(n, p.range, rnd, p.options - 1);
  final options = direction == PegDirection.toWord
      ? [word, for (final x in others) table.words[x]]
      : [twoDigits(n), for (final x in others) twoDigits(x)];
  for (var i = options.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = options[i];
    options[i] = options[j];
    options[j] = t;
  }
  return PegQuestion(
    n: n,
    direction: direction,
    prompt: direction == PegDirection.toWord ? twoDigits(n) : word,
    options: options,
    answer: direction == PegDirection.toWord ? word : twoDigits(n),
  );
}
