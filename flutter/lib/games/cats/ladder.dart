/// ЛЕСТНИЦА «КОШЕК» — ПО МЕРЕ, А НЕ ПО РАЗМЕРУ ПОЛЯ (задача a7987915, звено 3).
///
/// 🔴 ЗАМЕР, НА КОТОРОМ СТОИТ ТАБЛИЦА (01.10.2026, [gradeCats] на 1200 картах генератора:
/// поля 6…10 × рост областей `balance` 0 / 0,5 / 1, по 80 карт на сочетание):
///   · РАЗМЕР ТРУДНОСТИ НЕ ДАЁТ. При `balance 0` карт, которым нужен приём «касание»
///     (ступень 4), у 6×6 — 38 %, у 10×10 — 40 %; распределение ступеней почти одно и то
///     же. Прежняя лестница (сторона = 6 + (уровень−1)/3) росла именно размером — то есть
///     на месте.
///   · ТРУДНОСТЬ ДАЁТ РОВНОСТЬ ОБЛАСТЕЙ. С `balance 1` ступень 4 — у 55–70 % карт. Ступень 5
///     («без перебора не решить») встречается только при неровном росте: 7 из 80 на 6×6 и
///     10 из 80 на 7×7 при `balance 1`, 9 из 80 на 6×6 при 0,5 — и ни разу из 400 при 0.
///   · ВНУТРИ СТУПЕНИ КАРТЫ РАЗЛИЧАЕТ ЦЕНА (сумма ступеней всех применённых приёмов): на
///     ступени 4 у 8×8 и `balance 1` — от 18 до 68, медиана 32.
///
/// Поэтому ступень лестницы — это ОКНО МЕРЫ: нужный приём (`tier`) и диапазон цены.
/// Размер и рост областей подобраны там, где окно попадается чаще всего (от ~3 % карт у
/// верхних ступеней до ~30 % у средних), а не «чем дальше, тем больше». Окна идут вверх без
/// перекрытий: следующая ступень либо требует приёма сильнее, либо при том же приёме
/// дороже — это сторожит проба.
///
/// ⚠️ ГРАНИЦА, ПОДПИСАННАЯ ЗАМЕРОМ, А НЕ ПОТОЛОК. Последние ступени — перебор с растущей
/// ценой; перебор дороже 65 встречается у 0,1–0,8 % карт (замер 2000 карт на полях 6–8,
/// максимум 92). Следующая ось — число переборов за партию (`uses[CatsStep.trial] ≥ 2`) и
/// поля 11×11+; до замера не обещаем.
library;

import 'generator.dart';
import 'grade.dart';

/// Ступень: поле, рост областей и окно меры.
typedef CatsLevelCfg = ({int n, double balance, int tier, int minCost, int maxCost});

/// Нет верхней границы цены.
const int _open = 1 << 30;

/// Окна по замеру (доля карт сочетания, попадающих в окно, — в скобках; «~» — оценка по
/// квантилям 80 карт, точные — по 2000).
const List<CatsLevelCfg> _table = [
  (n: 6, balance: 0.0, tier: 1, minCost: 0, maxCost: _open),    // одно место (19 %)
  (n: 7, balance: 0.0, tier: 2, minCost: 0, maxCost: 13),       // запирание, коротко (~25 %)
  (n: 9, balance: 0.0, tier: 2, minCost: 14, maxCost: _open),   // запирание, долго (~30 %)
  (n: 9, balance: 1.0, tier: 3, minCost: 0, maxCost: 20),       // группа (~14 %)
  (n: 10, balance: 1.0, tier: 3, minCost: 21, maxCost: _open),  // группа, долго (~16 %)
  (n: 7, balance: 0.5, tier: 4, minCost: 0, maxCost: 27),       // касание (~30 %)
  (n: 8, balance: 1.0, tier: 4, minCost: 28, maxCost: 35),      // касание, дороже (~30 %)
  (n: 9, balance: 1.0, tier: 4, minCost: 36, maxCost: 44),      // (~22 %)
  (n: 10, balance: 0.5, tier: 4, minCost: 45, maxCost: _open),  // (~13 %)
  // Окна перебора — по ОТДЕЛЬНОМУ замеру на 2000 карт на сочетание: на 80 картах их
  // доля оценивалась по девяти точкам и вышла впятеро выше настоящей (проба поймала).
  (n: 6, balance: 1.0, tier: 5, minCost: 0, maxCost: 44),       // нужен перебор (5,3 %)
  (n: 7, balance: 1.0, tier: 5, minCost: 45, maxCost: 54),      // перебор дороже (1,7 %)
  (n: 8, balance: 1.0, tier: 5, minCost: 55, maxCost: _open),   // граница замера (1,9 %)
];

/// Сколько ступеней измерено.
int get catsLevelCount => _table.length;

/// Ступень по номеру уровня. Выше измеренного — последняя (см. «граница» в шапке).
CatsLevelCfg catsLevel(int level) => _table[(level - 1).clamp(0, _table.length - 1)];

/// Попадает ли мера в окно ступени.
bool inCatsWindow(CatsLevelCfg cfg, CatsGrade g) =>
    g.tier == cfg.tier && g.cost >= cfg.minCost && g.cost <= cfg.maxCost;

/// Раздача уровня: карта, её мера и попала ли она в окно.
class CatsDeal {
  const CatsDeal({required this.puzzle, required this.grade, required this.inWindow});
  final CatsPuzzle puzzle;
  final CatsGrade grade;
  final bool inWindow;
}

/// Карта уровня [level]: растим по зерну, пока мера не попадёт в окно ступени.
///
/// ⚠️ Зависать нельзя: не больше [attempts] карт, дальше отдаётся ближайшая к окну из
/// увиденных — сперва по приёму, потом по цене. 400 — от самого редкого окна (1,7 %):
/// промах (0,983^400) ≈ 0,1 %, в среднем ≈ 60 карт; карта с мерой стоит 1–2 мс на 6–8
/// клетках и до 13 мс на 10×10, где окна частые. Одна и та же строка [seed] — одна и та же
/// карта: проба и экран зовут эту функцию одинаково.
CatsDeal? dealCatsLevel(int level, String seed, {int attempts = 400}) {
  final cfg = catsLevel(level);
  CatsDeal? best;
  var bestGap = _open;
  for (var a = 0; a < attempts; a++) {
    final p = generateCats(cfg.n, '$seed|w$a', balance: cfg.balance);
    if (p == null) continue;
    final g = gradeCats(p.board);
    if (inCatsWindow(cfg, g)) return CatsDeal(puzzle: p, grade: g, inWindow: true);
    final costGap = g.cost < cfg.minCost ? cfg.minCost - g.cost : (g.cost > cfg.maxCost ? g.cost - cfg.maxCost : 0);
    final gap = (g.tier - cfg.tier).abs() * 1000 + costGap;
    if (gap < bestGap) {
      bestGap = gap;
      best = CatsDeal(puzzle: p, grade: g, inWindow: false);
    }
  }
  return best;
}
