/// ПРАВИЛА МАДЖОНГА — ПЕРЕНОС С ЖИВОГО TS, А НЕ ПЕРЕСКАЗ.
///
/// Источники переноса, файл в файл:
///   `frontend/src/games/mahjong/board.ts`            — свобода плитки и доступные пары;
///   `frontend/src/games/mahjong/layouts.ts`          — выбор раскладки уровня и ужатие;
///   `frontend/src/games/mahjong/vendor/solvable.ts`  — раздача, решаемая по построению;
///   `frontend/src/games/mahjong/stuck.ts`            — выходы из вставшей доски;
///   `frontend/src/services/mahjongLevels.ts`         — лестница уровней.
///
/// 🔴 Сверка — не этой же формулой: `test/mahjong_test.dart` сравнивает каждое число
/// с эталонами `test/fixtures/mahjong-reference.json`, выгруженными прогоном того TS.
/// Раздача сверяется по СПИСКУ брошенных чисел: те же броски — те же плитки.
///
/// ⚠️ Раскладки — чужие данные: ffalt/mah, MIT, «Copyright (c) 2016 ffalt».
/// Лежат ресурсом `assets/levels/mahjong_layouts.json`, уведомление об авторстве —
/// полем `license` внутри файла и здесь. Полный текст лицензии:
/// `frontend/src/games/mahjong/vendor/LICENSE-mah`.
library;

import 'dart:convert';
import 'dart:math';

/// Плитка на доске. x, y — в ПОЛУКЛЕТКАХ: плитка занимает 2×2 полуклетки.
class Tile {
  Tile({required this.id, required this.x, required this.y, required this.layer, this.symbol = -1});

  final int id;
  final int x;
  final int y;
  final int layer;
  int symbol;
}

/// Место под плитку в раскладке.
class Place {
  const Place({required this.x, required this.y, required this.layer});

  final int x;
  final int y;
  final int layer;
}

/// Перекрывает ли позиция позицию: плитка 2×2 в полуклетках.
bool overlaps(int ax, int ay, int bx, int by) => (ax - bx).abs() < 2 && (ay - by).abs() < 2;

/// Накрыта ли плитка сверху — половина (а) правила свободы, отдельным именем:
/// на скрытых уровнях лицо видно, только когда сверху никто не лежит.
bool coveredFromAbove(List<Tile> tiles, List<bool> alive, int i) {
  final t = tiles[i];
  for (var j = 0; j < tiles.length; j += 1) {
    if (!alive[j] || j == i) continue;
    if (tiles[j].layer > t.layer && overlaps(tiles[j].x, tiles[j].y, t.x, t.y)) return true;
  }
  return false;
}

/// Свободна ли плитка: (а) сверху ничего, (б) свободен левый ИЛИ правый бок.
bool isFree(List<Tile> tiles, List<bool> alive, int i) {
  final t = tiles[i];
  for (var j = 0; j < tiles.length; j += 1) {
    if (!alive[j] || j == i) continue;
    if (tiles[j].layer > t.layer && overlaps(tiles[j].x, tiles[j].y, t.x, t.y)) return false;
  }
  var blockedL = false;
  var blockedR = false;
  for (var j = 0; j < tiles.length; j += 1) {
    if (!alive[j] || j == i) continue;
    if (tiles[j].layer != t.layer) continue;
    if ((tiles[j].y - t.y).abs() < 2) {
      if ((tiles[j].x - (t.x - 2)).abs() < 1) blockedL = true;
      if ((tiles[j].x - (t.x + 2)).abs() < 1) blockedR = true;
    }
  }
  return !(blockedL && blockedR);
}

