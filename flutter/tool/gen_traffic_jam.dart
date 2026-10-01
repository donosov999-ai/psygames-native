// ignore_for_file: avoid_print
/// ВЫГРУЗКА БАНКА ДОСОК «ОСВОБОДИ ПУТЬ» → `assets/levels/traffic_jam.json`.
///
/// Запуск (из flutter/):  dart run tool/gen_traffic_jam.dart
/// Переменные: TJ_SEED (зерно, по умолчанию 20260930), TJ_OUT (куда писать),
/// TJ_TRIES (сколько расстановок перебрать, по умолчанию 15000).
///
/// 🔴 ЗАЧЕМ ЭТОТ ФАЙЛ В РЕПОЗИТОРИИ. Банк — данные, и без выгрузки рядом их нечем
/// пересобрать (урок товаров и Лондонской башни 24.09: файл уровней есть, инструмента
/// нет). Правила ходов при этом берутся из `lib/games/traffic_jam/model.dart` — тем же
/// кодом, что играет человек, поэтому «минимум ходов» в файле и на экране не разойдутся.
///
/// КАК ИЩЕТСЯ ТРУДНАЯ ДОСКА. Случайная расстановка машин задаёт связную компоненту
/// положений (ходы обратимы: машина может уехать туда, откуда приехала). Внутри неё
/// поиск в ширину ОТ ВСЕХ решённых положений разом даёт каждому положению настоящий
/// минимум ходов, и берётся самое дальнее. Приём тот же, что у полного перебора
/// Майкла Фоглмана (github.com/fogleman/rush, MIT), но код свой и базу мы не качаем:
/// случайных компонент хватает на лестницу до 30+ ходов.
///
/// ⚠️ ПРОВЕРКА ДО ЗАПИСИ. Каждая отобранная доска перерешивается поиском модели
/// (`tjSolve`), и число ходов обязано совпасть с найденным здесь до единицы. Иначе
/// выгрузка падает, а не пишет.
library;

import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/traffic_jam/model.dart';

/// Быстрый обход: машины — массивы, положение — позиции, занятость — битовая маска.
class _Fast {
  _Fast(this.board)
      : n = board.cars.length,
        masks = [
          for (var i = 0; i < board.cars.length; i++)
            [
              for (var p = 0; p + board.cars[i].length <= tjSize; p++)
                board.cellsOf(i, List<int>.generate(board.cars.length, (k) => k == i ? p : board.positions[k]))
                    .fold<int>(0, (m, c) => m | (1 << c)),
            ],
        ];

  final TjBoard board;
  final int n;

  /// masks[машина][позиция] — клетки машины битами.
  final List<List<int>> masks;

  int encode(List<int> pos) {
    var k = 0;
    for (var i = n - 1; i >= 0; i--) {
      k = k * 5 + pos[i];
    }
    return k;
  }

  List<int> decode(int k) {
    final pos = List<int>.filled(n, 0);
    for (var i = 0; i < n; i++) {
      pos[i] = k % 5;
      k ~/= 5;
    }
    return pos;
  }

  List<int> neighbours(int key) {
    final pos = decode(key);
    var occ = 0;
    for (var i = 0; i < n; i++) {
      occ |= masks[i][pos[i]];
    }
    final out = <int>[];
    var pow = 1;
    for (var i = 0; i < n; i++) {
      final own = occ & ~masks[i][pos[i]];
      final top = masks[i].length - 1;
      for (var p = pos[i] - 1; p >= 0 && (masks[i][p] & own) == 0; p--) {
        out.add(key + (p - pos[i]) * pow);
      }
      for (var p = pos[i] + 1; p <= top && (masks[i][p] & own) == 0; p++) {
        out.add(key + (p - pos[i]) * pow);
      }
      pow *= 5;
    }
    return out;
  }

  bool solved(int key) => key % 5 + board.cars[0].length == tjSize;
}

/// Случайная расстановка: красная в третьем ряду, остальные — куда встанут.
TjBoard _random(Random rnd, int others) {
  final cars = <TjCar>[const TjCar(horizontal: true, fixed: tjExitRow, length: 2)];
  final pos = <int>[rnd.nextInt(3)];
  var occ = 0;
  for (final c in TjBoard(cars, pos).cellsOf(0)) {
    occ |= 1 << c;
  }
  var tries = 0;
  while (cars.length <= others && tries++ < 400) {
    final h = rnd.nextBool();
    final len = rnd.nextInt(4) == 0 ? 3 : 2;
    final fixed = rnd.nextInt(tjSize);
    // Горизонтальная машина в ряду выезда встала бы справа от красной навсегда.
    if (h && fixed == tjExitRow) continue;
    final p = rnd.nextInt(tjSize - len + 1);
    var m = 0;
    for (var k = 0; k < len; k++) {
      m |= 1 << (h ? fixed * tjSize + p + k : (p + k) * tjSize + fixed);
    }
    if (m & occ != 0) continue;
    occ |= m;
    cars.add(TjCar(horizontal: h, fixed: fixed, length: len));
    pos.add(p);
  }
  return TjBoard(cars, pos);
}

