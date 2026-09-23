/// ДЕРЕВО «БЕЗДНЫ» — перенос материализации из `services/fractal-deep.ts`.
///
/// 🔴 ПОЧЕМУ ЗДЕСЬ ПЕРЕНОС, А НЕ ДАННЫЕ, КАК У ОСТАЛЬНЫХ ИГР РАЗДЕЛА. У «Бездны» под
/// каждой пустой клеткой прячется целая судоку, и так до трёх слоёв: полная партия —
/// тысячи вложенных пазлов, марафон на недели. Выгрузить это нельзя. Узлы рождаются
/// ЛЕНИВО и ДЕТЕРМИНИРОВАННО от (зерно, путь) — экран держит только цепочку от корня до
/// текущего узла и наигранное по тронутым узлам.
///
/// 🔴 ЦЕНА РАСХОЖДЕНИЯ. Если жребий разойдётся с веб-версией хоть на один шаг, человек,
/// продолжающий старую партию, получит другое дерево: его рука встанет на клетки,
/// которых в новых досках нет пустыми. Поэтому всё здесь сверено с живым JS по ответам
/// узел в узел (`test/deep_tree_test.dart`), а жребий — по числам (`deep_rng_test.dart`).
///
/// ⚠️ ПРИПРАВА ЛИСТЬЕВ (термометры и клетки-суммы) НЕ ПЕРЕНЕСЕНА. В веб-версии это
/// переключатель, выключенный по умолчанию (`useState(false)`), поэтому обычная партия
/// от неё не зависит. Экран не показывает переключателя, которого не умеет: включать
/// его нечестно, пока `spiceLeaf` не перенесён.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/services.dart' show AssetManifest, rootBundle;

import '../sudoku/levels.dart' show solveGrid;
import 'rng.dart';

const deepN = 9;
const deepBr = 3;
const deepBc = 3;

/// Клетка, цифра которой уходит наверх: центр узла.
const deepFeedCell = [4, 4];

/// Полосы лестницы «Бездны» — та же шестёрка, что в вебе.
const deepBands = <double>[1.2, 1.7, 2.6, 3.2, 4.5, 5.7];

/// Настройка партии.
class DeepCfg {
  const DeepCfg({
    required this.depth,
    required this.rating,
    required this.feedCount,
    required this.unlockShare,
  });

  /// Слоёв всего, включая корень: 2 или 3.
  final int depth;

  /// Полоса рейтинга банка для всех узлов партии.
  final double rating;

  /// Сколько клеток узла кормится снизу; `null` — каждая пустая («all» в вебе).
  final int? feedCount;

  /// Доля дырок, которую надо закрыть, чтобы узел отдал цифру наверх.
  final double unlockShare;
}

/// Узел без решения — дёшево, для счёта дерева и карточек.
class DeepPick {
  const DeepPick({
    required this.path,
    required this.puzzle,
    required this.blanks,
    required this.unlockCells,
    required this.feedCells,
    required this.rating,
  });

  final String path;
  final List<List<int>> puzzle;
  final int blanks;
  final int unlockCells;

  /// Кормимые клетки: руками не заполняются, под каждой — узел слоем ниже.
  final List<List<int>> feedCells;
  final double rating;
}

/// Полный узел: то же плюс решение.
class DeepNode extends DeepPick {
  const DeepNode({
    required super.path,
    required super.puzzle,
    required super.blanks,
    required super.unlockCells,
    required super.feedCells,
    required super.rating,
    required this.solution,
  });

  final List<List<int>> solution;
}

// ─────────────────────────── путь ───────────────────────────

String childPath(String parent, int r, int c) => parent.isEmpty ? '$r,$c' : '$parent/$r,$c';

({String parent, List<int> cell})? parentOf(String path) {
  if (path.isEmpty) return null;
  final i = path.lastIndexOf('/');
  final leaf = i < 0 ? path : path.substring(i + 1);
  final rc = leaf.split(',').map(int.parse).toList();
  return (parent: i < 0 ? '' : path.substring(0, i), cell: rc);
}

