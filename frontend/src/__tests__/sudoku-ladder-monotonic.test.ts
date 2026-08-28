/* psygames-sudoku-ladder-monotonic · VER 1 · 27.08.2026 */
/**
 * ЛЕСТНИЦА СУДОКУ НЕ ОБЕЩАЕТ МЕНЬШЕ, ЧЕМ УРОВЕНЬ НАЗАД.
 *
 * 🔴 ЗАЧЕМ. Дефект 2 задачи 25a92d61: прежний гейт сравнивал только КРАЙНИЕ
 * уровни (late > early), и провал в середине проходил по построению — ровно
 * так «сложность падала 12 уровней подряд» при зелёном гейте. Тот же класс,
 * что у goods-sort («гейт решаемости зелёный при 57 непроходимых уровнях»).
 *
 * ⚠️ МЕРЯЕМ ОБЕЩАНИЯ, А НЕ ЭМПИРИКУ. Прогонять генерацию в гейте — минуты и
 * шум: он краснел бы от невезения. Обещание уровня — его ЭФФЕКТИВНАЯ полоса
 * (effectiveBand ∘ targetTier ∘ levelConfig): то, что уровень декларирует
 * игроку с учётом вариантного потолка. Живой случай, который этот гейт ловит,
 * а старый пропускал: 27.08 подъём потолка jigsaw до 6 сделал L53 (полоса
 * 6..6) СЛОЖНЕЕ L55 (thermocage, потолок 5 → 4..5) — горб в конце лестницы.
 * Эмпирика согласна: медианы тиров по перезамеру 27.08 дали ...L53=6, L55=4.
 *
 * Правило: и min, и max эффективной полосы НЕ УБЫВАЮТ с ростом уровня.
 * Равенство разрешено (плато — законно), убывание — нет.
 */
import { effectiveBand, monotonicBandForLevel, targetTier } from '../services/sudoku-grade';
import { levelConfig } from '../services/sudoku-core';

const LAST_LEVEL = 80;

describe('лестница судоку монотонна по обещаниям', () => {
  it('🔴 пила жива как ось: СЫРЫЕ полосы спадают на стыках — иначе running-max был бы мёртвым кодом', () => {
    let спадов = 0;
    let prev = { min: 0, max: 0 };
    for (let lv = 1; lv <= LAST_LEVEL; lv++) {
      const eff = effectiveBand(String(levelConfig(lv).variant) as never, targetTier(lv));
      if (eff.min < prev.min || eff.max < prev.max) спадов++;
      prev = eff;
    }
    expect(спадов).toBeGreaterThan(0);
  });

  it('🔴 эффективная полоса каждого уровня не ниже предыдущей (вся последовательность, не края)', () => {
    const наруш: string[] = [];
    let prev = { min: 0, max: 0 };
    for (let lv = 1; lv <= LAST_LEVEL; lv++) {
      const cfg = levelConfig(lv) as { variant: string };
      const band = monotonicBandForLevel(lv);
      if (band.min < prev.min) наруш.push(`L${lv} ${cfg.variant}: min ${band.min} < ${prev.min} (L${lv - 1})`);
      if (band.max < prev.max) наруш.push(`L${lv} ${cfg.variant}: max ${band.max} < ${prev.max} (L${lv - 1})`);
      prev = band;
    }
    expect(наруш).toEqual([]);
  });
});
