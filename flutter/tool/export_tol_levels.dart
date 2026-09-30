/// ВЫГРУЗКА ЛЕСТНИЦЫ «ЛОНДОНСКОЙ БАШНИ» — повторяемая и по замеру, а не по прикидке.
///
/// ЗАПУСК (из папки flutter):  dart run tool/export_tol_levels.dart
/// Зерно и место: TOL_SEED=20260924 TOL_OUT=assets/levels/tower_london.json
///
/// ⚠️ ЗАЧЕМ ОН ПОЯВИЛСЯ. В шапке прежнего `tower_london.json` стояло:
/// «generator: tower-london makePuzzle (ПОВТОР ЖИВОГО КОДА ЭКРАНА) + поиск в
/// ширину». Инструмента в репозитории не было вовсе, а сам генератор был КОПИЕЙ
/// кода экрана — два источника одной правды. Цена выяснилась 24.09.2026: в
/// лестнице нашлись два дефекта, а переснять её было нечем. Тот же урок, что в
/// тот же день на товарах (`frontend/src/games/goods-sort/tools/export-levels.gen.ts`).
///
/// 🔴 ПОЧЕМУ НА DART, А НЕ НА TS, КАК У ТОВАРОВ. Игра выпускается НАТИВНО
/// (`hybrid_app.dart:150` перехватывает `/games/tower-london`), её правила живут
/// в `lib/games/tower_london/model.dart`, а веб-экран до людей не доходит.
/// Писать генератор на TS значило бы звать правила мёртвой половины. Здесь он
/// зовёт `TolState.legalMoves`/`move` — ровно те, которыми ходит игрок.
///
/// ━━━ ЗАМЕР, НА КОТОРОМ СТОИТ НОВАЯ ЛЕСТНИЦА (24.09.2026) ━━━
/// Перебор ВСЕГО пространства положений, поиск в ширину из каждого:
///   3 шара, ёмкости 3-2-1: 36 положений, диаметр 8
///   4 шара, ёмкости 4-3-1: 192 положения, диаметр 14
///   4 шара, 3-3-2: 240, диаметр 10 · 4 шара, 4-2-2: 216, диаметр 11
///   5 шаров, 5-3-2: 1440, диаметр 14 · 5 шаров, 4-4-2: 1560, диаметр 14
///   5 шаров, 4 стержня 4-3-2-1: 2640, диаметр 12
///   6 шаров, 4-4-3: 11520 положений, диаметр 16
///
/// ━━━ ВТОРОЙ ЗАМЕР (25.09.2026): КУДА ЛЕСТНИЦА РАСТЁТ ДАЛЬШЕ ━━━
/// Решение Дениса на вопрос «оставить ли верх на шести шарах»: РАСТИТЬ ДАЛЬШЕ
/// НОВОЙ ОСЬЮ. Замер перебором (поиск в ширину из собранной башни):
///   6 шаров 4-4-3: 11 520 положений, предел 16   ← было верхом
///   6 шаров 4-4-4: 13 680, предел 15             ⚠️ БОЛЬШЕ МЕСТА — ЛЕГЧЕ
///   7 шаров 4-4-3: 70 560, предел 21             ← взято
///   7 шаров 5-4-3: 85 680, предел 21
///   8 шаров 4-4-3: 7 200, предел 19              ⚠️ доска почти забита
///   9 шаров 5-5-4: 7 257 600, предел 29
///   4 стержня 4-3-2-1, 6 шаров: 14 400, предел 14 ⚠️ ЛИШНИЙ СТЕРЖЕНЬ — ЛЕГЧЕ
///   4 стержня 4-4-3-2, 9 шаров: 10 886 400, предел 23
///
/// 🔴 ВЫВОД, КОТОРЫЙ МЕНЯЕТ ПОДХОД К РОСТУ: трудность здесь — в ТЕСНОТЕ, а не в
/// размере. Ни четвёртый стержень, ни лишняя глубина её не добавляют: оба дают
/// свободу и УКОРАЧИВАЮТ план (16 → 14 и 16 → 15). Растить можно только числом
/// шаров при прежних стержнях — и ровно до заполнения: на восьми шарах из
/// одиннадцати мест предел снова падает (21 → 19), потому что ходить становится
/// некуда и задача вырождается.
///
/// 📌 ОДИН СТАРТ ХВАТАЕТ, И ЭТО ТОЖЕ ЗАМЕР. Правила хода не зависят от того,
/// какой шар какого цвета: два собранных положения отличаются лишь перестановкой
/// имён. Первый прогон это подтвердил числом — предел 16 достигался у ВСЕХ 720
/// стартов шестишаровой конфигурации, а не у одного.
/// Пар положений по длине плана (4 шара 4-3-1): 9→4968, 10→4104, 11→3336,
/// 12→1824, 13→576, 14→24. То есть задач хватает с запасом на каждой длине.
///
/// 🔴 ЧТО ИЗ ЭТОГО СЛЕДУЕТ. Прежняя лестница держала цель в 8 ходов с L7 по L20
/// — четырнадцать ступеней подряд, а с L11 и параметры не менялись вовсе.
/// Предел 8 перенесён из веба (`Math.min(8, 1 + lvl.level)`) и НИКЕМ НЕ МЕРЕН:
/// у той же конфигурации, что стоит с L11, диаметр 14. Потолок был не у игры.
library;

