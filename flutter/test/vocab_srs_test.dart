import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/vocab_srs/model.dart';

/// СВЕРКА «СЛОВАРЯ SRS» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Правила лежат в `frontend/src/services/vocab-srs.ts` и `frontend/app/games/vocab-srs.tsx`.
/// Проверять перенос той же формулой, которой переносил, нельзя — такая проба зелена
/// всегда. Поэтому числа ВЫГРУЖЕНЫ прогоном самого TS (buildOptions, gradeCard,
/// buildQueue, getStats, addCustomWords) в `test/fixtures/vocab-srs-reference.json`
/// прибором `frontend/scripts/flutter-vocab-srs-reference.test.ts`.
///
/// 🔴 В эталон попал и ПОРЯДОК обращений к случайности: вместо Math.random в TS
/// стояла заданная очередь чисел, и здесь Dart получает ту же очередь. Перепутанный
/// порядок перемешиваний покраснеет, даже если каждая формула по отдельности верна.
///
/// ⚠️ ЧЕМ ЭТА ПРОБА ДОКАЗАНА (мутации, каждая обязана краснеть):
///   · ease −0.2 → −0.1 у `again`               → «смешанный» и «сразу again»;
///   · easy-множитель 1.3 → 1.0                 → «easy ×4» со второго шага;
///   · первый интервал easy 3 → 1               → «easy ×4» с первого шага;
///   · `lapses += reps > 0 ? 1 : 0` → всегда +1 → «сразу again»;
///   · перемешивание кандидатов после четвёрки  → «обычный пул»;
///   · снять уникальность кандидатов            → «пул с повторами»;
///   · `dueAt <= now` → `<`                     → очередь сессии (созревшие пропали бы);
///   · сортировка `due` без устойчивого ключа   → порядок house/water (равный dueAt).
void main() {
  // Эталон и словарь читаются СРАЗУ, а не в setUpAll: по эталону строится сам
  // список проб (набор вариантов = проба), а setUpAll выполняется уже после
  // объявления дерева — до него `ref` ещё пуст.
  final ref = jsonDecode(File('test/fixtures/vocab-srs-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final vocab = <VocabEntry>[
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List<dynamic>)
      (e as Map).map((k, v) => MapEntry('$k', '$v')),
  ];

  /// Очередь чисел вместо случайности — точно как в выгрузке.
  double Function() queue(List<double> values) {
    var i = 0;
    return () => values[i++ % values.length];
  }

  VocabSrs engine({int Function()? now, double Function()? random, DeckStore? store}) => VocabSrs(
        vocab: vocab,
        baseLang: 'ru',
        targetLang: 'es',
        store: store ?? MemoryDeckStore(),
        nowMs: now ?? () => (ref['часыМс'] as num).toInt(),
        random: random,
      );

  test('словарь на месте: столько же записей и языков, сколько в живом TS', () {
    final d = ref['словарь'] as Map<String, dynamic>;
    expect(vocab.length, d['записей']);
    for (final lang in (d['языки'] as List)) {
      // Язык либо есть во ВСЕХ записях, либо его нет вовсе: пустая колонка
      // оставила бы пул пустым, и экран сказал бы «всё на сегодня сделано».
      expect(vocab.where((w) => (w['$lang'] ?? '').isNotEmpty).length, vocab.length, reason: 'язык $lang');
    }
  });

  test('ключ колоды совпадает с веб-версией дословно', () {
    expect(deckKeyFor('ru', 'es'), 'psygames_vocab_srs_ru_es');
    expect((ref['словарь'] as Map)['ключКолоды'], 'psygames_vocab_srs_<base>_<target>');
  });

  group('варианты ответа', () {
    for (final raw in (ref['варианты'] as List)) {
      final c = raw as Map<String, dynamic>;
      test(c['имя'], () {
        final e = engine(random: queue([for (final v in (c['очередь'] as List)) (v as num).toDouble()]));
        final got = e.buildOptions(c['right'] as String, [for (final w in (c['pool'] as List)) '$w']);
        expect(got, [for (final w in (c['ожидание'] as List)) '$w']);
      });
    }

    test('верный вариант присутствует всегда и дублей нет', () {
      final e = engine(random: queue([0.0, 0.25, 0.5, 0.75, 0.99]));
      for (final pool in [
        <String>[],
        ['a'],
        ['a', 'a', 'a'],
        ['a', 'b', 'c', 'd', 'e', 'f'],
      ]) {
        final o = e.buildOptions('casa', pool);
        expect(o, contains('casa'));
        expect(o.toSet().length, o.length);
        expect(o.length, lessThanOrEqualTo(4));
      }
    });
  });

  group('SM-2: оценки', () {
    for (final raw in (ref['оценки'] as List)) {
      final s = raw as Map<String, dynamic>;
      test(s['имя'], () async {
        final store = MemoryDeckStore();
        final e = engine(store: store);
        for (final raw2 in (s['следы'] as List)) {
          final step = raw2 as Map<String, dynamic>;
          final grade = switch (step['оценка'] as String) {
            'again' => Grade.again,
            'easy' => Grade.easy,
            _ => Grade.good,
          };
          final interval = await e.gradeCard('v:house', grade);
          expect(interval, step['интервалДней'], reason: 'интервал после ${step['оценка']}');

          final want = step['состояние'] as Map<String, dynamic>;
          final deck = jsonDecode(store.data[deckKeyFor('ru', 'es')]!) as Map<String, dynamic>;
          final got = (deck['states'] as Map)['v:house'] as Map<String, dynamic>;
          expect(got['reps'], want['reps'], reason: 'reps после ${step['оценка']}');
          expect(got['intervalDays'], want['intervalDays'], reason: 'intervalDays после ${step['оценка']}');
          expect(got['lapses'], want['lapses'], reason: 'lapses после ${step['оценка']}');
          expect(got['dueAt'], want['dueAt'], reason: 'dueAt после ${step['оценка']}');
          expect((got['ease'] as num).toDouble(), closeTo((want['ease'] as num).toDouble(), 1e-9),
              reason: 'ease после ${step['оценка']}');
        }
      });
    }

    test('ease не падает ниже 1.3, сколько ни ошибайся', () async {
      final e = engine();
      for (var i = 0; i < 20; i += 1) {
        await e.gradeCard('v:house', Grade.again);
      }
      final st = await e.getStats();
      // Карточка сброшена — в выученных её нет.
      expect(st.learned, 0);
      // Пол проверяем следующим успехом: при ease < 1.3 интервалы поехали бы вниз.
      await e.gradeCard('v:house', Grade.good);
      expect(await e.gradeCard('v:house', Grade.good), 1); // 1 × 1.3 = 1.3 → округление 1
    });
  });

  test('очередь сессии: созревшие впереди новых, порядок по просрочке', () async {
    final q = ref['очередьСессии'] as Map<String, dynamic>;
    final store = MemoryDeckStore();
    var now = (ref['часыМс'] as num).toInt();
    const day = 86400000;
    final e = engine(store: store, now: () => now);

    await e.gradeCard('v:house', Grade.good);
    await e.gradeCard('v:water', Grade.good);
    now += 2 * day;
    await e.gradeCard('v:dog', Grade.good);
    now += 3 * day;
    expect(now, (q['сейчасМс'] as num).toInt());

    final built = await e.buildQueue(5);
    expect([for (final c in built.due) c.id], [for (final c in (q['due'] as List)) (c as Map)['id']]);
    expect([for (final c in built.fresh) c.id], [for (final c in (q['fresh'] as List)) (c as Map)['id']]);
    expect(built.due.every((c) => !c.isNew), isTrue);
    expect(built.fresh.every((c) => c.isNew), isTrue);
    expect(built.pool.length, q['размерПула']);

    final s = await e.getStats();
    final want = q['статистика'] as Map<String, dynamic>;
    expect(s.totalWords, want['totalWords']);
    expect(s.learned, want['learned']);
    expect(s.dueNow, want['dueNow']);
    expect(s.customCount, want['customCount']);
    expect(s.nextDueAt, want['nextDueAt']);
  });

  test('карточка со сроком РОВНО СЕЙЧАС считается созревшей', () async {
    // Граница `dueAt <= now`. Без неё подмена на `<` проходит мимо всех проб:
    // в остальных сценариях сроки строго в прошлом (поймано мутацией 23.09.2026).
    final b = ref['границаСозревания'] as Map<String, dynamic>;
    final store = MemoryDeckStore();
    var now = (ref['часыМс'] as num).toInt();
    final e = engine(store: store, now: () => now);
    await e.gradeCard('v:house', Grade.good);
    now = (b['сейчасМс'] as num).toInt();

    final q = await e.buildQueue(2);
    expect([for (final c in q.due) c.id], [for (final c in (b['due'] as List)) (c as Map)['id']]);
    expect([for (final c in q.fresh) c.id], [for (final id in (b['freshПервые'] as List)) '$id']);
    final want = b['статистика'] as Map<String, dynamic>;
    final s = await e.getStats();
    expect(s.dueNow, want['dueNow']);
    expect(s.learned, want['learned']);
    expect(s.nextDueAt, want['nextDueAt']);
  });

  test('свои слова: разделители, дубли и мусорные строки', () async {
    final want = ref['своиСлова'] as Map<String, dynamic>;
    final e = engine();
    final added = await e.addCustomWords([
      'дом = casa',
      'вода — agua',
      'собака – perro',
      'кот\tgato',
      'плохая строка без разделителя',
      'дом = casa',
      ' = ',
      'длинный ответ = dos palabras aquí',
    ].join('\n'));
    expect(added, want['добавлено']);

    final q = await e.buildQueue(3);
    // Свои слова стоят ПЕРВЫМИ: иначе они никогда не попали бы в новые.
    expect([for (final c in q.fresh.take(3)) c.target],
        [for (final c in (want['записи'] as List).take(3)) (c as Map)['target']]);
  });

  test('оценка выводится из ответа, а не спрашивается у человека', () {
    expect(gradeFromAnswer(correct: false, rtMs: 100), Grade.again);
    expect(gradeFromAnswer(correct: true, rtMs: vocabEasyRtMs - 1), Grade.easy);
    expect(gradeFromAnswer(correct: true, rtMs: vocabEasyRtMs), Grade.good);
    expect(vocabEasyRtMs, ref['easyRtMs']);
    expect(vocabRetryOffset, ref['сдвигПослеОшибки']);
  });
}