/// Кто именно держит плитку — для подсказки «почему не нажимается».
List<int> blockersOf(List<Tile> tiles, List<bool> alive, int i) {
  final t = tiles[i];
  final out = <int>[];
  final left = <int>[];
  final right = <int>[];
  for (var j = 0; j < tiles.length; j += 1) {
    if (!alive[j] || j == i) continue;
    final b = tiles[j];
    if (b.layer > t.layer && overlaps(b.x, b.y, t.x, t.y)) {
      out.add(j);
      continue;
    }
    if (b.layer != t.layer) continue;
    if ((b.y - t.y).abs() >= 2) continue;
    if ((b.x - (t.x - 2)).abs() < 1) left.add(j);
    if ((b.x - (t.x + 2)).abs() < 1) right.add(j);
  }
  // Бока держат ТОЛЬКО вдвоём: свободного бока достаточно, чтобы снять плитку.
  if (left.isNotEmpty && right.isNotEmpty) out.addAll([...left, ...right]);
  return out;
}

/// Свобода всех плиток разом — один проход по парам вместо обхода на каждую.
List<bool> freeFlags(List<Tile> tiles, List<bool> alive) {
  final n = tiles.length;
  final covered = List<bool>.filled(n, false);
  final blockedL = List<bool>.filled(n, false);
  final blockedR = List<bool>.filled(n, false);
  for (var i = 0; i < n; i += 1) {
    if (!alive[i]) continue;
    final a = tiles[i];
    for (var j = i + 1; j < n; j += 1) {
      if (!alive[j]) continue;
      final b = tiles[j];
      if (a.layer != b.layer) {
        if (overlaps(a.x, a.y, b.x, b.y)) {
          if (b.layer > a.layer) {
            covered[i] = true;
          } else {
            covered[j] = true;
          }
        }
        continue;
      }
      if ((a.y - b.y).abs() >= 2) continue;
      if ((b.x - (a.x - 2)).abs() < 1) {
        blockedL[i] = true;
        blockedR[j] = true;
      } else if ((b.x - (a.x + 2)).abs() < 1) {
        blockedR[i] = true;
        blockedL[j] = true;
      }
    }
  }
  return List<bool>.generate(n, (i) => alive[i] && !covered[i] && !(blockedL[i] && blockedR[i]));
}

/// Сколько пар можно снять ПРЯМО СЕЙЧАС. Считаются сочетания: три одинаковые
/// свободные плитки — это три разных хода, а не один.
int availablePairs(List<Tile> tiles, List<bool> alive) {
  final free = freeFlags(tiles, alive);
  final bySymbol = <int, int>{};
  for (var i = 0; i < tiles.length; i += 1) {
    if (!free[i]) continue;
    bySymbol[tiles[i].symbol] = (bySymbol[tiles[i].symbol] ?? 0) + 1;
  }
  var pairs = 0;
  for (final k in bySymbol.values) {
    pairs += k * (k - 1) ~/ 2;
  }
  return pairs;
}

// ── ЛЕСТНИЦА ────────────────────────────────────────────────────────────────

/// Классический набор: 144 плитки = 72 пары. Больше не бывает.
const int fullSetPairs = 72;

class MahjongLevelCfg {
  const MahjongLevelCfg({
    required this.layers,
    required this.pairs,
    required this.cols,
    required this.shuffles,
  });

  final int layers;
  final int pairs;
  final int cols;

  /// Лимит перетасовок; −1 = без лимита (первые уровни).
  final int shuffles;

  String get signature => '$layers|$pairs|$cols|$shuffles';
}

/// Первые уровни — уже настоящий маджонг: два слоя с первого, три с четвёртого.
/// Плоских раскладок нет вовсе: без перекрытий игра перестаёт быть маджонгом.
MahjongLevelCfg mahjongLevel(int level) {
  final n = level < 1 ? 1 : level;
  if (n <= 3) return MahjongLevelCfg(layers: 2, pairs: 8 + n * 2, cols: 8, shuffles: -1);
  if (n <= 8) return MahjongLevelCfg(layers: 3, pairs: 14 + (n - 3) * 2, cols: 9, shuffles: 3);
  if (n <= 14) return MahjongLevelCfg(layers: 4, pairs: 24 + (n - 8) * 3, cols: 10, shuffles: 2);
  if (n <= 22) return MahjongLevelCfg(layers: 5, pairs: 42 + (n - 14) * 3, cols: 11, shuffles: 1);
  return MahjongLevelCfg(
    layers: 5,
    pairs: (66 + (n - 22)) < fullSetPairs ? 66 + (n - 22) : fullSetPairs,
    cols: 12,
    shuffles: 1,
  );
}

