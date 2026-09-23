/// ПРАВИЛА ДВИЖКА СОСУДОВ — перенос `src/games/water-sort/core/{tubes,hidden}.ts`.
///
/// 🔴 ОДИН ДВИЖОК — ТРИ ИГРЫ. «Переливалка», «Шарики» и «Гайки» в вебе это один
/// экран с разной шкуркой и своей лестницей прогресса. Копии экрана нет и быть не
/// должно: три копии шестисотстрочного экрана разъехались бы за неделю (в проекте
/// это уже случалось с двумя экранами судоку).
///
/// 🔴 ХОД ПЕРЕЛИВАЕТ ВЕСЬ ВЕРХНИЙ ОДНОЦВЕТНЫЙ СТОЛБИК, А НЕ ОДНУ ПОРЦИЮ — это
/// правило самой игры, а не оптимизация. Денис 23.09.2026 о гайках и шариках
/// отдельно: «если несколько одинаковых подряд — переносятся вместе, а не по
/// одной». Исключение одно — строгий налив (`strict`), это отдельная ось.
///
/// ⚠️ Сверяется эталонами живого TS (`test/fixtures/sort-tubes-reference.json`),
/// а не собственной формулой: 240 ходов, 80 отъездов, скрытые слои.
library;

import 'dart:convert';

/// Поле: сосуды и всё, что задаёт их вместимость и доступность.
///
/// 🔴 ВМЕСТИМОСТЬ ЛЕЖИТ РЯДОМ С СОДЕРЖИМЫМ, А НЕ КОНСТАНТОЙ В СОСЕДНЕМ ФАЙЛЕ —
/// оплаченный урок «Сортировки товаров»: там ёмкость осталась зашитой в четырёх
/// местах, и каждое стало тихим дефектом.
class TubeField {
  const TubeField({
    required this.tubes,
    required this.cap,
    this.caps,
    this.stones,
    this.opensAt,
    this.strict = false,
    this.sealed = 0,
  });

  factory TubeField.fromJson(Map<String, dynamic> j) => TubeField(
        tubes: (j['tubes'] as List).map((t) => (t as List).cast<int>()).toList(),
        cap: j['cap'] as int,
        caps: (j['caps'] as List?)?.cast<int>(),
        stones: (j['stones'] as List?)?.cast<int>(),
        opensAt: (j['opensAt'] as List?)?.cast<int>(),
        strict: j['strict'] == true,
        sealed: (j['sealed'] as num?)?.toInt() ?? 0,
      );

  /// Сосуд снизу вверх: последний элемент — верхний слой.
  final List<List<int>> tubes;

  /// Вместимость по умолчанию и САМАЯ БОЛЬШАЯ на поле.
  final int cap;

  /// Своя вместимость сосуда. Короткий сосуд домом цвета не бывает (см. [isDone]).
  final List<int>? caps;

  /// Камни на дне: место отнимают, но главное — сосуд с камнями НИКОГДА не дом
  /// цвета, а временное хранилище, за которое придётся отчитаться.
  final List<int>? stones;

  /// Отложенный сосуд: открывается, когда закрыто столько-то других.
  final List<int>? opensAt;

  /// Строгий налив: за ход уходит одна порция, а не весь верхний ряд.
  final bool strict;

  /// Сколько сосудов уже уехало с поля. ⚠️ Без этого счётчика отложенный сосуд
  /// запирался бы обратно: `isOpen` спрашивает `doneCount`, а тот считает
  /// закрытые НА ПОЛЕ — уехавшие обязаны продолжать считаться.
  final int sealed;

  int get length => tubes.length;

  TubeField copyWith({List<List<int>>? tubes, int? sealed}) => TubeField(
        tubes: tubes ?? this.tubes.map((t) => [...t]).toList(),
        cap: cap,
        caps: caps?.toList(),
        stones: stones?.toList(),
        opensAt: opensAt?.toList(),
        strict: strict,
        sealed: sealed ?? this.sealed,
      );

  Map<String, dynamic> toJson() => {
        'tubes': tubes.map((t) => [...t]).toList(),
        'cap': cap,
        'caps': caps?.toList(),
        'stones': stones?.toList(),
        'opensAt': opensAt?.toList(),
        'strict': strict,
        'sealed': sealed,
      };

  /// Вместимость КОНКРЕТНОГО сосуда.
  int capOf(int i) => (caps != null && i < caps!.length) ? caps![i] : cap;

  /// Сколько камней на дне.
  int stonesIn(int i) => (stones != null && i < stones!.length) ? stones![i] : 0;

  /// Сколько порций реально помещается: высота минус камни.
  int usable(int i) => capOf(i) - stonesIn(i);

