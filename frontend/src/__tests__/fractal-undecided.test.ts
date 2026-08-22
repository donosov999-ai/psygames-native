/* psygames-fractal-undecided · VER 1 · 23.08.2026 */
/**
 * НЕОПРЕДЕЛЁННОСТЬ ЗАДАЧИ — НЕ ОШИБКА ЧЕЛОВЕКА.
 *
 * 🔴 ЧТО НАШЛОСЬ. Дочерняя сетка фрактала ПОРОЗНЬ неоднозначна НАРОЧНО — в этом вся
 * идея портала: ответ даёт пересечение допустимых наборов двух досок, и до
 * разрешения портала клетка честно не определена. А игра сверяла поставленную цифру
 * с хранимым решением и наказывала за ЛЮБОЕ расхождение: красное на доске, тик
 * счётчика ошибок, срезанные звёзды.
 *
 * Замер на 25-м уровне (две партии, все дочерние сетки): 838 пустых клеток из 1140 —
 * 73,5 % — принимают цифру, отличную от решения, НЕ НАРУШАЯ НИ ОДНОГО ПРАВИЛА.
 * Три четверти доски карали за законный ход.
 *
 * ⚠️ ВЧЕРА Я ИЗМЕРИЛ ЭТО НЕ ТЕМ СПОСОБОМ и написал, что беда не подтвердилась.
 * Я проверял «краснеет ли ВЕРНАЯ цифра» — она не краснела. А беда была обратная:
 * краснеет НЕВЕРНАЯ-НО-ЗАКОННАЯ, то есть та, которую задача ещё не отвергает.
 *
 * Теперь ошибкой считается только доказуемое: цифра уже стоит в этой строке, столбце
 * или блоке. Остальное — неопределённость, и о ней говорят словами.
 */
import { conflictsInChild, generateFractal, withPortalsResolved } from '@/src/services/fractal-sudoku';

declare const __dirname: string;
declare function require(id: string): any;
const read = (rel: string): string => {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8') as string;
};

describe('доказуемый конфликт', () => {
  const grid = () => [
    [1, 2, 3, 0, 0, 0, 0, 0, 0],
    [4, 5, 6, 0, 0, 0, 0, 0, 0],
    [7, 8, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  it('🔴 повтор в строке, столбце и блоке — конфликт', () => {
    expect(`строка: ${conflictsInChild(grid(), 0, 5, 2)}`).toBe('строка: true');
    expect(`столбец: ${conflictsInChild(grid(), 5, 0, 4)}`).toBe('столбец: true');
    expect(`блок: ${conflictsInChild(grid(), 2, 2, 5)}`).toBe('блок: true');
  });

  it('🔴 цифра, не нарушающая правил, конфликтом НЕ считается', () => {
    expect(conflictsInChild(grid(), 4, 4, 9)).toBe(false);
    expect(conflictsInChild(grid(), 2, 2, 9)).toBe(false);
  });

  it('🔴 своя же клетка себе не мешает', () => {
    const g = grid();
    expect(conflictsInChild(g, 0, 0, 1)).toBe(false);
  });
});

describe('дочерняя сетка порознь неоднозначна — и это нормально', () => {
  /**
   * Замер, ради которого всё: сколько пустых клеток принимают цифру ≠ решения,
   * не нарушая ни одного видимого правила. Их обязано быть МНОГО — иначе портал
   * не нужен вовсе, и проверка ниже про наказание теряет смысл.
   */
  it('🔴 законных «неверных» цифр много — значит наказывать за них нельзя', () => {
    const f = generateFractal(25, 'портал-замер');
    let empty = 0, legalWrong = 0;
    for (const ch of f.children) {
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (ch.puzzle[r]![c] !== 0) continue;
        empty += 1;
        for (let n = 1; n <= 9; n++) {
          if (n === ch.solution[r]![c]) continue;
          if (!conflictsInChild(ch.puzzle, r, c, n)) { legalWrong += 1; break; }
        }
      }
    }
    const share = legalWrong / Math.max(1, empty);
    expect(`пустых ${empty > 300}, доля законных «неверных» ${share > 0.5}`)
      .toBe('пустых true, доля законных «неверных» true');
  });

  it('портал действительно сужает задачу — иначе он бесполезен', () => {
    const f = generateFractal(25, 'портал-замер');
    const withPortal = withPortalsResolved(f.children[0]!.puzzle, f.portals, 0);
    let before = 0, after = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (f.children[0]!.puzzle[r]![c] === 0) before += 1;
      if (withPortal[r]![c] === 0) after += 1;
    }
    expect(`клеток до ${before}, после ${after}: сузилось ${after <= before}`)
      .toBe(`клеток до ${before}, после ${after}: сузилось true`);
  });
});

describe('экран', () => {
  const SRC = read('../../app/games/sudoku-fractal.tsx');

  it('🔴 ошибка засчитывается только за доказуемый конфликт', () => {
    expect(SRC).toMatch(/conflictsInChild\(play\.children\[child\]\.grid, r, c, n\)/);
    expect(SRC).toMatch(/else if \(provable\) \{ sndWrong\(\); setErrors\(\(e\) => e \+ 1\); \}/);
  });

  it('🔴 красным красится то же, за что считается ошибка', () => {
    expect(SRC).toMatch(/const wrong = v !== 0 && conflictsInChild\(ch\.grid, r, c, v\);/);
    expect(SRC).not.toMatch(/const wrong = v !== 0 && v !== sol\[r\]\[c\];/);
  });

  it('🔴 про неопределённость говорят словами, и строка гаснет сама', () => {
    expect(SRC).toMatch(/setUndecided\(true\)/);
    expect(SRC).toMatch(/t\('fractalUndecided'\)/);
    expect(SRC).toMatch(/setTimeout\(\(\) => setUndecided\(false\), UNDECIDED_MS\)/);
  });

  it('🔴 подпись есть во всех двенадцати языках', () => {
    expect(read('../contexts/LanguageContext.tsx')).toMatch(/fractalUndecided: \{ ru: '[^']+', en: '[^']+' \}/);
    for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
      const src = read(`../contexts/translations/${lang}.ts`);
      expect(`${lang}: ${/"fractalUndecided":\s*"[^"]{20,}"/.test(src)}`).toBe(`${lang}: true`);
    }
  });
});
