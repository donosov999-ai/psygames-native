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
enum SudokuSkin { digits, letters }

SudokuSkin skinFromName(String? s) => s == SudokuSkin.letters.name ? SudokuSkin.letters : SudokuSkin.digits;

/// 🔴 ПРАВИЛА, ГДЕ У ЦИФРЫ НЕТ ЧИСЛОВОГО СМЫСЛА — только «девять разных значков».
///
/// Термометры (порядок), стрелки и клетки-суммы (сложение), точки Кропки и «не подряд»
/// (соседство чисел), чёт-нечет (чётность), сэндвич (сумма между 1 и 9) — там буква
/// спрятала бы само правило: человек не может знать, что «Л» больше «К» на единицу.
/// Это уже шифр, а не оформление. Поэтому буквы — только на этих правилах, а на
/// остальных доска остаётся цифрами, и пункт паузы не показывается вовсе.
const symbolicVariants = {'none', 'diagonal', 'antiknight', 'hyper', 'antiking', 'jigsaw'};

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
  const SudokuSymbols._(this.glyphs, {this.word, this.wordRow});

  /// `glyphs[v]` — значок цифры v; `glyphs[0]` — пусто.
  final List<String> glyphs;

  /// Спрятанное слово и строка решения, где оно читается. `null` — слова нет.
  final String? word;
  final int? wordRow;

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
}) {
  final n = solution.length;
  if (skin != SudokuSkin.letters || !skinApplies(variant) || n == 0) return SudokuSymbols.digits(n);
  final words = WordokuWords.of(language, n);
  if (words == null || words.isEmpty) return SudokuSymbols.alphabet(n);
  final rnd = Random(seed);
  return SudokuSymbols.wordoku(solution, rnd.nextInt(n), words[rnd.nextInt(words.length)]);
}
