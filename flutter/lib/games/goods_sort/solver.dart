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
/// ⚠️ ОСНОВНОЙ ПЕРЕБОР ТОЛЬКО СТРОГИЙ — ЭТО ЗАМЕР, А НЕ НЕДОСМОТР (оригинал,
/// 23.08.2026): мягкий перебор шире, упирается в бюджет и ТЕРЯЕТ 56 подсказок
/// из 150, не находя ни одной новой. Строгий ход законен и на мягком уровне,
/// значит найденный путь человек повторит при любом правиле.
///
/// 🔴 НО ТОЛЬКО ОСНОВНОЙ (07.10.2026, задача 747a6ece). Замер 23.08 говорит о
/// мягком переборе ВМЕСТО строгого. Когда строгий не нашёл ничего, терять уже
/// нечего, и тогда идёт запасной — «лучший по оценке» по настоящим правилам
/// уровня (`_solveBest`). Он нашёл путь там, где строгого нет вовсе: мягкий
/// «Микс» 1200 L26 и строгий с джокером «Питомцы» 1200 L54. Подробности и
/// замеры — у `solveStrict` и `_nicheCodes`.
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
/// больше двенадцати.
///
/// ⚠️ ВИДЫ ОЧЕРЕДИ И ЗАДНИХ РЯДОВ — ТОЖЕ В КАРТЕ (07.10.2026). Карта строилась по
/// одной доске, и вид, которого на ней ещё нет, получал общий запасной номер 15:
/// два разных вида из очереди после прихода полки становились в ключе одним.
Map<int, int> _buildTypeMap(GoodsBoard board) {
  final map = <int, int>{};
  var next = 1;
  void add(Iterable<int> goods) {
    for (final t in goods) {
      if (!map.containsKey(t)) map[t] = next < 15 ? next++ : 15;
    }
  }

  for (final cell in board.cells) {
    add(cell);
  }
  for (final shelf in board.queue) {
    add(shelf.cell);
  }
  for (final b in board.back ?? const <List<int>>[]) {
    add(b);
  }
  return map;
}

/// Что делает нишу не ровней другой, кроме содержимого: считается один раз на
/// перебор — места на доске не меняются, меняется только то, что на них лежит.
class _Places {
  _Places(GoodsPlay start)
      : goal = start.level.goal.kind == 'free' ? start.level.goal.niches.toSet() : const {},
        rowOf = [for (var i = 0; i < start.board.cells.length; i += 1) start.level.rowOfNiche(i)];

  /// Ниши цели «освободить» — по месту, как их проверяет `goalMet`.
  final Set<int> goal;

  /// Ряд каждой ниши — для примёрзшего ряда.
  final List<int> rowOf;
}