import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/tower_london/model.dart';

/// Одна ступень лестницы: сколько шаров, какие стержни, какой длины план.
typedef Rung = ({int level, List<String> balls, List<int> caps, int plan});

/// Буквы шаров. ⚠️ Пятый и шестой добавлены вместе с шестишаровыми ступенями,
/// седьмой (`P`, розовый) — вместе с семишаровыми; цвета подобраны замером ΔE в
/// `board.dart` — не переименовывать порознь.
const _colours = ['R', 'G', 'B', 'Y', 'M', 'C', 'P'];

/// 🔴 ЛЕСТНИЦА — ТАБЛИЦЕЙ, ЧТОБЫ ЕЁ МОЖНО БЫЛО ОСПОРИТЬ ОДНИМ ВЗГЛЯДОМ.
///
/// Три отрезка, у каждого своя конфигурация, и длина плана растёт внутри
/// отрезка до ИЗМЕРЕННОГО диаметра, а не до круглого числа:
///   L1–L7   3 шара 3-2-1, план 2…8    (предел 8 — отрезок выбран досуха)
///   L8–L13  4 шара 4-3-1, план 9…14   (предел 14 — тоже досуха)
///   L14–L20 6 шаров 4-4-3, план 10…16 (предел 16 — досуха)
///   L21–L25 7 шаров 4-4-3, план 17…21 (предел 21 — досуха; 25.09.2026)
///
/// ⚠️ ЧЕТВЁРТЫЙ ОТРЕЗОК НЕ ПАДАЕТ НА СТЫКЕ: 16 → 17. Конфигурация та же самая
/// (стержни 4-4-3), прибавляется ровно один шар — и этого хватает, чтобы план
/// вырос на пять ходов. Провал на L14 (14 → 10) остаётся: там меняются и шары, и
/// пространство разом.
///
/// ⚠️ НА L14 ПЛАН ПАДАЕТ С 14 ДО 10 — ЭТО НАРОЧНО. Там меняется конфигурация:
/// шаров становится шесть вместо четырёх, и пространство растёт со 192
/// положений до 11 520. Новая механика начинается с плана покороче, иначе
/// ступень получается двойным скачком сразу по двум осям.
List<Rung> ladder() {
  final out = <Rung>[];
  for (var i = 0; i < 7; i += 1) {
    out.add((level: out.length + 1, balls: _colours.take(3).toList(), caps: [3, 2, 1], plan: 2 + i));
  }
  for (var i = 0; i < 6; i += 1) {
    out.add((level: out.length + 1, balls: _colours.take(4).toList(), caps: [4, 3, 1], plan: 9 + i));
  }
  for (var i = 0; i < 7; i += 1) {
    out.add((level: out.length + 1, balls: _colours.take(6).toList(), caps: [4, 4, 3], plan: 10 + i));
  }
  for (var i = 0; i < 5; i += 1) {
    out.add((level: out.length + 1, balls: _colours.take(7).toList(), caps: [4, 4, 3], plan: 17 + i));
  }
  return out;
}

