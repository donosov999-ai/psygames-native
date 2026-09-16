/* psygames-variant-ceiling-measure · VER 2 · 16.09.2026 (VER 1 — src/__tests__/zz-ceil.test.ts, 26.08.2026) */
/**
 * ЗАМЕР, А НЕ ТЕСТ: потолок ступени по каждому варианту лестницы 13–57.
 * Отсюда взяты числа VARIANT_TIER_CEILING (26.08.2026).
 *
 * 🔴 ПЕРЕЕХАЛ ИЗ src/__tests__ 16.09.2026. Там он три недели гонялся в КАЖДОМ полном
 * прогоне jest, в CI тоже: 12 уровней × 8 досок, каждая с бюджетом 6000 мс и
 * заведомо недостижимой целью {9,9}. Замер одного вызова 16.09 — 2,85 с (L13 diagonal
 * 2854 мс, L57 jigsaw 2834 мс), то есть ~4,5 минуты на прогон ради одного утверждения
 * `out.length === 12`, плюс запись /tmp/ceil.json на раннере.
 *
 * Запуск:
 *   npx jest --rootDir . scripts/measure/variant-ceiling.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts"
 * Файл итога — по переменной CEIL_OUT (без неё ничего на диск не пишется).
 */
import { generateLogical, targetTier } from '@/src/services/sudoku-grade';
import { levelConfig } from '@/src/services/sudoku-core';
declare const process: { env: Record<string, string | undefined> };
declare function require(id: string): any;
const fs = require('fs');
it('потолок ступени по каждому варианту', () => {
  const TOP = [13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57];
  const out: any[] = [];
  for (const L of TOP) {
    const cfg = levelConfig(L); const tt = targetTier(L);
    const tiers: number[] = [];
    for (let i = 0; i < 8; i++) {
      // Потолок ищем БЕЗ цели: просим максимум, какой доска потянет.
      const r = generateLogical(L, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 6000, tier: { min: 9, max: 9 } });
      tiers.push(r.grade.solved ? r.grade.tier : -1);
    }
    const max = Math.max(...tiers);
    const hist: Record<number, number> = {};
    for (const t of tiers) hist[t] = (hist[t] ?? 0) + 1;
    out.push({ L, variant: cfg.variant, target: `${tt.min}-${tt.max}`, max, tiers });
    console.log(`${String(cfg.variant).padEnd(11)} L${L} цель ${tt.min}-${tt.max} · ПОТОЛОК ${max} · ${Object.entries(hist).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  }
  if (process.env.CEIL_OUT) fs.writeFileSync(process.env.CEIL_OUT, JSON.stringify(out, null, 1));
  expect(out.length).toBe(12);
}, 3600000);
