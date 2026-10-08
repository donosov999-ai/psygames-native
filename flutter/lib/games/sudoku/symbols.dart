/// ЗНАЧКИ ВМЕСТО ЦИФР — задача f1e1ff9c (пункт 1 «Усложнений», решение Дениса 30.09.2026).
///
/// Один слой на всё, что показывает цифру: клетку доски, клавишу, пометку карандаша и
/// подстановку `{d}` в тексте разбора. Внутри игра по-прежнему живёт цифрами — значок
/// меняет только то, что видно, поэтому переключать можно посреди партии, и прогресс,
/// проверка хода и мера трудности ничего о значках не знают.
///
/// 🔴 ТРУДНОСТЬ ОТ ЗАМЕНЫ ЗНАЧКА НЕ РАСТЁТ — это оформление (Wordoku, звери для детей).
/// Усложнение буквами — ШИФР, где буква означает неизвестную цифру (пункт 2, задача
/// 1f8fbd7f). Путать два вида нельзя: под одним словом «буквы» они дают разную игру.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

/// Какими значками показывать цифры.
enum SudokuSkin { digits, letters, drawn, animals }

/// Выбор игрока: вид значков и, для рисованных, набор. Хранится одной строкой:
/// `digits` · `letters` · `animals` · `drawn:<набор>`.
class SkinChoice {
  const SkinChoice(this.skin, [this.style = 'candy']);
  final SudokuSkin skin;
  final String style;

  static SkinChoice parse(String? s) {
    if (s == SudokuSkin.letters.name) return const SkinChoice(SudokuSkin.letters);
    if (s == SudokuSkin.animals.name) return const SkinChoice(SudokuSkin.animals);
    if (s != null && s.startsWith('drawn:')) {
      final st = s.substring(6);
      if (digitStyles.contains(st)) return SkinChoice(SudokuSkin.drawn, st);
    }
    return const SkinChoice(SudokuSkin.digits);
  }

  String get name => skin == SudokuSkin.drawn ? 'drawn:$style' : skin.name;
}

/// 🔴 РИСОВАННЫЕ ЦИФРЫ ВЕБА — потеря переноса, возвращена (задача f1e1ff9c).
/// Пять наборов и правило владения — ТЕ ЖЕ, что в вебе (frontend/src/constants/digitThemes.ts,
/// frontend/src/services/cosmetics.ts): бесплатны «конфетные» и набор своего профиля,
/// остальные — купленные в магазине (`psygames_cosmetics_unlocked_<профиль>`, id `digits_<набор>`).
/// Второй экономики здесь нет: натив читает ту же общую память, что веб.
const digitStyles = ['candy', 'rainbow', 'pastel', 'neon', 'elegant'];

/// Набор профиля по умолчанию — таблица веба PROFILE_DIGIT_STYLE.
const profileDigitStyle = <String, String>{
  'kids': 'rainbow', 'free': 'rainbow', 'students': 'rainbow',
  'women': 'pastel', 'vasilyeva': 'pastel', 'seniors': 'pastel',
  'nzt48': 'neon', 'odv999': 'neon', 'drivers': 'neon',
  'chess': 'elegant', 'execs': 'elegant', 'polyglot': 'elegant',
};

String defaultStyleFor(String profile) => profileDigitStyle[profile] ?? 'candy';

/// Владеет ли профиль набором: бесплатные + купленные.
bool styleOwned(String style, String profile, List<String> unlocked) =>
    style == 'candy' || style == defaultStyleFor(profile) || unlocked.contains('digits_$style');

/// Картинка цифры набора — ассет, скопированный из веба как есть.
String digitImage(String style, int v) => 'assets/digits/$style/d$v.webp';

/// 🔴 ЗВЕРИ ВМЕСТО ЦИФР (задача 01dc3ff0, «Судоку с животными» MindLab). Картинки — свои,
/// из «Пар» (`assets/pairs/animals/0..11.webp`), чужих ассетов нет. Номера картинок:
/// 0 кот · 1 собака · 2 лиса · 3 сова · 4 заяц · 5 медведь · 6 панда · 7 лев · 8 лягушка ·
/// 9 пингвин · 10 слон · 11 свинья.
///
/// ⚠️ НАБОР ПОДОБРАН ПО ЦВЕТУ, А НЕ ПО ПОРЯДКУ. Зверь различается с первого взгляда только
/// окраской: лиса рядом с котом (оба рыжие), сова и медведь рядом с собакой (все бурые)
/// путаются, поэтому в девятку их нет. На малых полях — самые несхожие из девяти.
/// Глиф — эмодзи того же зверя: им говорят пометки карандашом и текст разбора.
const animalPicks = <int, List<int>>{
  4: [0, 8, 9, 11],                      // кот · лягушка · пингвин · свинья
  6: [0, 1, 6, 8, 9, 11],                // + собака · панда
  9: [0, 1, 4, 6, 7, 8, 9, 10, 11],      // + заяц · лев · слон
};
const animalGlyphs = <int, String>{
  0: '🐱', 1: '🐶', 2: '🦊', 3: '🦉', 4: '🐰', 5: '🐻',
  6: '🐼', 7: '🦁', 8: '🐸', 9: '🐧', 10: '🐘', 11: '🐷',
};
String animalImage(int i) => 'assets/pairs/animals/$i.webp';

