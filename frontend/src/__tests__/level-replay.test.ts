/**
 * ПЕРЕИГРАТЬ ПРОЙДЕННЫЙ УРОВЕНЬ С ТРОПИНКИ.
 *
 * ЗАЧЕМ. Денис про тропинку дословно: «там можно вернуться к боссу или какой-то
 * интересной части». До этого тропинка была картинкой: путь видно, свернуть с него
 * нельзя. Теперь нажатие на пройденный узел выбирает уровень, а запускает его та же
 * кнопка «Начать» — логику старта в 59 играх никто не трогал.
 *
 * ⚠️ ГЛАВНАЯ ОПАСНОСТЬ ЭТОЙ ФУНКЦИИ — СЪЕДЕННЫЙ ПРОГРЕСС. Игра, которая на успехе
 * пишет уровень ПРЯМО (`setLevel(пройденный + 1)`), после переигровки третьего
 * уровня при рекорде двадцать записала бы четвёрку и срезала семнадцать уровней.
 * Так было устроено четыре игры: судоку своим ключом, маджонг, сортировка и парные
 * картинки — через lvl.setLevel(next). Поэтому здесь два разных гейта: правило
 * выбора и запрет прямой записи.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

import { pickTarget } from '../services/levelPick';

const GAMES_DIR = join(__dirname, '../../app/games');
const read = (p: string): string => readFileSync(p, 'utf8');
const game = (f: string): string => read(join(GAMES_DIR, f));
const HOOK = read(join(__dirname, '../hooks/usePersistentLevel.ts'));
const MAP = read(join(__dirname, '../components/LevelProgressMap.tsx'));

describe('правило выбора уровня', () => {
  it('пройденный уровень выбирается', () => {
    expect(pickTarget(3, 10)).toBe(3);
    expect(pickTarget(1, 2)).toBe(1);
  });

  it('свой потолок снимает переигровку — это способ вернуться', () => {
    expect(pickTarget(10, 10)).toBeNull();
  });

  /** Тропинка — карта пути, а не лифт: перепрыгнуть сложность нажатием нельзя. */
  it('выше потолка не пускает', () => {
    expect(pickTarget(11, 10)).toBeNull();
    expect(pickTarget(999, 10)).toBeNull();
  });

  it('мусор на входе не роняет и не уводит ниже первого', () => {
    expect(pickTarget(0, 10)).toBe(1);
    expect(pickTarget(-5, 10)).toBe(1);
    expect(pickTarget(3.4, 10)).toBe(3);
    expect(pickTarget(1, 1)).toBeNull();   // первый уровень = потолок, переигрывать нечего
  });
});

describe('переигровка не портит прогресс', () => {
  /**
   * reach обязан сравнивать с ДОСТИГНУТЫМ, а не с тем, на чём играли. Иначе
   * успешная переигровка уровня 3 выглядит как «дорос до 3» и обнуляет десятку.
   */
  it('потолок растёт только вверх', () => {
    expect(HOOK).toMatch(/if \(target > levelRef\.current\) \{ setLevel\(target\); return true; \}/);
  });

  /**
   * Провал на переигровке — не «стало трудно», а выбор человека вернуться в лёгкое.
   * Понижать за это значит наказывать за интерес к собственной истории.
   */
  it('провал переигровки не понижает уровень', () => {
    expect(HOOK).toMatch(/if \(pickedRef\.current !== null\) \{ clearPick\(\); return false; \}/);
  });

  /** Забытая переигровка тихо занижала бы сложность на месяцы — она только в памяти. */
  it('выбор не сохраняется на диск', () => {
    const pickBlock = HOOK.slice(HOOK.indexOf('const pick ='), HOOK.indexOf('const reach ='));
    expect(pickBlock).not.toContain('AsyncStorage');
  });

  /**
   * НИ ОДНА игра не пишет уровень прямой установкой на успехе. Разрешён только
   * явный сброс `setLevel(1)` — кнопка «начать заново» в трёх играх.
   */
  it('ни одна игра не срезает потолок прямой записью уровня', () => {
    const bad: string[] = [];
    for (const f of readdirSync(GAMES_DIR).filter((n: string) => n.endsWith('.tsx'))) {
      for (const m of game(f).matchAll(/lvl\.setLevel\(([^)]*)\)/g)) {
        if (m[1].trim() !== '1') bad.push(`${f}: lvl.setLevel(${m[1]})`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** Судоку хранит уровень своим ключом — там та же защита руками. */
  it('судоку пишет в хранилище максимум, а не сыгранный + 1', () => {
    expect(game('sudoku.tsx')).toContain('const nextBest = Math.max(best, level + 1);');
    expect(game('sudoku.tsx')).not.toMatch(/setItem\(`psygames_sudoku_level_\$\{pidDone\}`, String\(level \+ 1\)\)/);
  });
});

describe('тропинка', () => {
  /**
   * ⚠️ САМАЯ НЕОЧЕВИДНАЯ ЧАСТЬ. Выбор уровня ОПУСКАЕТ currentLevel — игра будет
   * играть на нём. Если считать потолком его же, то после нажатия на узел 3 при
   * достигнутых 10 узлы 4..10 станут «непройденными», нажать на них будет нельзя,
   * и человек заперт в тройке без пути назад. Спасает максимум за монтирование.
   */
  it('потолок пути помнит максимум, а не следует за выбором', () => {
    expect(MAP).toContain('if (sel > topRef.current) topRef.current = sel;');
    expect(MAP).toContain('const reached = topRef.current;');
  });

  it('нажимаются только пройденные узлы и свой потолок', () => {
    expect(MAP).toContain('if (l > reached && !(stars[l] || 0)) return null;');
  });

  /**
   * У методик (Iowa, RMET, охват, дыхание, словарь) уровень считает ПРОХОЖДЕНИЯ,
   * а не ступени сложности. «Вернуться на прохождение №3» — бессмыслица.
   */
  it('у методик переигровки нет', () => {
    expect(MAP).toContain('const canPick = !!onPickLevel && !countsRuns;');
  });

  /** Подпись обязана совпадать с тем, что запустит кнопка «Начать». */
  it('заголовок показывает выбранный уровень, а не потолок', () => {
    expect(MAP).toContain("t('levelOfMax').replace('{n}', String(sel))");
  });
});

describe('охват', () => {
  const screens = readdirSync(GAMES_DIR).filter((n: string) => n.endsWith('.tsx'))
    .filter((f: string) => game(f).includes('<LevelProgressMap'));

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(screens.length).toBeGreaterThan(55);
  });

  /**
   * Каждая игра со ступенями сложности даёт переигровку. Исключения — только те,
   * где уровень считает прохождения: там countsRuns, и гейт это признаёт сам,
   * а не по списку имён, который забыли бы обновить.
   */
  it('переигровка есть везде, кроме счётчиков прохождений', () => {
    const without = screens.filter((f: string) => {
      const src = game(f);
      return !src.includes('onPickLevel') && !src.includes('countsRuns');
    });
    expect(without).toEqual([]);
  });
});
