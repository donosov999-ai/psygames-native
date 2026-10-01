import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';

/// ЭТАЛОН РАЗБОРА СНЯТ ПРОГОНОМ ЖИВОГО TS, А НЕ ПЕРЕСЧИТАН ЗДЕСЬ.
///
/// `anagrams-teach-reference.json` — 400 случаев: десять языков × длины 4…8 × по
/// четыре слова из банка × ДВА разных колеса на каждое слово. Второе колесо —
/// обратный порядок: от порядка колеса зависят ИНДЕКСЫ плиток, и перенос обязан
/// совпасть на обоих, иначе подсветка покажет не те буквы.
///
/// ⚠️ Сверяется не только число шагов, но и КАЖДОЕ поле: приём, индексы, собранное,
/// кусок и оба числа объяснения. Разбор, который правильно ставит буквы и врёт в
/// числах («так начинаются 4 слова из 1454»), учит неверной логике — а именно логике
/// он и должен учить.
void main() {
  // Банк читается из ассетов — без привязки биндинга `rootBundle` не отвечает.
  TestWidgetsFlutterBinding.ensureInitialized();

  test('🔴 разбор совпадает с живым TS: приёмы, индексы, куски и числа (400 случаев)', () async {
    final raw = File('test/fixtures/anagrams-teach-reference.json').readAsStringSync();
    final cases = (jsonDecode(raw) as Map<String, dynamic>)['cases'] as List<dynamic>;
    expect(cases.length, 400, reason: 'эталон не тот, что снимали');

    final banks = <String, WordBank>{};
    var checked = 0;
    for (final c in cases.cast<Map<String, dynamic>>()) {
      final locale = c['locale'] as String;
      final bank = banks[locale] ??= await WordBank.load(locale);
      final target = c['target'] as String;
      final wheel = (c['wheel'] as List<dynamic>).cast<String>();
      final want = (c['steps'] as List<dynamic>).cast<Map<String, dynamic>>();

      final got = anagramLesson(target, wheel, bank.classicBank);
      expect(got.length, want.length, reason: 'шагов не столько: $locale $target');
      for (var i = 0; i < want.length; i++) {
        final w = want[i];
        final g = got[i];
        expect(teachTechniqueName(g.technique), w['technique'],
            reason: 'приём шага $i: $locale $target');
        expect(g.place, (w['place'] as List<dynamic>).cast<int>(),
            reason: 'индексы шага $i: $locale $target колесо $wheel');
        expect(g.built, w['built'], reason: 'собрано на шаге $i: $locale $target');
        expect(g.piece, w['piece'], reason: 'кусок шага $i: $locale $target');
        expect(g.words, w['words'], reason: 'счёт слов шага $i: $locale $target');
        expect(g.of, w['of'], reason: 'размер банка: $locale $target');
        checked += 1;
      }
    }
    expect(checked, greaterThan(1200), reason: 'сверено шагов: $checked');
  });

  test('🔴 первый шаг НИЧЕГО не ставит: осмотр — это приём, а не украшение', () async {
    final bank = await WordBank.load('ru');
    final steps = anagramLesson('СПАСИБО', 'СПАСИБО'.split(''), bank.classicBank);
    expect(steps.first.technique, TeachTechnique.look);
    expect(steps.first.place, isEmpty, reason: 'осмотр не ставит букв');
    expect(steps.first.built, '', reason: 'после осмотра не собрано ничего');
    // А последний шаг обязан собрать слово целиком: разбор доводит до решения.
    expect(steps.last.built, 'СПАСИБО');
  });

  test('🔴 повтор буквы указывает РАЗНЫЕ плитки колеса', () async {
    final bank = await WordBank.load('ru');
    // У «КОЛОКОЛ» три «О» и два «К»: индексы шагов не должны повторяться.
    const word = 'КОЛОКОЛ';
    final steps = anagramLesson(word, word.split(''), bank.classicBank);
    if (steps.isEmpty) return; // слова нет в банке — сверять нечего
    final all = [for (final s in steps) ...s.place];
    expect(all.toSet().length, all.length, reason: 'одна плитка указана дважды: $all');
    expect(all.length, word.length, reason: 'указаны не все буквы');
  });

  test('🔴 край шага зависит от длины слова: 3 у длинных, 2 у коротких', () async {
    final bank = await WordBank.load('ru');
    final long = bank.classicBank(7).firstWhere((w) => w.runes.length == 7, orElse: () => '');
    final short = bank.classicBank(5).firstWhere((w) => w.runes.length == 5, orElse: () => '');
    if (long.isNotEmpty) {
      final s = anagramLesson(long, long.toUpperCase().split(''), bank.classicBank);
      expect(s[1].piece.runes.length, 3, reason: 'у семибуквенного начало из трёх: $long');
    }
    if (short.isNotEmpty) {
      final s = anagramLesson(short, short.toUpperCase().split(''), bank.classicBank);
      expect(s[1].piece.runes.length, 2, reason: 'у пятибуквенного начало из двух: $short');
    }
  });

  test('🔴 слово не из этих букв разбора НЕ получает — пустой список, а не мусор', () async {
    final bank = await WordBank.load('ru');
    expect(anagramLesson('СПАСИБО', 'ВОРОБЕЙ'.split(''), bank.classicBank), isEmpty);
    expect(anagramLesson('ДА', 'ДА'.split(''), bank.classicBank), isEmpty,
        reason: 'слово короче трёх букв');
    expect(anagramLesson('СПАСИБО', 'СПАСИБО'.split(''), (_) => const ['ОДИН', 'ДВА']), isEmpty,
        reason: 'банк меньше четырёх слов');
  });

  test('🔴 объяснение берёт числа ИЗ ШАГА и подставляет все три поля', () {
    const step = TeachStep(
      technique: TeachTechnique.start,
      place: [0, 1],
      built: 'СП',
      piece: 'СП',
      words: 4,
      of: 1454,
    );
    final text = teachStepText(step, (k) => 'ключ $k: «{piece}», {n} из {total}');
    expect(text, 'ключ teachAnagramStart: «СП», 4 из 1454');
    expect(text.contains('{'), isFalse, reason: 'подстановка не осталась незакрытой');
  });

  /// 🔴 КЛЮЧ ОБЪЯСНЕНИЯ ДОЛЖЕН ДОЕХАТЬ В СБОРКУ, А НЕ ТОЛЬКО СУЩЕСТВОВАТЬ В КОДЕ.
  ///
  /// Сборщик словаря ищет `L.t('литерал')`, а разбор зовёт ключ переменной. Первый
  /// прогон собрал словарь БЕЗ четырёх объяснений: в коде они были, в сборке — нет, и
  /// человек увидел бы `teachAnagramLook` вместо текста. Поэтому проба смотрит в
  /// СОБРАННЫЙ ассет, а не в исходник: это единственное место, где видно результат.
  test('🔴 ключ каждого приёма объявлен и доехал в собранный словарь — все 12 языков', () {
    for (final t in TeachTechnique.values) {
      expect(teachAnagramKeys, contains(teachStepKey(t)),
          reason: 'приём $t не объявлен в teachAnagramKeys — сборщик его не увидит');
    }
    for (final loc in ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
      final dict = (jsonDecode(File('assets/l10n/$loc.json').readAsStringSync())
          as Map<String, dynamic>);
      for (final key in teachAnagramKeys) {
        final value = '${dict[key] ?? ''}';
        expect(value.trim(), isNotEmpty, reason: '$loc: нет строки для $key');
        expect(value.contains('{piece}'), isTrue,
            reason: '$loc: в строке $key потеряна подстановка {piece}');
      }
    }
  });
}

/// Имя приёма как оно лежит в эталоне (русское — эталон снят с TS, где тип такой).
String teachTechniqueName(TeachTechnique t) => switch (t) {
      TeachTechnique.look => 'осмотр',
      TeachTechnique.start => 'начало',
      TeachTechnique.middle => 'середина',
      TeachTechnique.end => 'окончание',
    };
