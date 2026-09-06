/**
 * 🔴 ПОДВИЖНАЯ НИША — ЛОМАЕТ ПЛАН СЕРИИ ХОДОВ, А НЕ ОТБИРАЕТ ХОД.
 *
 * Ось записана в `PSYGAMES_MERGE_PLAN.md:469` как ★★ и не была сделана:
 * «`goods-sort` · порядок ниш · нельзя планировать серию ходов». Сортировка —
 * игра с полной информацией, и весь план строится вперёд на три-четыре хода.
 * Если ниши меняются местами, план приходится пересобирать: знание «что где»
 * остаётся, знание «куда нести» — нет.
 *
 * 🔴 ПЕРЕСТАНОВКА ТОЛЬКО СРЕДИ НИШ ОДИНАКОВОЙ ЁМКОСТИ, и это не украшение.
 * §8 разбора требует «везти `caps` вместе с содержимым». Второй способ выполнить
 * то же требование — вообще не разлучать ёмкость с МЕСТОМ: если переставлять
 * только равные по ёмкости, содержимое никуда не переполнится по построению, а
 * `capsForBoard` остаётся верным (он считает ёмкости от уровня, а не от истории
 * ходов). Стопка из четырёх, приехавшая в нишу на два, — это молча испорченное
 * состояние, которое не поймает ни одна проверка «сумма ёмкостей = ниш × 3».
 *
 * ЗАМЕР ДО ПРАВКИ: подвижных ниш в игре нет — прогон L1…L60 даёт 0 уровней,
 * на которых порядок ниш меняется хоть раз.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import {
  GS_RULES, MOVING_FROM, MOVE_SHIFT_EVERY, movingNiches, nicheShift, permuteCells,
  strictPlacement, hiddenInfo, capsFor, dealBoard, capsForBoard, levelCfg, goalPlan,
} from '@/src/games/goods-sort/core/level';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);
const POOL = Array.from({ length: 34 }, (_, i) => i);

describe('подвижная ниша', () => {
  it('есть что проверять — уровни с подвижными нишами есть, и не все', () => {
    const свои = LEVELS.filter(movingNiches);
    expect(свои.length).toBeGreaterThan(2);
    expect(свои.length).toBeLessThan(LEVELS.length / 2);
    expect(Math.min(...свои)).toBe(MOVING_FROM);
  });

  /**
   * Три режима уровня не должны наслаиваться: строгая укладка, скрытая
   * информация и подвижные ниши берут разные фазы. Проверяется исполнением, а
   * не арифметикой в уме — ровно так же, как это уже делает `goods-sort-hidden`.
   */
  it('🔴 не совпадает ни со строгой укладкой, ни со скрытой информацией', () => {
    const плохо = LEVELS.filter(movingNiches)
      .filter((L) => strictPlacement(L) || hiddenInfo(L))
      .map((L) => `L${L}: подвижные ниши вместе с ${strictPlacement(L) ? 'строгой укладкой' : 'скрытой информацией'}`);
    expect(плохо).toEqual([]);
  });

  /**
   * Примёрзший ряд задан ПОЗИЦИЕЙ, а не содержимым: он держит ряд доски, а не
   * конкретные товары. Двигать ниши сквозь него значит менять, что именно
   * заморожено, посреди партии — и уровень может стать нерешаемым молча.
   */
  it('🔴 не совпадает с примёрзшим рядом', () => {
    const плохо = LEVELS.filter(movingNiches)
      .filter((L) => levelCfg(L, 8, false).obst.frozenRow)
      .map((L) => `L${L}: подвижные ниши поверх примёрзшего ряда`);
    expect(плохо).toEqual([]);
  });

  /**
   * Цель «освободить ниши» помечает КОНКРЕТНЫЕ ниши номерами. Сдвиг возит
   * содержимое между номерами — цель поехала бы вместе с доской, и
   * «опустошить помеченные» перестало бы что-либо значить.
   */
  it('🔴 не совпадает с целью «освободить ниши»', () => {
    const плохо = LEVELS.filter(movingNiches)
      .filter((L) => goalPlan(L).kind === 'free')
      .map((L) => `L${L}: подвижные ниши при цели «освободить ниши» — цель поедет вместе с доской`);
    expect(плохо).toEqual([]);
  });

  it('🔴 перестановка — настоящая биекция, без потерь и дублей', () => {
    const плохо: string[] = [];
    for (const slots of [9, 12, 14]) {
      const caps = capsFor(45, slots);
      for (let шаг = 0; шаг < 6; шаг += 1) {
        const p = nicheShift(caps, шаг);
        if (p.length !== slots) { плохо.push(`${slots}/${шаг}: длина ${p.length}`); continue; }
        if (new Set(p).size !== slots) плохо.push(`${slots}/${шаг}: не биекция`);
        if (p.some((j) => j < 0 || j >= slots)) плохо.push(`${slots}/${шаг}: индекс вне доски`);
      }
    }
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ ПО ЗАДАЧЕ: ниши правда МЕНЯЮТСЯ МЕСТАМИ. Тождественная
   * перестановка прошла бы все проверки выше и не сделала бы ничего.
   */
  it('🔴 на каждом своём уровне переставляются минимум две ниши', () => {
    const слабые: string[] = [];
    for (const L of LEVELS.filter(movingNiches)) {
      const { cells } = dealBoard(L, POOL, false);
      const caps = capsForBoard(L, cells);
      const p = nicheShift(caps, 1);
      const сдвинуто = p.filter((j, i) => j !== i).length;
      if (сдвинуто < 2) слабые.push(`L${L}: сдвинулось ${сдвинуто} ниш — плана это не ломает`);
    }
    expect(слабые).toEqual([]);
  });

  /**
   * 🔴 ЁМКОСТЬ НЕ РАЗЛУЧАЕТСЯ С МЕСТОМ. Переставляются только равные по
   * ёмкости — значит после сдвига любое содержимое влезает в свою новую нишу.
   * Это и есть выполнение требования «везти caps вместе с содержимым».
   */
  it('🔴 после сдвига ничто не переполняется: меняются только равные по ёмкости', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(movingNiches)) {
      const { cells } = dealBoard(L, POOL, false);
      const caps = capsForBoard(L, cells);
      for (let шаг = 0; шаг < 4; шаг += 1) {
        const p = nicheShift(caps, шаг);
        for (let i = 0; i < caps.length; i += 1) {
          if (caps[i] !== caps[p[i] as number]) плохо.push(`L${L}/${шаг}: ниша ${i} (ёмкость ${caps[i]}) едет в ёмкость ${caps[p[i] as number]}`);
        }
        const после = permuteCells(cells, p);
        for (let i = 0; i < после.length; i += 1) {
          if ((после[i] as number[]).length > (caps[i] as number)) плохо.push(`L${L}/${шаг}: в нише ${i} ${(после[i] as number[]).length} товаров при ёмкости ${caps[i]}`);
        }
      }
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 сдвиг ничего не теряет и не создаёт: мультимножество товаров то же', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(movingNiches)) {
      const { cells } = dealBoard(L, POOL, false);
      const caps = capsForBoard(L, cells);
      const до = cells.flat().slice().sort((a, b) => a - b).join(',');
      const после = permuteCells(cells, nicheShift(caps, 2)).flat().slice().sort((a, b) => a - b).join(',');
      if (до !== после) плохо.push(`L${L}: товары изменились при сдвиге`);
    }
    expect(плохо).toEqual([]);
  });

  /** Такт сдвига объявлен числом и вменяем: чаще каждого второго хода — это шум. */
  it('такт сдвига задан и не превращает игру в шум', () => {
    expect(MOVE_SHIFT_EVERY).toBeGreaterThanOrEqual(3);
    expect(MOVE_SHIFT_EVERY).toBeLessThanOrEqual(10);
  });

  it('🔴 правило заведено с тем же порогом и переведено на двенадцать языков', () => {
    const r = GS_RULES.find((x) => x.key === 'moving');
    expect(r).toBeDefined();
    expect(r!.fromLevel).toBe(MOVING_FROM);
    const поля = ['title', 'rule', 'example'];
    const нет: string[] = [];
    const base = read('src/contexts/LanguageContext.tsx');
    for (const f of поля) if (!base.includes(`lr_goods_sort_moving_${f}:`)) нет.push(`base/${f}`);
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const f of поля) if (!src.includes(`"lr_goods_sort_moving_${f}"`)) нет.push(`${loc}/${f}`);
    }
    expect(нет).toEqual([]);
  });
});
