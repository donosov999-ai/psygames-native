import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

/// «Анаграммы» — правила классического режима, перенос из живого TS.
///
/// Источники переноса, по одному на каждую часть:
///   лестница уровней — `frontend/src/games/anagrams/core/classicLevel.ts`
///   банк слов и спуск по длине — `.../core/allWords.ts`
///   ход партии — `frontend/app/games/anagrams.tsx`, `newRound`
///
/// ⚠️ СВЕРКА НЕ СВОЕЙ ЖЕ ФОРМУЛОЙ. Значения выгружены прогоном самого TS в
/// `test/fixtures/anagrams-reference.json`; Dart обязан совпасть с ними. Проба,
/// которая проверяет перенос тем выражением, которым переносила, зелёная всегда.
///
/// ⚠️ ЗА АДРЕСОМ `/games/anagrams` СТОЯТ ЧЕТЫРЕ ИГРЫ: классика, «Все слова»,
/// кроссворд, слово-квадрат. Здесь перенесена ПЕРВАЯ. Перехват в гибриде идёт по
/// маршруту (`routeOf` срезает query), поэтому включать его можно только когда
/// готовы все четыре — иначе человек потеряет три режима.
///
/// ⚠️ Имена латиницей: Dart не допускает не-ASCII в идентификаторах. Кириллица —
/// в комментариях и в том, что видит человек.

/// Длина слова по уровню. Девять — потолок: девятибуквенных слов у банков 56 и 49.
const anagramLevelLengths = [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9, 9];

/// Пол времени на слово. При девяти буквах это 1,7 с на букву.
const anagramFloorSec = 15;

/// Уровень, на котором длина упёрлась и включается ось времени.
const _lengthCapLevel = 15;

/// Что задаёт уровень классики. Перенос `classicLevel`.
///
/// 🔴 ДЛИНА РАСТИ НЕ МОЖЕТ, А ВРЕМЯ МОЖЕТ. Замер раздела 06.09.2026: было 12
/// различимых настроек, последняя новая на 15-м — дальше длина упёрта в девять,
/// а время держалось на тридцати секундах, и уровни 16+ ничем не отличались.
/// Девятибуквенных слов у курированных банков 56 (ru) и 49 (en), у остальных нет
/// вовсе. Тридцать секунд были ВЫБРАННЫМ числом, а не границей — с 16-го уровня
/// время идёт вниз до пола в пятнадцать.
class AnagramLevel {
  const AnagramLevel({required this.length, required this.trials, required this.wordSec});

  /// Сколько букв в загаданном слове.
  final int length;

  /// Слов за партию.
  final int trials;

  /// Секунд на слово. Ноль = без лимита (уровни 1–6).
  final int wordSec;

  static AnagramLevel of(int level) {
    final l = level < 1 ? 1 : level;
    final length = anagramLevelLengths[min(l, anagramLevelLengths.length) - 1];
    final base = l <= 6 ? 0 : max(30, 98 - (l - 6) * 8);
    final afterCap = max(0, l - _lengthCapLevel);
    final wordSec = base == 0 ? 0 : max(anagramFloorSec, base - (afterCap ~/ 2));
    return AnagramLevel(length: length, trials: 10, wordSec: wordSec);
  }
}

/// Набор «Найди все слова»: база 7–8 букв и её подслова.
class WordPack {
  const WordPack({required this.base, required this.words});
  final String base;
  final List<String> words;
}

/// Словари десяти языков. Переносятся ДАННЫМИ: те же файлы, что у веб-версии,
/// лежат в `assets/words/<язык>.json` (сверка содержимого — при переносе, 10 из
/// 10 совпали пакет в пакет).
///
/// ⚠️ Каталог объявлен в pubspec ПОИМЁННО, и это не формальность: строка
/// `- assets/words/` берёт только файлы самой папки, вложенные каталоги молча не
/// попадают в сборку при зелёной сборке. Сторожит `test/assets_bundled_test.dart`.
class WordBank {
  WordBank._(this.locale, this._packs);

  final String locale;
  final List<WordPack> _packs;
  final Map<int, List<String>> _byLength = {};

  static const locales = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru'];

  /// Язык без своего набора получает английский — так же, как в вебе.
  static String resolve(String locale) => locales.contains(locale) ? locale : 'en';

