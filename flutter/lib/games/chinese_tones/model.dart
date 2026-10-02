/// «ТОНЫ КИТАЙСКОГО» — правила на Flutter.
///
/// Перенос `frontend/app/games/chinese-tones.tsx` (`levelParams`, `buildTrials`)
/// и ядра `frontend/src/games/chinese-tones/core/pinyin.ts`. Сверка — с
/// ИСПОЛНЕНИЕМ живого TS: `test/fixtures/chinese-tones-reference.json`, прибор
/// `frontend/scripts/flutter-chinese-tones-reference.test.ts`. Банк слогов HSK —
/// ассетом оттуда же (`assets/vocab/zh-tone-bank.json`).
library;

import 'dart:math';

/// Гласные с тоновым знаком по рядам: знак ставится ПРАВИЛОМ с исключениями, и
/// ошибка в нём тихо научит неправильному написанию.
const List<(String, String)> _rows = [
  ('a', 'āáǎà'), ('e', 'ēéěè'), ('i', 'īíǐì'), ('o', 'ōóǒò'), ('u', 'ūúǔù'), ('ü', 'ǖǘǚǜ'),
];

final Map<String, (String, int)> _marks = {
  for (final (base, row) in _rows)
    for (final (i, ch) in row.runes.map(String.fromCharCode).indexed) ch: (base, i + 1),
};

List<String> _chars(String s) => [for (final r in s.runes) String.fromCharCode(r)];

/// Тон написанного слога: 1–4 по знаку, 5 — нейтральный.
int toneOf(String pinyin) {
  for (final c in _chars(pinyin)) {
    final m = _marks[c];
    if (m != null) return m.$2;
  }
  return 5;
}

/// Слог без знака: `zhǎo` → `zhao`.
String stripTone(String pinyin) => _chars(pinyin).map((c) => _marks[c]?.$1 ?? c).join();

/// Поставить тон: есть `a`/`e` — на неё; есть `ou` — на `o`; иначе на последнюю гласную.
String applyTone(String base, int tone) {
  if (tone == 5 || tone < 1 || tone > 4) return base;
  final letters = _chars(base);
  final vowels = [for (var i = 0; i < letters.length; i += 1) if ('aeiouü'.contains(letters[i])) i];
  if (vowels.isEmpty) return base;
  var target = vowels.last;
  final a = vowels.where((i) => letters[i] == 'a').firstOrNull;
  final e = vowels.where((i) => letters[i] == 'e').firstOrNull;
  if (a != null) {
    target = a;
  } else if (e != null) {
    target = e;
  } else {
    final o = vowels.where((i) => letters[i] == 'o').firstOrNull;
    if (o != null && o + 1 < letters.length && letters[o + 1] == 'u') target = o;
  }
  final row = _rows.firstWhere((r) => r.$1 == letters[target]).$2;
  letters[target] = _chars(row)[tone - 1];
  return letters.join();
}

/// Четыре написания слога, всегда 1→4: перемешивает экран.
List<String> allTones(String pinyin) {
  final base = stripTone(pinyin);
  return [for (var t = 1; t <= 4; t += 1) applyTone(base, t)];
}

/// Знаки тонов на кнопках младших уровней.
const List<String> toneSigns = ['ˉ', 'ˊ', 'ˇ', 'ˋ'];

class CtLevelParams {
  const CtLevelParams({
    required this.trials,
    required this.showAfter,
    required this.pinyinMode,
    required this.rate,
    required this.snrDb,
    required this.maxErrors,
  });
  final int trials;

  /// После ответа открываются иероглиф и пиньинь.
  final bool showAfter;

  /// Выбор слога целиком из четырёх написаний.
  final bool pinyinMode;
  final double rate;
  final double? snrDb;
  final int maxErrors;
}

CtLevelParams ctLevelParams(int level) {
  final l = min(15, max(1, level));
  final (trials, showAfter, pinyinMode) = l <= 5 ? (8, true, false) : (l <= 10 ? (10, false, false) : (12, false, true));
  return CtLevelParams(
    trials: trials,
    showAfter: showAfter,
    pinyinMode: pinyinMode,
    rate: ((0.9 - (l - 1) * 0.01) * 1000).round() / 1000,
    snrDb: l < 6 ? null : (max(0, 18 - (l - 6) * 2) * 10).round() / 10,
    maxErrors: l <= 5 ? 2 : (l <= 10 ? 1 : 0),
  );
}

class ZhSyllable {
  const ZhSyllable(this.zh, this.pinyin);
  final String zh;
  final String pinyin;
}

/// Банк: тон → слоги в порядке веба.
Map<int, List<ZhSyllable>> zhBankFromJson(Map<dynamic, dynamic> j) => {
      for (final e in (j['bank'] as Map).entries)
        int.parse('${e.key}'): [for (final s in (e.value as List)) ZhSyllable('${(s as Map)['zh']}', '${s['pinyin']}')],
    };

/// 🔴 БАНК, КОТОРЫЙ ПРОЗВУЧИТ. Отчёт «Полиглота» (Android 2.53.8): «нажимаешь — и ни
/// фига, не проговаривает; на айфоне нормально». Замер 01.10.2026: записи есть у 99 слогов
/// банка из 422 (23 %), остальные «Тоны» отдают системному голосу. На iPhone китайский голос
/// встроен, на Android его часто нет — и три слога из четырёх молчали, а плашка «нет голоса»
/// не показывалась: язык считался озвученным, раз у него есть хоть одна запись.
/// Без системного китайского голоса партия строится только из слогов с записью (22–28 на
/// тон); голос есть — банк целиком, как в вебе.
Map<int, List<ZhSyllable>> ctPlayableBank(
  Map<int, List<ZhSyllable>> bank, {
  required bool systemVoice,
  required bool Function(String zh) hasRecording,
}) {
  if (systemVoice) return bank;
  return {for (final e in bank.entries) e.key: [for (final s in e.value) if (hasRecording(s.zh)) s]};
}

class CtTrial {
  const CtTrial(this.syll, this.tone, this.options, this.correctIdx);
  final ZhSyllable syll;
  final int tone;
  final List<String> options;
  final int correctIdx;
}

List<String> _shuffle(List<String> arr, double Function() rng) {
  final a = [...arr];
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rng() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Пробы партии — `buildTrials` веба: тон, слог этого тона, и в режиме пиньиня —
/// четыре написания вперемешку.
List<CtTrial> buildCtTrials(Map<int, List<ZhSyllable>> bank, int count, bool pinyinMode, double Function() rng) {
  final out = <CtTrial>[];
  for (var i = 0; i < count; i += 1) {
    final tone = 1 + (rng() * 4).floor();
    final list = bank[tone]!;
    final syll = list[(rng() * list.length).floor()];
    if (pinyinMode) {
      final all = _shuffle(allTones(syll.pinyin), rng);
      out.add(CtTrial(syll, tone, all, all.indexOf(syll.pinyin)));
    } else {
      out.add(CtTrial(syll, tone, toneSigns, tone - 1));
    }
  }
  return out;
}

int ctScore(int hits, int errors) => max(0, hits * 100 - errors * 30);
