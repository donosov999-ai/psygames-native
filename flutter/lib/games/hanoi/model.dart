/// ПРАВИЛА «ХАНОЙСКОЙ БАШНИ» — перенос `src/games/hanoi/optimal.ts` и правила
/// хода из живого экрана (`app/games/hanoi.tsx`).
///
/// 🔴 ОПТИМУМ ДЛЯ ЧЕТЫРЁХ И БОЛЕЕ СТЕРЖНЕЙ — НЕ «2ⁿ − 1». С пятого уровня в игре
/// появляется четвёртый стержень, и минимум считается формулой Фрейма-Стюарта
/// перебором разбиений: на 9 дисках это 41 ход против 511. Поставь степень
/// двойки — и звёзды начнут врать ровно там, где игра становится интереснее.
///
/// ⚠️ ПРОВАЛА ПО ЧИСЛУ ОШИБОК ЗДЕСЬ ПОКА НЕТ, И ЭТО НЕ НЕДОСМОТР. Решение Дениса
/// 23.09.2026 («провал по количеству ошибок, уровни не понижать») ведётся
/// отдельной задачей f911ecd2 у координатора: сначала замер, как это делают
/// другие, потом порог. Перенос повторяет нынешнее поведение и не опережает его.
library;

import 'dart:convert';

/// Минимум ходов. Для трёх стержней — степень двойки, дальше перебор разбиений.
///
/// ⚠️ ЗНАЧЕНИЯ КЭШИРУЮТСЯ: без памяти перебор пересчитывает одно и то же дерево
/// и на 12 дисках заметно тормозит прямо в отрисовке.
final Map<String, int> _cache = {};

int frameStewart(int n, int pegs) {
  if (n <= 0) return 0;
  if (n == 1) return 1;
  if (pegs < 3) throw ArgumentError('Ханой: $pegs стержня(ей) — задача неразрешима');
  if (pegs == 3) {
    var v = 1;
    for (var i = 0; i < n; i += 1) {
      v *= 2;
    }
    return v - 1;
  }
  final key = '$n:$pegs';
  final ready = _cache[key];
  if (ready != null) return ready;
  var best = 1 << 62;
  for (var k = 1; k < n; k += 1) {
    final v = 2 * frameStewart(k, pegs) + frameStewart(n - k, pegs - 1);
    if (v < best) best = v;
  }
  _cache[key] = best;
  return best;
}

/// Счёт партии: за лишние ходы снимается по 50, за секунды — по одной.
int hanoiScore(int moves, int min, int seconds) {
  final v = (1000 - (moves - min) * 50 - seconds).round();
  return v < 0 ? 0 : v;
}

/// Звёзды: ровно минимум — три; до полутора минимумов — две; дальше одна.
int hanoiStars(int moves, int min) {
  if (moves <= min) return 3;
  if (moves <= (min * 1.5).ceil()) return 2;
  return 1;
}

/// Уровень: сначала растут диски на трёх стержнях, потом появляется четвёртый и
/// пятый — новый стержень это новый вызов (решение резко короче), после чего
/// снова растут диски.
({int discs, int pegs}) levelParams(int level) {
  if (level <= 4) return (discs: 2 + level, pegs: 3);
  if (level <= 9) return (discs: level < 9 ? level : 9, pegs: 4);
  final d = level - 1;
  return (discs: d < 12 ? d : 12, pegs: 5);
}

/// Стержни: снизу вверх, число — размер диска (больше = шире).
class HanoiState {
  HanoiState(this.pegs, this.discs);

  factory HanoiState.start(int level) {
    final p = levelParams(level);
    return HanoiState.ofDiscs(p.discs, p.pegs);
  }

  /// Доска из заданного числа дисков и стержней — МИНУЯ лестницу.
  ///
  /// 🔴 НУЖНА ШАГУ ЗАРЯДКИ: плейлист задаёт доску сам (`?wu=1&discs=5`), и брать
  /// её из личного уровня игрока в этом случае неверно — человек играл бы не то,
  /// что ему назначено. Обычный заход по-прежнему идёт через `HanoiState.start`.
  factory HanoiState.ofDiscs(int discs, int pegs) {
    final first = [for (var i = 0; i < discs; i += 1) discs - i];
    return HanoiState(
      [first, for (var i = 1; i < pegs; i += 1) <int>[]],
      discs,
    );
  }

  final List<List<int>> pegs;
  final int discs;

  HanoiState copy() => HanoiState(pegs.map((p) => [...p]).toList(), discs);

  /// Можно ли переложить: снимаем верхний и кладём ТОЛЬКО на больший или на
  /// пустой стержень.
  bool canMove(int from, int to) {
    if (from == to) return false;
    if (from < 0 || to < 0 || from >= pegs.length || to >= pegs.length) return false;
    final src = pegs[from];
    if (src.isEmpty) return false;
    final dst = pegs[to];
    return dst.isEmpty || dst.last > src.last;
  }

  /// Новое положение после хода; null — ход незаконен (в игре это ОШИБКА, и она
  /// считается отдельно от ходов).
  HanoiState? move(int from, int to) {
    if (!canMove(from, to)) return null;
    final next = copy();
    next.pegs[to].add(next.pegs[from].removeLast());
    return next;
  }

  /// Победа: все диски на ПОСЛЕДНЕМ стержне (правило одно на 3, 4 и 5 стержней).
  bool get solved => pegs.last.length == discs;

  Map<String, dynamic> toJson() => {'pegs': pegs.map((p) => [...p]).toList(), 'discs': discs};

  static HanoiState fromJson(Map<String, dynamic> j) => HanoiState(
        (j['pegs'] as List).map((p) => (p as List).cast<int>()).toList(),
        j['discs'] as int,
      );

  static HanoiState fromJsonString(String raw) =>
      HanoiState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}