/// Сколько задач в партии и сколько кладём на ступень.
///
/// ⚠️ ЗАДАЧ КЛАДЁМ БОЛЬШЕ, ЧЕМ РАУНДОВ, НО РАЗНЫМИ ОБЯЗАНЫ БЫТЬ ВСЕ. Экран
/// берёт их по порядку (`screen.dart:137`, `puzzles[(round-1) % length]`),
/// поэтому «в наборе есть разнообразие» не спасает: до задачи под номером шесть
/// человек не доходит никогда. Замер прежней лестницы: повтор ВНУТРИ одной
/// партии на 12 уровнях из 20, на первом — три разных задачи из пяти.
const int kRounds = 5;
const int kPuzzlesPerLevel = 8;

/// Положение, где шары лежат на стержнях по порядку заполнения.
TolState packed(List<String> balls, List<int> caps) {
  final pegs = <List<String>>[for (var i = 0; i < caps.length; i += 1) <String>[]];
  var at = 0;
  for (final b in balls) {
    while (pegs[at].length >= caps[at]) {
      at += 1;
    }
    pegs[at].add(b);
  }
  return TolState(pegs, caps);
}

TolState stateOf(String key, List<int> caps) =>
    TolState(key.split('|').map((p) => p.split('').toList()).toList(), [...caps]);

/// Кратчайшие расстояния от положения до всех достижимых.
///
/// ⚠️ ХОДИТ ЯДРО ИГРЫ (`legalMoves`/`move`), а не своя копия правил: иначе
/// выгрузка считала бы минимум по одним правилам, а человек играл по другим.
Map<String, int> distances(TolState from) {
  final dist = <String, int>{from.key: 0};
  final q = Queue<TolState>()..add(from);
  while (q.isNotEmpty) {
    final s = q.removeFirst();
    final d = dist[s.key]!;
    for (final m in s.legalMoves()) {
      final n = s.move(m.from, m.to)!;
      if (dist.containsKey(n.key)) continue;
      dist[n.key] = d + 1;
      q.add(n);
    }
  }
  return dist;
}

/// Все перестановки шаров — из них получаются стартовые БАШНИ.
List<List<String>> _orders(List<String> xs) {
  if (xs.length <= 1) return [xs];
  final out = <List<String>>[];
  for (var i = 0; i < xs.length; i += 1) {
    final rest = [...xs]..removeAt(i);
    for (final p in _orders(rest)) {
      out.add([xs[i], ...p]);
    }
  }
  return out;
}

