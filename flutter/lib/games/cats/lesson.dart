/// РАЗБОР «КОШЕК» ПО ШАГАМ: не показ ответа, а имя приёма на каждом ходу.
///
/// Цель Дениса 24.09.2026 — «решатель и учитель у всех игр». Здесь учитель свой, а
/// не общий: у кошек решение ЕСТЬ, и каждый ход почти всегда ВЫНУЖДЕН — значит есть
/// что назвать словом. Общий показ карточки стимула (`shell/demo_lesson.dart`)
/// годится играм на реакцию, где решать нечего; здесь он превратил бы разбор в
/// перелистывание готовой разгадки.
///
/// 🔴 КАЖДЫЙ ШАГ НАЗЫВАЕТ ПРИЁМ, А НЕ ПРОСТО СТАВИТ КОШКУ. Разбор без имени приёма —
/// это показ ответа: человек видит, ЧТО поставили, и не узнаёт, ПОЧЕМУ. Приёмов
/// четыре, и они ровно те, какими игра и решается руками:
///   · в цвете осталось одно место · в строке одно · в столбце одно
///   · и честное «дальше перебор», когда вынужденного хода нет.
///
/// ⚠️ «ЕДИНСТВЕННОЕ ЗАКОННОЕ МЕСТО» — ПРОВЕРКА МЕСТНАЯ, но на доске, где стоят только
/// кошки разгадки, она не ошибается: доказательство — у `forcedIn` ниже.
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'rules.dart';

/// Чем вынужден ход.
enum CatTechnique {
  /// В этом цвете осталось одно законное место.
  region,

  /// В этой строке осталось одно законное место.
  row,

  /// В этом столбце осталось одно законное место.
  column,

  /// Вынужденного хода нет — дальше перебор. Так и говорим.
  trial,
}

/// Ключ словаря с именем приёма.
String catTechniqueKey(CatTechnique t) => switch (t) {
      CatTechnique.region => 'catsWhyRegion',
      CatTechnique.row => 'catsWhyRow',
      CatTechnique.column => 'catsWhyColumn',
      CatTechnique.trial => 'catsWhyTrial',
    };

/// Имя приёма СТРОКОЙ — и одновременно единственное место, где эти ключи зовутся
/// литералом.
///
/// 🔴 ЗАЧЕМ ТАК, А НЕ `L.t(catTechniqueKey(...))`. Сборщик словаря
/// (`tools/embed-l10n.mjs`) ищет в исходниках ровно `L.t('ключ')`: ключ, названный
/// переменной, в ассеты НЕ попадает. 📍 Замер 30.09.2026: первая редакция отдавала
/// ключ переменной, прогон сборщика дал `catsWhyRegion → None` в ru.json — человек
/// увидел бы в разборе сам ключ вместо объяснения, и ни одна проба словаря этого
/// не показывает.
String catTechniqueName(CatTechnique t) => switch (t) {
      CatTechnique.region => L.t('catsWhyRegion'),
      CatTechnique.row => L.t('catsWhyRow'),
      CatTechnique.column => L.t('catsWhyColumn'),
      CatTechnique.trial => L.t('catsWhyTrial'),
    };

/// Один ход разбора: куда ставим и почему.
class CatLessonMove {
  const CatLessonMove(this.r, this.c, this.why);
  final int r;
  final int c;
  final CatTechnique why;
}

/// Законно ли поставить кошку в (r, c) при уже стоящих.
bool _free(CatsBoard board, Set<CatCell> cats, int r, int c) =>
    catConflict(board, cats, r, c) == null;

