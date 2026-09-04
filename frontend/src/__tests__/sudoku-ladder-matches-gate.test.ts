/**
 * ЛЕСТНИЦА ОБЕЩАЕТ РОВНО СТОЛЬКО, СКОЛЬКО ПРОВЕРЕНО.
 *
 * 🔴 ЧТО БЫЛО. Замер 03.09.2026: игра обрывала лестницу на 80-м уровне
 * (`SUDOKU_LAST_LEVEL = 80`), а `sudoku-levels.gate.ts` гонял и держал зелёными
 * 92 — уровни 81–92 (thermoknight, sandparity, killerdiag) генерировались и
 * решались, но из игры до них было не дойти. Двенадцать готовых ступеней лежали
 * мёртвыми, и заметить это можно было только сличив два числа в разных файлах.
 *
 * ⚠️ ЭТО РАСХОЖДЕНИЕ МОЛЧАЛИВОЕ В ОБЕ СТОРОНЫ. Потолок ВЫШЕ проверенного —
 * человек упирается в непроверенный уровень; потолок НИЖЕ — сделанное прячется.
 * Оба случая не видны ни из одного файла по отдельности, поэтому числа сверяются
 * здесь.
 */
declare function require(m: string): any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

function число(файл: string, имя: string): number {
  const src: string = fs.readFileSync(path.join(__dirname, '../..', файл), 'utf8')
    .split('\n').filter((l: string) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const m = new RegExp(`${имя}\\s*=\\s*(\\d+)`).exec(src);
  expect(`${имя} найдено в ${файл}: ${!!m}`).toBe(`${имя} найдено в ${файл}: true`);
  return Number(m![1]);
}

describe('лестница судоку и гейт уровней', () => {
  it('🔴 потолок игры равен последнему проверенному уровню', () => {
    const вИгре = число('app/games/sudoku.tsx', 'SUDOKU_LAST_LEVEL');
    const вГейте = число('src/__gates__/sudoku-levels.gate.ts', 'LAST_LEVEL');
    expect(`игра ${вИгре} · гейт ${вГейте}`).toBe(`игра ${вГейте} · гейт ${вГейте}`);
  });

  it('🔴 у каждого уровня до потолка есть своя настройка, а не заглушка', () => {
    const { levelConfig } = require('@/src/services/sudoku-core');
    const вИгре = число('app/games/sudoku.tsx', 'SUDOKU_LAST_LEVEL');
    const пустые: number[] = [];
    for (let L = 1; L <= вИгре; L += 1) {
      const cfg = levelConfig(L);
      if (!cfg || !cfg.N || !cfg.blanks) пустые.push(L);
    }
    expect(пустые).toEqual([]);
  });

  it('🔴 верхний пояс не безымянный: у 81+ своя подпись', () => {
    const экран: string = fs.readFileSync(
      path.join(__dirname, '../../app/games/sudoku.tsx'), 'utf8');
    expect(экран).toContain('sudokuBeltCombo');
  });
});