/// Код ниши одним числом: содержимое, ёмкость и всё, что делает её НЕ РОВНЕЙ
/// другой с тем же содержимым.
///
/// 🔴 НИШИ РАВНОПРАВНЫ НЕ ВСЕГДА (07.10.2026, задача 747a6ece). Ключ сортирует
/// ниши: две доски, где те же стопки лежат по другим местам, — одно положение.
/// Это верно, пока место ничего не решает, а решает оно у ниши цели
/// «освободить», в примёрзшем ряду и под препятствием. Прежде замки шли в ключ
/// отдельной строкой ПО МЕСТАМ, а ниши — сортированными: какая стопка под
/// замком, ключ не знал. Теперь эти признаки — в коде самой ниши. Заодно ёмкости
/// 1 и 2 больше не одна «пустая ниша» для симметрии: прежний код складывал их
/// в одну группу `cap <= 2`.
///
/// ⚠️ ЧЕГО В КОДЕ НЕТ — И ЭТО ЗАМЕРЫ ТОГО ЖЕ ДНЯ, А НЕ НЕДОСМОТР. Старт 720
/// уровней, «без пути» и длина пути против прежнего решателя:
///   · место в оседающем столбце: ключ строго по местам — без пути 22 вместо
///     трёх, худший перебор 21 с: без симметрии пустых ветвление съедает бюджет;
///   · «рядом с заслоном» (тройка по соседству его снимает): без пути 5 против 2;
///   · джокер в основном переборе ([jokers] = false): с ним путь длиннее на 98
///     стартах, до 387 ходов вместо 25 — основной перебор кладёт на джокер только
///     свой вид, то есть для него это обычная ниша. Запасной ходит по настоящим
///     правилам, и ему признак нужен.
List<int> _nicheCodes(GoodsPlay play, Map<int, int> types, _Places places, {required bool jokers}) {
  final board = play.board;
  final n = board.cells.length;
  final codes = List<int>.filled(n, 0);
  final frozenRow = play.frozenRow;
  for (var i = 0; i < n; i += 1) {
    final cell = board.cells[i];
    var packed = 0;
    for (var j = 0; j < cell.length && j < 4; j += 1) {
      packed |= (types[cell[j]] ?? 15) << (j * 4);
    }
    // Ёмкость обязана быть В КЛЮЧЕ: две пустые ниши на два и на четыре — РАЗНЫЕ
    // состояния, и склеить их значило бы объявить решаемой доску без решения.
    var code = (board.capOf(i) << 16) | packed;
    if (jokers && board.isJoker(i)) code |= 1 << 20;
    if (places.goal.contains(i)) code |= 1 << 21;
    if (frozenRow != null && places.rowOf[i] == frozenRow) code |= 1 << 22;
    final o = i < play.obstacles.length ? play.obstacles[i] : null;
    if (o != null) code |= (o.kind == 'locked' ? 1 + (o.movesLeft < 29 ? o.movesLeft : 29) : 31) << 23;
    codes[i] = code;
  }
  return codes;
}

