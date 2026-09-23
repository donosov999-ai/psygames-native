/* psygames-fractal-solution · VER 1 · 18.09.2026 */
/**
 * «ПОКАЗАТЬ РЕШЕНИЕ» ВО ФРАКТАЛЬНОЙ СУДОКУ (задача 7a96a2d6).
 *
 * 📍 Отзыв Дениса 585fc14c (18.09.2026, iPhone 403×873, 2.54.22): «Где кнопка показать решение?
 * Решатель где». У каркаса кнопка есть с 17.09 (проп `solution`), у фрактала она не была подключена.
 *
 * Что сторожит набор:
 *   · движок: показ нижней сетки даёт её ответ целиком, открывает её и отправляет цифру наверх,
 *     близнец портала получает ту же цифру; показ на карте решает корень целиком;
 *   · счёт: после показа ступень не засчитана и не опущена (разбор, как у головоломок), флаг показа
 *     живёт в снимке незаконченной партии, показанное не отменяется;
 *   · экран: лампочка каркаса подключена в обоих видах, перед показом стоит вопрос.
 *
 * ⚠️ Поведение движка проверяется ВЫЗОВАМИ на настоящих партиях. Разметку экрана — по тексту
 * со срезанными комментариями: пояснение рядом с кодом иначе засчиталось бы как код.
 */
import {
  generateFractal, startPlayState, playDigit, revealSolution, rootSolved, FEED_CELL, N,
  type FractalPuzzle, type FractalPlayState,
} from '@/src/services/fractal-sudoku';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const SCREEN: string = (readFileSync(join(__dirname, '../../app/games/sudoku-fractal.tsx'), 'utf8') as string)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const совпадает = (grid: number[][], solution: number[][]) =>
  grid.every((row, r) => row.every((v, c) => v === solution[r][c]));

/** Поставить в нижнюю сетку заведомо неверную цифру — показ обязан её перезаписать. */
function сОшибкой(f: FractalPuzzle, child: number): FractalPlayState {
  const t = f.children[child];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (t.puzzle[r][c] !== 0) continue;
    const wrong = (t.solution[r][c] % 9) + 1;
    const res = playDigit(startPlayState(f), f, { child, r, c }, wrong);
    if (res) return res.next;
  }
  throw new Error('в нижней сетке нет пустой клетки');
}

describe('«Показать решение» во фрактале — движок', () => {
  const f1 = generateFractal(1, 'показ-решения-1');
  const f21 = generateFractal(21, 'показ-решения-21');

  it('🔴 нижняя сетка: ответ целиком, сетка открыта, её цифра ушла в корень', () => {
    for (const child of [0, 4, 8]) {
      const s = revealSolution(startPlayState(f1), f1, child);
      const t = f1.children[child];
      expect(`сетка ${child} совпала с ответом: ${совпадает(s.children[child].grid, t.solution)}`)
        .toBe(`сетка ${child} совпала с ответом: true`);
      expect(s.children[child].done).toBe(true);
      const [rr, rc] = t.feedsCell;
      expect(s.rootGrid[rr][rc]).toBe(t.solution[FEED_CELL[0]][FEED_CELL[1]]);
    }
  });

  it('неверную цифру человека показ перезаписывает — это и есть ответ', () => {
    const s0 = сОшибкой(f1, 2);
    expect(совпадает(s0.children[2].grid, f1.children[2].solution)).toBe(false);
    const s = revealSolution(s0, f1, 2);
    expect(совпадает(s.children[2].grid, f1.children[2].solution)).toBe(true);
  });

  it('показ нижней сетки не трогает остальные — кроме клетки-близнеца портала', () => {
    expect(f21.portals.length).toBeGreaterThan(0);
    const p = f21.portals[0];
    const start = startPlayState(f21);
    const s = revealSolution(start, f21, p.from);
    // близнец получил ту же цифру: клетка одна на две доски
    expect(s.children[p.to].grid[p.toCell[0]][p.toCell[1]]).toBe(p.digit);
    for (let i = 0; i < 9; i++) {
      if (i === p.from) continue;
      let изменено = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (s.children[i].grid[r][c] !== start.children[i].grid[r][c]) изменено++;
      }
      const можно = i === p.to ? 1 : 0;
      expect(`сетка ${i}: изменено клеток ${изменено}`).toBe(`сетка ${i}: изменено клеток ${можно}`);
    }
  });

  it('🔴 карта: показ решает всю судоку — все девять нижних и корень', () => {
    for (const f of [f1, f21]) {
      const s = revealSolution(startPlayState(f), f, null);
      expect(rootSolved(s.rootGrid, f.root.solution)).toBe(true);
      expect(s.children.every((ch) => ch.done)).toBe(true);
      expect(s.children.every((ch, i) => совпадает(ch.grid, f.children[i].solution))).toBe(true);
    }
  });

  it('исходное состояние не меняется — показ возвращает новое', () => {
    const start = startPlayState(f1);
    const копия = JSON.stringify(start);
    revealSolution(start, f1, null);
    expect(JSON.stringify(start)).toBe(копия);
  });
});

describe('«Показать решение» во фрактале — экран и счёт', () => {
  it('🔴 лампочка каркаса подключена и на карте, и в нижней сетке', () => {
    expect((SCREEN.match(/solution=\{\{/g) ?? []).length).toBe(2);
  });

  it('🔴 перед показом — вопрос: лампочка только открывает его, показ — по кнопке вопроса', () => {
    expect((SCREEN.match(/onPress: \(\) => setСпросРешения\(true\)/g) ?? []).length).toBe(2);
    expect(SCREEN).toMatch(/testID="fractal-solution-confirm"\s+onPress=\{показатьРешение\}/);
    expect(SCREEN).toMatch(/testID="fractal-solution-cancel"/);
  });

  it('🔴 показанное не отменяется и помечает партию', () => {
    const тело = SCREEN.slice(SCREEN.indexOf('const показатьРешение'), SCREEN.indexOf('const place ='));
    expect(тело).toContain('revealSolution(');
    expect(тело).toContain('hist.reset()');
    expect(тело).toContain('setСдался(true)');
  });

  it('🔴 разбор: ступень не засчитана и не опущена, сессия пишется с solver_used', () => {
    const тело = SCREEN.slice(SCREEN.indexOf('const закончитьРазбором'), SCREEN.indexOf('const показатьРешение'));
    expect(тело).not.toMatch(/lvl\.(reach|fail|setLevel)\(/);
    expect(тело).toContain('passed: false');
    expect(тело).toContain('solver_used: true');
    // корень, добитый рукой после показа, — тоже разбор, а не победа
    expect(SCREEN).toMatch(/if \(сдался\) закончитьРазбором\(\);\s*else void finish\(true\);/);
  });

  it('🔴 карточка итога не накрывает показанный ответ: у разбора нет фазы result', () => {
    const тело = SCREEN.slice(SCREEN.indexOf('const закончитьРазбором'), SCREEN.indexOf('const показатьРешение'));
    expect(тело).not.toContain("setPhase('result')");
    expect(SCREEN).toContain('testID="fractal-solution-shown"');
  });

  it('флаг показа живёт в снимке партии, версия снимка не поднята (поле необязательное)', () => {
    expect(SCREEN).toMatch(/solverUsed: сдался/);
    expect(SCREEN).toMatch(/setСдался\(s\.solverUsed === true\)/);
    expect(SCREEN).toMatch(/RESUME_V\s*=\s*3/);
  });
});
