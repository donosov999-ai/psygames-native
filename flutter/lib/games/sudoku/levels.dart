/// ЛЕСТНИЦА И ДОСКИ СУДОКУ — ДАННЫМИ, А НЕ ГЕНЕРАТОРОМ.
///
/// 🔴 ПОЧЕМУ ТАК. Веб-версия собирает доску вариантного уровня на лету логическим
/// построителем — это `sudoku-grade.ts` (1894 строки) плюс половина ядра. Переносить его
/// в Dart дорого и незачем: доски можно ВЫГРУЗИТЬ тем же боевым путём и возить данными.
///   · `assets/levels/sudoku-ladder.json` — 92 ступени лестницы (размер, блоки, дырки,
///     вариант, потолок подсказок) и 35 полос рейтинга банка;
///   · `assets/levels/sudoku-bank.json` — банк классики (1835 досок, 58 полос), тот же
///     файл, что возит веб-версия;
///   · `assets/levels/sudoku-variant-boards.json` — доски вариантных уровней с их
///     геометрией и измеренной ступенью техник, выгруженные прогоном живого TS.
///
/// Решение у банковских досок НЕ хранится (в банке только задача и рейтинг) — его
/// добирает решатель на перенесённых правилах. У вариантных решение идёт в данных:
/// там оно участвовало в проверке единственности, и пересчитывать его нельзя.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show AssetManifest, rootBundle;

import 'rules.dart';

/// Ступень лестницы: что за доска выдаётся на этом уровне.
class SudokuLevel {
  const SudokuLevel({
    required this.level,
    required this.n,
    required this.br,
    required this.bc,
    required this.blanks,
    required this.variant,
    required this.hintMax,
  });

  final int level;
  final int n;
  final int br;
  final int bc;
  final int blanks;
  final String variant;
  final int hintMax;

  /// Доска берётся из банка, когда это классика 9×9: банк только такой.
  bool get fromBank => variant == 'none' && n == 9;
}

/// Готовая доска: задача, решение, геометрия варианта и измеренная ступень техник.
class SudokuBoard {
  const SudokuBoard({
    required this.level,
    required this.n,
    required this.br,
    required this.bc,
    required this.variant,
    required this.puzzle,
    required this.solution,
    required this.geometry,
    this.tier,
    this.rating,
  });

  final int level;
  final int n;
  final int br;
  final int bc;
  final String variant;
  final List<List<int>> puzzle;
  final List<List<int>> solution;
  final BoardGeometry geometry;

  /// Ступень техник, посчитанная градатором при выгрузке; `null` — мера промолчала.
  final int? tier;

  /// Рейтинг полосы банка (только у банковских досок).
  final double? rating;

  int get blanks {
    var k = 0;
    for (final row in puzzle) {
      for (final v in row) {
        if (v == 0) k++;
      }
    }
    return k;
  }
}

/// Лестница судоку и доски к ней.
class SudokuLevels {
  SudokuLevels._(this._ladder, this._ratingRows, this._bank, this._variantBoards);

  final Map<int, SudokuLevel> _ladder;
  final List<({int upTo, double rating})> _ratingRows;
  final Map<int, List<String>> _bank;                 // полоса (рейтинг×10) → задачи
  final Map<int, List<Map<String, Object?>>> _variantBoards;   // уровень → доски

  static const _ladderAsset = 'assets/levels/sudoku-ladder.json';
  static const _bankAsset = 'assets/levels/sudoku-bank.json';
  static const _variantAsset = 'assets/levels/sudoku-variant-boards.json';

