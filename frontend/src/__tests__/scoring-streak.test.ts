/**
 * 🔴 РАЗГОН СЧЁТА ЕСТЬ, НО НЕ ПРЕВРАЩАЕТ ПАРТИЮ В ЛОТЕРЕЮ.
 *
 * Три вещи, каждая из которых ломалась бы незаметно:
 *  1) разгон ЗАСЛУЖЕН — до трёх верных подряд множителя нет вовсе, иначе он
 *     достаётся за первый же случайный ход и перестаёт что-либо значить;
 *  2) разгон ЗАМЕДЛЯЕТСЯ и упирается в потолок — линейный «×n» обесценивает всё,
 *     что игрок набрал до серии, и превращает длинную партию в лотерею;
 *  3) на маленькой базе прибавка ВИДНА — при округлении вниз «+1 очко» с
 *     множителем 1,9 так и осталось бы «+1», то есть разгон жил бы в описании.
 */
import { streakMultiplier, scoreWithStreak } from '../services/scoring';

declare const __dirname: string;
declare function require(id: string): any;

describe('разгон счёта от серии', () => {
  it('до трёх подряд множителя нет', () => {
    for (const n of [0, 1, 2]) expect(streakMultiplier(n)).toBe(1);
    expect(streakMultiplier(3)).toBeGreaterThan(1);
  });

  it('растёт, но замедляется — и упирается в потолок 3×', () => {
    const шаги = [3, 4, 5, 7, 10, 15, 20, 50, 200].map(streakMultiplier);
    for (let i = 1; i < шаги.length; i++) expect(шаги[i]).toBeGreaterThanOrEqual(шаги[i - 1]);
    // Вогнутость: на равных отрезках длиной пять ранний прирост больше позднего.
    // ⚠️ Отрезки именно равные — сравнивать «с 3 до 5» и «с 10 до 15» нельзя,
    // это два шага против пяти, и линейная функция такую проверку прошла бы.
    expect(streakMultiplier(8) - streakMultiplier(3)).toBeGreaterThan(streakMultiplier(23) - streakMultiplier(18));
    expect(Math.max(...шаги)).toBe(3);
  });

  it('🔴 на маленькой базе прибавка видна, а не съедена округлением', () => {
    expect(scoreWithStreak(1, 5)).toBeGreaterThan(1);        // 1 × 1,5 → 2, а не 1
    expect(scoreWithStreak(2, 4)).toBeGreaterThan(2);        // 2 × 1,3 → 3
    expect(scoreWithStreak(10, 10)).toBe(20);                // серия 10 — ровно вдвое
    expect(scoreWithStreak(10, 1)).toBe(10);       // без серии — ровно база
  });

  it('мусор на входе не роняет счёт', () => {
    expect(scoreWithStreak(0, 9)).toBe(0);
    expect(scoreWithStreak(-5, 9)).toBe(0);
    expect(scoreWithStreak(NaN as unknown as number, 9)).toBe(0);
    expect(streakMultiplier(NaN as unknown as number)).toBe(1);
  });

  it('⚠️ множитель НЕ трогает валюту: он живёт только в счёте партии', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '../..');
    // Ни один экран кошелька/наград не должен звать разгон: монеты считаются
    // по явке и приращению рейтинга (§12.2, §14 карты геймификации).
    const подозрительные = ['src/services/wallet.ts', 'src/services/rewards.ts', 'src/services/currency.ts'];
    for (const rel of подозрительные) {
      const p = path.join(root, rel);
      if (fs.existsSync(p)) expect(fs.readFileSync(p, 'utf8')).not.toContain('scoreWithStreak');
    }
  });
});