  /// Сосуд с камнями домом цвета не станет — только временным хранилищем.
  bool isBuffer(int i) => stonesIn(i) > 0;

  int roomIn(int i) => usable(i) - tubes[i].length;

  /// Открыт ли сосуд ПРЯМО СЕЙЧАС. Считается от положения, а не хранится флагом:
  /// иначе отмена хода вернула бы содержимое, но не замок, и поле рассказывало
  /// бы о себе неправду.
  bool isOpen(int i) {
    final need = (opensAt != null && i < opensAt!.length) ? opensAt![i] : 0;
    return need <= 0 || doneCount() >= need;
  }

  /// Сколько ЦВЕТОВ собрано. ⚠️ Пустые не в счёт: с `isDone` счёт начинался бы с
  /// двойки (двух пустых сосудов), и печать «откроется после первого закрытого»
  /// снималась бы ДО ПЕРВОГО ХОДА.
  int doneCount() {
    var n = sealed;
    for (var i = 0; i < tubes.length; i += 1) {
      if (tubes[i].isNotEmpty && isDone(i)) n += 1;
    }
    return n;
  }

  /// Сосуд «закрыт»: пустой либо налит одним цветом доверху СВОЕЙ высоты.
  ///
  /// ⚠️ УКОРОЧЕННЫЙ СОСУД ДОМОМ НЕ БЫВАЕТ. Замер 07.09.2026: иначе четыре порции
  /// цвета в четырёхвысотном сосуде объявлялись домом, сосуд уезжал, а пятая
  /// порция оставалась на поле без дома — уровень становился непроходимым, и
  /// значок «уровень проверен» этого не ловил.
  bool isDone(int i) {
    final t = tubes[i];
    if (t.isEmpty) return true;
    if (isBuffer(i)) return false;
    if (usable(i) != cap) return false;
    return t.length == usable(i) && topRun(t) == t.length;
  }

  bool get isSolved {
    for (var i = 0; i < tubes.length; i += 1) {
      if (!isDone(i)) return false;
    }
    return true;
  }

  /// Ключ положения для памяти обхода: сосуд сортируется ЦЕЛИКОМ вместе со своей
  /// высотой, камнями и замком — две порции в сосуде на четыре и те же две в
  /// сосуде на два это РАЗНЫЕ положения.
  String fieldKey() {
    final rows = <String>[];
    for (var i = 0; i < tubes.length; i += 1) {
      final open = (opensAt != null && i < opensAt!.length) ? opensAt![i] : 0;
      rows.add('${tubes[i].join(',')}#${capOf(i)}:${stonesIn(i)}:$open');
    }
    rows.sort();
    return rows.join('|');
  }
}

int? topColor(List<int> t) => t.isEmpty ? null : t.last;

/// Высота верхнего одноцветного столбика — именно столько и переливается.
int topRun(List<int> t) {
  if (t.isEmpty) return 0;
  final c = t.last;
  var n = 1;
  for (var i = t.length - 2; i >= 0 && t[i] == c; i -= 1) {
    n += 1;
  }
  return n;
}

/// Почему ход не прошёл — ОТДЕЛЬНЫМ ОТВЕТОМ, а не «просто нет».
///
/// 📍 ПОВОД, дословно из отчёта тестировщицы (задача 44e6cd21): «не могу со
/// второго шурупа снять гайки, никуда не хотят сходить, и так и сяк кликаю». Ход
/// был запрещён правилами, но игра молчала: выбор снимался, счётчик промахов
/// тикал, причина не называлась нигде. Молчащий отказ читается как поломка.
///
/// ⚠️ ПРАВИЛО ЖИВЁТ В ОДНОМ МЕСТЕ: последней строкой стоит вопрос к самому
/// [canPour], а не своя копия условий — иначе объяснение и запрет разъедутся при
/// первой правке, и игра начнёт называть причину там, где ход разрешён.
String? refusalReason(TubeField f, int from, int to) {
  if (from == to) return null;
  if (!f.isOpen(from) || !f.isOpen(to)) return 'закрыт';
  final a = f.tubes[from];
  final b = f.tubes[to];
  if (a.isEmpty) return 'пусто';
  if (f.roomIn(to) == 0) return 'полон';
  if (b.isNotEmpty && topColor(b) != topColor(a)) return 'другойЦвет';
  return canPour(f, from, to) ? null : 'безТолку';
}

