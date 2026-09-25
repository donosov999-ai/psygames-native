/// НАБОР ЗАДАЧ «ДЕТСКОГО МАТА»: корпус, отбор по ступени, колода подхода.
///
/// Перенос с живого TS (`frontend/src/games/scholars-mate/core/deck.ts`) СО
/// СВЕРКОЙ: эталон снят прогоном самого TS, и проба требует совпадения колод
/// позиция в позицию на пяти ступенях.
library;

import 'dart:convert';

import 'package:flutter/services.dart';

import 'check.dart';
import 'ladder.dart';

/// Корпус: задачи по видам. Читается один раз за запуск.
class ScholarsCorpus {
  ScholarsCorpus(this._byKind);

  final Map<ScholarsKind, List<ScholarsPuzzle>> _byKind;

  List<ScholarsPuzzle> of(ScholarsKind kind) => _byKind[kind] ?? const [];

  int count(ScholarsKind kind) => of(kind).length;

  static ScholarsCorpus? _loaded;

  /// Прочитать корпус из ассетов. Второй вызов отдаёт уже прочитанный.
  static Future<ScholarsCorpus> load([AssetBundle? bundle]) async {
    final cached = _loaded;
    if (cached != null) return cached;
    final raw = await (bundle ?? rootBundle)
        .loadString('assets/scholars_mate/puzzles.json');
    final made = fromJson(jsonDecode(raw) as Map<String, dynamic>);
    _loaded = made;
    return made;
  }

  /// Разбор уже прочитанного JSON — так пробы обходятся без ассетов.
  static ScholarsCorpus fromJson(Map<String, dynamic> json) {
    final byKind = <ScholarsKind, List<ScholarsPuzzle>>{};
    for (final kind in ScholarsKind.values) {
      final rows = json[kind.name];
      if (rows is! List) continue;
      byKind[kind] = [
        for (final row in rows.cast<Map<String, dynamic>>())
          _translate(kind, row),
      ];
    }
    return ScholarsCorpus(byKind);
  }
}

/// Сырая запись корпуса короткими ключами: место дороже читаемости — файл
/// уезжает в приложение целиком.
ScholarsPuzzle _translate(ScholarsKind kind, Map<String, dynamic> x) {
  return ScholarsPuzzle(
    kind: kind,
    fen: x['f'] as String,
    pre: x['p'] as String?,
    solutions: (x['s'] as List? ?? const []).cast<String>(),
    san: (x['n'] as List? ?? const []).cast<String>(),
    line: (x['a'] as List? ?? const []).cast<String>(),
    mateIn: (x['d'] as num? ?? 1).toInt(),
    rating: (x['r'] as num? ?? 0).toInt(),
    motif: x['m'] as String?,
    threat: x['t'] as bool?,
  );
}

/// Повторимый генератор веба.
///
/// 🔴 СЧИТАЕТСЯ ЧЕРЕЗ `double`, И ЭТО НЕ НЕБРЕЖНОСТЬ. В JS произведение
/// `x * 1103515245` выходит за 2⁵³, и double теряет младшие биты ДО того, как
/// сработает `& 0x7fffffff`. Точная 64-битная арифметика Dart дала бы другие
/// числа — и другую колоду на той же ступени с тем же семенем. Совпадение с
/// вебом проверяется эталоном колод.
int Function() _rng(int seed) {
  var x = seed == 0 ? 1 : seed.toSigned(32);
  return () {
    x = (x.toDouble() * 1103515245 + 12345).toInt() & 0x7fffffff;
    return x;
  };
}

String _shownKey(ScholarsPuzzle p) => '${p.fen}|${p.pre ?? ''}';

/// Набор на подход.
///
/// 🔴 ПОЗИЦИИ НЕ ПОВТОРЯЮТСЯ ВНУТРИ ПОДХОДА: в упражнении на скорость повтор —
/// не «ещё одна попытка», а подсказка, и замер времени портится.
///
/// 🔴 ВЕСЬ ПОДХОД — ЗА ОДНУ СТОРОНУ. Замечание Дениса 05.09.2026: «когда за
/// чёрных, доска не переворачивается — получается ходишь на мат за
/// противника». Переворот каждой позиции сбивал узнавание, а закреплённая
/// ориентация показывала чёрные позиции белыми глазами. Сторона выбирается
/// один раз на подход, и все позиции берутся её.
List<ScholarsPuzzle> buildDeck(
  ScholarsCorpus corpus,
  int level, {
  int seed = 1,
  ScholarsKind? only,
}) {
  final base = levelParams(level);
  final kinds = only == null ? base.kinds : [only];
  final next = _rng(seed * 7919 + base.level * 104729);
  double rnd() => next() / 0x7fffffff;

  final deck = <ScholarsPuzzle>[];
  final taken = <String>{};
  String? sideOfRun;

  for (var i = 0; deck.length < base.count && i < base.count * 60; i++) {
    final kind = kinds[(rnd() * kinds.length).floor()];
    var pool = corpus.of(kind);
    if (base.motifs.isNotEmpty) {
      // Узор пускается на ступень, только когда до него дошла лестница.
      final byMotif = pool
          .where((x) => x.motif == null || base.motifs.contains(x.motif))
          .toList();
      if (byMotif.length >= base.count) pool = byMotif;
    }
    if (base.maxRating > 0 && kind != ScholarsKind.mate) {
      // 🔴 ПОЛОСА, А НЕ ПОТОЛОК: односторонний фильтр лестницы не строит.
      final inBand = pool
          .where((x) => x.rating >= base.minRating && x.rating <= base.maxRating)
          .toList();
      pool = inBand.length >= base.count
          ? inBand
          : pool.where((x) => x.rating >= base.minRating * 0.75).toList();
      if (pool.length < base.count) pool = corpus.of(kind);
    }
    if (pool.isEmpty) continue;
    final x = pool[(rnd() * pool.length).floor()];
    final side = sideToMove(x);
    if (sideOfRun == null) {
      sideOfRun = side;
    } else if (side != sideOfRun) {
      continue;
    }
    final key = _shownKey(x);
    if (taken.contains(key)) continue;
    taken.add(key);
    deck.add(x);
  }
  return deck;
}
