/**
 * 🔴 ЛИНИИ ПОВЕРХ ДОСКИ НЕ СТИРАЮТ СЕТКУ.
 *
 * Отчёты Вали 31.08.2026, дважды: «границы между числами гуляют, то появляются, то
 * исчезли», «вот опять границы стёрлись где цифры 6». На скриншоте (уровень 45,
 * термометры) видно точно: линия термометра идёт поверх границы клетки и разрывает
 * её — даже толстую границу блока. Выше и ниже линии граница есть, в месте прохода
 * нет. Отсюда «гуляют»: сетка цела везде, кроме мест с термометром.
 *
 * Причина арифметическая: сегмент рисуется абсолютным блоком внутри клетки и доходил
 * ровно до её края, накрывая пограничный пиксель (на плотном экране — почти три).
 *
 * ⚠️ Тем же болели СТРЕЛКИ: они рисовались своей копией той же формулы. Теперь обе
 * зовут `thermoSegment`, и зазор у них один.
 */
import { thermoSegment, thermoBulb } from '../services/sudoku-overlay';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

describe('накладки судоку не режут сетку', () => {
  const РАЗМЕРЫ = [24, 32, 38, 44, 56, 72];

  it('🔴 сегмент не доходит до края клетки ни на одном размере', () => {
    const плохо: string[] = [];
    for (const cell of РАЗМЕРЫ) {
      const thick = Math.max(2, Math.round(cell * 0.07));
      const вправо = thermoSegment(1, 1, [1, 2], cell, thick);
      const влево = thermoSegment(1, 1, [1, 0], cell, thick);
      const вниз = thermoSegment(1, 1, [2, 1], cell, thick);
      const вверх = thermoSegment(1, 1, [0, 1], cell, thick);
      const правыйКрай = (вправо.left ?? 0) + (вправо.width ?? 0);
      if (правыйКрай >= cell) плохо.push(`${cell}px вправо: доходит до ${правыйКрай} при клетке ${cell}`);
      if ((влево.left ?? 0) <= 0) плохо.push(`${cell}px влево: начинается с ${влево.left}`);
      const низ = (вниз.top ?? 0) + (вниз.height ?? 0);
      if (низ >= cell) плохо.push(`${cell}px вниз: доходит до ${низ}`);
      if ((вверх.top ?? 0) <= 0) плохо.push(`${cell}px вверх: начинается с ${вверх.top}`);
    }
    expect(плохо).toEqual([]);
  });

  it('зазор не съедает линию: она всё ещё длиннее половины клетки минус чуть-чуть', () => {
    for (const cell of РАЗМЕРЫ) {
      const s = thermoSegment(1, 1, [1, 2], cell, 4);
      // Плечо короче половины клетки, но не короче её трети — иначе термометр
      // распадётся на точки и перестанет читаться как линия.
      expect(s.width!).toBeLessThan(cell / 2);
      expect(s.width!).toBeGreaterThanOrEqual(cell / 3);
    }
  });

  it('колба остаётся внутри клетки', () => {
    for (const cell of РАЗМЕРЫ) {
      const b = thermoBulb(cell);
      expect(b.left!).toBeGreaterThan(0);
      expect(b.left! + b.width!).toBeLessThan(cell);
    }
  });

  /**
   * ⚠️ Проверяем ОТСУТСТВИЕ КОПИИ, а не её место в файле. Первая редакция искала
   * `variant === 'arrow' … thermoSegment` в пределах шестисот символов и падала на
   * длинном комментарии — ровно тот сорт гейта, который ломается от правки текста и
   * молчит при поломке смысла. Копия формулы узнаётся однозначно: собственный расчёт
   * плеча «до края клетки», которого больше нет ни у одной накладки.
   */
  it('🔴 ни одна накладка не держит свою копию формулы сегмента', () => {
    const плохо: string[] = [];
    for (const f of ['sudoku.tsx', 'sudoku-fractal-deep.tsx', 'sudoku-samurai.tsx']) {
      const p = path.join(__dirname, '../../app/games', f);
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, 'utf8') as string;
      if (/width: cellSize \/ 2, height: thick/.test(src)) плохо.push(`${f}: своя формула плеча`);
      if (/height: cellSize \/ 2, width: thick/.test(src)) плохо.push(`${f}: своя формула плеча (вертикаль)`);
    }
    expect(плохо).toEqual([]);
  });
});
