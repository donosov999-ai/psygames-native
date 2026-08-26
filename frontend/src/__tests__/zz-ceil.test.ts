import { generateLogical, targetTier } from '@/src/services/sudoku-grade';
import { levelConfig } from '@/src/services/sudoku-core';
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
  fs.writeFileSync('/tmp/ceil.json', JSON.stringify(out, null, 1));
  expect(out.length).toBe(12);
}, 3600000);