/// Докуда лестница РЕАЛЬНО растёт — перебором, а не вписанным числом.
final int mahjongLevels = () {
  var last = 1;
  var prev = mahjongLevel(1).signature;
  for (var level = 2; level <= 200; level += 1) {
    final cur = mahjongLevel(level).signature;
    if (cur != prev) {
      last = level;
      prev = cur;
    }
  }
  return last;
}();

/// Скрытая информация — каждый третий уровень с десятого.
const int mahjongHiddenFrom = 10;

bool mahjongHidden(int level) =>
    level >= mahjongHiddenFrom && (level - mahjongHiddenFrom) % 3 == 0;

int shufflesLeft(int budget, int used) => budget < 0 ? -1 : max(0, budget - used);

bool canShuffle(int budget, int used) => budget < 0 || used < budget;

// ── РАСКЛАДКИ ───────────────────────────────────────────────────────────────

/// Ширина, после которой доска не читается на телефоне (26 полуклеток).
const int maxLayoutHalfX = 26;

class MahjongLayout {
  const MahjongLayout({
    required this.id,
    required this.name,
    required this.cat,
    required this.places,
    required this.layers,
    required this.width,
    required this.height,
  });

  final String id;
  final String name;
  final String cat;
  final List<Place> places;
  final int layers;
  final int width;
  final int height;
}

class LevelLayout {
  const LevelLayout({required this.layout, required this.places});

  final MahjongLayout layout;
  final List<Place> places;
}

/// Библиотека раскладок из ресурса. Данные чужие (ffalt/mah, MIT) — см. шапку.
class MahjongLayouts {
  MahjongLayouts(this.all);

  factory MahjongLayouts.fromJson(String raw) {
    final data = jsonDecode(raw) as Map<String, dynamic>;
    final list = (data['layouts'] as List).map((e) {
      final m = e as Map<String, dynamic>;
      final flat = (m['zxy'] as List).cast<int>();
      final places = <Place>[];
      for (var i = 0; i + 2 < flat.length; i += 3) {
        places.add(Place(layer: flat[i], x: flat[i + 1], y: flat[i + 2]));
      }
      return MahjongLayout(
        id: m['id'] as String,
        name: m['name'] as String,
        cat: m['cat'] as String,
        places: places,
        layers: m['layers'] as int,
        width: m['width'] as int,
        height: m['height'] as int,
      );
    }).toList();
    return MahjongLayouts(list);
  }

  final List<MahjongLayout> all;
  final Map<int, LevelLayout?> _perLevel = {};

  /// Годится ли раскладка под заказ уровня — дёшево, без самой сборки.
  bool _eligible(MahjongLayout l, int layers, int need) {
    if (l.layers < layers) return false;
    var cnt = 0;
    for (final p in l.places) {
      if (p.layer < layers) cnt += 1;
    }
    return cnt >= need;
  }

  /// КАКАЯ РАСКЛАДКА У УРОВНЯ. Детерминированно: уровень 7 сегодня и через месяц
  /// выглядит одинаково, иначе поднятая из хранилища партия оживала бы другой доской.
  /// Шаг 29 (простое) по списку годных — соседние уровни почти никогда не совпадают.
  LevelLayout? forLevel(int level) {
    final n = level < 1 ? 1 : level;
    if (_perLevel.containsKey(n)) return _perLevel[n];

    final p = mahjongLevel(n);
    final need = p.pairs * 2;
    final fit = all.where((l) => _eligible(l, p.layers, need)).toList();
    LevelLayout? answer;
    if (fit.isNotEmpty) {
      final start = (n * 29) % fit.length;
      LevelLayout? wide;   // подходит, но широковата — запасной вариант
      for (var k = 0; k < fit.length && answer == null; k += 1) {
        final layout = fit[(start + k) % fit.length];
        final kept = reduceLayout(layout.places, p.layers, need);
        if (kept == null) continue;
        final places = normalize(kept);
        var w = 0;
        for (final q in places) {
          if (q.x + 2 > w) w = q.x + 2;
        }
        if (w <= maxLayoutHalfX) {
          answer = LevelLayout(layout: layout, places: places);
        } else {
          wide ??= LevelLayout(layout: layout, places: places);
        }
      }
      answer ??= wide;
    }
    _perLevel[n] = answer;
    return answer;
  }
}