/// Задачи одной ступени: [kPuzzlesPerLevel] ПОПАРНО РАЗНЫХ пар «старт → цель»,
/// у каждой кратчайший план ровно [plan] ходов.
///
/// 🔴 СТАРТ — ВСЕГДА БАШНЯ, НО ПОРЯДОК ШАРОВ РАЗНЫЙ. Это середина между двумя
/// крайностями, и обе крайности померены.
///
/// · ОДИН старт на ступень (как было): целей на нужной длине не хватает.
///   Замер 24.09.2026 при старте «все шары по порядку с первого стержня»:
///     3 шара 3-2-1: план 2→3 цели · 4→5 · 5→4 · 7→5 · 8→3
///     4 шара 4-3-1: план 13→8 · 14→ОДНА
///   На планах 2, 4, 5, 7, 8 и 14 восьми разных задач НЕ СУЩЕСТВУЕТ, а партия
///   идёт пятью раундами. Вот откуда брались повторы: генератор был зажат и
///   честно дублировал — на 12 уровнях из 20.
///
/// · ЛЮБОЕ положение стартом: пар становится много, но пропадает свойство,
///   которое экранная проба фиксировала словами «старт: все шары на первом».
///   Игра открывается башней — это её узнаваемое лицо, и ломать его ради
///   разнообразия незачем.
///
/// · БАШНЯ С РАЗНЫМ ПОРЯДКОМ (взято): лицо сохранено, а пар хватает везде.
///   Замер: 3 шара — 6 стартов, 18…42 пары на план; 4 шара — 24 старта,
///   24…768 пар; 6 шаров — 720 стартов, тысячи пар.
List<Map<String, dynamic>> puzzlesFor(Rung rung, Random rnd) {
  final seen = <String>{};
  final out = <Map<String, dynamic>>[];
  final starts = _orders(rung.balls).map((b) => packed(b, rung.caps)).toList()
    ..shuffle(rnd);

  // Обход ПОЛНЫЙ по стартам: если пар на этой длине мало, мы их всё равно
  // найдём, а не сдадимся на случайных попытках.
  final usedStarts = <String>{};
  for (final start in starts) {
    if (out.length >= kPuzzlesPerLevel) break;
    if (!usedStarts.add(start.key)) continue;
    final d = distances(start);
    final goals = d.entries.where((e) => e.value == rung.plan).map((e) => e.key).toList()
      ..shuffle(rnd);
    for (final goalKey in goals) {
      if (out.length >= kPuzzlesPerLevel) break;
      if (!seen.add('${start.key}>$goalKey')) continue;
      out.add({
        'start': start.key.split('|').map((p) => p.split('')).toList(),
        'goal': goalKey.split('|').map((p) => p.split('')).toList(),
        'minMoves': rung.plan,
        'caps': rung.caps,
      });
    }
  }
  return out;
}

void main() {
  final seed = int.tryParse(Platform.environment['TOL_SEED'] ?? '') ?? 20260924;
  final out = Platform.environment['TOL_OUT'] ?? 'assets/levels/tower_london.json';
  final rnd = Random(seed);

  final levels = <Map<String, dynamic>>[];
  for (final rung in ladder()) {
    final puzzles = puzzlesFor(rung, rnd);
    if (puzzles.length < kPuzzlesPerLevel) {
      stderr.writeln('L${rung.level}: задач нашлось только ${puzzles.length} '
          'из $kPuzzlesPerLevel на плане ${rung.plan} — ступень недобрана');
      exit(2);
    }
    levels.add({
      'level': rung.level,
      'targetMoves': rung.plan,
      'balls': rung.balls.length,
      'puzzles': puzzles,
    });
  }

  // 🔴 ВЫГРУЗКА ПРОВЕРЯЕТ СЕБЯ ДО ЗАПИСИ. Между поиском задач и файлом лежит
  // сборка уровня, и однажды она уже теряла данные молча (случай товаров).
  for (final lv in levels) {
    final ps = (lv['puzzles'] as List).cast<Map<String, dynamic>>();
    final keys = ps.map((p) => '${p['start']}>${p['goal']}').toSet();
    if (keys.length != ps.length) {
      stderr.writeln('L${lv['level']}: в ступени повторяются задачи');
      exit(3);
    }
    for (final p in ps) {
      final caps = (p['caps'] as List).cast<int>();
      final start = TolState(
          (p['start'] as List).map((e) => (e as List).cast<String>()).toList(), caps);
      final goalKey = (p['goal'] as List).map((e) => (e as List).cast<String>().join()).join('|');
      final d = distances(start)[goalKey];
      if (d != p['minMoves']) {
        stderr.writeln('L${lv['level']}: заявлен план ${p['minMoves']}, а поиск даёт $d');
        exit(4);
      }
    }
  }

  final data = {
    'generator': 'tower-london: ядро игры (TolState.legalMoves/move) + поиск в ширину, '
        'tool/export_tol_levels.dart',
    'seed': seed,
    'rounds': kRounds,
    'levels': levels,
  };
  File(out).writeAsStringSync('${const JsonEncoder.withIndent(' ').convert(data)}\n');

  final plans = levels.map((l) => l['targetMoves']).join(', ');
  stdout.writeln('ВЫГРУЗКА: ${levels.length} ступеней по $kPuzzlesPerLevel задач, '
      'зерно $seed → $out');
  stdout.writeln('ПЛАНЫ ПО СТУПЕНЯМ: $plans');
}
