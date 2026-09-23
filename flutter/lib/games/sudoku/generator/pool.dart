/// ПУЛ ШАБЛОНОВ — ИЗ НАШЕЙ ЖЕ ЛЕСТНИЦЫ, А НЕ ПРИДУМАННЫЙ ЗАНОВО.
///
/// 🔴 ВАРИАНТ В (решение Дениса 18.09): генератор ОПИРАЕТСЯ на прописанные ступени, а не
/// заменяет их. 92 ступени — это уже готовый набор правил с измеренной трудностью:
/// вариант, размер доски, ступень техник у вариантных досок и полоса рейтинга у
/// банковских. Пул собирается из них, и ни одна строка лестницы при этом не меняется.
///
/// 🔴 ОДИН ШАБЛОН НА (ПРАВИЛО, ПОЛОСА), А НЕ НА СТУПЕНЬ. Вариант живёт на лестнице по
/// 4–5 ступеней подряд; если сделать шаблоном каждую, рейтинг одного и того же правила
/// размажется по пяти объектам и не наберёт партий ни на одном. Стабильная единица —
/// правило плюс полоса.
///
/// ⚠️ НАЧАЛЬНЫЙ РЕЙТИНГ — ПЕРЕСЧЁТ НАШЕЙ МЕРЫ, А НЕ ВКУС. У вариантных досок это ступень
/// техник (`tier`, 1–7), у банковских — рейтинг банка (1,2–9,2). Обе шкалы переводятся в
/// одну игрока линейно, и проба требует, чтобы перевод был монотонным: доска, которую
/// наша мера считает труднее, обязана получить рейтинг выше. Дальше эти числа уточняются
/// живыми партиями — начальное значение только задаёт старт.
library;

import '../levels.dart';
import 'engine.dart';

/// Границы шкалы игрока. 1200 — середина, с неё стартует новичок (см. `AdaptiveState`).
const ratingFloor = 800.0;
const ratingCeil = 2200.0;

/// Ступень техник у вариантных досок: 1–7 (выше семи наша мера не ходит).
const maxTier = 7;

/// Полоса банка: 1,2–9,2 (58 полос в банке классики).
const bankLow = 1.2;
const bankHigh = 9.2;

/// Ступень техник → рейтинг игрока.
double ratingForTier(int tier) =>
    ratingFloor + (ratingCeil - ratingFloor) * (tier.clamp(1, maxTier) - 1) / (maxTier - 1);

/// Полоса банка → рейтинг игрока.
double ratingForBank(double bandRating) {
  final t = ((bandRating - bankLow) / (bankHigh - bankLow)).clamp(0.0, 1.0);
  return ratingFloor + (ratingCeil - ratingFloor) * t;
}

/// Собрать пул из лестницы. Один шаблон на пару (правило, полоса); полоса берётся у
/// нашей меры, а не у номера ступени.
List<Template> buildPool(SudokuLevels levels, {int lastLevel = 92}) {
  final byId = <String, Template>{};

  for (var lv = 1; lv <= lastLevel; lv++) {
    final cfg = levels.config(lv);

    if (cfg.fromBank) {
      final bank = levels.bankRating(lv);
      final band = (bank * 10).round();
      final id = 'sudoku:bank:полоса$band';
      byId[id] ??= Template(id: id, band: band, rating: ratingForBank(bank), variant: 'none');
      continue;
    }

    // Вариантная ступень: меру берём у выгруженных досок, а не у номера уровня.
    final tiers = <int>[];
    for (var i = 0; i < levels.boardsFor(lv); i++) {
      final t = levels.boardAt(lv, i)?.tier;
      if (t != null) tiers.add(t);
    }
    // Мера промолчала у всех досок ступени — берём середину шкалы, но НЕ выбрасываем
    // ступень: правило без рейтинга всё равно играбельно, рейтинг наберётся партиями.
    final tier = tiers.isEmpty
        ? 4
        : (tiers.reduce((a, b) => a + b) / tiers.length).round().clamp(1, maxTier);
    final id = 'sudoku:${cfg.variant}:ступень$tier';
    byId[id] ??= Template(
      id: id,
      band: tier,
      rating: ratingForTier(tier),
      variant: cfg.variant,
    );
  }

  final pool = byId.values.toList()..sort((a, b) => a.rating.compareTo(b.rating));
  return pool;
}

/// Шаблон ДЛЯ УЖЕ ВЫДАННОЙ ДОСКИ — тем же именем, что и в пуле.
///
/// Нужен теневому шагу (§10.2): доску выдала прописанная лестница, а рейтинг обязан
/// учиться на ней же — иначе к моменту включения пилота трудность игрока будет
/// неизвестна, и первая же адаптивная партия окажется случайной.
Template templateForBoard({
  required String variant,
  required bool fromBank,
  required double bankRating,
  int? tier,
}) {
  if (fromBank) {
    final band = (bankRating * 10).round();
    return Template(
      id: 'sudoku:bank:полоса$band',
      band: band,
      rating: ratingForBank(bankRating),
      variant: 'none',
    );
  }
  final t = (tier ?? 4).clamp(1, maxTier);
  return Template(
    id: 'sudoku:$variant:ступень$t',
    band: t,
    rating: ratingForTier(t),
    variant: variant,
  );
}
