/// РЕШАТЕЛЬ «МАТ В N» ДЛЯ СЯНЦИ И СЁГИ — один перебор И/ИЛИ над двумя досками.
///
/// Атакующий (тот, чей ход в задаче) ставит мат не позже N своих ходов при лучшей
/// защите. Мат — шах и ни одного законного хода; пат матом не считается (в сянци пат —
/// тоже поражение, но задачи берём только с шахом, чтобы «мат» значил одно и то же).
/// В сёги — конвенция цумэ: каждый ход атакующего обязан быть шахом.
///
/// Доска — изменяемая (ход вперёд / назад): у bishop построение игры из FEN дорогое,
/// поэтому перебор ходит по одной игре через makeMove / undo.
library;

import 'package:bishop/bishop.dart' as bishop;

import 'shogi_rules.dart';

abstract class MateBoard {
  /// Законные ходы стороны, чья очередь, в записи Fairy-Stockfish.
  List<String> moves();
  void push(String move);
  void pop();

  /// Под шахом ли сторона, чья очередь.
  bool get inCheck;

  /// Ключ позиции для памяти перебора.
  Object get key;

  /// FEN текущей позиции.
  String get fen;

  /// Только шахи у атакующего (цумэ-сёги).
  bool get checksOnly;

  /// Ходы атакующего, дающие шах (для `checksOnly`).
  List<String> checks();
}

class ShogiBoard implements MateBoard {
  ShogiBoard(String fen) : _stack = [ShogiPosition.parse(fen)];
  final List<ShogiPosition> _stack;
  ShogiPosition get position => _stack.last;

  @override
  List<String> moves() => position.legalMoves();
  @override
  void push(String move) => _stack.add(position.apply(move));
  @override
  void pop() => _stack.removeLast();
  @override
  bool get inCheck => position.inCheck(position.toMove);
  @override
  Object get key => position.fen();
  @override
  String get fen => position.fen();
  @override
  bool get checksOnly => true;
  @override
  List<String> checks() => position.checkingMoves();
}

/// Вариант сянци строится один раз на процесс.
final bishop.Variant xiangqiVariant = bishop.Xiangqi.xiangqi();

class XiangqiBoard implements MateBoard {
  XiangqiBoard(String fen) : game = bishop.Game(variant: xiangqiVariant, fen: fen);
  final bishop.Game game;
  final List<Map<String, bishop.Move>> _cache = [];

  Map<String, bishop.Move> _current() {
    final hash = game.state.hash;
    if (_cache.isNotEmpty && _cacheHash.last == hash) return _cache.last;
    final map = {for (final m in game.generateLegalMoves()) game.toAlgebraic(m): m};
    _cache.add(map);
    _cacheHash.add(hash);
    return map;
  }

  final List<int> _cacheHash = [];

  @override
  List<String> moves() => _current().keys.toList();
  @override
  void push(String move) {
    final m = _current()[move];
    if (m == null) throw ArgumentError('xiangqi: illegal $move');
    game.makeMove(m, false);
  }

  @override
  void pop() {
    game.undo();
    while (_cacheHash.isNotEmpty && _cacheHash.last != game.state.hash) {
      _cacheHash.removeLast();
      _cache.removeLast();
    }
  }

  @override
  bool get inCheck => game.inCheck;
  @override
  Object get key => game.state.hash;
  @override
  String get fen => game.fen;
  @override
  bool get checksOnly => false;
  @override
  List<String> checks() => moves();
}

enum MateVerdict { yes, no, unknown }

class MateSolver {
  MateSolver(this.board, {this.nodeLimit = 300000});
  final MateBoard board;
  final int nodeLimit;
  int _nodes = 0;
  final Map<String, bool> _memo = {};

  bool _mated() => board.inCheck && board.moves().isEmpty;

  /// Ходы атакующего, которые стоит пробовать (в сёги — только шахи).
  List<String> _attacks() => board.checksOnly ? board.checks() : board.moves();

  /// Атакующий ставит мат не позже `n` своих ходов? `null` — потолок узлов.
  bool? _mate(int n) {
    if (n <= 0) return false;
    final key = 'a$n|${board.key}';
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    for (final m in _attacks()) {
      board.push(m);
      final r = _mated() ? true : (n > 1 ? _defend(n - 1) : false);
      board.pop();
      if (r == true) return _memo[key] = true;
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = false;
  }

  /// Защита (её ход): все ответы ведут к мату за `n` ходов атакующего?
  bool? _defend(int n) {
    final key = 'd$n|${board.key}';
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    final replies = board.moves();
    if (replies.isEmpty) return _memo[key] = board.inCheck;
    var unknown = false;
    for (final r in replies) {
      board.push(r);
      final v = _mate(n);
      board.pop();
      if (v == false) return _memo[key] = false;
      if (v == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = true;
  }

  MateVerdict _wrap(bool? r) => r == null
      ? MateVerdict.unknown
      : r
      ? MateVerdict.yes
      : MateVerdict.no;

  void _reset() {
    _nodes = 0;
    _memo.clear();
  }

  /// Атакующий (его ход) матует за `n`?
  MateVerdict mateIn(int n) {
    _reset();
    return _wrap(_mate(n));
  }

  /// Защита (её ход) получает мат за `n` ходов атакующего при любой защите?
  MateVerdict holds(int n) {
    _reset();
    if (_mated()) return MateVerdict.yes;
    return _wrap(_defend(n));
  }

  /// Первые ходы атакующего, доказывающие мат за `n`.
  List<String> winningMoves(int n) {
    final out = <String>[];
    for (final m in _attacks()) {
      _reset();
      board.push(m);
      final r = _mated() ? true : (n > 1 ? _defend(n - 1) : false);
      board.pop();
      if (r == true) out.add(m);
    }
    return out;
  }

  /// Ход атакующего засчитан? (шах в сёги обязателен; после хода мат за `left`
  /// оставшихся ходов всё ещё вынужден). Потолок — в пользу человека.
  bool accepts(String move, int left) {
    board.push(move);
    try {
      if (board.checksOnly && !board.inCheck) return false;
      if (_mated()) return true;
      if (left <= 0) return false;
      _reset();
      return _defend(left) != false;
    } finally {
      board.pop();
    }
  }

  /// Лучшая защита: ответ, после которого мат дальше всего (сперва — где мата за
  /// `left` нет вовсе).
  String? bestDefence(int left) {
    final replies = board.moves();
    if (replies.isEmpty) return null;
    var best = replies.first;
    var bestDepth = -1;
    for (final r in replies) {
      board.push(r);
      var depth = left + 1;
      for (var d = 1; d <= left; d++) {
        _reset();
        if (_mate(d) != false) {
          depth = d;
          break;
        }
      }
      board.pop();
      if (depth > bestDepth) {
        bestDepth = depth;
        best = r;
      }
      if (depth > left) break;
    }
    return best;
  }
}
