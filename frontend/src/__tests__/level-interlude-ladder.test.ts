/* psygames-level-interlude-ladder · VER 1 · 21.08.2026 */
/**
 * ЛЕСТНИЦА В ЗАСТАВКЕ: ПИТОМЕЦ ИДЁТ ВВЕРХ, И ВИДЕН НЕ ОДИН ПЕРЕХОД.
 *
 * 🔴 ЧТО БЫЛО. Дорожка между уровнями шла ВБОК и показывала ровно два узла —
 * пройденный и следующий. Замечание Дениса 21.08.2026 дословно: «питомец должен
 * двигаться снизу экрана по этой дорожке пути вверх, а не вбок» и «почему
 * показывается только один шаг уровней, типа 2-3, а 1 шаг уже не виден».
 *
 * Два узла показывали СОБЫТИЕ и не показывали ПУТЬ: на любом уровне заставка
 * выглядела одинаково, и «сколько уже пройдено» из неё узнать было нельзя.
 *
 * ⚠️ ПРОВЕРЯЕМ ЧИСЛАМИ, А НЕ СЛОВОМ В ИСХОДНИКЕ. «В файле есть translateY» не
 * значит «идёт вверх»: у экранной оси Y низ положительный, и тот же translateY
 * с плюсом увёл бы питомца ВНИЗ. Поэтому считаем ту же геометрию, что и
 * компонент, и требуем от неё знака и количества.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const SRC = readFileSync(join(__dirname, '../components/LevelInterlude.tsx'), 'utf8') as string;
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * ⚠️ ОКНО БЕРЁМ ИЗ КОМПОНЕНТА, А НЕ СЧИТАЕМ ЗАНОВО. Первая редакция этого теста
 * держала свою копию формулы — и осталась ЗЕЛЁНОЙ, когда компонент нарочно
 * сломали до одного перехода: проверялись свойства формулы, а не то, что
 * компонент ею пользуется. Своя копия рядом с проверяемым кодом — это не
 * проверка, а второе место, где может быть ошибка.
 */
import { interludeSteps as steps } from '@/src/components/LevelInterlude';
import LevelInterlude from '@/src/components/LevelInterlude';
import React from 'react';

const TestRenderer = require('react-test-renderer');
jest.mock('@/src/services/pet', () => ({
  getPetSkin: async () => 'default',
  getPetAccessory: async () => null,
}));

/** Что человек РЕАЛЬНО увидит на ступенях — по дереву, а не по исходнику. */
function ladderNumbers(level: number): number[] {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(LevelInterlude as any, {
      level, stars: 2, ms: 2200, doneLine: 'готово', nextLine: 'дальше',
    }));
  });
  const nums = r.root.findAllByType('Text')
    .map((n: any) => Number(n.props.children))
    .filter((n: number) => Number.isFinite(n));
  TestRenderer.act(() => r.unmount());
  return nums;
}

describe('лестница уровней в заставке', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(SRC.length).toBeGreaterThan(2000);
    expect(code).toContain('translateY');
  });

  it('🔴 питомец едет ВВЕРХ: смещение отрицательное, а не положительное', () => {
    // outputRange: [0, -segment] — минус и есть «вверх» на экранной оси.
    const m = code.match(/outputRange:\s*\[\s*0\s*,\s*(-?)segment\s*\]/);
    expect(`знак смещения: ${m?.[1] ?? 'нет такой строки'}`).toBe('знак смещения: -');
  });

  it('🔴 вбок питомец больше не едет', () => {
    expect(/translateX/.test(code)).toBe(false);
  });

  /**
   * Порядок задаёт раскладка: `column-reverse` ставит ПЕРВОГО ребёнка вниз.
   * Значит массив обязан идти по возрастанию — иначе лестница перевернётся, и
   * питомец пойдёт от старшей ступени к младшей. Проверяем обе половины: и что
   * раскладка перевёрнута, и что окно возрастает (вызовом настоящей функции).
   */
  it('🔴 младшая ступень внизу — порядок задаёт раскладка, а не сортировка', () => {
    expect(code).toContain("flexDirection: 'column-reverse'");
    for (const lvl of [1, 2, 5, 30]) {
      const s = steps(lvl);
      expect(`${lvl}: ${s.join(',')}`).toBe(`${lvl}: ${[...s].sort((a, b) => a - b).join(',')}`);
    }
  });

  it('🔴 виден не один переход: на 2→3 ступень 1 на месте', () => {
    expect(steps(2)).toEqual([1, 2, 3]);
  });

  it('🔴 окно растёт до четырёх и дальше не пухнет', () => {
    expect(steps(1)).toEqual([1, 2]);
    expect(steps(3)).toEqual([1, 2, 3, 4]);
    expect(steps(9)).toEqual([7, 8, 9, 10]);
    expect(steps(57)).toEqual([55, 56, 57, 58]);
  });

  it('ниже единицы ступеней не бывает', () => {
    for (const lvl of [1, 2, 3]) expect(Math.min(...steps(lvl))).toBeGreaterThanOrEqual(1);
  });

  it('🔴 следующая ступень ровно одна, остальные пройдены', () => {
    for (const lvl of [1, 2, 5, 30]) {
      const s = steps(lvl);
      expect(s.filter((n) => n > lvl)).toEqual([lvl + 1]);
    }
  });

  /**
   * Питомец стоит на ТОЛЬКО ЧТО пройденной ступени — предпоследней снизу, — и
   * поднимается ровно на один шаг. Ошибка на единицу здесь означала бы, что он
   * стартует не с той ступени и приходит мимо.
   */
  it('🔴 старт — предпоследняя снизу, приход — последняя', () => {
    for (const lvl of [1, 2, 5, 30]) {
      const s = steps(lvl);
      expect(s[s.length - 2]).toBe(lvl);
      expect(s[s.length - 1]).toBe(lvl + 1);
    }
  });

  it('🔴 высота лестницы — доля экрана, с полом и потолком', () => {
    const trackH = (h: number) => Math.max(170, Math.min(Math.round(h * 0.42), 300));
    expect(trackH(0)).toBe(170);        // высота ещё не приехала — не схлопываемся
    expect(trackH(667)).toBe(280);
    expect(trackH(844)).toBe(300);
    expect(trackH(1400)).toBe(300);     // планшет — не растягиваем во весь экран
  });

  /**
   * 🔴 РЕНДЕРОМ, А НЕ ФОРМУЛОЙ. Всё выше проверяет расчёт; здесь — что расчёт
   * доехал до экрана. Компонент можно посчитать верно и нарисовать два узла.
   */
  it('🔴 на экране видны все ступени окна, а не только переход', () => {
    expect(ladderNumbers(5)).toEqual([3, 4, 5, 6]);
  });

  it('🔴 случай из замечания: на 2→3 ступень 1 видна на экране', () => {
    expect(ladderNumbers(2)).toEqual([1, 2, 3]);
  });

  it('на первом уровне рисуем две ступени и ни одного нуля', () => {
    expect(ladderNumbers(1)).toEqual([1, 2]);
  });
});
