/// ЛЕСТНИЦА И ДОСКИ СУДОКУ — ДАННЫМИ, А НЕ ГЕНЕРАТОРОМ.
///
/// 🔴 ПОЧЕМУ ТАК. Веб-версия собирает доску вариантного уровня на лету логическим
/// построителем — это `sudoku-grade.ts` (1894 строки) плюс половина ядра. Переносить его
/// в Dart дорого и незачем: доски можно ВЫГРУЗИТЬ тем же боевым путём и возить данными.
///   · `assets/levels/sudoku-ladder.json` — все ступени лестницы (размер, блоки, дырки,
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

import 'roads.dart';
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
    this.lives = 3,
    this.rating,
  });

  final int level;
  final int n;
  final int br;
  final int bc;
  final int blanks;
  final String variant;
  final int hintMax;

  /// Сколько ошибок до провала на этой ступени — `levelConfig.lives` веба (цена ошибки
  /// убывает к верху лестницы, задача 1fa57de3). Выгрузка без поля — прежние три.
  final int lives;

  /// Своя полоса банка ступени (`levelConfig.bankRating` веба): Wordoku и звери — классика со
  /// значками, доски которой берутся из банка с рейтингом, а не логическим путём (замер
  /// 08.10: логический путь у них насыщается на уровне классики ~37). `null` — полосу ведёт `ratingRows`.
  final double? rating;

  /// Доска берётся из банка: классика 9×9 или ступень со своей полосой банка. Банк только 9×9.
  bool get fromBank => (variant == 'none' || rating != null) && n == 9;
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
    this.geometryJson = const {},
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

  /// Геометрия варианта в форме выгрузки (поля генератора TS) — для снимка незаконченной
  /// партии в формате веба (resume.dart). У банка и малышей — пусто.
  final Map<String, Object?> geometryJson;

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
  SudokuLevels._(this._ladder, this._ratingRows, this._bank, this._variantBoards, this._transit,
      [this._roadBoards = const {}]);

  final Map<int, SudokuLevel> _ladder;
  final List<({int upTo, double rating})> _ratingRows;
  final Map<int, List<String>> _bank;                 // полоса (рейтинг×10) → задачи
  final Map<int, List<Map<String, Object?>>> _variantBoards;   // уровень → доски
  final Map<int, Map<String, Object?>> _transit;               // уровень → строка перехода

  /// Доски дорог «полегче» / «пожёстче» (`sudoku-road-boards.json`): дорога → уровень → доски.
  /// Нет файла или ступени — дорога играет доски обычной дороги (жизни и подсказки у неё
  /// всё равно свои), а банковские ступени дорога сдвигает полосой банка.
  final Map<SudokuRoad, Map<int, List<Map<String, Object?>>>> _roadBoards;

  static const _ladderAsset = 'assets/levels/sudoku-ladder.json';
  static const _bankAsset = 'assets/levels/sudoku-bank.json';
  static const _variantAsset = 'assets/levels/sudoku-variant-boards.json';
  static const transitAsset = 'assets/levels/sudoku-ladder-transit.json';
  static const _roadAsset = 'assets/levels/sudoku-road-boards.json';

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
        lives: (row['lives'] as num?)?.toInt() ?? 3,
        rating: (row['rating'] as num?)?.toDouble(),
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
    var hasVariants = false, hasTransit = false, hasRoads = false;
    try {
      final listed = (await AssetManifest.loadFromAssetBundle(rootBundle)).listAssets();
      hasVariants = listed.contains(_variantAsset);
      hasTransit = listed.contains(transitAsset);
      hasRoads = listed.contains(_roadAsset);
    } catch (_) {
      hasVariants = false;
    }
    if (hasVariants) {
      final vj = jsonDecode(await rootBundle.loadString(_variantAsset)) as Map<String, Object?>;
      for (final b in (vj['boards'] as List).cast<Map<String, Object?>>()) {
        (variants[(b['level'] as num).toInt()] ??= <Map<String, Object?>>[]).add(b);
      }
    }

    final transit = <int, Map<String, Object?>>{};
    if (hasTransit) {
      final tj = jsonDecode(await rootBundle.loadString(transitAsset)) as Map<String, Object?>;
      for (final r in (tj['steps'] as List).cast<Map<String, Object?>>()) {
        transit[(r['level'] as num).toInt()] = r;
      }
    }

    final roadBoards = <SudokuRoad, Map<int, List<Map<String, Object?>>>>{};
    if (hasRoads) {
      final rj = jsonDecode(await rootBundle.loadString(_roadAsset)) as Map<String, Object?>;
      for (final b in (rj['boards'] as List).cast<Map<String, Object?>>()) {
        final road = sudokuRoadOf(b['road'] as String?);
        if (road == null) continue;
        ((roadBoards[road] ??= {})[(b['level'] as num).toInt()] ??= <Map<String, Object?>>[]).add(b);
      }
    }

    return SudokuLevels._(ladder, rows, bank, variants, transit, roadBoards);
  }

  /// Доски дорог для проб: сколько лежит на ступени у дороги.
  int roadBoardsFor(int level, SudokuRoad road) => _roadBoards[road]?[level]?.length ?? 0;

  /// Ширина полосы банка — 0,1; ключом берём целое, чтобы не сравнивать дробные.
  static int _bandKey(double rating) => (rating * 10).round();

  /// Полоса банка на `shift` полных полос от `rating` (полная — ≥ 20 досок); край — край.
  double _neighbourBand(double rating, int shift) {
    final full = [for (final e in _bank.entries) if (e.value.length >= 20) e.key]..sort();
    final at = full.indexOf(_bandKey(rating));
    if (at < 0 || shift == 0) return rating;
    return full[(at + shift).clamp(0, full.length - 1)] / 10;
  }

  int get lastLevel => _ladder.keys.reduce(max);

  /// 🔴 СТУПЕНИ В ДРУГОЙ ИГРЕ И БОССЫ ПОСЛЕ СТУПЕНИ — СТРОКОЙ ДАННЫХ, КАК ОНА ЛЕЖИТ В ФАЙЛЕ
  /// (`assets/levels/sudoku-ladder-transit.json`, план уровней v4, задача 4e3d3443).
  ///
  /// Строку разбирает `LadderTransit.levelOf` / `bossOf` (`lib/shell/level_transition.dart`):
  /// форма одна на все лестницы, и второй разборщик здесь разошёлся бы с ней молча.
  /// `null` — ступень своя, без босса.
  ///
  /// ⚠️ [lastLevel] этим НЕ растёт: первая ступень в другой игре — 145-я («Кошки»), а доски
  /// 121–144 ещё не выгружены. Подними потолок раньше досок — победа на 120-й вела бы на
  /// пустую ступень («досок нет»), а не на следующую игру.
  Map<String, Object?>? transitRow(int level) => _transit[level];

  /// Потолок до загрузки ступеней — только чтобы экран было чем рисовать первый кадр;
  /// настоящий берётся из данных ([lastLevel]) сразу после загрузки.
  static const fallbackLast = 999;

  SudokuLevel config(int level) =>
      _ladder[level.clamp(1, lastLevel)] ?? _ladder[1]!;

  /// Полоса банка для уровня. `shift` — дорога: −1 «полегче», +1 «пожёстче».
  ///
  /// Ступень со своей полосой (`rating`) сдвигается на соседнюю ПОЛНУЮ полосу банка (≥ 20 досок):
  /// строки `ratingRows` — это лестница классики по уровням, и шаг по ним увёл бы Wordoku на полосу
  /// классики 80-го, а не на соседнюю по трудности.
  double bankRating(int level, {int shift = 0}) {
    final own = config(level).rating;
    if (own != null) return _neighbourBand(own, shift);
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
  /// [road] — дорога: на банке сдвиг полосы, на вариантной ступени — доски своей дороги.
  SudokuBoard? boardFor(int level, {int seed = 0, int shift = 0, SudokuRoad road = defaultSudokuRoad}) {
    final cfg = config(level);
    if (road != defaultSudokuRoad && shift == 0) shift = sudokuRoadShift(road);
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

    final own = road == defaultSudokuRoad ? null : _roadBoards[road]?[level];
    final pool = (own != null && own.isNotEmpty) ? own : _variantBoards[level];
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
      geometryJson: (row['geometry'] as Map).cast<String, Object?>(),
      tier: (row['tier'] as num?)?.toInt(),
    );
  }

  /// Строка доски: по цифре на клетку, а если клетки бывают многозначными (коды клеток
  /// Шрёдингера: 1..10 и 100+) — через запятую (`export-sudoku-boards.cjs`, `toStr`).
  static List<List<int>> _parse(String s, int n) {
    if (s.contains(',')) {
      final cells = s.split(',').map(int.parse).toList();
      return [for (var r = 0; r < n; r++) cells.sublist(r * n, r * n + n)];
    }
    return [
      for (var r = 0; r < n; r++)
        [for (var c = 0; c < n; c++) int.parse(s[r * n + c])],
    ];
  }
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