/// Снимок положения строкой: коды ниш по возрастанию.
///
/// ⚠️ ПРЕПЯТСТВИЯ — ЧАСТЬ СНИМКА. Две одинаковые доски, у одной замок на три
/// хода, у другой на один, — РАЗНЫЕ положения: из второй через ход открывается
/// ниша, из первой нет. Склей их, и перебор объявит тупиком ветку, которая
/// через два хода оживает.
String _stateKey(GoodsPlay play, List<int> nicheCodes) {
  final board = play.board;
  final n = nicheCodes.length;
  final codes = [...nicheCodes]..sort();
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
  return '${String.fromCharCodes(chars)}${play.frozenRow ?? -1}';
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
///
/// [behind] — положения, где партия УЖЕ побывала (история ходов экрана).
///
/// 🔴 БЕЗ НИХ ПОДСКАЗКА ОТМЕНЯЕТ САМА СЕБЯ. Перебор каждый раз начинается с
/// чистого листа, и ход «вернуть товар туда, откуда его взяли» у него в
/// почёте: это укладка на свой вид, второй по рангу ход после тройки. Из
/// положения, где партия только что была, решение находится снова — и
/// перебор отдаёт путь, начатый с отката. Замер 02.10.2026, задача 978b07b4:
/// цепочка «ход = голова свежего решения» на всех 720 уровнях (шесть наборов ×
/// две лестницы) дошла до победы на 155, а на 549 зациклилась туда-обратно.
/// Поэтому пройденное сначала исключается из перебора.
///
/// ⚠️ ИСКЛЮЧАЕТСЯ ПРЕДПОЧТИТЕЛЬНО, А НЕ НАВСЕГДА. Если человек зашёл в тупик,
/// вернуться — единственный путь, и молчать о нём было бы хуже отката. Не
/// нашлось пути мимо пройденного — перебор повторяется без запрета.
///
/// [lastMove] — ход, которым партия пришла в [start]. Ход ровно обратный ему
/// перебор пробует ПОСЛЕДНИМ — и на первом шаге, и внутри пути. Запрета на
/// пройденное тут мало: замок тикает с каждым ходом, заслон снимается тройкой
/// по соседству, и тот же товар, вернувшийся на место, даёт уже ДРУГОЕ
/// положение. Замер того же дня с одним запретом: на 120 уровнях «Микса» (обе
/// лестницы) осталось 9 переносов того же товара туда и обратно, и в каждом из
/// девяти путь без обратного хода находился за 28–93 узла.
///
/// 🔴 ЗАПАСНОЙ ПЕРЕБОР ПО ПРАВИЛАМ САМОГО УРОВНЯ (07.10.2026, задача 747a6ece).
/// Не нашёл строгий — ищет `_solveBest`: «лучший по оценке», с той укладкой,
/// что у уровня (на мягком — куда угодно, на строгом — к своему виду и на
/// джокер). Зачем: на мягком «Миксе» 1200 L26 строгого пути нет вовсе — места
/// вне льда одна ниша, а освободить надо две, — и разбор показывал одно
/// правило вместо пути, хотя по правилам уровня он в девять ходов. Почему не
/// заменить им основной: поиск в глубину на 720 стартах дешевле (медиана 25
/// узлов), а «лучший по оценке» платит за узел все ходы сразу. Поэтому запасной
/// идёт ПОСЛЕ, с бюджетом в десятую часть: узел у него раз в десять дороже.
///
/// [deadline] — потолок по ЧАСАМ поверх потолка по узлам; его ставит экран.
/// Узлы одинаковы на любой машине, а человек ждёт секунды: замер 07.10.2026
/// посреди партии (после 5, 10 и 20 случайных ходов, 2 131 положение) — медиана
/// 0 мс, p99 до 3 мс, но три положения стоили 0,76–1,9 с на маке, а телефон
/// медленнее.
/// Пробы часов не ставят: им нужен один ответ на любой машине.
GoodsSolve solveStrict(
  GoodsPlay start, {
  int budget = 20000,
  bool Function(GoodsPlay)? done,
  Iterable<GoodsPlay> behind = const [],
  GoodsMove? lastMove,
  Duration? deadline,
}) {
  final clock = Stopwatch()..start();
  bool late() => deadline != null && clock.elapsed >= deadline;
  var nodes = 0;
  if (behind.isNotEmpty) {
    final ahead = _solveStrict(start, budget, done, behind, lastMove, late);
    if (ahead.solvable) return ahead;
    nodes += ahead.nodes;
  }
  final any = _solveStrict(start, budget, done, const [], lastMove, late);
  nodes += any.nodes;
  if (any.solvable) {
    return GoodsSolve(solvable: true, exhausted: false, path: any.path, nodes: nodes);
  }
  if (late()) return GoodsSolve(solvable: false, exhausted: true, path: const [], nodes: nodes);
  final best = _solveBest(start, budget ~/ 10, done, behind, lastMove, late);
  return GoodsSolve(
    solvable: best.solvable,
    exhausted: !best.solvable && (any.exhausted || best.exhausted),
    path: best.path,
    nodes: nodes + best.nodes,
  );
}

/// Узел запасного перебора: положение, как в него пришли и во что оно обходится.
class _Node {
  _Node(this.play, this.parent, this.move, this.g, this.f);
  final GoodsPlay play;
  final _Node? parent;
  final GoodsMove? move;
  final int g;
  final double f;
}

/// Куча по оценке: меньшая `f` — раньше, при равной — та, что дальше от начала.
class _Heap {
  final _items = <_Node>[];

  bool get isEmpty => _items.isEmpty;

  bool _before(_Node a, _Node b) => a.f < b.f || (a.f == b.f && a.g > b.g);

  void _swap(int i, int j) {
    final t = _items[i];
    _items[i] = _items[j];
    _items[j] = t;
  }

  void add(_Node n) {
    _items.add(n);
    var i = _items.length - 1;
    while (i > 0) {
      final p = (i - 1) >> 1;
      if (!_before(_items[i], _items[p])) break;
      _swap(i, p);
      i = p;
    }
  }

  _Node removeFirst() {
    final top = _items.first;
    final last = _items.removeLast();
    if (_items.isNotEmpty) {
      _items[0] = last;
      var i = 0;
      while (true) {
        final l = 2 * i + 1;
        final r = l + 1;
        var m = i;
        if (l < _items.length && _before(_items[l], _items[m])) m = l;
        if (r < _items.length && _before(_items[r], _items[m])) m = r;
        if (m == i) break;
        _swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/// Оценка «сколько ещё ходов»: на каждую нужную тройку вида — сколько товаров не
/// хватает в его лучших нишах; товар очереди и задних рядов — две трети хода
/// (два перекладывания на тройку). При цели «освободить» каждый товар в нише цели
/// стоит двух: его надо увезти, и ему нужно место.
double _estimate(GoodsPlay play) {
  final board = play.board;
  final goal = play.level.goal;
  final per = <int, List<int>>{};
  for (final cell in board.cells) {
    final local = <int, int>{};
    for (final t in cell) {
      local[t] = (local[t] ?? 0) + 1;
    }
    local.forEach((t, n) => (per[t] ??= []).add(n));
  }
  var h = 0.0;
  per.forEach((t, counts) {
    if (goal.kind == 'pick' && !goal.types.contains(t)) return;
    counts.sort((a, b) => b - a);
    final total = counts.fold<int>(0, (s, n) => s + n);
    final triples = total ~/ kTriple;
    for (var k = 0; k < triples && k < counts.length; k += 1) {
      h += kTriple - counts[k];
    }
    h += total - triples * kTriple;
  });
  if (goal.kind == 'free') {
    for (final i in goal.niches) {
      if (i < board.cells.length) h += 2 * board.cells[i].length;
    }
  }
  final queued = board.queue.fold<int>(0, (s, x) => s + x.cell.length);
  final back = (board.back ?? const <List<int>>[]).fold<int>(0, (s, x) => s + x.length);
  return h + (queued + back) * 2 / 3;
}

/// Запасной перебор: «лучший по оценке» (A* с оценкой втрое тяжелее пройденного)
/// по настоящим правилам укладки уровня. Ходит тоже только верхним товаром — путь
/// человек повторит через `GoodsPlay.moveTopOf`, как и путь основного перебора.
GoodsSolve _solveBest(
  GoodsPlay start,
  int budget,
  bool Function(GoodsPlay)? done,
  Iterable<GoodsPlay> behind,
  GoodsMove? lastMove,
  bool Function() late,
) {
  final from0 = GoodsPlay(
    level: start.level,
    board: collapseTriples(start.board),
    obstacles: start.obstacles,
    frozenRow: start.frozenRow,
    frozenType: start.frozenType,
  );
  final types = _buildTypeMap(from0.board);
  final places = _Places(from0);
  bool reached(GoodsPlay p) => done != null ? done(p) : p.won;
  final closed = <String>{};
  final root = _stateKey(from0, _nicheCodes(from0, types, places, jokers: true));
  for (final p in behind) {
    final key = _stateKey(p, _nicheCodes(p, types, places, jokers: true));
    if (key != root) closed.add(key);
  }
  final open = _Heap()..add(_Node(from0, null, null, 0, 3 * _estimate(from0)));
  var nodes = 0;
  while (!open.isEmpty) {
    final node = open.removeFirst();
    final play = node.play;
    if (reached(play)) {
      final path = <GoodsMove>[];
      for (_Node? x = node; x != null && x.move != null; x = x.parent) {
        path.add(x.move!);
      }
      return GoodsSolve(solvable: true, exhausted: false, path: List.unmodifiable(path.reversed), nodes: nodes);
    }
    final codes = _nicheCodes(play, types, places, jokers: true);
    if (!closed.add(_stateKey(play, codes))) continue;
    // Часы — на КАЖДОМ узле: узел запасного разворачивает все ходы сразу, на
    // мягкой доске эмулятора это десятки миллисекунд, и проверка раз в 16 узлов
    // перескакивала потолок 700 мс на полсекунды (замер 07.10.2026: 1 227 мс).
    if (++nodes > budget || late()) {
      return GoodsSolve(solvable: false, exhausted: true, path: const [], nodes: nodes);
    }
    final board = play.board;
    final last = node.move ?? lastMove;
    // Симметрия пустых — та же, что в основном переборе: по одной на код ниши.
    final emptyCodes = <int>[];
    final firstEmpty = List<bool>.filled(board.cells.length, false);
    for (var i = 0; i < board.cells.length; i += 1) {
      if (!play.usable(i) || board.cells[i].isNotEmpty || emptyCodes.contains(codes[i])) continue;
      emptyCodes.add(codes[i]);
      firstEmpty[i] = true;
    }
    for (var from = 0; from < board.cells.length; from += 1) {
      if (!play.usable(from) || board.cells[from].isEmpty) continue;
      final src = board.cells[from];
      for (var to = 0; to < board.cells.length; to += 1) {
        if (to == from || !play.usable(to)) continue;
        if (!board.canPlace(to, src.last, play.level.strict)) continue;
        if (board.cells[to].isEmpty) {
          if (!firstEmpty[to]) continue;
          // Одинокий товар в пустую нишу-ровню — тот же расклад, только ход потрачен.
          if (src.length == 1 && (codes[from] >> 16) == (codes[to] >> 16)) continue;
        }
        final next = play.moveTopOf(from, to);
        if (next == null) continue;
        final back = last != null && from == last.to && to == last.from ? 1 : 0;
        open.add(_Node(next, node, (from: from, to: to), node.g + 1, node.g + 1 + back + 3 * _estimate(next)));
      }
    }
  }
  return GoodsSolve(solvable: false, exhausted: false, path: const [], nodes: nodes);
}

GoodsSolve _solveStrict(
  GoodsPlay start,
  int budget,
  bool Function(GoodsPlay)? done,
  Iterable<GoodsPlay> behind,
  GoodsMove? lastMove,
  bool Function() late,
) {
  final seen = <String>{};
  final path = <GoodsMove>[];
  var nodes = 0;
  var exhausted = false;
  // Бюджет кончился — перебор остановлен целиком. Не то же, что `exhausted`:
  // ветка, упёршаяся в предел глубины, обрывается одна, остальные идут дальше.
  var outOfBudget = false;

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
  final places = _Places(from0);
  bool reached(GoodsPlay p) => done != null ? done(p) : p.won;

  // Пройденное — как уже осмотренное. Корень исключается: человек мог отменой
  // вернуться туда, где уже стоял, и запрет на корень оборвал бы перебор сразу.
  final root = _stateKey(from0, _nicheCodes(from0, types, places, jokers: false));
  for (final p in behind) {
    final key = _stateKey(p, _nicheCodes(p, types, places, jokers: false));
    if (key != root) seen.add(key);
  }

  bool walk(GoodsPlay play, int depth) {
    if (reached(play)) return true;
    if (depth >= _maxDepth) {
      exhausted = true;
      return false;
    }
    if (++nodes > budget || ((nodes & 15) == 0 && late())) {
      exhausted = true;
      outOfBudget = true;
      return false;
    }
    final codes = _nicheCodes(play, types, places, jokers: false);
    final key = _stateKey(play, codes);
    if (seen.contains(key)) return false;
    seen.add(key);

    final board = play.board;
    final last = path.isNotEmpty ? path.last : lastMove;
    // Полка закрывается ЦЕЛОЙ тройкой — три одинаковых и больше ничего, — и
    // только тогда сверху приходит полка из очереди. Пока очередь не пуста,
    // тройка в смешанной нише виды тратит, а очередь не двигает.
    final closing = board.col != null && board.queue.isNotEmpty;

    // СИММЕТРИЯ ПУСТЫХ НИШ: две пустые ниши с одним кодом неразличимы, и
    // считать их разными ветками значит раздувать ветвление во столько раз,
    // сколько на доске пустых. ⚠️ У донора приёма ниши одинаковы, у нас нет:
    // ёмкость, джокер, лёд, цель и препятствия — всё это в коде ниши, поэтому
    // оставляем по одной пустой НА КАЖДЫЙ КОД, а не одну вообще.
    final firstEmpty = List<bool>.filled(board.cells.length, false);
    final emptyCodes = <int>[];
    for (var i = 0; i < board.cells.length; i += 1) {
      if (!play.usable(i) || board.cells[i].isNotEmpty) continue;
      if (emptyCodes.contains(codes[i])) continue;
      emptyCodes.add(codes[i]);
      firstEmpty[i] = true;
    }

    // ПОРЯДОК ХОДОВ РЕШАЕТ ВСЁ: сначала закрывающие полку, потом складывающие
    // тройку, потом к своему типу, и лишь потом переезды в пустую нишу.
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
        // ⚠️ Чужой вид на джокер игра пускает, а этот перебор — нет, и это
        // замер 07.10.2026: с такими ходами путь удлинился на 98 стартах из 717,
        // на строгих уровнях с джокером до 387 ходов вместо 25 — на джокер годится
        // любой товар, и перебор в глубину тонет в перестановках. Где без джокера
        // не обойтись («Питомцы» 1200 L54), путь находит запасной перебор: он
        // ходит по настоящим правилам и ищет короткое.
        if (dst.isNotEmpty && dst.last != type) continue;
        if (dst.isEmpty) {
          if (!firstEmpty[to]) continue; // симметрия пустых
          // НЕ РАЗБИРАТЬ СОБРАННОЕ: ниша из одного типа переезжать в пустую не
          // должна — это перестановка кучки с места на место. ⚠️ Только когда
          // пустая НЕ ПРОСТОРНЕЕ: переезд из ниши на два в пустую на четыре
          // бывает единственным способом собрать тройку. И только между
          // нишами-ровнями (код без ёмкости и содержимого): кучку из ниши цели
          // «освободить» как раз и надо увезти — 07.10.2026 запрет делал такие
          // уровни нерешаемыми для разбора.
          if (srcUniform && board.capOf(to) <= board.capOf(from) && (codes[from] >> 20) == (codes[to] >> 20)) {
            continue;
          }
        }
        var sameCount = 0;
        for (final t in dst) {
          if (t == type) sameCount += 1;
        }
        final int rank;
        if (sameCount + 1 >= kTriple) {
          final back = board.back;
          final closes = closing &&
              sameCount == dst.length &&
              dst.length + 1 == kTriple &&
              (back == null || back[to].isEmpty);
          rank = closes ? 0 : 1;
        } else if (last != null && from == last.to && to == last.from) {
          // Обратный ход — последним (см. `lastMove`). Тройку не трогаем: ход,
          // который её складывает, хорош при любом прошлом.
          rank = 5;
        } else if (places.goal.contains(to)) {
          // Цель «освободить»: класть в её нишу — работать против цели.
          rank = 4;
        } else if (places.goal.contains(from)) {
          // …а увозить из неё — к цели, сразу после троек. Без этого перебор,
          // различающий ниши цели (см. `_nicheCodes`), блуждал: путь со старта
          // удлинился на 39 уровнях с этой целью, до 304 ходов вместо 33.
          rank = 2;
        } else {
          rank = dst.isNotEmpty ? 2 : 3;
        }
        moves.add((from: from, to: to, rank: rank));
      }
    }
    moves.sort((a, b) => a.rank - b.rank);

    for (final m in moves) {
      // ⚠️ Бюджет кончился — выходим СРАЗУ. Без этой строки каждый узел стека
      // доигрывал оставшиеся ходы, и на каждом строилась новая доска: при
      // глубине в сотни ходов «упёрся в 20 000 узлов» стоило секунды, а не
      // доли секунды (замер 07.10.2026: до 21 с на одном уровне).
      if (outOfBudget) return false;
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
GoodsMove? hintMove(
  GoodsPlay play, {
  int budget = 20000,
  Iterable<GoodsPlay> behind = const [],
  GoodsMove? lastMove,
}) =>
    solveStrict(play, budget: budget, behind: behind, lastMove: lastMove).firstMove;

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
