/// НАБОР ЗАДАЧ «ДЕТСКОГО МАТА»: корпус, отбор по ступени, колода подхода.
///
/// Перенос с живого TS (`frontend/src/games/scholars-mate/core/deck.ts`) СО
/// СВЕРКОЙ: эталон снят прогоном самого TS, и проба требует совпадения колод
/// позиция в позицию на пяти ступенях.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import 'check.dart';
import 'ladder.dart';

/// Корпус: задачи по видам. Читается один раз за запуск.
class ScholarsCorpus {
  ScholarsCorpus(this._byKind, [this._named = const {}]);

  final Map<ScholarsKind, List<ScholarsPuzzle>> _byKind;

  /// Пулы именованных узоров списка отработки («арабский мат», «мат Бодена»…),
  /// в порядке файла. Позиции переведены как «мат из партий» — так и в вебе.
  final Map<String, List<ScholarsPuzzle>> _named;

  List<ScholarsPuzzle> of(ScholarsKind kind) => _byKind[kind] ?? const [];

  List<ScholarsPuzzle> named(String motif) => _named[motif] ?? const [];

  /// Узоры списка отработки: сначала самые богатые позициями.
  ///
  /// 🔴 СОРТИРОВКА УСТОЙЧИВАЯ, КАК В JS. Веб сортирует `Object.keys` по размеру
  /// пула, и при РАВНЫХ размерах JS сохраняет порядок файла, а `List.sort` в Dart
  /// этого не обещает: список отработки разошёлся бы с вебом молча. Ничьи
  /// разбираются по месту в файле явно.
  List<String> get namedMotifs {
    final keys = _named.keys.toList();
    final order = {for (var i = 0; i < keys.length; i++) keys[i]: i};
    keys.sort((a, b) {
      final bySize = named(b).length - named(a).length;
      return bySize != 0 ? bySize : order[a]! - order[b]!;
    });
    return keys;
  }

  int namedCount(String motif) => named(motif).length;

  /// Сколько позиций в миксе — сумма по всем пулам.
  int get mixedCount =>
      namedMotifs.fold(0, (sum, motif) => sum + namedCount(motif));

  int count(ScholarsKind kind) => of(kind).length;

  static ScholarsCorpus? _loaded;

  /// Прочитать корпус из ассетов. Второй вызов отдаёт уже прочитанный.
  static Future<ScholarsCorpus> load([AssetBundle? bundle]) async {
    final cached = _loaded;
    if (cached != null) return cached;
    final raw = await (bundle ?? rootBundle).loadString(
      'assets/scholars_mate/puzzles.json',
    );
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
    final named = <String, List<ScholarsPuzzle>>{};
    final pools = json['named'];
    if (pools is Map<String, dynamic>) {
      for (final MapEntry(key: motif, value: rows) in pools.entries) {
        named[motif] = [
          for (final row in (rows as List).cast<Map<String, dynamic>>())
            _translate(ScholarsKind.fromGames, row),
        ];
      }
    }
    return ScholarsCorpus(byKind, named);
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
          .where(
            (x) => x.rating >= base.minRating && x.rating <= base.maxRating,
          )
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

/// Набор на подход по одному именованному узору.
///
/// Лестницы тут нет: человек выбрал, что отрабатывать, и получает только это.
/// Секунды и число позиций — с уровня, чтобы отработка шла в темпе лестницы;
/// `count` — длинный набор для потока. Весь подход — за одну сторону.
List<ScholarsPuzzle> buildNamedDeck(
  ScholarsCorpus corpus,
  String motif,
  int level, {
  int seed = 1,
  int? count,
}) {
  final raw = corpus.named(motif);
  if (raw.isEmpty) return const [];
  final base = levelParams(level);
  final want = min(count ?? base.count, raw.length);
  final next = _rng(seed * 7919 + motif.length * 104729 + level);
  double rnd() => next() / 0x7fffffff;
  final deck = <ScholarsPuzzle>[];
  final taken = <String>{};
  String? sideOfRun;
  for (var i = 0; deck.length < want && i < want * 80; i++) {
    final x = raw[(rnd() * raw.length).floor()];
    final side = sideToMove(x);
    if (sideOfRun == null) {
      sideOfRun = side;
    } else if (side != sideOfRun) {
      continue;
    }
    if (!taken.add(_shownKey(x))) continue;
    deck.add(x);
  }
  return deck;
}

/// Микс узоров — «какой тут вообще мат?»: любой узор из списка, имя до ответа
/// скрывает экран. Одна сторона на весь подход.
List<ScholarsPuzzle> buildMixedMotifDeck(
  ScholarsCorpus corpus,
  int level, {
  int seed = 1,
  int? count,
}) {
  final names = corpus.namedMotifs
      .where((m) => corpus.namedCount(m) > 0)
      .toList();
  if (names.isEmpty) return const [];
  final base = levelParams(level);
  final want = count ?? base.count;
  final next = _rng(seed * 7919 + level * 104729 + names.length);
  double rnd() => next() / 0x7fffffff;
  final deck = <ScholarsPuzzle>[];
  final taken = <String>{};
  String? sideOfRun;
  for (var i = 0; deck.length < want && i < want * 200; i++) {
    final raw = corpus.named(names[(rnd() * names.length).floor()]);
    final x = raw[(rnd() * raw.length).floor()];
    final side = sideToMove(x);
    if (sideOfRun == null) {
      sideOfRun = side;
    } else if (side != sideOfRun) {
      continue;
    }
    if (!taken.add(_shownKey(x))) continue;
    deck.add(x);
  }
  return deck;
}

/// Сколько наборов добирает поток, прежде чем сдаться.
const int _flowSetsCeiling = 120;

/// Колода потока: наборы лестницы подряд, пока одного цвета не наберётся на
/// всё время (три секунды на позицию), — и берётся цвет, которого больше.
///
/// ⚠️ Просто отфильтровать один набор нельзя — не хватит позиций: в смешанной
/// колоде на больший цвет приходится 66–119 из ~200 нужных (замер веба).
List<ScholarsPuzzle> buildFlowDeck(
  ScholarsCorpus corpus,
  int level,
  int seed,
  int flowMs, {
  ScholarsKind? only,
}) {
  final base = levelParams(level);
  final need = max(4, (flowMs / 1000 / 3 / base.count).ceil()) * base.count;
  final byColour = <String, List<ScholarsPuzzle>>{'w': [], 'b': []};
  final seen = <String>{};
  for (var n = 0; n < _flowSetsCeiling; n++) {
    var added = 0;
    for (final p in buildDeck(
      corpus,
      level,
      seed: seed + n * 101,
      only: only,
    )) {
      if (!seen.add(_shownKey(p))) continue;
      byColour[sideToMove(p)]!.add(p);
      added++;
    }
    if (added == 0) break; // пул исчерпан
    if (max(byColour['w']!.length, byColour['b']!.length) >= need) break;
  }
  return byColour['w']!.length >= byColour['b']!.length
      ? byColour['w']!
      : byColour['b']!;
}

/// Виды заданий выбранного режима — для карточки настройки. Узор и микс
/// спрашивают мат из партий, жертва — только жертву, лестница — виды уровня.
List<ScholarsKind> kindsOfMode(
  int level, {
  ScholarsKind? only,
  String? motif,
  bool mix = false,
}) {
  if (mix || motif != null) return const [ScholarsKind.fromGames];
  if (only != null) return [only];
  final kinds = <ScholarsKind>[];
  for (final k in levelParams(level).kinds) {
    if (!kinds.contains(k)) kinds.add(k);
  }
  return kinds;
}