/// Ходы разбора: от пустой доски до полной, вынужденные вперёд.
///
/// Порядок приёмов — от самого узкого к самому широкому: цвет обычно даёт первую
/// зацепку (в маленькой области мест мало), строка и столбец подхватывают дальше.
List<CatLessonMove> catsLessonMoves(CatsBoard board) {
  final n = board.n;
  final solution = board.solutionCells;
  final cats = <CatCell>{};
  final out = <CatLessonMove>[];

  ({int r, int c})? forcedIn(Iterable<({int r, int c})> area) {
    final free = [for (final p in area) if (_free(board, cats, p.r, p.c)) p];
    if (free.length != 1) return null;
    // 🔴 ЕДИНСТВЕННОЕ МЕСТО ВСЕГДА ИЗ РАЗГАДКИ — ЭТО ДОКАЗЫВАЕТСЯ, А НЕ ПРОВЕРЯЕТСЯ.
    // На доске стоят только кошки разгадки. Кошка разгадки для этой области (строки,
    // столбца) с ними не спорит — разгадка согласна сама с собой, — значит её клетка
    // законна. Раз законная клетка одна, это она и есть.
    // 📍 Замер 30.09.2026: первая редакция проверяла это условием, и мутация «снять
    // проверку» выжила на 50 досках — ветка не исполнялась ни разу, потому что
    // исполниться не может. Страховка, которую нечем задеть, выдаёт себя за защиту;
    // здесь вместо неё утверждение: сломается рассуждение — упадёт отладочная сборка.
    assert(solution.contains(free.first.r * n + free.first.c),
        'единственное место вне разгадки — рассуждение в шапке неверно');
    return free.first;
  }

  // 🔴 ПОТОЛОК ХОДОВ — n, ПО КОШКЕ ЗА ХОД. 📍 Замер 30.09.2026: мутация «перебор
  // ставит кошку мимо разгадки» ПОВЕСИЛА прогон проб на десять минут — ход добавлял
  // уже стоящую клетку, число кошек не росло, и `while (cats.length < n)` крутился
  // вечно. В коде без мутации так не бывает, но разбор открывается по кнопке на
  // экране: зависание там — это замёрзшее приложение, а не красная проба.
  for (var guard = 0; guard < n && cats.length < n; guard++) {
    CatLessonMove? move;

    for (var id = 0; id < n && move == null; id++) {
      final area = [
        for (var r = 0; r < n; r++)
          for (var c = 0; c < n; c++)
            if (board.regionAt(r, c) == id) (r: r, c: c),
      ];
      if (area.any((p) => cats.contains(p.r * n + p.c))) continue;
      final p = forcedIn(area);
      if (p != null) move = CatLessonMove(p.r, p.c, CatTechnique.region);
    }

    for (var r = 0; r < n && move == null; r++) {
      if (cats.any((cell) => cell ~/ n == r)) continue;
      final p = forcedIn([for (var c = 0; c < n; c++) (r: r, c: c)]);
      if (p != null) move = CatLessonMove(p.r, p.c, CatTechnique.row);
    }

    for (var c = 0; c < n && move == null; c++) {
      if (cats.any((cell) => cell % n == c)) continue;
      final p = forcedIn([for (var r = 0; r < n; r++) (r: r, c: c)]);
      if (p != null) move = CatLessonMove(p.r, p.c, CatTechnique.column);
    }

    // Вынужденного хода не нашлось — говорим честно и берём следующую из разгадки.
    if (move == null) {
      final left = solution.difference(cats);
      if (left.isEmpty) break;
      final cell = left.first;
      move = CatLessonMove(cell ~/ n, cell % n, CatTechnique.trial);
    }

    out.add(move);
    cats.add(move.r * n + move.c);
  }
  return out;
}

/// Шаги для плеера каркаса: рамка на клетку и ключ приёма.
List<LessonStep> catsLessonSteps(CatsBoard board) => [
      for (final m in catsLessonMoves(board))
        LessonStep(
          box: LessonBox(m.c, m.r, 1, 1, LessonBoxKind.place),
          techniqueKey: catTechniqueKey(m.why),
          text: catTechniqueName(m.why),
        ),
    ];

/// Кошки, открытые к шагу [shown], — по ним разбор рисует доску.
Map<CatCell, CatMark> catsLessonMarks(CatsBoard board, List<CatLessonMove> moves, int shown) => {
      for (var i = 0; i < shown && i < moves.length; i++)
        moves[i].r * board.n + moves[i].c: CatMark.cat,
    };