  static Future<WordBank> load(String locale, {AssetBundle? bundle}) async {
    final code = resolve(locale);
    final raw = await (bundle ?? rootBundle).loadString('assets/words/$code.json');
    final packs = [
      for (final e in jsonDecode(raw) as List)
        WordPack(
          base: (e as Map<String, dynamic>)['base'] as String,
          words: [for (final w in e['words'] as List) w as String],
        ),
    ];
    return WordBank._(code, packs);
  }

  int get packCount => _packs.length;

  /// Все слова набора заданной длины — и базы, и подслова, без повторов.
  ///
  /// Длина считается по РУНАМ, а не по кодовым единицам: у арабского, японского
  /// и корейского `String.length` врёт.
  List<String> wordsOfLength(int len) => _byLength.putIfAbsent(len, () {
        final seen = <String>{};
        for (final p in _packs) {
          if (p.base.runes.length == len) seen.add(p.base);
          for (final w in p.words) {
            if (w.runes.length == len) seen.add(w);
          }
        }
        return seen.toList();
      });

  /// БАНК КЛАССИКИ СО СПУСКОМ ПО ДЛИНЕ. Перенос `банкКлассики`.
  ///
  /// 🔴 ПОЧЕМУ СПУСК ОБЯЗАТЕЛЕН. Лестница просит длину 9 на уровнях 11–15, а базы
  /// наборов не длиннее восьми: девятибуквенных подслов нет ни у одного языка
  /// (замер 06.09.2026 — ровно 0 у всех десяти). Без спуска банк приходил бы
  /// пустым ровно там, куда доходит игрок.
  ///
  /// Порог в четыре слова — меньше нечего тасовать.
  List<String> classicBank(int len) {
    for (var n = len; n >= 4; n--) {
      final words = wordsOfLength(n);
      if (words.length >= 4) return words;
    }
    return const [];
  }
}

/// Одно слово партии: что загадано и какие буквы показаны.
class AnagramRound {
  const AnagramRound({required this.target, required this.letters});

  /// Загаданное слово, как его засчитывают.
  final String target;

  /// Буквы на колесе — те же, что у цели, в другом порядке.
  final List<String> letters;
}

/// Ход классической партии. Перенос `newRound` из экрана.
///
/// 🔴 ЗАЧЁТ ИДЁТ ПО ВСЕМУ БАНКУ ДЛИНЫ, А НЕ ПО ОДНОМУ СЛОВУ. Из тех же букв
/// часто складывается не то слово, что загадано, — и оно тоже верное. В вебе это
/// множество `validWords`, и без него игрок получает «неверно» за настоящее
/// слово. Перенесено вместе с механикой, а не забыто.
class ClassicGame {
  ClassicGame({required this.bank, required this.level, Random? rnd})
      : _rnd = rnd ?? Random(),
        _valid = {for (final w in bank.classicBank(level.length)) w.toUpperCase()};

  final WordBank bank;
  final AnagramLevel level;
  final Random _rnd;
  final Set<String> _valid;
  final Set<String> _used = {};

  /// Тот же источник случайности, что раздаёт слова: перемешивание на экране
  /// обязано брать его, а не заводить свой — иначе партия перестаёт повторяться
  /// по зерну, и проба не может сыграть одно и то же дважды.
  Random get rnd => _rnd;

  /// Сколько слов зачтётся на этой длине — размер множества зачёта.
  int get acceptedCount => _valid.length;

  /// Слово принимается, если оно есть в банке этой длины.
  bool accepts(String word) => _valid.contains(word.toUpperCase());

  /// Следующее слово партии.
  ///
  /// Банк исчерпан — использованные сбрасываются, а не партия встаёт.
  AnagramRound next() {
    final all = bank.classicBank(level.length);
    var avail = [for (final w in all) if (!_used.contains(w)) w];
    if (avail.isEmpty) {
      _used.clear();
      avail = all;
    }
    final pick = avail[_rnd.nextInt(avail.length)];
    _used.add(pick);
    final target = pick.toUpperCase();
    return AnagramRound(target: target, letters: shuffleLetters(target, _rnd));
  }

  /// Перемешать буквы так, чтобы на поле не лежал сразу готовый ответ.
  ///
  /// Пять попыток, как в вебе: на коротком слове из одинаковых букв («ООО»)
  /// любая перестановка равна исходной, и бесконечный цикл был бы хуже подсказки.
  static List<String> shuffleLetters(String word, Random rnd) {
    final letters = word.runes.map(String.fromCharCode).toList();
    for (var i = 0; i < 5; i++) {
      letters.shuffle(rnd);
      if (letters.join() != word) break;
    }
    return letters;
  }
}
