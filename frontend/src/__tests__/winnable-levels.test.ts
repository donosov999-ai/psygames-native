/* psygames-winnable-levels · VER 1 · 22.08.2026 */
/**
 * В ЛЮБОЙ УРОВЕНЬ МОЖНО ДОИГРАТЬ.
 *
 * 🔴 КЛАСС ДЕФЕКТА, КОТОРЫЙ ПОВТОРИЛСЯ ТРИЖДЫ: победа сверяется с числом из
 * КОНФИГА, а доска собирается из того, что реально есть. Пока они совпадают —
 * всё работает; разошлись — партия не завершается НИКОГДА, и заметить это можно
 * только доиграв до того уровня.
 *
 * Где ловилось:
 *   · фрактальная судоку — починено ранее;
 *   · «Пары»: спрайтов ровно двенадцать, а формула с 22-го уровня просила
 *     тринадцать. Все карты открыты, ходов нет, счётчик висит «12/13». Игра при
 *     этом не скрыта из меню и стояла в ротации «Вызова дня».
 *
 * ⚠️ ПРОВЕРЯЕМ ПАРАМЕТРЫ УРОВНЯ ПРОТИВ ЗАПАСА МАТЕРИАЛА, а не «выглядит ли
 * разумно». Число, которого нет в наборе, попросить нельзя.
 */
import { SPRITE_COUNT } from '@/src/constants/pairThemes';
import { levelCfg } from '@/app/games/picture-pairs';
import { levelParams, answerChoices } from '@/app/games/quick-count';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;

describe('«Пары»: групп не больше, чем картинок в наборе', () => {
  const groupsAt = (L: number) => levelCfg(L).pairs;

  it('расчёт взят из ЖИВОЙ игры, а не переписан в тесте', () => {
    expect(typeof groupsAt(1)).toBe('number');
    expect(groupsAt(1)).toBeGreaterThan(1);
  });

  it('🔴 ни на одном уровне до сотого не просят больше, чем есть', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const groups = groupsAt(L);
      if (groups > SPRITE_COUNT) bad.push(`L${L}: просит ${groups} из ${SPRITE_COUNT}`);
      if (groups < 2) bad.push(`L${L}: групп ${groups} — играть не во что`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('на 22-м уровне — том самом — просят ровно столько, сколько есть', () => {
    expect(groupsAt(22)).toBe(SPRITE_COUNT);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ: без ограничителя 22-й уровень обязан просить больше
   * набора. Иначе всё выше зеленеет на пустом месте.
   */
  it('без ограничителя дефект бы вернулся', () => {
    const raw = (L: number) => (L <= 9 ? Math.min(12, 3 + L) : L <= 12 ? 4 + (L - 10) : 4 + (L - 13));
    expect(raw(22)).toBeGreaterThan(SPRITE_COUNT);
  });
});

describe('🔴 счётчик победы берётся из доски, а не из конфига', () => {
  const screen = read('../../app/games/picture-pairs.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('число групп для победы считается по СОБРАННОЙ колоде', () => {
    expect(screen).toMatch(/setPairsCount\(new Set\(deck\.map/);
  });

  it('и больше не приходит из конфига', () => {
    expect(screen).not.toMatch(/setPairsCount\(pairs\)/);
  });
});

describe('«Быстрый счёт»: верный ответ всегда есть на экране', () => {
  /**
   * 🔴 ДИАПАЗОН ПЕРЕВОРАЧИВАЛСЯ С СОРОКОВОГО УРОВНЯ: нижняя граница росла без
   * потолка, верхняя упиралась в двадцать. На 43-м кнопка оставалась одна при
   * четырёх возможных ответах, на 45-м кнопок не оставалось НИ ОДНОЙ — партия
   * вставала намертво. Тот же класс, что у «Пар»: уровень просит того, чего
   * экран дать не может.
   */
  it('🔴 нижняя граница никогда не обгоняет верхнюю — сто уровней подряд', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const p = levelParams(L);
      if (p.minN > p.maxN) bad.push(`L${L}: ${p.minN}..${p.maxN} перевёрнут`);
      if (p.maxN - p.minN < 2) bad.push(`L${L}: разброс ${p.maxN - p.minN} — угадывание, а не счёт`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 кнопки накрывают ВЕСЬ возможный ответ', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const p = levelParams(L);
      const buttons = new Set(answerChoices(p));
      for (let n = p.minN; n <= p.maxN; n += 1) {
        if (!buttons.has(n)) bad.push(`L${L}: ответа ${n} нет на экране`);
      }
      if (buttons.size < 3) bad.push(`L${L}: кнопок ${buttons.size}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('на 45-м — том самом — кнопки есть', () => {
    expect(answerChoices(levelParams(45)).length).toBeGreaterThanOrEqual(3);
  });

  /** ⚠️ Проверка проверки: прежняя формула на 45-м давала ноль кнопок. */
  it('прежняя формула эту проверку бы завалила', () => {
    const raw = (L: number) => {
      const base = 3 + Math.floor((L - 1) / 2);
      const spread = 2 + Math.floor(L / 5);
      return { minN: base, maxN: Math.min(20, base + spread) };
    };
    expect(raw(45).minN).toBeGreaterThan(raw(45).maxN);
  });
});
