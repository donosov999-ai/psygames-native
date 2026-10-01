/// «ГО: ЖИЗНЬ» — БЕЗУСЛОВНАЯ ЖИЗНЬ ПО БЕНСОНУ И РЕШАТЕЛЬ «ЖИВИ ЗА N ХОДОВ».
///
/// Задача 66dee70c, часть 2 («жизнь и смерть»). Чёрная группа зажата белыми; чёрные
/// ходят и должны сделать её живой не позже N своих ходов при лучшей атаке белых.
/// «Живая» — по алгоритму Бенсона (1976): группа безусловно жива, если у неё два
/// жизненных района, — её не снять, даже если соперник ходит сколько угодно раз
/// подряд. Сэки и «живая, если ответить» сюда не входят: засчитываем только жизнь,
/// которую нельзя оспорить, — так ответ задачи однозначен.
///
/// Ходы-кандидаты обеих сторон — пустые пункты пространства группы (всё, что
/// достижимо от её камней по чёрным и пустым пунктам) и дамэ белых групп с одним-
/// двумя дамэ рядом с ним (взять камень стены — тоже способ жить).
library;

import 'rules.dart';

/// Камни цвета `colour`, безусловно живые по Бенсону.
Set<int> bensonAlive(GoPosition pos, int colour) {
  final n = pos.points.length;
  // Цепочки цвета и районы — связные области из пунктов НЕ этого цвета.
  final chainOf = List<int>.filled(n, -1);
  final chains = <Set<int>>[];
  final chainLibs = <Set<int>>[];
  for (var p = 0; p < n; p++) {
    if (pos.at(p) != colour || chainOf[p] >= 0) continue;
    final g = pos.group(p);
    for (final s in g.stones) {
      chainOf[s] = chains.length;
    }
    chains.add(g.stones);
    chainLibs.add(g.liberties);
  }
  final regionOf = List<int>.filled(n, -1);
  final regions = <Set<int>>[];
  for (var p = 0; p < n; p++) {
    if (pos.at(p) == colour || regionOf[p] >= 0) continue;
    final r = <int>{p};
    regionOf[p] = regions.length;
    final stack = [p];
    while (stack.isNotEmpty) {
      final q = stack.removeLast();
      for (final m in pos.neighbours(q)) {
        if (pos.at(m) != colour && regionOf[m] < 0) {
          regionOf[m] = regions.length;
          r.add(m);
          stack.add(m);
        }
      }
    }
    regions.add(r);
  }
  // Соседние цепочки района; жизненен ли район для цепочки: все его ПУСТЫЕ пункты —
  // дамэ этой цепочки.
  final around = <Set<int>>[
    for (final r in regions)
      {
        for (final q in r)
          for (final m in pos.neighbours(q))
            if (chainOf[m] >= 0) chainOf[m],
      },
  ];
  bool vital(int region, int chain) {
    for (final q in regions[region]) {
      if (pos.at(q) == goEmpty && !chainLibs[chain].contains(q)) return false;
    }
    return true;
  }

  final aliveChains = {for (var i = 0; i < chains.length; i++) i};
  final liveRegions = {for (var i = 0; i < regions.length; i++) i};
  var changed = true;
  while (changed) {
    changed = false;
    for (final c in aliveChains.toList()) {
      var count = 0;
      for (final r in liveRegions) {
        if (around[r].contains(c) && vital(r, c)) count++;
        if (count >= 2) break;
      }
      if (count < 2) {
        aliveChains.remove(c);
        changed = true;
      }
    }
    for (final r in liveRegions.toList()) {
      if (!around[r].every(aliveChains.contains)) {
        liveRegions.remove(r);
        changed = true;
      }
    }
  }
  return {for (final c in aliveChains) ...chains[c]};
}

/// Решатель «живи»: чёрные ходят, их группа на `target` должна стать безусловно живой
/// не позже чем за `blackMoves` своих ходов при лучшей атаке белых.
class LifeSolver {
  LifeSolver({this.nodeLimit = 200000});
  final int nodeLimit;
  int _nodes = 0;
  final Map<String, bool> _memo = {};

  String _key(GoPosition pos, int left) =>
      '${pos.points.join()}|${pos.toMove}|$left|${pos.previous?.join() ?? ''}';