/// 🔴 ПРАВИЛО ВЕБА: картинка — только там, где под цифрой НИЧЕГО не нарисовано.
/// «Под цифрой что-то нарисовано → цифра рисуется текстом цветом темы. Контраст важнее
/// единообразия начертания — читаемость цифры и есть игра» (app/games/sudoku.tsx).
/// У этих правил под клетками ничего нет: знаки Кропки стоят между клетками, подсказки
/// сэндвича — снаружи.
const decorFreeVariants = {'none', 'diagonal', 'antiknight', 'hyper', 'antiking', 'jigsaw', 'kropki', 'sandwich', 'nonconsec', 'friends', 'wordoku', 'animals'};

/// 🔴 ПРАВИЛА, ГДЕ У ЦИФРЫ НЕТ ЧИСЛОВОГО СМЫСЛА — только «девять разных значков».
///
/// Термометры (порядок), стрелки и клетки-суммы (сложение), точки Кропки и «не подряд»
/// (соседство чисел), чёт-нечет (чётность), сэндвич (сумма между 1 и 9) — там буква
/// спрятала бы само правило: человек не может знать, что «Л» больше «К» на единицу.
/// Это уже шифр, а не оформление. Поэтому буквы — только на этих правилах, а на
/// остальных доска остаётся цифрами, и пункт паузы не показывается вовсе.
const symbolicVariants = {'none', 'diagonal', 'antiknight', 'hyper', 'antiking', 'jigsaw'};

/// Ступени лестницы, где значки — само правило (блоки 153+, письмо раздела уровней 2d8320ed):
/// классика, но буквами (Wordoku, в строке спрятано слово) или зверями. Выбор игрока тут не
/// спрашивается — поэтому их нет в [symbolicVariants] (там выбор игрока действует), и пункта
/// «значки» в паузе у них нет.
const forcedSkinVariants = {'wordoku', 'animals'};

bool skinApplies(String variant) => symbolicVariants.contains(variant);

/// СЛОВА ДЛЯ WORDOKU — ДАННЫМИ, ПО ЯЗЫКАМ (`assets/levels/sudoku-wordoku-words.json`).
///
/// У каждого слова ровно n РАЗНЫХ букв — иначе две цифры получили бы одну букву, и доска
/// стала бы нерешаемой на вид. Гейт — `sudoku_symbols_test.dart`. Слова лежат в ассете,
/// а не в коде, по той же причине, что слова игр в `assets/words/`: это данные языка,
/// и следующий язык добавляется строкой файла, а не правкой экрана.
class WordokuWords {
  static const asset = 'assets/levels/sudoku-wordoku-words.json';
  static Map<String, Map<int, List<String>>> _byLang = const {};

  static Map<String, Map<int, List<String>>> get all => _byLang;

  static Future<void> load() async {
    if (_byLang.isNotEmpty) return;
    final raw = jsonDecode(await rootBundle.loadString(asset)) as Map<String, Object?>;
    _byLang = {
      for (final e in raw.entries)
        if (!e.key.startsWith('_'))
          e.key: {
            for (final s in (e.value as Map<String, Object?>).entries)
              int.parse(s.key): (s.value as List).cast<String>(),
          },
    };
  }

  static List<String>? of(String language, int n) => _byLang[language]?[n];
}

/// Набор значков одной партии: `glyph(v)` — что показать вместо цифры `v`.
class SudokuSymbols {
  const SudokuSymbols._(this.glyphs, {this.word, this.wordRow, this.images});

  /// `glyphs[v]` — значок цифры v; `glyphs[0]` — пусто.
  final List<String> glyphs;

  /// Спрятанное слово и строка решения, где оно читается. `null` — слова нет.
  final String? word;
  final int? wordRow;

  /// Картинки цифр (рисованные наборы): `images[v]` — ассет цифры v. `null` — без картинок.
  /// Текстовые значки при этом остаются цифрами: ими говорят пометки и текст разбора.
  final List<String>? images;

  /// Рисованный набор веба.
  factory SudokuSymbols.drawn(int n, String style) => SudokuSymbols._(
        ['', for (var v = 1; v <= n; v++) '$v'],
        images: ['', for (var v = 1; v <= n; v++) digitImage(style, v)],
      );

  /// Картинка значения; `null` — картинки нет, клетка и клавиша рисуют глиф.
  String? image(int v) {
    final im = images;
    return im != null && v > 0 && v < im.length && im[v].isNotEmpty ? im[v] : null;
  }

