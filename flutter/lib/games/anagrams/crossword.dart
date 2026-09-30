import 'model.dart';

/// КРОССВОРД — третий режим анаграмм. Перенос `core/crossword.ts`.
///
/// Слова из одного набора букв вписываются в сетку и пересекаются: открытая
/// буква — половина соседнего слова.
///
/// 🔴 УКЛАДЧИК ПЕРЕНЕСЁН ЧИСЛО В ЧИСЛО, включая генератор случайных и порядок
/// перебора. Сетка — это то, что человек видит; «такой же случайный» здесь дал бы
/// ДРУГОЕ поле на том же уровне, и партия, начатая в вебе, не продолжилась бы
/// нативно. Проба сверяет сетки клетка в клетку по сорока раскладкам.
///
/// ⚠️ Имена латиницей: Dart не берёт не-ASCII в идентификаторах (стережёт
/// `test/dart_identifiers_are_ascii_test.dart`).
const crossHoriz = 0;
const crossVert = 1;

const crossWordsMin = 6;
const crossWordsMax = 10;
const crossHintsMax = 5;

/// Слов в сетке на уровне: от 6 до 10, шаг — каждые шесть уровней.
int crossWordsAtLevel(int level) {
  final l = level < 1 ? 1 : level;
  final n = crossWordsMin + ((l - 1) ~/ 6);
  return n > crossWordsMax ? crossWordsMax : n;
}

/// Подсказок на уровне: пять до 25-го, дальше по одной меньше каждые восемь.
int crossHintsAtLevel(int level) {
  final l = level < 1 ? 1 : level;
  final after = l - 25 < 0 ? 0 : l - 25;
  final n = crossHintsMax - (after ~/ 8);
  return n < 0 ? 0 : n;
}

/// Слова уровня: самые длинные, по убыванию длины, при равной — по алфавиту.
List<String> crossWordsOfLevel(WordPack pack, int level) {
  final uniq = {for (final w in pack.words) w.toUpperCase()}.toList();
  uniq.sort((a, b) {
    final byLen = b.length - a.length;
    return byLen != 0 ? byLen : (a.compareTo(b) < 0 ? -1 : 1);
  });
  return uniq.take(crossWordsAtLevel(level)).toList();
}

/// Слово на своём месте в сетке.
class PlacedWord {
  const PlacedWord({required this.word, required this.r, required this.c, required this.d});
  final String word;
  final int r;
  final int c;

  /// `crossHoriz` или `crossVert`.
  final int d;
}

/// Готовая сетка: слова, размер, буквы по клеткам, и кто не поместился.
class Crossword {
  const Crossword({
    required this.words,
    required this.rows,
    required this.cols,
    required this.letters,
    required this.outside,
  });

  final List<PlacedWord> words;
  final int rows;
  final int cols;

  /// Буква в каждой занятой клетке. Ключ — `r * cols + c`.
  final Map<int, String> letters;

  /// Слова, которым места не нашлось. Пусто у всех уровней, что доходят до игры.
  final List<String> outside;
}

bool crosswordHas(Crossword cw, String word) {
  final s = word.toUpperCase();
  return cw.words.any((w) => w.word == s);
}

/// Кроссворд собран: найдены все размещённые слова.
bool crosswordSolved(Crossword cw, List<String> found) {
  final f = {for (final w in found) w.toUpperCase()};
  return cw.words.every((w) => f.contains(w.word));
}

/// Подсказка: какое слово приоткрыть и сколько букв станет открыто.
///
/// 🔴 БЕРЁМ САМОЕ КОРОТКОЕ ИЗ ТЕХ, ГДЕ ЕЩЁ ЕСТЬ ЧТО ОТКРЫВАТЬ. У слова открывают
/// не больше `длина − 1` буквы: иначе подсказка решает его целиком. Слово, где
/// открывать уже нечего, пропускается — нажатие, которое списывает подсказку и не
/// делает НИЧЕГО, и есть то, на что жаловались как «подсказка не работает».
///
/// ⚠️ При равной длине берётся ПЕРВОЕ по порядку размещения, а не по алфавиту:
/// в вебе это `reduce` с строгим «короче», и порядок слов в сетке — тот же.
({String word, int opened})? crosswordHint(
  Crossword cw,
  List<String> found, [
  Map<String, int> opened = const {},
]) {
  final f = {for (final w in found) w.toUpperCase()};
  final left = [
    for (final w in cw.words)
      if (!f.contains(w.word) && (opened[w.word] ?? 0) < w.word.length - 1) w.word,
  ];
  if (left.isEmpty) return null;
  var best = left.first;
  for (final w in left.skip(1)) {
    if (w.length < best.length) best = w;
  }
  return (word: best, opened: (opened[best] ?? 0) + 1);
}

