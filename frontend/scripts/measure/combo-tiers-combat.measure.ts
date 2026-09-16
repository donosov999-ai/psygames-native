/* psygames-combo-tiers-combat-measure · VER 1 · 16.09.2026 */
/**
 * ЗАМЕР, А НЕ ТЕСТ: достижимая ступень комбо-пояса 81–92 на БОЕВОМ пути экрана.
 *
 * ⚠️ ЗАЧЕМ ВТОРОЙ ЗАМЕР. `combo-tiers.measure.ts` (29.08) звал `generateLogical`
 * НАПРЯМУЮ с `budgetMs: 6000`. Экран так не делает: `sudoku.tsx` берёт
 * `logicalBuilder(..., { budgetMs: 2200, tier: roadTier(lv, road), look })`, а тот
 * отдаёт каждому заходу генератора половину — 1100 мс, — и крутит заходы через
 * `runSteps`, пока не `enough`. То есть замер 29.08 шёл впятеро щедрее боя. Для
 * джигсо 27.08 перемеряли именно боевым бюджетом; для комбо этого не делали.
 * Потолок по правилу словаря — «берётся регулярно В ИГРЕ», а не в лаборатории.
 *
 * ⚠️ И подписи в старом замере разошлись с лестницей: там `sandparity` стоит на
 * 81/84, а сейчас на 81–84 `thermoknight`, sandparity на 85–88. Здесь вариант
 * печатается из `levelConfig`, а не из подписи.
 *
 * 🔴 ПОПАДАНИЕ СЧИТАЕТСЯ ПО ЭФФЕКТИВНОЙ ПОЛОСЕ, А НЕ ПО targetTier. Сборщик целится в
 * `effectiveBand(variant, targetTier)`: верх режется потолком варианта, пол держится на
 * ступень ниже. Первая редакция этого замера (16.09.2026) сравнивала с СЫРОЙ полосой
 * 5–6 и показала «в полосе 1/15» на L87 и L91 — тревога ложная: сборщик туда и не
 * целился, его полоса там 4–5, и попадание 15/15. Чуть не опустил потолки до 4 — а это
 * сделало бы эффективную полосу 3–4 и заставило бы ВЫБРАСЫВАТЬ редкие пятёрки.
 *
 * Запуск:
 *   npx jest --rootDir . scripts/measure/combo-tiers-combat.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts" -t "БОЙ"
 */
import { logicalBuilder, targetTier, selectionLookForLevel, effectiveBand } from '@/src/services/sudoku-grade';
import { levelConfig } from '@/src/services/sudoku-core';
import { runSteps } from '@/src/components/BoardBuilding';

declare function require(id: string): any;
declare const process: { env: Record<string, string | undefined> };
/** ⚠️ Строка пишется в файл СРАЗУ после уровня: jest копит console.log до конца файла,
 *  и при обрыве процесса (16.09 его убили по памяти на середине) пропадало всё. */
const ФАЙЛ = process.env.COMBO_OUT;
const записать = (строка: string) => {
  console.log(строка);
  if (ФАЙЛ) require('fs').appendFileSync(ФАЙЛ, строка + '\n');
};

const свод = (a: number[]) => {
  const c = new Map<number, number>();
  for (const t of a) c.set(t, (c.get(t) ?? 0) + 1);
  return [...c.entries()].sort((x, y) => x[0] - y[0]).map(([t, n]) => `${t}×${n}`).join(' ');
};

describe('БОЙ комбо-пояса 81–92', () => {
  jest.setTimeout(1800_000);
  const ДОСОК = 15;
  // вход (полоса 4–5) и верх (5–6) каждой четвёрки
  const УРОВНИ = [81, 83, 85, 87, 89, 91];

  for (const lv of УРОВНИ) {
    it(`БОЙ L${lv}`, async () => {
      const cfg = levelConfig(lv) as unknown as { N: number; BR: number; BC: number; blanks: number; variant: string };
      const полоса = targetTier(lv);   // обычная дорога: roadTier(lv, 'normal') === targetTier(lv)
      const цель = effectiveBand(cfg.variant as never, полоса);   // во что сборщик целится НА САМОМ ДЕЛЕ
      const тиры: number[] = [];
      let вПолосе = 0, неРешено = 0, фолбэков = 0, заходовВсего = 0;
      const t0 = Date.now();
      for (let i = 0; i < ДОСОК; i++) {
        const b = logicalBuilder(lv, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant as never, {
          budgetMs: 2200, tier: полоса, look: selectionLookForLevel(lv),
        });
        let заходов = 0;
        const r = await runSteps({
          steps: b.steps, step: () => { заходов++; return b.step(); }, enough: (x) => b.enough(x),
          show: () => {}, frame: async () => {}, now: () => Date.now(),
        });
        заходовВсего += заходов;
        if (!r.grade.solved) { неРешено++; continue; }
        тиры.push(r.grade.tier);
        if (r.fellBack) фолбэков++;
        if (r.grade.tier >= цель.min && r.grade.tier <= цель.max) вПолосе++;
      }
      записать(
        `L${lv} [${cfg.variant}] сырая ${полоса.min}–${полоса.max} → цель ${цель.min}–${цель.max}: ступени ${свод(тиры)} · в цели ${вПолосе}/${ДОСОК}` +
        ` · не решено ${неРешено} · фолбэков ${фолбэков} · заходов ${заходовВсего} · ${Math.round((Date.now() - t0) / 1000)}с`,
      );
      expect(тиры.length + неРешено).toBe(ДОСОК);
    });
  }
});
