import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/bilingual.dart';
import 'package:psygames_flutter/games/languages/fresh_pool.dart';
import 'package:psygames_flutter/games/semantic_sort/model.dart';

/// СВЕРКА «СОРТИРОВКИ СЛОВ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Раунды в эталоне сняты ИСПОЛНЕНИЕМ веб-функции `buildSemanticRounds`, отбор —
/// веб-функцией `pickFreshFrom`, на заданной очереди случайных чисел. Здесь та же
/// очередь в том же порядке — совпасть обязан каждый раунд: слово, верная
/// категория и порядок кнопок.
///
/// ⚠️ ЧЕМ ДОКАЗАНА (мутации, каждая обязана краснеть):
///   · лестница 2→3→4 категорий сдвинута на уровень;
///   · категория без порога «≥ 3 слова»;
///   · «коварные» дистракторы не берутся из таблицы;
///   · вторая перетасовка (кнопок раунда) убрана;
///   · в билингво слово берётся всегда на первом языке;
///   · отбор тасует `List.shuffle` вместо веб-Фишера–Йетса.
void main() {
  final ref = jsonDecode(File('test/fixtures/semantic-sort-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final queue = [for (final v in (ref['очередь'] as List)) (v as num).toDouble()];
  final shift = (ref['сдвигОчередиРаундов'] as num).toInt();
  final vocab = <Map<String, String>>[
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List<dynamic>)
      (e as Map).map((k, v) => MapEntry('$k', '$v')),
  ];
  final distractors = <String, List<String>>{
    for (final e in (jsonDecode(File('assets/vocab/semantic-distractors.json').readAsStringSync()) as Map).entries)
      '${e.key}': [for (final w in (e.value as List)) '$w'],
  };

  double Function() rngFrom(List<double> values) {
    var i = 0;
    return () => values[i++ % values.length];
  }

  test('лестница уровней', () {
    for (final raw in (ref['уровни'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = semanticLevelParams((l['level'] as num).toInt());
      expect(p.catsPerRound, l['catsPerRound'], reason: 'категорий на уровне ${l['level']}');
      expect(p.roundsCount, l['roundsCount'], reason: 'раундов на уровне ${l['level']}');
    }
    expect(semanticPassAccuracy, ref['проходТочностью']);
  });

  test('ключ запаса совпадает с вебом — запас один на обе половины', () {
    final k = ref['ключЗапаса'] as Map<String, dynamic>;
    expect(semanticSeenPool, k['pool']);
    expect(freshPoolKey(semanticSeenPool, 'nzt48'), k['пример']);
    expect(freshPoolKey(semanticSeenPool, null), k['гость']);
  });

  test('таблица «коварных» доехала целиком', () {
    expect(distractors.length, (ref['таблицаКоварных'] as Map)['ключей']);
  });

  for (final raw in (ref['свежие'] as List)) {
    final c = raw as Map<String, dynamic>;
    test('отбор невиданного: ${c['имя']}', () {
      final got = pickFreshWeb<String>(
        [for (final x in (c['items'] as List)) '$x'],
        (c['count'] as num).toInt(),
        [for (final x in (c['seen'] as List)) '$x'],
        (x) => x,
        rngFrom(queue),
      );
      final want = c['итог'] as Map<String, dynamic>;
      expect(got.picked, [for (final x in (want['picked'] as List)) '$x']);
      expect(got.seen, [for (final x in (want['seen'] as List)) '$x']);
      expect(got.wrapped, want['wrapped']);
    });
  }

  for (final raw in (ref['партии'] as List)) {
    final c = raw as Map<String, dynamic>;
    test('раунды: ${c['имя']}', () {
      final tgt = c['tgt'] as String;
      final second = c['второй'] as String;
      final bi = c['билингво'] as bool;
      final p = semanticLevelParams((c['level'] as num).toInt());
      final cw = semanticCategories(vocab, tgt);
      expect(cw.cats, [for (final x in (c['cats'] as List)) '$x'], reason: 'годные категории');
      final effCats = p.catsPerRound < cw.cats.length ? p.catsPerRound : cw.cats.length;
      expect(effCats, c['effCats']);

      final pool = semanticWordsPool(vocab, cw.cats, bi ? [tgt, second] : [tgt]);
      expect(pool.length, c['размерПула']);
      final fresh = pickFreshWeb(pool, p.roundsCount, const [], (w) => w['en'] ?? '', rngFrom(queue));
      expect([for (final w in fresh.picked) w['en']], [for (final x in (c['отобрано'] as List)) '$x']);

      final rounds = buildSemanticRounds(
        picked: fresh.picked,
        rounds: p.roundsCount,
        cats: cw.cats,
        effCats: effCats,
        wordCat: cw.wordCat,
        tgt: tgt,
        langsByRound: bi ? rowForPair(p.roundsCount, tgt, second) : const [],
        bilingual: bi,
        distractors: distractors,
        rng: rngFrom(queue.sublist(shift)),
      );
      final want = c['раунды'] as List;
      expect(rounds.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(rounds[i].word, w['word'], reason: 'слово раунда $i');
        expect(rounds[i].correctCat, w['correctCat'], reason: 'верная категория раунда $i');
        expect(rounds[i].cats, [for (final x in (w['cats'] as List)) '$x'], reason: 'кнопки раунда $i');
        expect(rounds[i].lang, w['язык'], reason: 'язык раунда $i');
      }
    });
  }

  test('🔴 порог «не меньше трёх слов» — на своём словаре, где он РАБОТАЕТ', () {
    // В живых данных порог спит: минимум 6 слов в категории на всех 12 языках.
    // Поэтому мутация «порог снят» выживала — проба стояла там, где правило не
    // срабатывает. Здесь словарь из эталона: у категории `y` два слова.
    final c = ref['порог'] as Map<String, dynamic>;
    final vocabOwn = <Map<String, String>>[
      for (final e in (c['словарь'] as List)) (e as Map).map((k, v) => MapEntry('$k', '$v')),
    ];
    final got = semanticCategories(vocabOwn, c['tgt'] as String);
    final want = c['итог'] as Map<String, dynamic>;
    expect(got.cats, [for (final x in (want['cats'] as List)) '$x']);
    expect(got.wordCat, (want['wordCat'] as Map).map((k, v) => MapEntry('$k', '$v')));
  });
}