  static Future<SudokuLevels> load() async {
    final ladderJson = jsonDecode(await rootBundle.loadString(_ladderAsset)) as Map<String, Object?>;
    final ladder = <int, SudokuLevel>{};
    for (final row in (ladderJson['ladder'] as List).cast<Map<String, Object?>>()) {
      final lv = (row['level'] as num).toInt();
      ladder[lv] = SudokuLevel(
        level: lv,
        n: (row['n'] as num).toInt(),
        br: (row['br'] as num).toInt(),
        bc: (row['bc'] as num).toInt(),
        blanks: (row['blanks'] as num).toInt(),
        variant: row['variant'] as String,
        hintMax: (row['hintMax'] as num).toInt(),
      );
    }
    final rows = [
      for (final r in (ladderJson['ratingRows'] as List).cast<Map<String, Object?>>())
        (upTo: (r['upTo'] as num).toInt(), rating: (r['rating'] as num).toDouble()),
    ];

    final bankJson = jsonDecode(await rootBundle.loadString(_bankAsset)) as Map<String, Object?>;
    final bank = <int, List<String>>{};
    for (final row in (bankJson['rows'] as List).cast<Map<String, Object?>>()) {
      final key = _bandKey((row['r'] as num).toDouble());
      (bank[key] ??= <String>[]).add(row['p'] as String);
    }

    // ⚠️ СНАЧАЛА СПРАШИВАЕМ ОПИСЬ АССЕТОВ, ПОТОМ ЧИТАЕМ. Отсутствующий ассет Flutter не
    // «возвращает пусто», а КИДАЕТ, и кидает `FlutterError` — это `Error`, мимо `on
    // Exception`. Первая редакция ловила `Exception`, и проба экрана падала на пустой
    // загрузке; вторая ловила всё, но framework всё равно показывал ошибку как сбой
    // пробы. Поэтому файла, которого нет, мы просто не трогаем: банковские уровни
    // играются и без вариантных досок.
    final variants = <int, List<Map<String, Object?>>>{};
    var hasVariants = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      hasVariants = manifest.listAssets().contains(_variantAsset);
    } catch (_) {
      hasVariants = false;
    }
    if (hasVariants) {
      final vj = jsonDecode(await rootBundle.loadString(_variantAsset)) as Map<String, Object?>;
      for (final b in (vj['boards'] as List).cast<Map<String, Object?>>()) {
        (variants[(b['level'] as num).toInt()] ??= <Map<String, Object?>>[]).add(b);
      }
    }