int depthOf(String path) => path.isEmpty ? 0 : path.split('/').length;

// ─────────────────────── банк досок ───────────────────────

/// Полосы банка: те же строки и в том же порядке, что у веб-версии. Порядок важен —
/// доска выбирается номером в полосе.
class DeepBank {
  DeepBank._(this._pools);

  final Map<int, List<String>> _pools;

  static const _asset = 'assets/levels/sudoku-bank.json';

  static Future<DeepBank> load() async {
    var has = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      has = manifest.listAssets().contains(_asset);
    } catch (_) {
      has = false;
    }
    final pools = <int, List<String>>{};
    if (has) {
      final json = jsonDecode(await rootBundle.loadString(_asset)) as Map<String, Object?>;
      for (final row in (json['rows'] as List).cast<Map<String, Object?>>()) {
        final key = bandKey((row['r'] as num).toDouble());
        (pools[key] ??= <String>[]).add(row['p'] as String);
      }
    }
    return DeepBank._(pools);
  }

  static int bandKey(double rating) => (rating * 10).round();

  List<String> pool(double rating) => _pools[bandKey(rating)] ?? const [];
}

// ─────────────────────── материализация ───────────────────────

/// Автоморфизм доски: перестановка строк внутри полосы, самих полос, столбцов, стопок
/// и транспонирование. Валидность, единственность и рейтинг сохраняются по построению,
/// а УЗОР меняется — иначе 40 досок полосы дают один и тот же рисунок на сотнях узлов.
List<List<int>> shuffleBoard(List<List<int>> board, String seed, String path) {
  final rnd = Rng('fractal-deep-shape|${normalizeSeed(seed)}|$path');

  List<int> order() {
    final bands = [0, 1, 2];
    for (var i = 2; i > 0; i--) {
      final j = rnd.nextInt(i + 1);
      final t = bands[i];
      bands[i] = bands[j];
      bands[j] = t;
    }
    final out = <int>[];
    for (final b in bands) {
      final inner = [0, 1, 2];
      for (var i = 2; i > 0; i--) {
        final j = rnd.nextInt(i + 1);
        final t = inner[i];
        inner[i] = inner[j];
        inner[j] = t;
      }
      for (final k in inner) {
        out.add(b * 3 + k);
      }
    }
    return out;
  }

  final rows = order(), cols = order();
  final transpose = rnd.next() < 0.5;
  return [
    for (var r = 0; r < deepN; r++)
      [
        for (var c = 0; c < deepN; c++)
          transpose ? board[cols[c]][rows[r]] : board[rows[r]][cols[c]],
      ],
  ];
}

List<List<int>> _parse(String s) => [
      for (var r = 0; r < deepN; r++)
        [for (var c = 0; c < deepN; c++) s.codeUnitAt(r * deepN + c) - 48],
    ];

({List<List<int>> puzzle, double rating}) pickBoard(
  DeepBank bank,
  String seed,
  String path,
  double rating,
) {
  final pool = bank.pool(rating);
  if (pool.isEmpty) throw StateError('Бездна: полоса $rating пуста');
  final rng = Rng('fractal-deep|${normalizeSeed(seed)}|$path|R${(rating * 10).round()}');
  final i = math.min(pool.length - 1, rng.nextInt(pool.length));
  return (puzzle: shuffleBoard(_parse(pool[i]), seed, path), rating: rating);
}

/// Кормимые клетки узла: детерминированная выборка из его дырок. Тасовка зерном — чтобы
/// пунктирные клетки были разбросаны по доске, а не сбивались в первый ряд.
List<List<int>> pickFeedCells(String seed, String path, List<List<int>> puzzle, int? want) {
  final empties = <List<int>>[];
  for (var r = 0; r < deepN; r++) {
    for (var c = 0; c < deepN; c++) {
      if (puzzle[r][c] == 0) empties.add([r, c]);
    }
  }
  if (want == null) return empties;   // 'all' — каждая пустая
  final rng = Rng('fractal-deep-feed|${normalizeSeed(seed)}|$path');
  for (var i = empties.length - 1; i > 0; i--) {
    final j = rng.nextInt(i + 1);
    final t = empties[i];
    empties[i] = empties[j];
    empties[j] = t;
  }
  return empties.take(math.max(0, math.min(want, empties.length))).toList();
}

