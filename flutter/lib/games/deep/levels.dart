// 🔴 ЛЕСТНИЦА «БЕЗДНЫ» — решение Дениса 12.11.2026: «сложность + бесконечные ступени»
// (задача c345a8f1, правило «все функции — у всех 131 игр»). В вебе уровней у «Бездны» не было:
// объём (разведка / поход / бездна) и ступень досок выбирались руками.
//
// Ступени идут по осям, которые у игры уже есть, — ничего нового в правилах:
//   · 1–3: объём «Разведка» → «Поход» → «Бездна» на первой ступени досок (как первая партия веба);
//   · 4–8: «Бездна», ступень досок 2…6 (рейтинг банка `deepBands`);
//   · 9–10: пар порталов на родителя 3, 4 (в вебе всегда 2) — больше перекрёстных зависимостей листьев;
//   · 11 и дальше: доля дырок, которую надо закрыть, чтобы узел отдал цифру наверх, растёт на 0,08
//     с 0,24 до 1,0 (ступень 20 — каждую дырку).
// ⚠️ Глубина остаётся 2–3: дерево глубже не проверено (`DeepCfg.depth`). После 20-й ступени номер растёт,
// а нагрузка — нет; следующая ось — отдельным решением.

/// Параметры одной ступени лестницы «Бездны».
typedef DeepLevel = ({String preset, int band, int portalPairs, double unlockShare});

/// Доля закрытия по умолчанию — как у пресетов веба.
const deepBaseUnlockShare = 0.24;

/// Ступень, на которой рост нагрузки кончается (доля закрытия дошла до 1,0).
const deepPlateauLevel = 20;

DeepLevel deepLevel(int level) {
  final n = level < 1 ? 1 : level;
  if (n <= 3) {
    return (preset: const ['scout', 'trek', 'abyss'][n - 1], band: 0, portalPairs: 2, unlockShare: deepBaseUnlockShare);
  }
  if (n <= 8) return (preset: 'abyss', band: n - 3, portalPairs: 2, unlockShare: deepBaseUnlockShare);
  if (n <= 10) return (preset: 'abyss', band: 5, portalPairs: n - 6, unlockShare: deepBaseUnlockShare);
  final share = deepBaseUnlockShare + 0.08 * (n - 10);
  return (preset: 'abyss', band: 5, portalPairs: 4, unlockShare: share > 1.0 ? 1.0 : share);
}