/// Клетки, открытые найденными словами и подсказками. Ключ — `r * cols + c`.
Set<int> crosswordRevealed(
  Crossword cw,
  List<String> found, [
  Map<String, int> opened = const {},
]) {
  final out = <int>{};
  final f = {for (final w in found) w.toUpperCase()};
  for (final w in cw.words) {
    final whole = f.contains(w.word);
    final n = whole ? w.word.length : (opened[w.word] ?? 0);
    final dr = w.d == crossHoriz ? 0 : 1;
    final dc = w.d == crossHoriz ? 1 : 0;
    for (var i = 0; i < n; i++) {
      out.add((w.r + dr * i) * cw.cols + (w.c + dc * i));
    }
  }
  return out;
}

const _shift = 64;
const _width = 256;
int _key(int r, int c) => (r + _shift) * _width + (c + _shift);

/// Тот же генератор, что в вебе (`mulberry32`). От него зависит раскладка.
double Function() _seeded(int s) {
  var a = s & 0xFFFFFFFF;
  return () {
    a = (a + 0x6d2b79f5) & 0xFFFFFFFF;
    var t = _imul(a ^ (a >>> 15), 1 | a);
    t = ((t + _imul(t ^ (t >>> 7), 61 | t)) & 0xFFFFFFFF) ^ t;
    return ((t ^ (t >>> 14)) & 0xFFFFFFFF) / 4294967296;
  };
}

/// Младшие 32 бита произведения — то же, что `Math.imul` в JS.
///
/// 🔴 ВОЗВРАЩАЕМ БЕЗЗНАКОВОЕ, И ЭТО НЕ ПРИДИРКА. Первая редакция переводила
/// результат в знаковый (как его видит JS) — и следующий же `>>>` уходил в
/// 64-битную арифметику Dart, где у отрицательного числа биты совсем другие.
/// Генератор расходился, порядок перезапусков укладчика менялся, и сетка
/// собиралась иная: замер поймал это на `ar L7` — 8 строк вместо 9.
///
/// ⚠️ Знак здесь не нужен вовсе: `^`, `|` и `+` на 32 битах дают одни и те же
/// биты в обоих прочтениях, а `>>>` и деление на 2^32 требуют именно
/// беззнакового. Поэтому всё держим маской `& 0xFFFFFFFF`.
///
/// Переполнение 64-битного произведения безопасно: оно заворачивается, а младшие
/// 32 бита от этого не меняются — их мы и берём.
int _imul(int a, int b) => ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF;

