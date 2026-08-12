/**
 * Судоку-самурай: пять сеток, сцепленных углами.
 *
 * ЗАЧЕМ ТЕСТ. Тут ошибиться легко и НЕЗАМЕТНО: доска из пяти сеток выглядит правдоподобно,
 * даже если пересечения разъехались. Человек обнаружит это через сорок минут игры, когда
 * задача окажется нерешаемой — и потеряет весь час. Для мега-босса это худший исход,
 * хуже чем не выпустить его вовсе.
 *
 * Поэтому проверяем не «сгенерировалось без ошибки», а три вещи по существу:
 * геометрию пересечений, корректность решения и согласованность выкалывания.
 */
import {
  N, CANVAS, GRID_ORIGINS, overlapsOf, toCanvas,
  buildSolution, isSolved, dig, generateSamurai,
} from '@/src/services/samurai';

describe('раскладка', () => {
  it('пять сеток, и все помещаются в поле 21×21', () => {
    expect(GRID_ORIGINS.length).toBe(5);
    for (const [r, c] of GRID_ORIGINS) {
      expect(r + N).toBeLessThanOrEqual(CANVAS);
      expect(c + N).toBeLessThanOrEqual(CANVAS);
    }
  });

  it('каждый угол делит с центром ровно один блок 3×3 — девять клеток', () => {
    for (let g = 0; g < 4; g++) {
      expect(`угол ${g}: ${overlapsOf(g).length} клеток`).toBe(`угол ${g}: 9 клеток`);
    }
    expect(overlapsOf(4)).toEqual([]);   // у центра своих пересечений нет
  });

  it('пересечения — это ОДНА и та же точка поля, а не просто равные координаты', () => {
    for (let g = 0; g < 4; g++) {
      for (const [r, c, cr, cc] of overlapsOf(g)) {
        expect(toCanvas(g, r, c)).toEqual(toCanvas(4, cr, cc));
      }
    }
  });

  it('углы не соприкасаются друг с другом — только через центр', () => {
    const cells = (g: number) => {
      const s = new Set<string>();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) s.add(toCanvas(g, r, c).join(','));
      return s;
    };
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const A = cells(a), B = cells(b);
        const common = [...A].filter((x) => B.has(x));
        expect(`углы ${a}+${b}: общих клеток ${common.length}`).toBe(`углы ${a}+${b}: общих клеток 0`);
      }
    }
  });
});

describe('решение', () => {
  // Генерация с перебором — держим выборку небольшой, но не единичной:
  // разовый успех ничего не доказывает, а раскладка каждый раз новая.
  const runs = 4;

  it('собирается и проходит полную проверку', () => {
    for (let i = 0; i < runs; i++) {
      const s = buildSolution();
      expect(`прогон ${i}: ${isSolved(s)}`).toBe(`прогон ${i}: true`);
    }
  });

  it('в каждой сетке каждая цифра ровно девять раз', () => {
    const s = buildSolution();
    for (let g = 0; g < 5; g++) {
      const count = new Map<number, number>();
      for (const row of s[g]) for (const v of row) count.set(v, (count.get(v) ?? 0) + 1);
      for (let v = 1; v <= 9; v++) {
        expect(`сетка ${g}, цифра ${v}: ${count.get(v)}`).toBe(`сетка ${g}, цифра ${v}: 9`);
      }
    }
  });

  it('проверка ловит разъехавшееся пересечение — иначе она бесполезна', () => {
    const s = buildSolution();
    const [r, c, cr, cc] = overlapsOf(0)[0];
    // портим ТОЛЬКО копию в центре: каждая сетка по отдельности останется валидной,
    // сломается именно согласованность — то, что глазами не видно.
    const was = s[4][cr][cc];
    s[4][cr][cc] = was === 9 ? 8 : was + 1;
    expect(isSolved(s)).toBe(false);
    s[4][cr][cc] = was;
    expect(s[0][r][c]).toBe(was);
  });
});

describe('выкалывание', () => {
  it('пустых клеток не меньше заказанного', () => {
    const s = buildSolution();
    const p = dig(s, 40);
    for (let g = 0; g < 5; g++) {
      const blanks = p[g].flat().filter((v) => v === 0).length;
      expect(`сетка ${g}: ${blanks >= 40}`).toBe(`сетка ${g}: true`);
    }
  });

  it('в пересечении клетка исчезает СРАЗУ В ОБЕИХ сетках', () => {
    const s = buildSolution();
    const p = dig(s, 45);
    for (let g = 0; g < 4; g++) {
      for (const [r, c, cr, cc] of overlapsOf(g)) {
        const a = p[g][r][c] === 0, b = p[4][cr][cc] === 0;
        expect(`сетка ${g} (${r},${c}): пусто у обоих ${a} / ${b}`)
          .toBe(`сетка ${g} (${r},${c}): пусто у обоих ${a} / ${a}`);
      }
    }
  });

  it('оставшиеся подсказки совпадают с решением', () => {
    const { solution, puzzle } = generateSamurai(45);
    for (let g = 0; g < 5; g++) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (puzzle[g][r][c] !== 0) expect(puzzle[g][r][c]).toBe(solution[g][r][c]);
        }
      }
    }
  });

  it('решение не портится выкалыванием — доска остаётся решаемой', () => {
    const { solution } = generateSamurai(45);
    expect(isSolved(solution)).toBe(true);
  });
});