  /// Звери (картинки «Пар») — для полей 4, 6 и 9; на прочих размерах цифры.
  factory SudokuSymbols.animals(int n) {
    final picks = animalPicks[n];
    if (picks == null) return SudokuSymbols.digits(n);
    return SudokuSymbols._(
      ['', for (final i in picks) animalGlyphs[i]!],
      images: ['', for (final i in picks) animalImage(i)],
    );
  }

  /// «Мяу — друзья» (задача fa0d6f9c): правило говорит о коте и мыши, поэтому значки
  /// неизменны при любом выборе игрока — 1 кот, 2 мышь (как MEOW_FRIENDS_4/_9 в MindLab),
  /// дальше звери набора этого поля без кота. Поля 4×4 (малыши) и 9×9 (ступени лестницы).
  /// ⚠️ Картинки мыши в «Парах» нет (рисует задача 3ebe9d63): пока мышь — глиф 🐭.
  factory SudokuSymbols.meow(int n) {
    final rest = animalPicks[n]?.where((i) => i != 0).toList();
    if (rest == null || rest.length < n - 2) return SudokuSymbols.digits(n);
    final picks = [0, -1, ...rest.take(n - 2)]; // кот · мышь (без картинки) · звери поля
    return SudokuSymbols._(
      ['', for (final i in picks) i < 0 ? '🐭' : animalGlyphs[i]!],
      images: ['', for (final i in picks) i < 0 ? '' : animalImage(i)],
    );
  }

  /// Обычные цифры.
  factory SudokuSymbols.digits(int n) => SudokuSymbols._(['', for (var v = 1; v <= n; v++) '$v']);

  /// WORDOKU: буква цифры — та буква слова, что стоит на месте этой цифры в строке
  /// `row` решения. Поэтому слово ГАРАНТИРОВАННО читается в этой строке, а не надеется
  /// на удачу раскладки.
  factory SudokuSymbols.wordoku(List<List<int>> solution, int row, String word) {
    final n = solution.length;
    final letters = word.split('');
    if (letters.length != n || letters.toSet().length != n) {
      throw ArgumentError('wordoku word "$word" needs $n distinct letters');
    }
    final g = List<String>.filled(n + 1, '');
    for (var c = 0; c < n; c++) {
      g[solution[row][c]] = letters[c];
    }
    return SudokuSymbols._(g, word: word, wordRow: row);
  }

  /// Буквы по алфавиту без слова — для языков, у которых слов пока нет.
  factory SudokuSymbols.alphabet(int n) =>
      SudokuSymbols._(['', for (var v = 1; v <= n; v++) String.fromCharCode(0x40 + v)]);

  String glyph(int v) => v > 0 && v < glyphs.length ? glyphs[v] : '';

  /// Цифры ли это — от этого зависит, писать ли значки в отчёт партии.
  bool get isDigits => glyphs.length > 1 && glyphs[1] == '1';
}

/// Значки для выданной доски: предпочтение игрока, правило доски и язык.
///
/// Слово и строку выбирает зерно раздачи — у одной доски одно и то же слово, сколько
/// ни переключай значки посреди партии.
SudokuSymbols symbolsFor({
  required SudokuSkin skin,
  required String variant,
  required List<List<int>> solution,
  required String language,
  required int seed,
  String style = 'candy',
}) {
  final n = solution.length;
  // Правило друзей — о коте и мыши: значки не выбираются, иначе пропадает само правило.
  if (variant == 'friends' && n > 0) return SudokuSymbols.meow(n);
  // Wordoku и звери на лестнице: значки — правило ступени, выбор игрока не спрашивается.
  if (variant == 'animals' && n > 0) return SudokuSymbols.animals(n);
  if (variant == 'wordoku' && n > 0) {
    final words = WordokuWords.of(language, n);
    if (words == null || words.isEmpty) return SudokuSymbols.alphabet(n);
    final rnd = Random(seed);
    return SudokuSymbols.wordoku(solution, rnd.nextInt(n), words[rnd.nextInt(words.length)]);
  }
  // Рисованные — это всё ещё цифры: числовой смысл не теряется ни на одном правиле.
  // Где под клеткой рисунок, клетка сама возьмёт текст (decorFreeVariants).
  if (skin == SudokuSkin.drawn && n > 0) return SudokuSymbols.drawn(n, style);
  // Звери — как буквы: прячут числовой смысл, поэтому только на правилах без него.
  if (skin == SudokuSkin.animals && skinApplies(variant) && n > 0) return SudokuSymbols.animals(n);
  if (skin != SudokuSkin.letters || !skinApplies(variant) || n == 0) return SudokuSymbols.digits(n);
  final words = WordokuWords.of(language, n);
  if (words == null || words.isEmpty) return SudokuSymbols.alphabet(n);
  final rnd = Random(seed);
  return SudokuSymbols.wordoku(solution, rnd.nextInt(n), words[rnd.nextInt(words.length)]);
}
