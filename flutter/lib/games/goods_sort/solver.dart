/// РЕШАТЕЛЬ «СОРТИРОВКИ ТОВАРОВ» — перенос `src/games/goods-sort/core/solver.ts`.
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ ОБЩИЙ ПОИСК КАРКАСА. У каркаса есть `BoardSolver` —
/// поиск в ширину по договору `BoardPuzzle`, и ханою с башнями Лондона его
/// хватает. Здесь он не годится, и это замерено в самом TS-решателе (см. его
/// шапку): у сортировки ветвление около `ниш × ниш`, и без трёх отсечений
/// перебор упирается в потолок вместо ответа. Отсечения — порядок ходов
/// (сначала складывающие тройку), симметрия пустых ниш по ёмкости и запрет
/// разбирать уже собранную нишу — дают на замере A/B 60 досок глубокий перебор
/// ВДВОЕ дешевле. Написать это заново было бы вторым источником правды о том,
/// решаема ли доска, при уже существующем и проверенном первом.
///
/// ⚠️ ЧТО ИЗМЕНЕНО ПРОТИВ ОРИГИНАЛА, И ЗАЧЕМ. Три вещи, каждая по делу:
///   1. возвращается ВЕСЬ путь, а не только первый ход: разбору нужно довести
///      человека до конца, подсказке — по-прежнему только голова пути;
///   2. перебор идёт по `GoodsPlay`, а не по голой доске: ниша под препятствием
///      и примёрзший ряд не трогаются вовсе, НО препятствия при этом ЖИВУТ —
///      замок тикает по ходам, заслон снимается тройкой по соседству. В TS
///      решатель про них не знал вовсе (в вебе его звал генератор, у которого
///      препятствий ещё нет), и статичный список доступных ниш тут не годится:
///      замер 24.09.2026 — препятствия стоят у 66 уровней из 120, и на L21
///      статичная модель не нашла решения даже за 600 тыс. узлов, потому что
///      уровень разбирается ровно ПОСЛЕ снятия заслона;
///   3. цель задаётся снаружи: у уровня она бывает не «разобрать всё», а «убрать
///      названные виды» или «освободить ниши». Искать полную разборку там, где
///      хватит трёх ходов, значит учить длинному пути.
///
/// ⚠️ РЕШАТЕЛЬ ТОЛЬКО СТРОГИЙ — ЭТО ЗАМЕР, А НЕ НЕДОСМОТР (оригинал, 23.08.2026):
/// мягкий перебор шире, упирается в бюджет и ТЕРЯЕТ 56 подсказок из 150, не
/// находя ни одной новой. Для нас это безопасно вдвойне: строгий ход законен и
/// на мягком уровне, значит найденный путь человек повторит при любом правиле.
library;

import 'model.dart';

/// Ход: снять ВЕРХНИЙ товар ниши [from] и положить в нишу [to].
///
/// ⚠️ Человек может взять товар и из середины ниши (`GoodsPick.index`), решатель
/// же перебирает только верхние. Это сужение НАМЕРЕННОЕ: множество его ходов —
/// подмножество человеческих, поэтому каждый найденный ход игрок повторит
/// точно. Обратное неверно, и цена известна: путь иногда длиннее кратчайшего.
typedef GoodsMove = ({int from, int to});

/// Что ответил перебор.
class GoodsSolve {
  const GoodsSolve({
    required this.solvable,
    required this.exhausted,
    required this.path,
    required this.nodes,
  });

  /// Доска разбирается.
  final bool solvable;

  /// Перебор упёрся в бюджет — «не решается» здесь означает «не знаю».
  final bool exhausted;

  /// Найденный путь целиком; пусто — решения не нашли.
  final List<GoodsMove> path;

  /// Сколько узлов перебрано. Секундомер на разных машинах врёт, узлы — нет.
  final int nodes;

  /// Первый ход решения — то, что нужно подсказке.
  GoodsMove? get firstMove => path.isEmpty ? null : path.first;
}

/// Ниша упакована в одно число: до четырёх товаров по четыре бита плюс ёмкость
/// в старших. Типы перенумерованы локально 1..15 — товар в игре это индекс из
/// сорока с лишним, в четыре бита он не влезет, а на одной доске типов не
/// больше десяти.
Map<int, int> _buildTypeMap(GoodsBoard board) {
  final map = <int, int>{};
  var next = 1;
  for (final cell in board.cells) {
    for (final t in cell) {
      if (!map.containsKey(t)) map[t] = next++;
    }
  }
  return map;
}

