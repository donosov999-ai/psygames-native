import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/vocab_srs/typing.dart';

/// СВЕРКА ДВИЖКА НАБОРА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Числа выгружены прогоном самого `frontend/src/services/typing.ts`
/// (createState → pressChar → backspace → stats) прибором
/// `frontend/scripts/flutter-vocab-srs-reference.test.ts`, раздел `typ`.
/// Сверяется КАЖДЫЙ step: принят ли символ, была ли ошибка, где встал курсор и
/// как выглядят метки всего образца — а не только total.
///
/// ⚠️ ЧЕМ ЭТА ПРОБА ДОКАЗАНА (мутации, каждая обязана краснеть):
///   · строгий режим пускает дальше при ошибке   → «словарь: строго»;
///   · свободный режим НЕ метит ошибку           → «свободный режим»;
///   · послабление сравнивает с учётом регистра  → «диктант»;
///   · пропуск знаков убран                      → «диктант» (запятая и «!»);
///   · пропуск ПРОБЕЛОВ в начале убран           → «диктант» (первый же символ);
///   · возврат курсора не чистит метку           → «возврат курсора»;
///   · точность считается без ошибок в знаменателе → totalи всех наборов.
void main() {
  final ref = jsonDecode(File('test/fixtures/vocab-srs-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final typ = ref['печать'] as Map<String, dynamic>;

  test('коды меток совпадают с веб-версией', () {
    final m = typ['метки'] as Map<String, dynamic>;
    expect(Mark.pending, m['PENDING']);
    expect(Mark.correct, m['CORRECT']);
    expect(Mark.wrong, m['WRONG']);
  });

  test('знаки препинания опознаются тем же набором символов', () {
    for (final raw in (typ['знакиПрепинания'] as List)) {
      final e = raw as Map<String, dynamic>;
      expect(isPunct(e['ch'] as String), e['знак'],
          reason: 'символ «${e['ch']}»');
    }
  });

  for (final raw in (typ['наборы'] as List)) {
    final X = raw as Map<String, dynamic>;
    test(X['имя'], () {
      final st = TypingState.create(
        [X['слово'] as String],
        lenient: X['lenient'] as bool,
        nowMs: () => (ref['часыМс'] as num).toInt(),
      );
      final steps = X['шаги'] as List;

      // Нулевой step — состояние сразу после создания.
      final start = (steps.first as Map<String, dynamic>)['старт'] as Map<String, dynamic>;
      expect(st.pos, start['pos'], reason: 'курсор после создания');
      expect(st.marks, [for (final v in (start['marks'] as List)) (v as num).toInt()],
          reason: 'метки после создания');

      for (final raw2 in steps.skip(1)) {
        final step = raw2 as Map<String, dynamic>;
        final key = step['клавиша'] as String;
        if (key == 'BS') {
          st.backspace();
        } else {
          final r = st.pressChar(key,
              blockOnError: X['blockOnError'] as bool, lenient: X['lenient'] as bool);
          expect(r.accepted, step['accepted'], reason: 'принят ли «$key»');
          expect(r.wrong, step['wrong'], reason: 'ошибка на «$key»');
          expect(r.finished, step['finished'], reason: 'конец на «$key»');
        }
        expect(st.pos, step['pos'], reason: 'курсор после «$key»');
        expect(st.errors, step['errors'], reason: 'ошибок после «$key»');
        expect(st.marks, [for (final v in (step['marks'] as List)) (v as num).toInt()],
            reason: 'метки после «$key»');
      }

      final total = X['итог'] as Map<String, dynamic>;
      final s = st.stats();
      expect(s.typed, total['typed']);
      expect(s.errors, total['errors']);
      expect(s.accuracy, total['accuracy']);
    });
  }

  test('вставка целого слова одним куском не проходит — движок смотрит одно нажатие', () {
    final st = TypingState.create(['casa'], nowMs: () => 0);
    final r = st.pressChar('casa', blockOnError: true);
    expect(r.accepted, isFalse);
    expect(st.pos, 0);
    expect(st.errors, 1);
  });

  test('после конца набор не принимает ничего', () {
    final st = TypingState.create(['ab'], nowMs: () => 0);
    st.pressChar('a', blockOnError: true);
    final last = st.pressChar('b', blockOnError: true);
    expect(last.finished, isTrue);
    final after = st.pressChar('c', blockOnError: true);
    expect(after.accepted, isFalse);
    expect(after.finished, isTrue);
    expect(st.errors, 0, reason: 'нажатие после конца не считается ошибкой');
  });
}
