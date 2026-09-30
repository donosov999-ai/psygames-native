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
import 'contract.dart';
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
      final id = 'sudoku:bank:band$band';
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
    final id = 'sudoku:${cfg.variant}:tier$tier';
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
      id: 'sudoku:bank:band$band',
      band: band,
      rating: ratingForBank(bankRating),
      variant: 'none',
    );
  }
  final t = (tier ?? 4).clamp(1, maxTier);
  return Template(
    id: 'sudoku:$variant:tier$t',
    band: t,
    rating: ratingForTier(t),
    variant: variant,
  );
}

/// Рейтинг ПРОПИСАННОЙ ступени — той же мерой, что и у шаблонов пула.
double ratingForLevel(SudokuLevels levels, int level) {
  final cfg = levels.config(level);
  if (cfg.fromBank) return ratingForBank(levels.bankRating(level));
  final tiers = <int>[];
  for (var i = 0; i < levels.boardsFor(level); i++) {
    final t = levels.boardAt(level, i)?.tier;
    if (t != null) tiers.add(t);
  }
  final tier = tiers.isEmpty
      ? 4
      : (tiers.reduce((a, b) => a + b) / tiers.length).round().clamp(1, maxTier);
  return ratingForTier(tier);
}

/// Состояние для того, кто ПРИШЁЛ С ПРОПИСАННОЙ ЛЕСТНИЦЫ (решение Дениса 23.09.2026).
///
/// 🔴 НЕ С НУЛЯ. Валя стоит на 54-й ступени; старт генератора с рейтинга новичка (1200)
/// выдал бы ей доски вдвое легче тех, что она уже проходит, и путь читался бы как
/// откат назад. Спрошено прямо, ответ — «от трудности её 54-й ступени».
///
/// ⚠️ НЕУВЕРЕННОСТЬ ОСТАЁТСЯ ШИРОКОЙ. Ступень говорит, ЧТО человек проходил, но не
/// говорит, насколько уверенно: рейтинг взят у лестницы, а не измерен адаптивными
/// партиями. Широкая `ratingUncertainty` делает первые шаги крупными, и настоящая
/// трудность находится за несколько партий, а не за двадцать.
///
/// Номер уровня генератора при этом НЕ наследуется: `adaptiveWins` — счётчик побед
/// именно на генераторе, и начинать его с 54 значило бы приписать победы, которых на
/// этом пути не было.
AdaptiveState startFromLadder(SudokuLevels levels, int level) => AdaptiveState(
      skillRating: ratingForLevel(levels, level),
      ratingUncertainty: 350,
    );