int _blanksOf(List<List<int>> g) {
  var n = 0;
  for (final row in g) {
    for (final v in row) {
      if (v == 0) n++;
    }
  }
  return n;
}

int _unlockOf(int blanks, double share) =>
    math.max(1, math.min(blanks, (blanks * share).ceil()));

/// Узел без решения — им считают дерево и рисуют карточки.
DeepPick materializePick(DeepBank bank, String seed, String path, DeepCfg cfg) {
  final picked = pickBoard(bank, seed, path, cfg.rating);
  final blanks = _blanksOf(picked.puzzle);
  // Листья детей не заводят: глубина кончилась — это обычная судоку с подсказками.
  final isLeaf = depthOf(path) >= cfg.depth - 1;
  final feed = isLeaf ? <List<int>>[] : pickFeedCells(seed, path, picked.puzzle, cfg.feedCount);
  return DeepPick(
    path: path,
    puzzle: picked.puzzle,
    blanks: blanks,
    unlockCells: _unlockOf(blanks, cfg.unlockShare),
    feedCells: feed,
    rating: picked.rating,
  );
}

/// Полный узел. `feedDigit` — цифра, которую этот узел обязан отдать наверх: решение
/// перекрашивается так, чтобы в центре стояла именно она.
///
/// ⚠️ Перекраска — ПЕРЕСТАНОВКА двух цифр по всей доске, а не правка одной клетки:
/// доска обязана остаться законной судоку.
DeepNode materializeNode(DeepBank bank, String seed, String path, DeepCfg cfg, int feedDigit) {
  final pick = materializePick(bank, seed, path, cfg);
  final puzzle = [for (final row in pick.puzzle) [...row]];
  final solution = solveGrid(puzzle, deepN, deepBr, deepBc);
  if (solution == null) throw StateError('Бездна: доска банка не решилась — банк повреждён');

  if (feedDigit > 0) {
    final centre = solution[deepFeedCell[0]][deepFeedCell[1]];
    if (centre != feedDigit) {
      void swap(List<List<int>> g) {
        for (var r = 0; r < deepN; r++) {
          for (var c = 0; c < deepN; c++) {
            if (g[r][c] == centre) {
              g[r][c] = feedDigit;
            } else if (g[r][c] == feedDigit) {
              g[r][c] = centre;
            }
          }
        }
      }

      swap(solution);
      swap(puzzle);
    }
  }

  final blanks = _blanksOf(puzzle);
  return DeepNode(
    path: path,
    puzzle: puzzle,
    blanks: blanks,
    unlockCells: _unlockOf(blanks, cfg.unlockShare),
    feedCells: pick.feedCells,
    rating: pick.rating,
    solution: solution,
  );
}

/// Цепочка от корня до узла включительно: каждому по дороге считается его кормящая
/// цифра из решения родителя. Это и есть «войти на глубину N» — экран держит цепочку,
/// а не всё дерево.
List<DeepNode> materializeChain(DeepBank bank, String seed, String path, DeepCfg cfg) {
  final parts = path.isEmpty ? <String>[] : path.split('/');
  final chain = <DeepNode>[materializeNode(bank, seed, '', cfg, 0)];
  var cur = '';
  for (final part in parts) {
    final rc = part.split(',').map(int.parse).toList();
    final parent = chain.last;
    final digit = parent.solution[rc[0]][rc[1]];
    cur = childPath(cur, rc[0], rc[1]);
    chain.add(materializeNode(bank, seed, cur, cfg, digit));
  }
  return chain;
}

// ─────────────────────── прогресс и видимые цифры ───────────────────────

/// Доступ к узлам — кэширует вызывающий (экран держит карту).
typedef NodeAt = DeepNode Function(String path);

/// Наигранное по тронутым узлам: путь → сетка.
typedef DeepPlayed = Map<String, List<List<int>>>;

