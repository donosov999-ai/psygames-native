/* psygames-one-line-growth · VER 1 · 22.08.2026 */
/**
 * РОСТ НЕ КОНЧАЕТСЯ, И СЛОВАРЬ МЕХАНИК НЕ СХЛОПЫВАЕТСЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ РАЗБОРОМ 22.08.2026:
 *   · число вершин упиралось в двенадцать к 22-му уровню, треугольники — в три к
 *     25-му. То есть 27 уровней из 48 давали ОДИН И ТОТ ЖЕ граф, только
 *     перетасованный;
 *   · двойных и односторонних рёбер генератор не ставил ВООБЩЕ. Человек
 *     знакомился со стрелкой на одиннадцатом рисованном уровне и больше не видел
 *     её никогда — словарь механик схлопывался ровно там, где должен расти.
 *
 * ⚠️ БЕЗОПАСНОСТЬ ПО ПОСТРОЕНИЮ. Смешанный граф правилом чётности не
 * описывается, поэтому оба вида добавляются так, что УЖЕ НАЙДЕННЫЙ путь остаётся
 * рабочим: стрелка ставится по направлению прохода, двойное подвешивается
 * отростком «сходил и вернулся».
 */
import { generateOneLinePuzzle } from '@/src/games/one-line/core/generator';
import { AUTHORED_LEVEL_COUNT } from '@/src/games/one-line/core/authored';
import { totalEdgeUses, validateEulerSolution } from '@/src/games/one-line/core/validator';

const LEVELS = 48;
const at = (lv: number, seed = 'grow') => generateOneLinePuzzle(seed, lv);

describe('рост продолжается за плато вершин', () => {
  /**
   * ⚠️ СРЕДНЕЕ ПО НЕСКОЛЬКИМ ЗЁРНАМ, А НЕ ОДНА ВЫБОРКА. Зерно включает номер
   * уровня, поэтому два разных уровня дают разные графы даже когда параметры у
   * них ОДИНАКОВЫЕ — и сравнение одной пары проходит по случайности. Прежняя
   * редакция этой проверки так и зеленела на сломанном генераторе.
   */
  const avgEdges = (lv: number): number => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
    return seeds.reduce((n, s2) => n + at(lv, s2).edges.length, 0) / seeds.length;
  };

  it('🔴 после 22-го уровня растут РЁБРА, раз вершины упёрлись', () => {
    const early = avgEdges(26);
    const late = avgEdges(LEVELS);
    // Не «хоть на сколько-нибудь», а заметно: при прежнем потолке разницы нет вовсе.
    expect(`с ${early.toFixed(1)} до ${late.toFixed(1)}: ${late - early >= 4 ? 'растёт' : 'СТОИТ'}`)
      .toBe(`с ${early.toFixed(1)} до ${late.toFixed(1)}: растёт`);
  });

  it('и запутанность раскладки тоже растёт', () => {
    expect(at(22).visualCrossings).toBeLessThan(at(LEVELS).visualCrossings);
  });

  it('🔴 два далёких уровня не дают ОДИН И ТОТ ЖЕ граф', () => {
    const shape = (lv: number) => `${at(lv).vertices.length}/${at(lv).edges.length}`;
    const seen = new Set([26, 32, 38, 44, 48].map(shape));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('🔴 приправа появляется у генератора, а не только в рисованных', () => {
  const sample = () => {
    const out: { arrows: number; doubles: number; edges: number }[] = [];
    for (let lv = AUTHORED_LEVEL_COUNT + 1; lv <= LEVELS; lv += 1) {
      for (const seed of ['a', 'b', 'c']) {
        const p = at(lv, seed);
        out.push({
          arrows: p.edges.filter((e) => e.kind === 'oneway').length,
          doubles: p.edges.filter((e) => e.kind === 'double').length,
          edges: p.edges.length,
        });
      }
    }
    return out;
  };

  it('стрелки и двойные рёбра встречаются', () => {
    const s = sample();
    expect(s.reduce((n, x) => n + x.arrows, 0)).toBeGreaterThan(0);
    expect(s.reduce((n, x) => n + x.doubles, 0)).toBeGreaterThan(0);
  });

  it('но остаются ПРИПРАВОЙ: меньше пятой части рёбер', () => {
    const s = sample();
    const spice = s.reduce((n, x) => n + x.arrows + x.doubles, 0);
    const edges = s.reduce((n, x) => n + x.edges, 0);
    /**
     * ⚠️ ПОТОЛОК ЖЁСТКИЙ, А НЕ «ЛИШЬ БЫ НЕ ПОЛОВИНА». Замер на 144 уровнях:
     * стрелок 7,6 %, двойных 1,7 %. У игры-образца три процента. Порог 12 %
     * оставляет запас на разброс и при этом краснеет, если снять ограничитель.
     */
    /**
     * ⚠️ ПОТОЛОК НА СРЕДНЕЕ ПО ВСЕМ УРОВНЯМ. Замер на 144 уровнях: стрелок 7,6 %,
     * двойных 1,7 %, вместе 9,3 %. У игры-образца три процента. Отдельный уровень
     * может выскочить и на тринадцать — это разброс, а не поломка; а вот среднее
     * выше десяти означает, что ограничитель сняли.
     */
    expect(`доля приправы ${(spice / edges * 100).toFixed(1)}% ${spice / edges < 0.10 ? 'ок' : 'МНОГО'}`)
      .toBe(`доля приправы ${(spice / edges * 100).toFixed(1)}% ок`);
  });

  it('на первом уровне после рисованных приправы почти нет', () => {
    const p = at(AUTHORED_LEVEL_COUNT + 1);
    expect(p.edges.filter((e) => e.kind === 'double').length).toBe(0);
  });
});

describe('🔴 каждый уровень остаётся решаемым', () => {
  it('путь, найденный ядром, проходит доску целиком — 144 уровня подряд', () => {
    const bad: string[] = [];
    for (let lv = AUTHORED_LEVEL_COUNT + 1; lv <= LEVELS; lv += 1) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const p = at(lv, seed);
        if (!validateEulerSolution(p, p.solution)) bad.push(`L${lv}/${seed}`);
        if (p.solution.edgeIds.length !== totalEdgeUses(p.edges)) bad.push(`L${lv}/${seed}: длина пути`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ. Испорченный путь обязан быть отвергнут — иначе всё
   * выше зеленеет на чём угодно. 22.08.2026 прежняя редакция проверки решения
   * жила по старой модели «каждое ребро ровно раз» и объявила нерешаемыми 43
   * уровня из 108, ни один из которых нерешаемым не был.
   */
  it('испорченный путь не принимается', () => {
    const p = at(30);
    const cut = { vertexIds: p.solution.vertexIds.slice(0, -1), edgeIds: p.solution.edgeIds.slice(0, -1) };
    expect(validateEulerSolution(p, cut)).toBe(false);
    const reversed = { ...p.solution, vertexIds: [...p.solution.vertexIds].reverse() };
    expect(validateEulerSolution(p, reversed)).toBe(false);
  });
});
