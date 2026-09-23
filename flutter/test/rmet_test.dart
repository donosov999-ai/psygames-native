/// «ПРОЧТИ ЭМОЦИЮ»: МАТЕРИАЛ И ПАРТИЯ.
///
/// 🔴 ЧТО СТОРОЖИТ ПЕРВОЕ. Пункт, у которого верного слова НЕТ среди вариантов,
/// нерешаем — и заметить это на глаз в восемнадцати пунктах на двух языках
/// нельзя. Поэтому материал проверяется целиком, а не «на пару штук».
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: чужой нормы. Упражнение по мотивам парадигмы,
/// материал свой; «22–30 из 36» — планка другого инструмента, и приложить её
/// значило бы сказать человеку, что он ниже того, к чему не относится.
library;

import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rmet/model.dart';

void main() {
  late RmetContent content;

  setUpAll(() {
    content = RmetContent.fromJsonString(File('assets/rmet.json').readAsStringSync());
  });

  test('🔴 материал целен: 18 пунктов, четыре слова, верное среди них, три снимка', () {
    expect(content.items, hasLength(18));
    final broken = <String>[];
    for (final item in content.items) {
      for (final locale in ['ru', 'en']) {
        final options = item.optionsFor(locale);
        if (options.length != 4) broken.add('${item.correct['en']}/$locale: вариантов ${options.length}');
        if (!options.contains(item.correctFor(locale))) {
          broken.add('${item.correct['en']}/$locale: верного слова нет среди вариантов');
        }
        if (options.toSet().length != options.length) {
          broken.add('${item.correct['en']}/$locale: вариант повторяется');
        }
      }
      if (item.files.length != 3) broken.add('${item.correct['en']}: снимков ${item.files.length}');
    }
    expect(broken, isEmpty);
  });

  test('🔴 снимки, на которые ссылается материал, лежат в сборке', () {
    final missing = <String>[];
    for (final item in content.items) {
      for (final f in item.files) {
        if (!File('assets/rmet/$f').existsSync()) missing.add(f);
      }
    }
    expect(missing, isEmpty, reason: 'ссылка на картинку, которой нет, — пустой экран у человека');
  });

  test('партия считает верные и время ТОЛЬКО на верных', () {
    final s = RmetSession.start(content, 'ru', 3, random: Random(7));
    s.answer(s.current.correctFor('ru'), 1000);
    expect(s.hits, 1);
    s.next();
    final wrong = s.options.firstWhere((o) => o != s.current.correctFor('ru'));
    s.answer(wrong, 5000);
    expect(s.errors, 1);
    s.next();
    s.answer(s.current.correctFor('ru'), 2000);
    s.next();
    expect(s.finished, isTrue);
    final m = s.metrics;
    expect(m.hits, 2);
    expect(m.total, 3);
    expect(m.meanRtMs, closeTo(1500, 0.001), reason: 'промах не должен разбавлять скорость');
    expect(m.accuracy, closeTo(2 / 3, 1e-12));
    expect(m.passed, isTrue, reason: 'две трети — наша планка, и она названа своим именем');
  });

  test('второй ответ на один пункт не считается', () {
    final s = RmetSession.start(content, 'en', 2, random: Random(3));
    s.answer(s.current.correctFor('en'), 800);
    s.answer(s.options.first, 900);
    expect(s.hits + s.errors, 1, reason: 'пункт отвечен один раз');
  });

  test('заход берёт разные пункты, а не первые по списку', () {
    final a = RmetSession.start(content, 'ru', 9, random: Random(1));
    final b = RmetSession.start(content, 'ru', 9, random: Random(2));
    expect([for (final i in a.items) i.correct['en']],
        isNot([for (final i in b.items) i.correct['en']]));
  });
}