/// Снимок положения строкой. Ниши равноправны, поэтому числа сортируются.
///
/// ⚠️ ПРЕПЯТСТВИЯ — ЧАСТЬ СНИМКА. Две одинаковые доски, у одной замок на три
/// хода, у другой на один, — РАЗНЫЕ положения: из второй через ход открывается
/// ниша, из первой нет. Склей их, и перебор объявит тупиком ветку, которая
/// через два хода оживает.
String _stateKey(GoodsPlay play, Map<int, int> types) {
  final board = play.board;
  final n = board.cells.length;
  final codes = List<int>.filled(n, 0);
  for (var i = 0; i < n; i += 1) {
    final cell = board.cells[i];
    var packed = 0;
    for (var j = 0; j < cell.length && j < 8; j += 1) {
      packed |= (types[cell[j]] ?? 15) << (j * 4);
    }
    // Ёмкость обязана быть В КЛЮЧЕ: две пустые ниши на два и на четыре — РАЗНЫЕ
    // состояния, и склеить их значило бы объявить решаемой доску без решения.
    codes[i] = (board.capOf(i) << 16) | (packed & 0xFFFF);
  }
  codes.sort();
  // 🔴 ОЧЕРЕДЬ И ЗАДНИЕ РЯДЫ — ЧАСТЬ СОСТОЯНИЯ. Две доски с одинаковым
  // содержимым ниш, но разными остатками, — разные: у одной впереди ещё пять
  // полок, у другой ни одной. Склей их — и перебор объявит решаемой партию,
  // которую не досмотрел. Длины достаточно: и очередь, и задний ряд
  // расходуются только вперёд.
  final tail = board.queue.length;
  final spines = (board.back ?? const <List<int>>[]).fold<int>(0, (n, b) => n + b.length);
  final chars = List<int>.filled(n * 2 + 1, 0);
  for (var i = 0; i < n; i += 1) {
    chars[i * 2] = codes[i] & 0xFFFF;
    chars[i * 2 + 1] = (codes[i] >> 16) & 0xFFFF;
  }
  chars[n * 2] = (tail * 251 + spines) & 0xFFFF;
  final locks = StringBuffer();
  for (final o in play.obstacles) {
    locks.writeCharCode(o == null ? 0 : (o.kind == 'locked' ? 1 + o.movesLeft : 1));
  }
  return '${String.fromCharCodes(chars)}$locks${play.frozenRow ?? -1}';
}

/// Глубина ограничена, иначе падает стек: перебор идёт вглубь и только потом
/// возвращается. Потолок с запасом от разумной партии — перекладываний в ней
/// заведомо меньше пятисот, дальше это уже не решение, а блуждание.
const int _maxDepth = 500;

/// Разбирается ли положение.
///
/// [done] — цель; по умолчанию настоящая победа уровня (`GoodsPlay.won`): цель
/// плюс пустая очередь и пустые задние ряды.
///
/// ⚠️ БЮДЖЕТ ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. Перебор без потолка на плотной доске уходит в
/// минуты, а человек ждёт. Упёрлись — честно говорим `exhausted`, а не «нет».
GoodsSolve solveStrict(
  GoodsPlay start, {
  int budget = 20000,
  bool Function(GoodsPlay)? done,
}) {
  final seen = <String>{};
  final path = <GoodsMove>[];
  var nodes = 0;
  var exhausted = false;

  // Сложенные тройки убираются ДО перебора: иначе первый же узел оказался бы
  // положением, которого в игре не бывает.
  final from0 = GoodsPlay(
    level: start.level,
    board: collapseTriples(start.board),
    obstacles: start.obstacles,
    frozenRow: start.frozenRow,
    frozenType: start.frozenType,
  );
  final types = _buildTypeMap(from0.board);
  bool reached(GoodsPlay p) => done != null ? done(p) : p.won;

  bool walk(GoodsPlay play, int depth) {
    if (reached(play)) return true;
    if (depth >= _maxDepth) {
      exhausted = true;
      return false;
    }
    if (++nodes > budget) {
      exhausted = true;
      return false;
    }
    final key = _stateKey(play, types);
    if (seen.contains(key)) return false;
    seen.add(key);

    final board = play.board;

    // СИММЕТРИЯ ПУСТЫХ НИШ: две пустые ниши одной ёмкости неразличимы, и
    // считать их разными ветками значит раздувать ветвление во столько раз,
    // сколько на доске пустых. ⚠️ У донора приёма ёмкость одна на доску, у нас
    // три — поэтому оставляем по одной пустой НА КАЖДУЮ ЁМКОСТЬ, а не одну
    // вообще. Без Map и без массива: ёмкости в игре ровно три, а аллокация
    // повторялась бы на каждом узле перебора.
    var firstEmpty2 = -1, firstEmpty3 = -1, firstEmpty4 = -1;
    for (var i = 0; i < board.cells.length; i += 1) {
      if (!play.usable(i) || board.cells[i].isNotEmpty) continue;
      final cap = board.capOf(i);
      if (cap <= 2) {
        if (firstEmpty2 < 0) firstEmpty2 = i;
      } else if (cap == 3) {
        if (firstEmpty3 < 0) firstEmpty3 = i;
      } else if (firstEmpty4 < 0) {
        firstEmpty4 = i;
      }
    }

    // ПОРЯДОК ХОДОВ РЕШАЕТ ВСЁ: сначала складывающие тройку, потом к своему
    // типу, и лишь потом переезды в пустую нишу.
    final moves = <({int from, int to, int rank})>[];
    for (var from = 0; from < board.cells.length; from += 1) {
      if (!play.usable(from)) continue;
      final src = board.cells[from];
      if (src.isEmpty) continue;
      final type = src.last;
      var srcUniform = true;
      for (var j = 1; j < src.length; j += 1) {
        if (src[j] != src[0]) {
          srcUniform = false;
          break;
        }
      }
      for (var to = 0; to < board.cells.length; to += 1) {
        if (to == from || !play.usable(to) || board.roomIn(to) <= 0) continue;
        final dst = board.cells[to];
        // Строгая укладка. ⚠️ Проверяется ЗДЕСЬ, а не в `GoodsPlay.move`: у
        // уровня правило бывает мягким, а перебор всегда строгий — и это
        // безопасно, потому что строгий ход законен и на мягком уровне.
        if (dst.isNotEmpty && dst.last != type) continue;
        if (dst.isEmpty) {
          final cap = board.capOf(to);
          final first = cap <= 2 ? firstEmpty2 : (cap == 3 ? firstEmpty3 : firstEmpty4);
          if (first != to) continue; // симметрия пустых
          // НЕ РАЗБИРАТЬ СОБРАННОЕ: ниша из одного типа переезжать в пустую не
          // должна — это перестановка кучки с места на место. ⚠️ Только когда
          // пустая НЕ ПРОСТОРНЕЕ: переезд из ниши на два в пустую на четыре
          // бывает единственным способом собрать тройку.
          if (srcUniform && cap <= board.capOf(from)) continue;
        }
        var sameCount = 0;
        for (final t in dst) {
          if (t == type) sameCount += 1;
        }
        final rank = sameCount + 1 >= kTriple ? 0 : (dst.isNotEmpty ? 1 : 2);
        moves.add((from: from, to: to, rank: rank));
      }
    }
    moves.sort((a, b) => a.rank - b.rank);

    for (final m in moves) {
      final next = play.moveTopOf(m.from, m.to);
      if (next == null) continue;
      path.add((from: m.from, to: m.to));
      if (walk(next, depth + 1)) return true;
      path.removeLast();
    }
    return false;
  }

  final solvable = walk(from0, 0);
  return GoodsSolve(
    solvable: solvable,
    exhausted: exhausted,
    path: solvable ? List.unmodifiable(path) : const [],
    nodes: nodes,
  );
}