  static bool alive(GoPosition pos, int target) =>
      pos.at(target) == goBlack && bensonAlive(pos, goBlack).contains(target);

  /// Кэш Бенсона по доске: в переборе одна и та же доска встречается многократно
  /// (разный порядок ходов, разный запас), а проверка проходит всю доску.
  static final Map<String, bool> _aliveCache = {};

  static bool _aliveCached(GoPosition pos, int target) {
    if (pos.at(target) != goBlack) return false;
    final key = '${pos.points.join()}|$target';
    final hit = _aliveCache[key];
    if (hit != null) return hit;
    if (_aliveCache.length > 50000) _aliveCache.clear();
    return _aliveCache[key] = bensonAlive(pos, goBlack).contains(target);
  }

  GoVerdict lives(GoPosition pos, int target, int blackMoves) {
    _nodes = 0;
    _memo.clear();
    final r = _live(pos, target, blackMoves);
    if (r == null) return GoVerdict.unknown;
    return r ? GoVerdict.yes : GoVerdict.no;
  }

  /// После хода чёрных (ход белых): вынуждена ли ещё жизнь за `blackMovesLeft`.
  GoVerdict holdsAfter(GoPosition pos, int target, int blackMovesLeft) {
    _nodes = 0;
    _memo.clear();
    final r = _attacked(pos, target, blackMovesLeft);
    if (r == null) return GoVerdict.unknown;
    return r ? GoVerdict.yes : GoVerdict.no;
  }

  List<int> winningMoves(GoPosition pos, int target, int blackMoves) {
    final out = <int>[];
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null) continue;
      _nodes = 0;
      _memo.clear();
      if (_aliveCached(next, target) ||
          _attacked(next, target, blackMoves - 1) == true) {
        out.add(m);
      }
    }
    return out;
  }

  /// Пустые пункты пространства группы и дамэ слабых белых групп рядом с ним.
  List<int> candidates(GoPosition pos, int target) {
    if (pos.at(target) != goBlack) return const [];
    final space = <int>{target};
    final stack = [target];
    while (stack.isNotEmpty) {
      final q = stack.removeLast();
      for (final m in pos.neighbours(q)) {
        if (pos.at(m) != goWhite && space.add(m)) stack.add(m);
      }
    }
    final out = <int>{for (final q in space) if (pos.at(q) == goEmpty) q};
    final seen = <int>{};
    for (final q in space) {
      for (final m in pos.neighbours(q)) {
        if (pos.at(m) != goWhite || seen.contains(m)) continue;
        final g = pos.group(m);
        seen.addAll(g.stones);
        if (g.liberties.length <= 2) out.addAll(g.liberties);
      }
    }
    final list = out.toList()..sort();
    return list;
  }

  bool? _live(GoPosition pos, int target, int left) {
    if (pos.at(target) != goBlack) return false;
    if (_aliveCached(pos, target)) return true;
    if (left <= 0) return false;
    final key = _key(pos, left);
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null) continue;
      if (_aliveCached(next, target)) return _memo[key] = true;
      final r = _attacked(next, target, left - 1);
      if (r == true) return _memo[key] = true;
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = false;
  }

  bool? _attacked(GoPosition pos, int target, int left) {
    if (pos.at(target) != goBlack) return false;
    if (_aliveCached(pos, target)) return true;
    if (left <= 0) return false;
    final key = _key(pos, left);
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    for (final m in [...candidates(pos, target), -1]) {
      final next = pos.play(m);
      if (next == null) continue;
      final r = _live(next, target, left);
      if (r == false) return _memo[key] = false;
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = true;
  }

  /// Лучшая атака белых: ход, после которого жизнь не доказывается; если таких нет —
  /// тот, что оставляет группе меньше всего пустых пунктов пространства.
  int attackerReply(GoPosition pos, int target, int blackMovesLeft) {
    int? fallback;
    for (final m in [...candidates(pos, target), -1]) {
      final next = pos.play(m);
      if (next == null) continue;
      fallback ??= m;
      _nodes = 0;
      _memo.clear();
      if (_live(next, target, blackMovesLeft) != true) return m;
    }
    var best = fallback ?? -1, bestSpace = 1 << 30;
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null || next.at(target) != goBlack) continue;
      final space = candidates(next, target).length;
      if (space < bestSpace) {
        bestSpace = space;
        best = m;
      }
    }
    return best;
  }
}