    return SudokuLevels._(ladder, rows, bank, variants);
  }

  /// Ширина полосы банка — 0,1; ключом берём целое, чтобы не сравнивать дробные.
  static int _bandKey(double rating) => (rating * 10).round();

  int get lastLevel => _ladder.keys.reduce(max);

  SudokuLevel config(int level) =>
      _ladder[level.clamp(1, lastLevel)] ?? _ladder[1]!;

  /// Полоса банка для уровня. `shift` — дорога: −1 «полегче», +1 «пожёстче».
  double bankRating(int level, {int shift = 0}) {
    var i = 0;
    while (i < _ratingRows.length - 1 && level > _ratingRows[i].upTo) {
      i++;
    }
    final j = (i + shift).clamp(0, _ratingRows.length - 1);
    return _ratingRows[j].rating;
  }

  /// Сколько досок лежит на уровне: у банковских — размер полосы, у вариантных — выгрузка.
  int boardsFor(int level) {
    final cfg = config(level);
    if (cfg.fromBank) return _bank[_bandKey(bankRating(level))]?.length ?? 0;
    return _variantBoards[level]?.length ?? 0;
  }

  /// Доска уровня ПО НОМЕРУ в данных — для проб: они обязаны проверить КАЖДУЮ доску,
  /// а не ту, что выпала по зерну. Мутация 23.09 это и показала: испорченную доску
  /// проба по одному зерну на уровень не заметила.
  SudokuBoard? boardAt(int level, int index) {
    final cfg = config(level);
    if (cfg.fromBank) {
      final rating = bankRating(level);
      final pool = _bank[_bandKey(rating)];
      if (pool == null || index < 0 || index >= pool.length) return null;
      final puzzle = _parse(pool[index], cfg.n);
      final solution = solveGrid(puzzle, cfg.n, cfg.br, cfg.bc);
      if (solution == null) return null;
      return SudokuBoard(
        level: level, n: cfg.n, br: cfg.br, bc: cfg.bc, variant: cfg.variant,
        puzzle: puzzle, solution: solution, geometry: const BoardGeometry(), rating: rating,
      );
    }
    final pool = _variantBoards[level];
    if (pool == null || index < 0 || index >= pool.length) return null;
    return _fromRow(level, pool[index]);
  }

  /// Доска уровня. `seed` задаёт выбор из полосы: одно и то же зерно — одна и та же доска.
  SudokuBoard? boardFor(int level, {int seed = 0, int shift = 0}) {
    final cfg = config(level);
    final rnd = Random(seed == 0 ? DateTime.now().microsecondsSinceEpoch : seed);

    if (cfg.fromBank) {
      final rating = bankRating(level, shift: shift);
      final pool = _bank[_bandKey(rating)];
      if (pool == null || pool.isEmpty) return null;
      final puzzle = _parse(pool[rnd.nextInt(pool.length)], cfg.n);
      final solution = solveGrid(puzzle, cfg.n, cfg.br, cfg.bc);
      if (solution == null) return null;
      return SudokuBoard(
        level: level, n: cfg.n, br: cfg.br, bc: cfg.bc, variant: cfg.variant,
        puzzle: puzzle, solution: solution, geometry: const BoardGeometry(), rating: rating,
      );
    }

    final pool = _variantBoards[level];
    if (pool == null || pool.isEmpty) return null;
    return _fromRow(level, pool[rnd.nextInt(pool.length)]);
  }

  SudokuBoard _fromRow(int level, Map<String, Object?> row) {
    final n = (row['n'] as num).toInt();
    return SudokuBoard(
      level: level,
      n: n,
      br: (row['br'] as num).toInt(),
      bc: (row['bc'] as num).toInt(),
      variant: row['variant'] as String,
      puzzle: _parse(row['puzzle'] as String, n),
      solution: _parse(row['solution'] as String, n),
      geometry: BoardGeometry.fromJson((row['geometry'] as Map).cast<String, Object?>()),
      tier: (row['tier'] as num?)?.toInt(),
    );
  }

  static List<List<int>> _parse(String s, int n) => [
        for (var r = 0; r < n; r++)
          [for (var c = 0; c < n; c++) int.parse(s[r * n + c])],
      ];
}

/// Решатель для банковских досок: у банка лежит только задача, решение добирается.
///
/// Это НЕ генератор — он ничего не придумывает, а доводит готовую задачу до ответа
/// по тем же правилам (`isValid`). Порядок клеток — от самой ограниченной (MRV),
/// поэтому откатов почти не бывает.
List<List<int>>? solveGrid(
  List<List<int>> puzzle,
  int n,
  int br,
  int bc, {
  String variant = 'none',
  BoardGeometry? geometry,
}) {
  final grid = [for (final row in puzzle) [...row]];
  return _fill(grid, n, br, bc, variant, geometry) ? grid : null;
}

bool _fill(List<List<int>> grid, int n, int br, int bc, String variant, BoardGeometry? geometry) {
  var bestR = -1, bestC = -1, bestCount = n + 1;
  List<int>? bestCands;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (grid[r][c] != 0) continue;
      final cands = <int>[];
      for (var v = 1; v <= n; v++) {
        if (isValid(grid, r, c, v, n, br, bc, variant: variant, geometry: geometry)) cands.add(v);
      }
      if (cands.length < bestCount) {
        bestCount = cands.length;
        bestR = r;
        bestC = c;
        bestCands = cands;
        if (bestCount == 0) return false;
      }
    }
  }
  if (bestR < 0) return true;   // пустых нет — решено
  for (final v in bestCands!) {
    grid[bestR][bestC] = v;
    if (_fill(grid, n, br, bc, variant, geometry)) return true;
    grid[bestR][bestC] = 0;
  }
  return false;
}