/// Разрешён ли перелив.
///
/// ⚠️ ПЕРЕЛИВ ИЗ ОДНОЦВЕТНОЙ В ПУСТУЮ ЗАПРЕЩЁН: формально законен, но не меняет
/// положения — то же содержимое в другой посуде. Без запрета решатель ходит по
/// кругу, а человек получает подсказку, ведущую в никуда.
bool canPour(TubeField f, int from, int to) {
  if (from == to) return false;
  if (!f.isOpen(from) || !f.isOpen(to)) return false;
  final a = f.tubes[from];
  final b = f.tubes[to];
  if (a.isEmpty) return false;
  if (f.roomIn(to) == 0) return false;
  final color = topColor(a);
  if (b.isEmpty) {
    // Из сосуда с камнями содержимое ОБЯЗАНО уйти, иначе партия не сходится;
    // наливать однородный столбик В буфер так же бессмысленно, как в пустой.
    if (f.isBuffer(to)) return topRun(a) != a.length;
    if (f.isBuffer(from)) return true;
    // Из УКОРОЧЕННОГО — тоже можно: домом он стать не может, значит однородный
    // столбик в нём тупик, и вылить наружу — единственный выход.
    if (f.usable(from) != f.cap && topRun(a) == a.length) return true;
    return topRun(a) != a.length;
  }
  return topColor(b) == color;
}

/// Сколько порций реально перельётся.
int pourAmount(TubeField f, int from, int to) {
  if (!canPour(f, from, to)) return 0;
  if (f.strict) return 1;
  final run = topRun(f.tubes[from]);
  final room = f.roomIn(to);
  return run < room ? run : room;
}

/// Новое поле после перелива; null — ход незаконен.
///
/// ⚠️ ЗАПЕЧАТКА СЮДА НЕ ВХОДИТ, и это замер, а не недосмотр: собранный сосуд
/// ИНЕРТЕН (вылить некуда, налить нельзя), его отъезд не меняет ни одного
/// достижимого положения. В вебе попытка положить `sealDone` внутрь хода «как у
/// соседей» сломала генератор: проба шла 11,5 с и проходила, стала 100 с и падать.
TubeField? pour(TubeField f, int from, int to) {
  final n = pourAmount(f, from, to);
  if (n == 0) return null;
  final color = topColor(f.tubes[from])!;
  final tubes = <List<int>>[];
  for (var i = 0; i < f.tubes.length; i += 1) {
    if (i == from) {
      tubes.add(f.tubes[i].sublist(0, f.tubes[i].length - n));
    } else if (i == to) {
      tubes.add([...f.tubes[i], ...List<int>.filled(n, color)]);
    } else {
      tubes.add([...f.tubes[i]]);
    }
  }
  return TubeField(
    tubes: tubes,
    cap: f.cap,
    caps: f.caps?.toList(),
    stones: f.stones?.toList(),
    opensAt: f.opensAt?.toList(),
    strict: f.strict,
    sealed: f.sealed,
  );
}

class SealResult {
  const SealResult(this.field, this.sealed);
  final TubeField field;
  final int sealed;
}

/// СОБРАННЫЙ ЦВЕТ ЗАПЕЧАТЫВАЕТСЯ И УЕЗЖАЕТ, РЯД СМЫКАЕТСЯ (решение Дениса 06.09.2026).
///
/// ⚠️ УЕЗЖАЕТ ТОЛЬКО ПОЛНЫЙ ДОМ ЦВЕТА: пустой сосуд `isDone` тоже считает
/// законченным — убери его, и игрок лишится места для манёвра, то есть самой игры.
/// ⚠️ ВСЕ РЯДЫ ПОЛЯ ЕДУТ ВМЕСТЕ: `caps`, `stones` и `opensAt` адресуются тем же
/// номером, что и сосуды. Сдвинь один и забудь другой — и у сосуда окажется чужая
/// высота или чужой замок.
SealResult sealDone(TubeField f) {
  final drop = <bool>[];
  for (var i = 0; i < f.tubes.length; i += 1) {
    drop.add(f.tubes[i].isNotEmpty && f.isDone(i));
  }
  final count = drop.where((x) => x).length;
  if (count == 0) return SealResult(f, 0);
  List<T>? keep<T>(List<T>? row) {
    if (row == null) return null;
    final out = <T>[];
    for (var i = 0; i < row.length; i += 1) {
      if (i >= drop.length || !drop[i]) out.add(row[i]);
    }
    return out;
  }

  final tubes = <List<int>>[];
  for (var i = 0; i < f.tubes.length; i += 1) {
    if (!drop[i]) tubes.add([...f.tubes[i]]);
  }
  return SealResult(
    TubeField(
      tubes: tubes,
      cap: f.cap,
      caps: keep(f.caps),
      stones: keep(f.stones),
      opensAt: keep(f.opensAt),
      strict: f.strict,
      sealed: f.sealed + count,
    ),
    count,
  );
}

class TubeMove {
  const TubeMove(this.from, this.to);
  final int from;
  final int to;
}