List<int> _shuffleOrder(int n, double Function() rnd) {
  final out = [for (var i = 0; i < n; i++) i];
  for (var i = n - 1; i > 0; i--) {
    final j = (rnd() * (i + 1)).floor();
    final t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

class _Field {
  final Map<int, String> letters = {};
  final Set<int> horiz = {};
  final Set<int> vert = {};
  final List<PlacedWord> words = [];

  /// Число пересечений, если слово встанет сюда, либо `null` — если нельзя.
  int? fits(String word, int r, int c, int d) {
    final dr = d == crossHoriz ? 0 : 1;
    final dc = d == crossHoriz ? 1 : 0;
    final own = d == crossHoriz ? horiz : vert;
    // Правило 3: торцы.
    if (letters.containsKey(_key(r - dr, c - dc))) return null;
    if (letters.containsKey(_key(r + dr * word.length, c + dc * word.length))) return null;
    var crossings = 0;
    for (var i = 0; i < word.length; i++) {
      final rr = r + dr * i;
      final cc = c + dc * i;
      final k = _key(rr, cc);
      if (own.contains(k)) return null;   // вдоль своего направления не наслаиваются
      final here = letters[k];
      if (here != null) {
        if (here != word[i]) return null;   // правило 2
        crossings += 1;
      } else if (d == crossHoriz) {
        // Правило 4: пустая клетка не касается боком чужой буквы.
        if (letters.containsKey(_key(rr - 1, cc)) || letters.containsKey(_key(rr + 1, cc))) {
          return null;
        }
      } else if (letters.containsKey(_key(rr, cc - 1)) || letters.containsKey(_key(rr, cc + 1))) {
        return null;
      }
    }
    return crossings;
  }

  void place(String word, int r, int c, int d) {
    final dr = d == crossHoriz ? 0 : 1;
    final dc = d == crossHoriz ? 1 : 0;
    final own = d == crossHoriz ? horiz : vert;
    for (var i = 0; i < word.length; i++) {
      final k = _key(r + dr * i, c + dc * i);
      letters[k] = word[i];
      own.add(k);
    }
    words.add(PlacedWord(word: word, r: r, c: c, d: d));
  }

  /// Границы занятого прямоугольника: `[rmin, cmin, rows, cols]`.
  List<int> frame() {
    if (letters.isEmpty) return const [0, 0, 0, 0];
    var rmin = 1 << 30, rmax = -(1 << 30), cmin = 1 << 30, cmax = -(1 << 30);
    for (final k in letters.keys) {
      final r = (k ~/ _width) - _shift;
      final c = (k % _width) - _shift;
      if (r < rmin) rmin = r;
      if (r > rmax) rmax = r;
      if (c < cmin) cmin = c;
      if (c > cmax) cmax = c;
    }
    return [rmin, cmin, rmax - rmin + 1, cmax - cmin + 1];
  }
}

({_Field field, List<String> outside}) _layout(List<String> words, List<int> order, int limit) {
  final field = _Field();
  field.place(words[order[0]], 0, 0, crossHoriz);
  var rest = [for (final i in order.skip(1)) words[i]];

  for (var pass = 0; pass < 2; pass++) {
    final failed = <String>[];
    for (final word in rest) {
      ({int score, int r, int c, int d})? best;
      // Кандидаты — только клетки с нужной буквой: пересечение обязательно,
      // значит перебирать пустое поле незачем.
      for (final e in field.letters.entries.toList()) {
        final rr = (e.key ~/ _width) - _shift;
        final cc = (e.key % _width) - _shift;
        for (var i = 0; i < word.length; i++) {
          if (word[i] != e.value) continue;
          for (final d in const [crossHoriz, crossVert]) {
            final r = d == crossVert ? rr - i : rr;
            final c = d == crossHoriz ? cc - i : cc;
            final n = field.fits(word, r, c, d);
            if (n == null || n == 0) continue;   // без пересечения не годится
            final f = field.frame();
            final r2 = r + (d == crossVert ? word.length - 1 : 0);
            final c2 = c + (d == crossHoriz ? word.length - 1 : 0);
            final h = (f[0] + f[2] - 1 > r2 ? f[0] + f[2] - 1 : r2) - (f[0] < r ? f[0] : r) + 1;
            final w = (f[1] + f[3] - 1 > c2 ? f[1] + f[3] - 1 : c2) - (f[1] < c ? f[1] : c) + 1;
            if (limit != 0 && (h > limit || w > limit)) continue;
            // Компактность важнее числа пересечений: на телефоне решает сторона.
            final score = h * w * 1000 - n * 10 + (h - w).abs();
            if (best == null || score < best.score) best = (score: score, r: r, c: c, d: d);
          }
        }
      }
      if (best == null) {
        failed.add(word);
      } else {
        field.place(word, best.r, best.c, best.d);
      }
    }
    if (failed.isEmpty) return (field: field, outside: const []);
    if (failed.length == rest.length) return (field: field, outside: failed);
    rest = failed;
  }
  return (field: field, outside: rest);
}

/// Собрать сетку. Уровень служит зерном: та же сетка при том же уровне.
Crossword buildCrossword(List<String> words, int seed, {int restarts = 24, int limit = 0}) {
  final list = [...words];
  final rnd = _seeded(seed);
  final byLength = [for (var i = 0; i < list.length; i++) i]
    ..sort((a, b) => list[b].length - list[a].length);

  ({_Field field, List<String> outside, int score})? best;
  for (var k = 0; k < restarts; k++) {
    final order = k == 0 ? byLength : _shuffleOrder(list.length, rnd);
    final laid = _layout(list, order, limit);
    final f = laid.field.frame();
    final score = laid.outside.length * 1000000 +
        f[2] * f[3] * 100 +
        (f[2] > f[3] ? f[2] : f[3]);
    if (best == null || score < best.score) {
      best = (field: laid.field, outside: laid.outside, score: score);
    }
    final bf = best.field.frame();
    final side = bf[2] > bf[3] ? bf[2] : bf[3];
    if (best.outside.isEmpty && side <= 9) break;   // уже компактно
  }

  final field = best!.field;
  final f = field.frame();
  final rmin = f[0], cmin = f[1], rows = f[2], cols = f[3];
  final letters = <int, String>{};
  for (final e in field.letters.entries) {
    final r = (e.key ~/ _width) - _shift - rmin;
    final c = (e.key % _width) - _shift - cmin;
    letters[r * cols + c] = e.value;
  }
  return Crossword(
    words: [
      for (final w in field.words)
        PlacedWord(word: w.word, r: w.r - rmin, c: w.c - cmin, d: w.d),
    ],
    rows: rows,
    cols: cols,
    letters: letters,
    outside: best.outside,
  );
}
