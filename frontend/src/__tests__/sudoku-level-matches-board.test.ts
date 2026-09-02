/**
 * 🔴 НОМЕР УРОВНЯ В ШАПКЕ СОВПАДАЕТ С ДОСКОЙ НА ЭКРАНЕ.
 *
 * Отчёты Вали 31.08.2026, дважды: «с 46 уровня начинаются стрелки, а у меня всё ещё
 * термометр». Лестница исправна — расходились ДОСКА и ПОДПИСЬ. В телеметрии видно
 * посекундно:
 *   06:02:59  level:45 variant:thermo   ← поднята незаконченная партия сорок пятого
 *   06:02:59  level:46 variant:thermo   ← и тут же номер стал сорок шестым
 *
 * Достигнутый уровень читается из хранилища асинхронно, и его `setLevel` прилетал
 * ПОСЛЕ восстановления партии, перетирая её номер. Человек видел термометр там, где
 * правила обещали стрелки.
 *
 * ⚠️ ЭТО УЖЕ ВТОРОЙ СЛУЧАЙ ОДНОГО КЛАССА (первый — «баг Ур.45/8»): номер уровня и
 * доска живут в разных состояниях, и любое «догоняющее» асинхронное присваивание их
 * рассинхронизирует. Поэтому гейт проверяет не конкретный уровень, а САМО ПРАВИЛО:
 * поднятая партия защищена от догоняющей записи.
 */
import { levelConfig } from '../services/sudoku-core';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../app/games/sudoku.tsx'), 'utf8') as string;

describe('уровень и доска судоку не расходятся', () => {
  it('есть что проверять: лестница правда меняет правило по уровням', () => {
    expect(levelConfig(45).variant).toBe('thermo');
    expect(levelConfig(46).variant).toBe('arrow');
  });

  it('🔴 поднятая из снимка партия защищена от догоняющей записи уровня', () => {
    // Флаг ставится ровно при восстановлении…
    expect(SRC).toMatch(/const applyResume[\s\S]{0,120}resumedRef\.current = true/);
    // …проверяется там, где прилетает достигнутый уровень…
    expect(SRC).toMatch(/modeRef\.current === 'levels' && !resumedRef\.current\) setLevel\(reached\)/);
    // …и снимается при старте новой партии, иначе уровень замёрзнет навсегда.
    expect(SRC).toMatch(/const startGame[\s\S]{0,260}resumedRef\.current = false/);
  });

  it('🔴 у каждого уровня полосы 42–49 правило то, что обещано игроку', () => {
    const плохо: string[] = [];
    for (let L = 42; L <= 45; L++) if (levelConfig(L).variant !== 'thermo') плохо.push(`L${L}: ${levelConfig(L).variant}`);
    for (let L = 46; L <= 49; L++) if (levelConfig(L).variant !== 'arrow') плохо.push(`L${L}: ${levelConfig(L).variant}`);
    expect(плохо).toEqual([]);
  });
});