/// Самое дальнее от решения положение компоненты и его минимум ходов.
/// `null` — компонента без решения или больше потолка.
(TjBoard, int)? _hardest(TjBoard start, {int cap = 150000}) {
  final f = _Fast(start);
  final s0 = f.encode(start.positions);
  final index = <int, int>{s0: 0};
  final keys = <int>[s0];
  final adj = <List<int>>[];
  for (var i = 0; i < keys.length; i++) {
    final nb = f.neighbours(keys[i]);
    final ids = <int>[];
    for (final k in nb) {
      var id = index[k];
      if (id == null) {
        id = keys.length;
        index[k] = id;
        keys.add(k);
        if (keys.length > cap) return null;
      }
      ids.add(id);
    }
    adj.add(ids);
  }
  final dist = List<int>.filled(keys.length, -1);
  final q = Queue<int>();
  for (var i = 0; i < keys.length; i++) {
    if (f.solved(keys[i])) {
      dist[i] = 0;
      q.add(i);
    }
  }
  if (q.isEmpty) return null;
  while (q.isNotEmpty) {
    final i = q.removeFirst();
    for (final j in adj[i]) {
      if (dist[j] == -1) {
        dist[j] = dist[i] + 1;
        q.add(j);
      }
    }
  }
  var best = 0;
  for (var i = 1; i < keys.length; i++) {
    if (dist[i] > dist[best]) best = i;
  }
  return (TjBoard(start.cars, f.decode(keys[best])), dist[best]);
}

/// Цель лестницы: минимум ходов на ступени [level] из [levels].
int target(int level, int levels, int top) {
  if (level <= 2) return level + 1; // 2 и 3 хода — знакомство
  final t = (level - 3) / (levels - 3);
  return (4 + t * (top - 4)).round();
}

void main() {
  final seed = int.tryParse(Platform.environment['TJ_SEED'] ?? '') ?? 20260930;
  final out = Platform.environment['TJ_OUT'] ?? 'assets/levels/traffic_jam.json';
  const levels = 60;
  final tries = int.tryParse(Platform.environment['TJ_TRIES'] ?? '') ?? 15000;
  final rnd = Random(seed);
  final byMoves = <int, List<TjBoard>>{};
  final seen = <String>{};
  final t0 = DateTime.now();
  var tried = 0;
  // Перебор: чем больше машин, тем чаще длинные решения, но тем чаще и тупики.
  while (tried < tries) {
    tried++;
    final b = _random(rnd, 7 + rnd.nextInt(7));
    final h = _hardest(b);
    if (h == null) continue;
    final (board, d) = h;
    if (d < 2) continue;
    // Одна и та же доска в банке дважды — фальшивая новая ступень.
    final rowsKey = board.toRows().join('/');
    if (!seen.add(rowsKey)) continue;
    byMoves.putIfAbsent(d, () => []).add(board);
  }
  // Верх лестницы — не рекорд перебора, а минимум ходов, досок с которым и выше
  // набирается с запасом на верхние ступени: рекорд бывает в одном экземпляре, а
  // ступень, не нашедшая доски своей цели, берёт следующую по трудности — и оставляет
  // пустоту выше (прогоны 30.09: 32 хода — одна доска; запас 6 кончился на L57).
  final sortedD = byMoves.keys.toList()..sort();
  var top = sortedD.first;
  for (final d in sortedD) {
    final atLeast = sortedD.where((x) => x >= d).fold<int>(0, (s, x) => s + byMoves[x]!.length);
    if (atLeast >= 12) top = d;
  }
  final dist = (byMoves.keys.toList()..sort()).map((d) => '$d:${byMoves[d]!.length}').join(' ');
  print('перебрано $tried расстановок за ${DateTime.now().difference(t0).inSeconds} с; '
      'досок по минимуму ходов: $dist');

  // Лестница: на каждую ступень — доска с минимумом ходов, ближайшим к цели и не
  // меньше, чем у предыдущей (человек идёт подряд — провалов назад быть не должно).
  final used = <String>{};
  final bank = <TjLevel>[];
  var floor = 2;
  for (var level = 1; level <= levels; level++) {
    final want = max(target(level, levels, top), floor);
    TjBoard? pick;
    var got = 0;
    for (var d = want; d <= top && pick == null; d++) {
      for (final b in byMoves[d] ?? const <TjBoard>[]) {
        final k = b.toRows().join('/');
        if (used.contains(k)) continue;
        pick = b;
        got = d;
        used.add(k);
        break;
      }
    }
    if (pick == null) throw StateError('ступень $level: нет доски на $want+ ходов');
    // Проверка до записи: поиск модели обязан найти ровно столько же ходов.
    final solved = tjSolve(TjBoard.parse(pick.toRows()), maxStates: 400000);
    if (solved.length != got) {
      throw StateError('ступень $level: выгрузка насчитала $got ходов, поиск модели — ${solved.length}');
    }
    bank.add(TjLevel(id: 'tj-${level.toString().padLeft(3, '0')}', rows: pick.toRows(), minMoves: got));
    floor = got;
  }
  final data = {
    'generator': 'tool/gen_traffic_jam.dart — самое дальнее от решения положение '
        'связной компоненты случайной расстановки; ход = проезд машины на любое число клеток',
    'seed': seed,
    'tried': tried,
    'levels': [for (final l in bank) l.toJson()],
  };
  File(out).writeAsStringSync('${const JsonEncoder.withIndent(' ').convert(data)}\n');
  print('ЛЕСТНИЦА: ${bank.map((l) => l.minMoves).join(' ')}');
  print('записано ${bank.length} досок → $out');
}