/// Подсказка: ход, который ВЕДЁТ К РЕШЕНИЮ, а не просто законен.
///
/// 🔴 В ВЕБЕ ПРЕЖНЯЯ ПОДСКАЗКА НАЗЫВАЛА ХОДЫ, КОТОРЫЕ ИГРА ОТВЕРГАЛА: она не
/// знала ни строгой укладки, ни ёмкостей, и замер 22.08.2026 дал от 29 до 91 %
/// незаконных подсказок. Здесь ход берётся из настоящего решения.
GoodsMove? hintMove(GoodsPlay play, {int budget = 20000}) =>
    solveStrict(play, budget: budget).firstMove;

/// Есть ли ход вообще — распознавание тупика.
///
/// ⚠️ Правило укладки берётся НАСТОЯЩЕЕ (`level.strict`), а не «всегда строгое»:
/// тупик мы объявляем человеку, и мерить его надо по тем ходам, которые
/// доступны ЕМУ.
bool hasAnyMove(GoodsPlay play) {
  final board = play.board;
  final strict = play.level.strict;
  for (var from = 0; from < board.cells.length; from += 1) {
    if (!play.usable(from)) continue;
    final src = board.cells[from];
    if (src.isEmpty) continue;
    final type = src.last;
    for (var to = 0; to < board.cells.length; to += 1) {
      if (to == from || !play.usable(to) || board.roomIn(to) <= 0) continue;
      final dst = board.cells[to];
      if (strict && dst.isNotEmpty && dst.last != type) continue;
      // Переезд одинокого товара в пустую нишу ходом не считаем: иначе «ход
      // есть» будет вечно верным и тупик не наступит никогда.
      if (dst.isEmpty && src.length == 1) continue;
      return true;
    }
  }
  return false;
}

/// Тупик на ЖИВОЙ доске.
///
/// ⚠️ ЖИВАЯ — ЭТО НЕ ВСЯ: ниши под препятствием и в примёрзшем ряду ходов не
/// дают, и `GoodsPlay.usable` уже их отсекает. Оставь им вместимость — запертая
/// ниша будет считаться местом, куда можно положить, и тупик не наступит никогда.
///
/// Разобранная доска тупиком НЕ считается: там ходов нет потому, что всё
/// сделано, и сказать «ходов больше нет» в момент победы обиднее, чем смолчать.
bool isDeadEnd(GoodsPlay play) {
  if (play.board.isCleared || play.won) return false;
  return !hasAnyMove(play);
}