/// Прижать доску к нулю: пустые строки сверху и колонки слева отбирают у плиток пиксели.
List<Place> normalize(List<Place> places) {
  if (places.isEmpty) return const [];
  var minX = places.first.x;
  var minY = places.first.y;
  for (final q in places) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
  }
  return places.map((q) => Place(x: q.x - minX, y: q.y - minY, layer: q.layer)).toList();
}

/// УЖАТЬ РАСКЛАДКУ ДО ЗАКАЗА УРОВНЯ. `null` = такой доски из неё не выйдет.
///
/// Снимается по одной НЕПРИКРЫТОЙ плитке; кого снять, решает счёт
/// «доля слоя × 1e6 + квадрат расстояния от центра слоя»: доля держит пропорции
/// стопки (низ широкий, верх узкий), расстояние срезает по контуру, а не изнутри.
/// Пол у слоя сначала две плитки и лишь потом одна — иначе сжатие встаёт наглухо
/// там, где верхушка раскладки и есть одна плитка.
List<Place>? reduceLayout(List<Place> places, int maxLayers, int need) {
  final keep = places.where((p) => p.layer < maxLayers).toList();
  if (need <= 0 || keep.length < need) return null;
  final n = keep.length;
  var nLayers = 0;
  for (final p in keep) {
    if (p.layer + 1 > nLayers) nLayers = p.layer + 1;
  }

  final under = List<List<int>>.generate(n, (_) => <int>[]);
  final above = List<int>.filled(n, 0);
  for (var i = 0; i < n; i += 1) {
    final a = keep[i];
    for (var j = 0; j < n; j += 1) {
      if (i == j) continue;
      final b = keep[j];
      if (b.layer > a.layer && (b.x - a.x).abs() < 2 && (b.y - a.y).abs() < 2) {
        under[j].add(i);
        above[i] += 1;
      }
    }
  }

  final alive = List<bool>.filled(n, true);
  final cur = List<int>.filled(nLayers, 0);
  for (final p in keep) {
    cur[p.layer] += 1;
  }
  final orig = List<int>.from(cur);
  var count = n;

  while (count > need) {
    final cx = List<double>.filled(nLayers, 0);
    final cy = List<double>.filled(nLayers, 0);
    for (var i = 0; i < n; i += 1) {
      if (!alive[i]) continue;
      final p = keep[i];
      cx[p.layer] += p.x;
      cy[p.layer] += p.y;
    }
    for (var k = 0; k < nLayers; k += 1) {
      if (cur[k] > 0) {
        cx[k] = cx[k] / cur[k];
        cy[k] = cy[k] / cur[k];
      }
    }
    var best = -1;
    for (var floor = 2; floor >= 1 && best < 0; floor -= 1) {
      var bestScore = -1.0;
      for (var i = 0; i < n; i += 1) {
        if (!alive[i] || above[i] > 0) continue;
        final p = keep[i];
        if (cur[p.layer] <= floor) continue;
        final dx = p.x - cx[p.layer];
        final dy = p.y - cy[p.layer];
        final score = (cur[p.layer] / orig[p.layer]) * 1e6 + dx * dx + dy * dy;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    if (best < 0) return null;
    alive[best] = false;
    cur[keep[best].layer] -= 1;
    count -= 1;
    for (final i in under[best]) {
      above[i] -= 1;
    }
  }

  // Координаты не сдвигаем: ужатая доска обязана остаться подмножеством исходной.
  return [for (var i = 0; i < n; i += 1) if (alive[i]) keep[i]];
}

// ── ПОКАЗ СЛОЁВ ────────────────────────────────────────────────────────────
//
// 🔴 Формулы перенесены, а не подобраны на глаз. Доступность считается по СЕТКЕ,
// а рисуется плитка со сдвигом, который о сетке не знает и накапливается по слоям:
// стоит сдвигу набежать больше полуклетки — картинка начинает врать. Замер веба по
// всем 40 уровням: прежняя формула давала 4283 плитки «выглядит накрытой, но
// свободна» и 369 «накрыта, но не видно»; эта — 0 и 0.

/// На сколько пикселей поднимать каждый слой.
int layerOffsetFor(int maxLayer) => max(1, 6 ~/ max(1, maxLayer));

/// Чем выше слой, тем плитка мельче — но не мельче 0,7 от базовой.
double tileScaleFor(int layer, int maxLayer) {
  if (maxLayer <= 0) return 1;
  final step = min(0.07, 0.1 / maxLayer);
  return max(0.7, 1 - layer * step);
}

/// Затемнение слоя: нижние этажи глубже в тени.
double layerShadeFor(int layer, int maxLayer) {
  if (maxLayer <= 0) return 0;
  final fromTop = maxLayer - layer;
  return (fromTop / maxLayer) * 0.36;
}

/// Занятая плитка темнее свободной. Потолок 0,92 — за ним кость перестаёт
/// просвечивать вовсе и плитка становится чёрным прямоугольником.
const double busyShade = 0.3;

double tileShadeFor(int layer, int maxLayer, bool free) =>
    min(0.92, layerShadeFor(layer, maxLayer) + (free ? 0 : busyShade));

/// Оттенок слоя: чем выше, тем светлее.
String layerTintFor(int layer, int maxLayer) {
  if (maxLayer <= 0) return '#f8fafc';
  const tones = ['#ffffff', '#eef2f7', '#dde5ef', '#ccd7e6', '#bccadd'];
  final fromTop = maxLayer - layer;
  return tones[min(fromTop, tones.length - 1)];
}

/// Где рисовать плитку. Подъём считается ОТ САМОГО ВЕРХНЕГО слоя вниз, поэтому
/// отрицательных координат не бывает по построению: раньше верхняя плитка верхней
/// строки уезжала за край контейнера и обрезалась.
({int left, int top}) tilePlacement(int x, int y, int layer, int maxLayer, int half, int layerOffset) =>
    (left: x * half + layer * layerOffset, top: y * half + (maxLayer - layer) * layerOffset);

/// Отмен на уровень — бюджет, как в вебе.
const int undosPerLevel = 3;

// ── РАЗДАЧА, РЕШАЕМАЯ ПО ПОСТРОЕНИЮ ────────────────────────────────────────

/// Раздача. `peelOrder` — пары в том порядке, в котором генератор их СНИМАЛ:
/// проигранная вперёд, эта последовательность и есть решение доски.
class Deal {
  const Deal({required this.tiles, required this.peelOrder});

  final List<Tile> tiles;
  final List<List<int>> peelOrder;

  bool get isEmpty => tiles.isEmpty;
}

/// Нечётное число мест — пары не сложатся, лишнее долой.
List<Place> pairedPlaces(List<Place> places) =>
    places.length.isEven ? places : places.sublist(0, places.length - 1);

/// Сколько раз пересобирать раздачу, прежде чем признать неудачу (у источника 2000;
/// замер 23.08.2026: худшая раскладка берёт разбор с 55 % с первой попытки, 60 заходов —
/// 10⁻²¹ на отказ).
const int _maxRuns = 60;

List<T> _shuffled<T>(List<T> arr, double Function() rnd) {
  final a = List<T>.from(arr);
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// ОДИН ЗАХОД: симулируем разбор полной доски, попутно раздавая символы.
/// Пустой ответ — заход упёрся в «свободных меньше двух», надо пересобрать.
Deal _dealOnce(List<Place> places, int symbolCount, double Function() rnd) {
  final total = places.length;
  final pairs = total ~/ 2;
  final tiles = [
    for (var i = 0; i < total; i += 1)
      Tile(id: i, x: places[i].x, y: places[i].y, layer: places[i].layer, symbol: -1),
  ];
  final alive = List<bool>.filled(total, true);
  final peelOrder = <List<int>>[];
  final symSeq = _shuffled(List<int>.generate(pairs, (k) => k % symbolCount), rnd);

  for (var p = 0; p < pairs; p += 1) {
    final flags = freeFlags(tiles, alive);
    final free = <int>[];
    for (var i = 0; i < total; i += 1) {
      if (flags[i]) free.add(i);
    }
    if (free.length < 2) return const Deal(tiles: [], peelOrder: []);
    final pick = _shuffled(free, rnd);
    final a = pick[0];
    final b = pick[1];
    tiles[a].symbol = symSeq[p];
    tiles[b].symbol = symSeq[p];
    alive[a] = false;
    alive[b] = false;
    peelOrder.add([a, b]);
  }
  return Deal(tiles: tiles, peelOrder: peelOrder);
}

/// РАЗДАЧА ПО МЕСТАМ РАСКЛАДКИ. Пустой ответ = не собралось за `maxRuns` заходов.
/// Повторы живут здесь: «доска решаема» — обещание этой функции, и держит его она сама.
Deal dealSolvable(
  List<Place> places,
  int symbolCount, {
  int maxRuns = _maxRuns,
  double Function()? rnd,
}) {
  final random = rnd ?? Random().nextDouble;
  final even = pairedPlaces(places);
  if (even.length < 2 || symbolCount < 1) return const Deal(tiles: [], peelOrder: []);
  for (var run = 0; run < max(1, maxRuns); run += 1) {
    final deal = _dealOnce(even, symbolCount, random);
    if (deal.tiles.isNotEmpty) return deal;
  }
  return const Deal(tiles: [], peelOrder: []);
}

// ── ВСТАВШАЯ ДОСКА ─────────────────────────────────────────────────────────

enum MahjongExit { shuffle, undo, restart }

class StuckInput {
  const StuckInput({
    required this.openPairs,
    required this.shufflesLeft,
    required this.shuffleDeals,
    required this.canUndo,
  });

  /// Ходов на доске сейчас — `availablePairs`.
  final int openPairs;

  /// Перетасовок осталось; −1 = без лимита.
  final int shufflesLeft;

  /// Перетасовка ПРОВЕРЕНА раздатчиком: она даст разбираемую доску.
  final bool shuffleDeals;

  final bool canUndo;
}

/// Выходы из положения. Пусто = доска жива. На вставшей доске список никогда не
/// пуст: последним стоит `restart` — это правда о положении, а не утешение.
List<MahjongExit> mahjongExits(StuckInput s) {
  if (s.openPairs > 0) return const [];
  final out = <MahjongExit>[];
  if (s.shufflesLeft != 0 && s.shuffleDeals) out.add(MahjongExit.shuffle);
  if (s.canUndo) out.add(MahjongExit.undo);
  if (out.isEmpty) out.add(MahjongExit.restart);
  return out;
}

/// Ключ строки под доской. `null` = доска жива.
String? mahjongStuckKey(StuckInput s) {
  final exits = mahjongExits(s);
  if (exits.isEmpty) return null;
  final shuffle = exits.contains(MahjongExit.shuffle);
  final undo = exits.contains(MahjongExit.undo);
  if (shuffle && undo) return 'mahjongNoPairs';
  if (shuffle) return 'mahjongStuckShuffle';
  if (undo) return 'mahjongStuckUndo';
  return 'mahjongStuckRestart';
}