List<TubeMove> legalMoves(TubeField f) {
  final out = <TubeMove>[];
  for (var a = 0; a < f.tubes.length; a += 1) {
    for (var b = 0; b < f.tubes.length; b += 1) {
      if (canPour(f, a, b)) out.add(TubeMove(a, b));
    }
  }
  return out;
}

// ─────────────────────────── СКРЫТЫЙ СЛОЙ ───────────────────────────

/// С какого уровня появляется скрытый слой.
const int hiddenFrom = 16;

/// Идёт ли на уровне режим скрытого слоя: ритм «через два на третий».
bool hiddenAtLevel(int level) {
  final l = level < 1 ? 1 : level;
  return l >= hiddenFrom && (l - hiddenFrom) % 3 == 0;
}

/// Ключ клетки: `сосуд * 100 + глубина`. Глубина 0 — дно.
int layerKey(int tube, int depth) => tube * 100 + depth;

/// Виден ли слой. Верхний виден ВСЕГДА: иначе игрок не знал бы даже того, чем
/// ходит.
bool layerVisible(TubeField f, Set<int> hidden, int tube, int depth) {
  if (tube >= f.tubes.length) return true;
  final t = f.tubes[tube];
  if (depth >= t.length - 1) return true;
  return !hidden.contains(layerKey(tube, depth));
}

/// Сколько слоёв ещё не открыто — цифра для замера «цены неопределённости».
int hiddenLeft(TubeField f, Set<int> hidden) {
  var n = 0;
  for (var i = 0; i < f.tubes.length; i += 1) {
    for (var d = 0; d < f.tubes[i].length; d += 1) {
      if (!layerVisible(f, hidden, i, d)) n += 1;
    }
  }
  return n;
}

/// Считаются ли звёзды по ходам. ⚠️ Под скрытым слоем минимума НЕ СУЩЕСТВУЕТ:
/// разведка стоит ходов, которых в минимуме нет, и честно разведавший доску
/// получил бы одну звезду за то, чего не мог знать.
bool starsByMoves(int level) => !hiddenAtLevel(level);

/// Звёзды: доля от эталона. Эталон — измеренная формула «цвета × (высота − 1)»,
/// а НЕ длина найденного пути: поиск в глубину длиннее минимума в 1,52 раза, и
/// три звезды выдавались за игру в 1,83 раза длиннее оптимальной.
int starsFor(int moves, int reference, int level) {
  if (!starsByMoves(level)) return 3;
  if (reference == 0) return 3;
  final share = moves / reference;
  if (share <= 1.2) return 3;
  if (share <= 1.8) return 2;
  return 1;
}

// ─────────────────────────── УРОВНИ ───────────────────────────

/// Уровень движка сосудов: раздача и всё, что о ней надо знать экрану.
/// Генератор и решатель НЕ переносились — уровни розданы живым TS.
class TubeLevel {
  const TubeLevel({
    required this.level,
    required this.field,
    required this.colors,
    required this.empty,
    required this.moveLimit,
    required this.reference,
    required this.hidden,
    required this.hiddenLevel,
  });

  factory TubeLevel.fromJson(Map<String, dynamic> j) => TubeLevel(
        level: j['level'] as int,
        field: TubeField.fromJson(j['field'] as Map<String, dynamic>),
        colors: j['colors'] as int,
        empty: j['empty'] as int,
        moveLimit: (j['moveLimit'] as num?)?.toInt() ?? 0,
        reference: (j['reference'] as num).toInt(),
        hidden: (j['hidden'] as List? ?? const []).map((k) => (k as num).toInt()).toSet(),
        hiddenLevel: j['hiddenLevel'] == true,
      );

  final int level;
  final TubeField field;
  final int colors;
  final int empty;
  final int moveLimit;
  final int reference;

  /// Ключи скрытых слоёв этой раздачи.
  final Set<int> hidden;
  final bool hiddenLevel;

  TubeField freshField() => field.copyWith();
}

class TubeLevelSet {
  TubeLevelSet(this.levels);

  factory TubeLevelSet.fromJsonString(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return TubeLevelSet(
      (j['levels'] as List).map((e) => TubeLevel.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  final List<TubeLevel> levels;

  /// Уровень по номеру. За последним вшитым идём по кругу с конца лестницы:
  /// генератор на телефоне не крутим, а обрывать игру нечестно.
  TubeLevel byLevel(int level) {
    if (levels.isEmpty) throw StateError('уровней нет');
    if (level <= levels.length) return levels[level - 1];
    final tail = levels.length >= 10 ? 10 : levels.length;
    final i = levels.length - tail + ((level - levels.length - 1) % tail);
    return levels[i];
  }
}
