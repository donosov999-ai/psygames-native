import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';
import 'package:psygames_flutter/games/goods_sort/solver.dart';

/// 🔴 РЕШАТЕЛЬ ТОВАРОВ: НЕ «НАШЁЛ ПУТЬ», А «ПУТЬ, КОТОРЫЙ ЧЕЛОВЕК ПОВТОРИТ».
///
/// Разбор показывает ходы человеку, и цена вранья здесь прямая: он тянет товар
/// туда, куда показали, и ничего не происходит. Именно так в вебе жила прежняя
/// подсказка — замер 22.08.2026 дал от 29 до 91 % НЕЗАКОННЫХ подсказок, потому
/// что она не знала ни строгой укладки, ни ёмкостей.
///
/// ⚠️ ПОЭТОМУ ЗАКОННОСТЬ ПРОВЕРЯЕТСЯ ПРАВИЛАМИ ИГРЫ, А НЕ ПРАВИЛАМИ РЕШАТЕЛЯ.
/// Спросить у решателя, законны ли его ходы, значит спросить его о нём самом.
/// Здесь путь ПРОИГРЫВАЕТСЯ ходом за ходом через `GoodsPlay.move` — ту самую
/// дверь, в которую ходит экран, — и каждый ход обязан быть принят.
void main() {
  late GoodsLevelSet set;

  setUpAll(() {
    // Ширина телефонная: от неё зависит маска сетки, а значит число ниш и сама
    // доска. На широком поле игрались бы ДРУГИЕ уровни (в выгрузке две готовые
    // лестницы, `levels` и `wide`).
    set = GoodsLevelSet.fromJsonString(
      File('assets/levels/goods_sort.json').readAsStringSync(),
      width: 390,
    );
  });

  /// 🔴 АРИФМЕТИКА, КОТОРАЯ СИЛЬНЕЕ ЛЮБОГО ПЕРЕБОРА. Тройка — это три товара
  /// ОДНОГО вида (`tripleIn`, исключений нет даже у джокера). Значит вид, которого
  /// на доске не кратно трём, не исчезнет никогда, и цель «разобрать всё»
  /// недостижима — сколько ни ищи. Без этой проверки «решатель не нашёл» и
  /// «решения нет» неразличимы, и первый прячется за вторым.
  List<MapEntry<int, int>> oddTypes(GoodsPlay p) {
    final count = <int, int>{};
    void add(Iterable<int> goods) {
      for (final t in goods) {
        count[t] = (count[t] ?? 0) + 1;
      }
    }

    for (final c in p.board.cells) {
      add(c);
    }
    for (final s in p.board.queue) {
      add(s.cell);
    }
    for (final b in p.board.back ?? const <List<int>>[]) {
      add(b);
    }
    return count.entries.where((e) => e.value % kTriple != 0).toList();
  }

  bool needsFullClear(GoodsLevel l) => l.goal.kind != 'pick' && l.goal.kind != 'free';

  test('🔴 путь решателя проходим ЦЕЛИКОМ по правилам самой игры', () {
    var solved = 0;
    var moves = 0;
    final unsolved = <int>[];
    final impossible = <int>[];

    for (var lvl = 1; lvl <= 30; lvl += 1) {
      final start = GoodsPlay.start(set.byLevel(lvl));
      // Уровень, где вид лежит не по три, разобрать нельзя — и спрашивать с
      // решателя путь там нечестно (см. отдельную пробу ниже).
      if (needsFullClear(start.level) && oddTypes(start).isNotEmpty) {
        impossible.add(lvl);
        continue;
      }
      final solve = solveStrict(start);
      if (!solve.solvable) {
        unsolved.add(lvl);
        continue;
      }
      solved += 1;

      // Путь проигрывается ходом за ходом: каждый ход обязан быть законен ИМЕННО
      // ТАМ, где он стоит в пути, — доска и препятствия под ним уже другие.
      var play = GoodsPlay(
        level: start.level,
        board: collapseTriples(start.board),
        obstacles: start.obstacles,
        frozenRow: start.frozenRow,
        frozenType: start.frozenType,
      );
      for (final m in solve.path) {
        expect(play.usable(m.from), isTrue,
            reason: 'L$lvl: разбор берёт из недоступной ниши ${m.from}');
        expect(play.usable(m.to), isTrue,
            reason: 'L$lvl: разбор кладёт в недоступную нишу ${m.to}');
        expect(play.board.cells[m.from], isNotEmpty,
            reason: 'L$lvl: разбор берёт из пустой ниши ${m.from}');
        final next = play.moveTopOf(m.from, m.to);
        expect(next, isNotNull, reason: 'L$lvl: ход ${m.from}→${m.to} игра не пустит');
        play = next!;
        moves += 1;
      }
      expect(play.won, isTrue, reason: 'L$lvl: путь кончился, а уровень не взят');
    }

    // ignore: avoid_print
    print('РЕШАТЕЛЬ ТОВАРОВ: путь найден на $solved из ${30 - impossible.length} '
        'решаемых уровней, ходов в путях $moves; '
        'невыигрываемых по арифметике: $impossible; без пути: $unsolved');
    expect(unsolved, isEmpty, reason: 'разбора не будет на уровнях: $unsolved');
  });

  /// 🔴 НЕВЫИГРЫВАЕМЫХ УРОВНЕЙ НЕТ — И ЭТО СТОРОЖИТСЯ СО СТОРОНЫ ПРИЛОЖЕНИЯ.
  ///
  /// 📍 БЫЛО 24.09.2026: девять уровней из 62 нельзя было выиграть (L21, L35,
  /// L57 и повторы хвоста). Причина — в генераторе: раздача клала товар в
  /// подмножество ниш, не проверив, хватает ли в нём МЕСТА, и лишний товар тихо
  /// пропадал. Вид, потерявший экземпляр, тройкой уже не станет никогда.
  /// Починено в `frontend/src/games/goods-sort/core/level.ts` (подмножество
  /// растёт под товар + арифметическая проверка в раздаче), лестница переснята
  /// `src/games/goods-sort/tools/export-levels.gen.ts`.
  ///
  /// ⚠️ ПРОВЕРКА СТОИТ И ТУТ, И В ВЕБЕ (`goods-sort-whole-triples.test.ts`), и
  /// это не дубль: веб сторожит ГЕНЕРАТОР, а здесь — ФАЙЛ, который реально уехал
  /// в приложение. Между генератором и файлом лежит выгрузка, и она уже теряла
  /// товар молча.
  test('🔴 невыигрываемых уровней нет ни одного — на ОБЕИХ лестницах', () {
    // ⚠️ ЛЕСТНИЦ В ВЫГРУЗКЕ ДВЕ, И ЭТО РАЗНЫЕ УРОВНИ. Узкую (`levels`) играет
    // телефон, широкую (`wide`) — экран от 560 px. Проверить одну значит
    // отчитаться за половину: 24.09.2026 битых было семь на узкой и ВОСЕМЬ на
    // широкой, и списки не совпадали.
    final raw = File('assets/levels/goods_sort.json').readAsStringSync();
    for (final ladderKind in [(390.0, 'узкая'), (800.0, 'широкая')]) {
      final ladder = GoodsLevelSet.fromJsonString(raw, width: ladderKind.$1);
      final broken = <int, String>{};
      var full = 0;
      for (var lvl = 1; lvl <= 120; lvl += 1) {
        final p = GoodsPlay.start(ladder.byLevel(lvl));
        if (!needsFullClear(p.level)) continue;
        full += 1;
        final odd = oddTypes(p);
        if (odd.isNotEmpty) {
          broken[lvl] = odd.map((e) => 'вид ${e.key}×${e.value}').join(', ');
        }
      }
      // ignore: avoid_print
      print('НЕВЫИГРЫВАЕМЫХ УРОВНЕЙ (${ladderKind.$2} лестница): ${broken.length} из $full'
          '${broken.isEmpty ? '' : ' · ${broken.entries.map((e) => 'L${e.key} (${e.value})').join(' · ')}'}');
      expect(broken, isEmpty,
          reason: '${ladderKind.$2} лестница: снова есть уровни, которые нельзя выиграть: $broken');
      expect(full, greaterThan(50),
          reason: '${ladderKind.$2}: целей «разобрать всё» осталось $full — состав лестницы изменился');
    }
  });

  /// Все лестницы приложения: шесть наборов × две ширины.
  List<(String, double)> allLadders() {
    final files = [
      for (final set in (jsonDecode(File('assets/levels/goods_sets.json').readAsStringSync())
          as Map<String, dynamic>)['sets'] as List)
        (set as Map<String, dynamic>)['file'] as String,
    ];
    expect(files, hasLength(greaterThanOrEqualTo(6)), reason: 'наборы не прочитались — проба не о том');
    return [
      for (final f in files)
        for (final w in [390.0, 1200.0]) (f, w),
    ];
  }

  /// 🔴 «РАЗБОР» СО СТАРТА ВЕДЁТ К ПОБЕДЕ НА КАЖДОМ УРОВНЕ (задача 747a6ece).
  ///
  /// 📍 БЫЛО 02.10.2026: на 16 стартах из 720 разбор не находил пути и показывал
  /// одно правило. Замер 07.10.2026 разложил их так:
  ///   · 10 не проходились ВОВСЕ — дефект генератора: вид льда лежал во льду
  ///     (`pickFrozen` в `frontend/src/games/goods-sort/core/level.ts`, лестницы
  ///     пересняты);
  ///   · 3 — решатель: цель «освободить» запрещал увозить однородную кучку,
  ///     джокер не принимал чужой вид, полка из очереди приходит только за
  ///     ЦЕЛУЮ тройку, а перебор их не различал;
  ///   · 3 решались при большем бюджете — после правки льда стали лёгкими.
  /// Проба смотрит не «решатель ответил да», а ПУТЬ: он проигрывается ходом за
  /// ходом через ту же дверь, что у экрана, и обязан кончиться победой.
  test('🔴 «Разбор» со старта ведёт к победе на КАЖДОМ уровне всех наборов', () {
    final bad = <String>[];
    var levels = 0, moves = 0, maxNodes = 0;
    for (final (file, width) in allLadders()) {
      final ladder = GoodsLevelSet.fromJsonString(File('assets/levels/$file').readAsStringSync(), width: width);
      for (var lv = 1; lv <= ladder.levels.length; lv++) {
        levels++;
        var play = GoodsPlay.start(ladder.byLevel(lv));
        final solve = solveStrict(play);
        if (solve.nodes > maxNodes) maxNodes = solve.nodes;
        if (!solve.solvable) {
          bad.add('$file ${width.toInt()} L$lv: пути нет${solve.exhausted ? ' (упёрся)' : ''}');
          continue;
        }
        for (final m in solve.path) {
          final next = play.moveTopOf(m.from, m.to);
          if (next == null) {
            bad.add('$file ${width.toInt()} L$lv: игра не пустит ход ${m.from}→${m.to}');
            break;
          }
          play = next;
          moves++;
        }
        if (!play.won) bad.add('$file ${width.toInt()} L$lv: путь кончился, а уровень не взят');
      }
    }
    // ignore: avoid_print
    print('РАЗБОР СО СТАРТА: $levels уровней, путь на ${levels - bad.length}, ходов в путях $moves, '
        'узлов в худшем $maxNodes');
    expect(levels, greaterThanOrEqualTo(720), reason: 'лестниц меньше, чем выгружено, — проба не о том');
    expect(bad, isEmpty);
  });

  /// 🔴 ЛЁД РАСТАПЛИВАЕТСЯ: тройка его вида лежит ВНЕ ряда на открытых нишах.
  ///
  /// Лёд снимается тройкой своего вида, а в примёрзший ряд нельзя ни положить, ни
  /// взять. Выгрузка 25.09.2026 ставила вид, не глядя, где его товары: у 44 уровней
  /// из 720 часть тройки сидела во льду, десять не проходились вовсе. Правило
  /// стоит в генераторе (`pickFrozen`), а здесь сторожится ФАЙЛ, который уехал в
  /// приложение, — как и арифметика троек выше.
  test('🔴 лёд растапливается: тройка его вида вне ряда, на всех лестницах', () {
    final bad = <String>[];
    var frozen = 0;
    for (final (file, width) in allLadders()) {
      final ladder = GoodsLevelSet.fromJsonString(File('assets/levels/$file').readAsStringSync(), width: width);
      for (var lv = 1; lv <= ladder.levels.length; lv++) {
        final play = GoodsPlay.start(ladder.byLevel(lv));
        final type = play.frozenType;
        if (play.frozenRow == null || type == null) continue;
        frozen++;
        var open = 0;
        for (var i = 0; i < play.board.cells.length; i++) {
          if (play.usable(i)) open += play.board.cells[i].where((t) => t == type).length;
        }
        if (open < kTriple) bad.add('$file ${width.toInt()} L$lv: вида $type на открытых нишах $open');
      }
    }
    expect(frozen, greaterThan(40), reason: 'уровней со льдом почти нет — проба не о том');
    expect(bad, isEmpty);
  });

  /// 🔴 ПОТОЛОК ПО ЧАСАМ ОСТАНАВЛИВАЕТ РАЗБОР. Экран ставит его, чтобы человек не
  /// ждал на нажатии (`_lessonDeadline`); без проверки потолок мог молча не
  /// работать, и редкое тяжёлое положение подвешивало бы экран на секунды.
  test('🔴 потолок по часам: разбор не думает дольше отпущенного', () {
    // Берём старт, которому нужно заметно больше узлов, чем проверка часов
    // пропускает между взглядами (раз в 16 узлов).
    GoodsPlay? heavy;
    for (final (file, width) in allLadders()) {
      final ladder = GoodsLevelSet.fromJsonString(File('assets/levels/$file').readAsStringSync(), width: width);
      for (var lv = 1; lv <= ladder.levels.length && heavy == null; lv++) {
        final play = GoodsPlay.start(ladder.byLevel(lv));
        if (solveStrict(play).nodes > 300) heavy = play;
      }
      if (heavy != null) break;
    }
    expect(heavy, isNotNull, reason: 'нет старта тяжелее 300 узлов — проба не о том');
    final cut = solveStrict(heavy!, deadline: Duration.zero);
    expect(cut.solvable, isFalse, reason: 'часы не остановили перебор');
    expect(cut.exhausted, isTrue, reason: 'остановленный перебор обязан сказать «не знаю», а не «нет»');
    expect(solveStrict(heavy).solvable, isTrue, reason: 'без часов тот же старт решается');
  });

  test('🔴 препятствия ЖИВУТ: замок тикает по ходам, заслон снимается тройкой', () {
    final level = set.byLevel(1);

    // ЗАМОК. Две ниши и замок на два хода: после первого хода он ещё стоит, после
    // второго ниша открывается. Мутация встроена: проверяются ОБА шага, и «замок
    // не тикает» покраснит второй, «тикает вдвое» — первый.
    var locked = GoodsPlay(
      level: level,
      board: GoodsBoard(cells: [
        [1, 2],
        [2],
        []
      ], caps: [
        3,
        3,
        3
      ]),
      obstacles: [null, null, const Obstacle('locked', movesLeft: 2)],
    );
    expect(locked.usable(2), isFalse);
    locked = locked.moveTopOf(0, 1)!;
    expect(locked.usable(2), isFalse, reason: 'замок на два хода снялся за один');
    locked = locked.moveTopOf(1, 0)!;
    expect(locked.usable(2), isTrue, reason: 'замок на два хода не снялся за два');

    // ЗАСЛОН. Снимается тройкой ПО СОСЕДСТВУ. Ниша 1 соседняя с 0 (сетка уровня),
    // поэтому тройка в 0 открывает 1, а ход без тройки — нет.
    GoodsPlay blocked(List<List<int>> cells) => GoodsPlay(
          level: level,
          board: GoodsBoard(cells: cells, caps: [3, 3, 3]),
          obstacles: [null, const Obstacle('blocked'), null],
        );
    final near = blocked([
      [7, 7],
      [],
      [7]
    ]);
    expect(near.usable(1), isFalse);
    final after = near.moveTopOf(2, 0)!; // тройка семёрок в нише 0
    expect(after.board.cells[0], isEmpty, reason: 'тройка не собралась — замер не о том');
    expect(after.usable(1), isTrue, reason: 'тройка по соседству заслон не сняла');

    final idle = blocked([
      [7, 8],
      [],
      [7]
    ]).moveTopOf(0, 2)!; // восьмёрка переехала, тройки нет
    expect(idle.usable(1), isFalse, reason: 'заслон снялся без тройки');
  });

  test('подсказка — это ГОЛОВА настоящего пути, а не любой законный ход', () {
    final start = GoodsPlay.start(set.byLevel(1));
    final hint = hintMove(start);
    expect(hint, isNotNull);
    expect(hint, solveStrict(start).path.first);
    expect(start.moveTopOf(hint!.from, hint.to), isNotNull,
        reason: 'подсказку обязана принять сама игра');
  });

  /// 🔴 ПОДСКАЗКА ЗА ПОДСКАЗКОЙ: НЕ ТУДА-ОБРАТНО, А ДО ПОБЕДЫ.
  ///
  /// 02.10.2026, задача 978b07b4. Решатель каждый раз начинал с чистого листа, а
  /// ход «вернуть товар, откуда взяли» у него в почёте — это укладка на свой вид.
  /// Замер: партия, где каждый ход — голова свежего решения, на 720 уровнях
  /// (шесть наборов × две лестницы × 60) дошла до победы на 155 и на 549
  /// закончилась циклом туда-обратно. Разбор на экране решает так же, с текущего
  /// положения, и второй разбор подряд открывался откатом первого.
  ///
  /// ⚠️ «ТОТ ЖЕ ТОВАР НАЗАД» МЕРИТСЯ ОТДЕЛЬНО ОТ ВОЗВРАТА В ПОЛОЖЕНИЕ. Замок тикает
  /// с каждым ходом, и товар, вернувшийся на место, даёт уже другое положение:
  /// один запрет на пройденное оставил девять таких переносов, и ни один не был
  /// нужен — путь без него находился всегда.
  test('🔴 подсказка за подсказкой не ходит туда-обратно и доводит до победы', () {
    String position(GoodsPlay p) => [
          p.board.cells.map((c) => c.join(',')).join('|'),
          p.board.queue.length,
          (p.board.back ?? const <List<int>>[]).fold<int>(0, (n, b) => n + b.length),
          p.obstacles.map((o) => o == null ? '-' : '${o.kind}${o.movesLeft}').join(),
          p.frozenRow,
        ].join('#');

    // Наборов шесть, и у каждого своя выгрузка уровней: профиль играет своим
    // набором (nzt48 — «Напитки», дети — «Игрушки»), и один «Микс» живого не покрывает.
    final files = [
      for (final set in (jsonDecode(File('assets/levels/goods_sets.json').readAsStringSync())
          as Map<String, dynamic>)['sets'] as List)
        (set as Map<String, dynamic>)['file'] as String,
    ];
    expect(files, hasLength(greaterThanOrEqualTo(6)), reason: 'наборы не прочитались — проба не о том');
    for (final (file, width) in [
      for (final f in files)
        for (final w in [390.0, 1200.0]) (f, w),
    ]) {
      final ladder = GoodsLevelSet.fromJsonString(
        File('assets/levels/$file').readAsStringSync(),
        width: width,
      );
      final bad = <String>[];
      var won = 0;
      for (var lv = 1; lv <= ladder.levels.length; lv++) {
        var play = GoodsPlay.start(ladder.byLevel(lv));
        // Без пути с самого начала цепочке не с чего начаться — это другая проба.
        if (!solveStrict(play).solvable) continue;
        final behind = <GoodsPlay>[];
        final visited = {position(play)};
        GoodsMove? last;
        int? lastType;
        var steps = 0;
        while (!play.won && steps < 200) {
          final m = hintMove(play, behind: behind, lastMove: last);
          if (m == null) {
            bad.add('L$lv, шаг $steps: подсказки нет');
            break;
          }
          final type = play.board.cells[m.from].last;
          if (last != null && m.from == last.to && m.to == last.from && type == lastType) {
            bad.add('L$lv, шаг $steps: тот же товар назад, ${m.from}→${m.to}');
          }
          final next = play.moveTopOf(m.from, m.to);
          if (next == null) {
            bad.add('L$lv, шаг $steps: игра не приняла подсказку ${m.from}→${m.to}');
            break;
          }
          behind.add(play);
          play = next;
          last = m;
          lastType = type;
          steps++;
          if (!visited.add(position(play))) {
            bad.add('L$lv, шаг $steps: вернулись в пройденное положение');
            break;
          }
        }
        if (play.won) {
          won++;
        } else if (steps >= 200) {
          bad.add('L$lv: за 200 подсказок победы нет');
        }
      }
      expect(bad, isEmpty, reason: '$file, ширина $width');
      expect(won, greaterThan(50), reason: '$file, ширина $width: цепочка почти не доходит до победы — проба не о том');
    }
  });

  test('🔴 тупик: разобранная доска тупиком НЕ считается', () {
    final level = set.byLevel(1);
    GoodsPlay withBoard(List<List<int>> cells, List<int> caps) => GoodsPlay(
          level: level,
          board: GoodsBoard(cells: cells, caps: caps),
          obstacles: List<Obstacle?>.filled(cells.length, null),
        );

    expect(isDeadEnd(withBoard([[], []], [3, 3])), isFalse,
        reason: 'сказать «ходов больше нет» в момент победы обиднее, чем смолчать');

    // ⚠️ МЁРТВУЮ ДОСКУ НЕЛЬЗЯ СОБРАТЬ ИЗ СЛОЖЕННЫХ ТРОЕК: доска уберёт их сама и
    // окажется пустой. Берём перемешанные стопки — обе ниши полны, верхушки
    // разные, класть некуда ни одному товару.
    expect(
        isDeadEnd(withBoard([
          [1, 2, 1],
          [2, 1, 2]
        ], [
          3,
          3
        ])),
        isTrue,
        reason: 'обе ниши полны и верхушки разные — ход невозможен');

    // И встречная сторона, иначе проба зеленела бы на чём угодно: доска, где ход
    // ЕСТЬ (верхняя двойка ложится на двойку соседа), тупиком не считается.
    expect(
        isDeadEnd(withBoard([
          [1, 2],
          [2]
        ], [
          3,
          3
        ])),
        isFalse);
  });

  test('🔴 упёрлись в бюджет — говорим «не знаю», а не «решения нет»', () {
    final tiny = solveStrict(GoodsPlay.start(set.byLevel(30)), budget: 5);
    expect(tiny.solvable, isFalse);
    expect(tiny.exhausted, isTrue,
        reason: 'без этого флага «не решается» соврал бы про нерешаемость');
    expect(tiny.path, isEmpty, reason: 'неполный путь хуже, чем никакого');
  });
}
