import 'dart:convert';

import 'package:flutter/services.dart';

/// СЛОВО-КВАДРАТ — четвёртый режим анаграмм. Перенос `core/ring.ts`.
///
/// Четыре слова по краям квадрата из одного банка букв; соседние делят угловую
/// букву. Сторона всегда пять: рамка из четырёх пятибуквенных слов.
///
/// ⚠️ Имена латиницей — Dart не берёт не-ASCII в идентификаторах.
const ringSide = 5;

/// Потолок банка: колец с банком шире двенадцати букв в наборах нет.
const ringBankMax = 12;

/// Одно кольцо: четыре слова по краям и банк их букв.
class Ring {
  const Ring({
    required this.top,
    required this.right,
    required this.bottom,
    required this.left,
    required this.bank,
  });

  /// Слева направо по верхнему ряду.
  final String top;

  /// Сверху вниз по правому столбцу; первая буква — общий угол с `top`.
  final String right;

  /// Слева направо по нижнему ряду; последняя буква — общий угол с `right`.
  final String bottom;

  /// Сверху вниз по левому столбцу; первая — угол с `top`, последняя — с `bottom`.
  final String left;

  /// Разные буквы всех четырёх слов, по алфавиту.
  final List<String> bank;

  List<String> get words => [top, right, bottom, left];
}

/// Углы сходятся: рамка замкнута и читается по кругу.
bool ringCornersMeet(String top, String right, String bottom, String left) =>
    top[0] == left[0] &&
    top[ringSide - 1] == right[0] &&
    left[ringSide - 1] == bottom[0] &&
    right[ringSide - 1] == bottom[ringSide - 1];

/// Банк кольца: по каждой букве берётся МАКСИМУМ её вхождений среди четырёх слов.
///
/// 🔴 Именно максимум, а не сумма: слова делят плитки, а не тратят их по
/// отдельности. Сумма раздула бы банк и сделала бы игру тривиальной.
List<String> ringBankOf(String top, String right, String bottom, String left) {
  final need = <String, int>{};
  for (final word in [top, right, bottom, left]) {
    final count = <String, int>{};
    for (final ch in word.split('')) {
      count[ch] = (count[ch] ?? 0) + 1;
    }
    count.forEach((ch, n) {
      final was = need[ch] ?? 0;
      if (n > was) need[ch] = n;
    });
  }
  final keys = need.keys.toList()..sort();
  return [
    for (final ch in keys) ...List.filled(need[ch]!, ch),
  ];
}

/// Складывается ли слово из банка. Каждая плитка тратится один раз.
bool madeOfBank(String word, List<String> bank) {
  final rest = [...bank];
  for (final ch in word.split('')) {
    final i = rest.indexOf(ch);
    if (i < 0) return false;
    rest.removeAt(i);
  }
  return true;
}

/// Ключ кольца — наименьший из восьми его прочтений.
///
/// 🔴 КВАДРАТ СОВПАДАЕТ САМ С СОБОЙ ВОСЕМЬЮ СПОСОБАМИ: четыре поворота и те же
/// четыре с отражением. Без ключа одно и то же кольцо считалось бы восемью
/// разными, и лестница уровней ставила бы человеку один квадрат по восемь раз.
String ringKey(String top, String right, String bottom, String left) {
  String rev(String s) => s.split('').reversed.join();
  final variants = <String>[];
  var t = top, r = right, b = bottom, l = left;
  for (var i = 0; i < 4; i++) {
    variants.add([t, r, b, l].join('|'));
    // Поворот на 90° по часовой: левый столбец снизу вверх становится верхом.
    final nt = rev(l), nr = t, nb = rev(r), nl = b;
    t = nt;
    r = nr;
    b = nb;
    l = nl;
  }
  // Отражение по вертикали: верх и низ наоборот, столбцы меняются местами.
  t = rev(top);
  r = left;
  b = rev(bottom);
  l = right;
  for (var i = 0; i < 4; i++) {
    variants.add([t, r, b, l].join('|'));
    final nt = rev(l), nr = t, nb = rev(r), nl = b;
    t = nt;
    r = nr;
    b = nb;
    l = nl;
  }
  variants.sort();
  return variants.first;
}

/// Сколько ЧУЖИХ слов складывается из того же банка — ось трудности.
///
/// 🔴 Это и есть «почти слово»: чем больше кандидатов, тем дольше человек
/// перебирает. Уровень задаётся этим числом, а не длиной — сторона всегда пять.
int ringFalseCandidates(Ring r, List<String> dictionary) {
  final bank = ringBankOf(r.top, r.right, r.bottom, r.left);
  final own = {r.top, r.right, r.bottom, r.left};
  var n = 0;
  for (final w in dictionary) {
    if (!own.contains(w) && madeOfBank(w, bank)) n += 1;
  }
  return n;
}

/// Лестница: кольца по возрастанию числа ложных кандидатов, при равенстве — по ключу.
List<Ring> ringLadder(List<Ring> rings, List<String> dictionary) {
  final weight = {
    for (final r in rings) r: ringFalseCandidates(r, dictionary),
  };
  final keys = {
    for (final r in rings) r: ringKey(r.top, r.right, r.bottom, r.left),
  };
  final out = [...rings];
  out.sort((a, b) {
    final byWeight = weight[a]! - weight[b]!;
    return byWeight != 0 ? byWeight : keys[a]!.compareTo(keys[b]!);
  });
  return out;
}

/// Кольца языка. Данные — те же файлы, что у веб-версии.
///
/// ⚠️ БАНК В ФАЙЛЕ НЕ ХРАНИТСЯ, и это не экономия на спичках: он однозначно
/// выводится из четырёх слов, а хранение удвоило бы вес ради того, что считается
/// за один проход.
class RingPacks {
  RingPacks._(this.locale, this.rings);

  final String locale;
  final List<Ring> rings;

  static const locales = ['de', 'en', 'es', 'fr', 'it', 'ko', 'pt', 'ru'];
  static final _cache = <String, RingPacks>{};

  static String resolve(String locale) => locales.contains(locale) ? locale : 'en';

  static Future<RingPacks> load(String locale, {AssetBundle? bundle}) async {
    final code = resolve(locale);
    final have = _cache[code];
    if (have != null) return have;
    final raw = await (bundle ?? rootBundle).loadString('assets/rings/$code.json');
    final rings = [
      for (final e in jsonDecode(raw) as List)
        Ring(
          top: (e as Map<String, dynamic>)['t'] as String,
          right: e['r'] as String,
          bottom: e['b'] as String,
          left: e['l'] as String,
          bank: ringBankOf(e['t'] as String, e['r'] as String, e['b'] as String, e['l'] as String),
        ),
    ];
    final packs = RingPacks._(code, rings);
    _cache[code] = packs;
    return packs;
  }

  /// Все слова набора — словарь для счёта ложных кандидатов.
  late final List<String> dictionary = [
    for (final r in rings) ...r.words,
  ];

  late final List<Ring> ladder = ringLadder(rings, dictionary);

  /// Кольцо уровня. Уровень N всегда даёт то же кольцо; набор идёт по кругу.
  Ring ringForLevel(int level) =>
      ladder[((level < 1 ? 1 : level) - 1) % ladder.length];
}