/// Сколько СВОИХ клеток узла закрыто верно: подсказки и кормимые не в счёт.
int deepOwnSolved(DeepNode node, List<List<int>>? grid) {
  if (grid == null) return 0;
  final feed = {for (final f in node.feedCells) '${f[0]},${f[1]}'};
  var n = 0;
  for (var r = 0; r < deepN; r++) {
    for (var c = 0; c < deepN; c++) {
      if (node.puzzle[r][c] != 0 || feed.contains('$r,$c')) continue;
      if (grid[r][c] == node.solution[r][c]) n++;
    }
  }
  return n;
}

/// Закрытых клеток узла всего: свои руки плюс всплывшие от детей.
int deepNodeProgress(NodeAt nodeAt, DeepPlayed played, String p) {
  final node = nodeAt(p);
  var n = deepOwnSolved(node, played[p]);
  for (final f in node.feedCells) {
    if (deepNodeDone(nodeAt, played, childPath(p, f[0], f[1]))) n++;
  }
  return n;
}

/// 🔴 НЕТРОНУТОЕ ПОДДЕРЕВО НЕ МАТЕРИАЛИЗУЕМ — ОНО ЗАВЕДОМО НЕ ДОРЕШАНО.
///
/// Замер веб-версии 11.09.2026: открытие пресета «бездна» вызывало 2548 материализаций —
/// ВСЮ партию целиком, потому что отрисовка корня спрашивала каждую кормимую клетку, та
/// спрашивала своего ребёнка, и так до дна. Человек с телефона получал замирание на
/// открытии. Отсечка точная, а не приближённая: порог всегда ≥ 1, а прогресс складывается
/// только из своих верных клеток и дорешанных детей — значит он НЕ МОЖЕТ быть больше нуля,
/// если во всём поддереве не тронуто ни одной клетки.
bool _touchedSubtree(DeepPlayed played, String p) {
  if (played.containsKey(p)) return true;
  final prefix = p.isEmpty ? '' : '$p/';
  for (final key in played.keys) {
    if (key == p) return true;
    if (prefix.isEmpty || key.startsWith(prefix)) return true;
  }
  return false;
}

/// Узел отдал цифру наверх: закрыто не меньше порога.
bool deepNodeDone(NodeAt nodeAt, DeepPlayed played, String p) {
  // ⚠️ Отсечка ДО `nodeAt`: сам вопрос «дорешан ли» не должен рождать узел.
  if (!_touchedSubtree(played, p)) return false;
  return deepNodeProgress(nodeAt, played, p) >= nodeAt(p).unlockCells;
}

/// Видимое значение клетки: подсказка → рука → всплывшая снизу цифра.
///
/// 🔴 ЦИФРЫ СНИЗУ НЕ ХРАНЯТСЯ, А ВЫЧИСЛЯЮТСЯ. Значение кормимой клетки — это вопрос
/// «дорешан ли её ребёнок», заданный прямо в момент чтения. Поэтому отмена хода в
/// ребёнке, роняющая его ниже порога, сама забирает цифру из родителя: второй
/// бухгалтерии, которая могла бы разъехаться, просто нет.
int deepValueAt(NodeAt nodeAt, DeepPlayed played, String p, int r, int c) {
  final node = nodeAt(p);
  final given = node.puzzle[r][c];
  if (given != 0) return given;
  final hand = played[p]?[r][c] ?? 0;
  if (hand != 0) return hand;
  final isFeed = node.feedCells.any((f) => f[0] == r && f[1] == c);
  if (isFeed && deepNodeDone(nodeAt, played, childPath(p, r, c))) {
    return node.solution[r][c];
  }
  return 0;
}

/// Корень собран верно и целиком — победа партии.
bool deepRootComplete(NodeAt nodeAt, DeepPlayed played) {
  final root = nodeAt('');
  for (var r = 0; r < deepN; r++) {
    for (var c = 0; c < deepN; c++) {
      if (deepValueAt(nodeAt, played, '', r, c) != root.solution[r][c]) return false;
    }
  }
  return true;
}
