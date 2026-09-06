/**
 * 🔴 НИША-ДЖОКЕР — КЛАПАН ПРОТИВ СТРОГОЙ УКЛАДКИ, А НЕ ЛИШНЕЕ МЕСТО.
 *
 * Взято у конкурента («временный контейнер»), но переложено на доску, а не в
 * магазин: джокер не покупается и не даёт лишней ёмкости — он снимает с ОДНОЙ
 * ниши правило укладки. Поэтому он и осмыслен только там, где это правило есть:
 * на обычном уровне ниша и так принимает что угодно, пока есть место
 * (`canPlace`: `if (!strict) return true`), и джокер был бы пустым словом.
 *
 * 🔴 ИНВАРИАНТ «КРАТНОСТИ ТРЁМ» НЕ ТРОГАЕТСЯ. Сумма ёмкостей равна «ниш × 3» и
 * после правки: джокер не добавляет ни одного товара и не меняет `capsFor`, он
 * даёт МЕСТО, куда можно положить. Вся арифметика решаемости (`spares`, потолок
 * типов, ёмкость за вычетом запертых) посчитана из этой суммы — сдвинь её, и
 * уровень станет теснее задуманного, причём молча.
 *
 * ЗАМЕР ДО ПРАВКИ (прогон L1…L60, `dealBoard` + `placementOk`, пул 34 вида):
 * строгих уровней 11 (L30, 33, 36 … 60), допустимых первых ходов **25,55** в
 * среднем, стартовых тупиков 0. Джокер обязан это число поднять — иначе он
 * ничего не делает.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import {
  GS_RULES, JOKER_FROM, jokerNiches, jokersForBoard, strictPlacement,
  dealBoard, capsForBoard, placementOk, levelCfg,
} from '@/src/games/goods-sort/core/level';
import { makeBoard, canPlace } from '@/src/games/goods-sort/core/board';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);
const POOL = Array.from({ length: 34 }, (_, i) => i);

/**
 * 🔴 ГДЕ ЖИВЁТ ДЖОКЕР — НЕ НА СТАРТОВОЙ ДОСКЕ.
 *
 * Замер стартовых досок (L36…L60, `dealBoard`, пул 34): из девяти ниш-джокеров
 * **восемь полны и одна пуста**. И то и другое для джокера — ноль: полная не
 * принимает ничего, а ПУСТАЯ и так принимает любой тип, потому что строгая
 * укладка написана как «пусто ИЛИ сверху свой» (`canPlace`). Разница появляется
 * с ВТОРОГО товара: обычная ниша с этого момента заперта на один тип, джокер —
 * нет. Поэтому считаем не «ходы на старте», а сколько типов принимает ниша,
 * когда в ней уже что-то лежит. Первая редакция гейта мерила старт и показала
 * рост лишь на 3 уровнях из 9 — мерила не то место.
 */
function типовПринимает(L: number, джокер: boolean): number {
  const { cells } = dealBoard(L, POOL, false);
  const caps = capsForBoard(L, cells);
  const strict = strictPlacement(L);
  const i = jokerNiches(L, cells.length)[0] as number;
  const cap = caps[i] as number;
  if (cap < 2) return 0;
  // Ставим в нишу один товар — ровно тот ход, после которого обычная ниша
  // запирается на его тип. Тип берём с доски, чтобы он был настоящим.
  const первый = (cells.find((c) => c.length > 0) ?? [0])[0] as number;
  const ниша = [первый];
  const типы = new Set<number>();
  for (const c of cells) for (const t of c) типы.add(t);
  let n = 0;
  for (const t of типы) if (placementOk([...ниша], t, strict, cap, джокер)) n += 1;
  return n;
}

describe('ниша-джокер', () => {
  it('есть что проверять — строгие уровни существуют и джокер на них есть', () => {
    const строгие = LEVELS.filter(strictPlacement);
    expect(строгие.length).toBeGreaterThanOrEqual(9);
    const сДжокером = LEVELS.filter((L) => jokerNiches(L, 14).length > 0);
    expect(сДжокером.length).toBeGreaterThan(0);
    // Обе стороны непусты: есть уровни и с джокером, и без.
    expect(сДжокером.length).toBeLessThan(LEVELS.length);
  });

  /**
   * Джокер снимает правило укладки, которое существует только на строгих
   * уровнях. Появиться раньше строгой укладки он не может — там снимать нечего.
   */
  it('🔴 джокер бывает только на строгих уровнях и не раньше своего порога', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      const есть = jokerNiches(L, 14).length > 0;
      if (есть && !strictPlacement(L)) плохо.push(`L${L}: джокер без строгой укладки — снимать нечего`);
      if (есть && L < JOKER_FROM) плохо.push(`L${L}: джокер раньше порога L${JOKER_FROM}`);
      if (!есть && L >= JOKER_FROM && strictPlacement(L)) плохо.push(`L${L}: строгий уровень выше порога, а джокера нет`);
    }
    expect(плохо).toEqual([]);
  });

  it('джокер ровно один на уровне и указывает на существующую нишу', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      for (const slots of [9, 12, 14]) {
        const j = jokerNiches(L, slots);
        if (j.length > 1) плохо.push(`L${L}/${slots}: джокеров ${j.length}`);
        if (j.some((i) => i < 0 || i >= slots)) плохо.push(`L${L}/${slots}: индекс вне доски`);
      }
    }
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ: ниша-джокер принимает ЧУЖОЙ тип при строгой укладке, обычная —
   * нет. Проверяется настоящим предикатом ядра, а не пересказом правила.
   */
  it('🔴 джокер принимает чужой товар под строгой укладкой, обычная ниша — нет', () => {
    const доска = makeBoard([[7, 7], [7, 7]], [3, 3], [true, false]);
    expect(canPlace(доска, 0, 5, true)).toBe(true);    // джокер: чужой тип принят
    expect(canPlace(доска, 1, 5, true)).toBe(false);   // обычная: чужой тип отвергнут
    expect(canPlace(доска, 0, 7, true)).toBe(true);    // свой тип принимают обе
    expect(canPlace(доска, 1, 7, true)).toBe(true);
  });

  it('🔴 джокер НЕ даёт лишней ёмкости — полная ниша остаётся полной', () => {
    const полный = makeBoard([[7, 7, 5]], [3], [true]);
    expect(canPlace(полный, 0, 1, true)).toBe(false);
    expect(canPlace(полный, 0, 1, false)).toBe(false);
  });

  /** На обычном уровне джокер ничего не меняет: там и так кладут что угодно. */
  it('на нестрогом уровне джокер ничего не меняет', () => {
    const доска = makeBoard([[7, 7], [7, 7]], [3, 3], [true, false]);
    expect(canPlace(доска, 0, 5, false)).toBe(true);
    expect(canPlace(доска, 1, 5, false)).toBe(true);
  });

  /**
   * 🔴 ИНВАРИАНТ КРАТНОСТИ ТРЁМ. Сумма ёмкостей = ниш × 3 на каждом уровне,
   * включая уровни с джокером: он не участвует в раздаче ёмкостей вообще.
   */
  it('🔴 сумма ёмкостей равна «ниш × 3» и на уровнях с джокером', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      for (const narrow of [false, true]) {
        const { cells } = dealBoard(L, POOL, narrow);
        const caps = capsForBoard(L, cells);
        const сумма = caps.reduce((a, b) => a + b, 0);
        if (сумма !== cells.length * 3) плохо.push(`L${L}${narrow ? ' узкий' : ''}: ёмкость ${сумма} при ${cells.length} нишах`);
      }
    }
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 ЗАМЕР ДО И ПОСЛЕ ОДНИМ ПРОГОНОМ. Считаем ходы на тех же досках дважды —
   * с джокером и без, — и требуем, чтобы джокер их прибавил. Если он ничего не
   * даёт, механики нет, сколько бы кода ни лежало рядом.
   */
  it('🔴 занятая ниша-джокер принимает больше типов, чем обычная, — на КАЖДОМ своём уровне', () => {
    const свои = LEVELS.filter((L) => jokerNiches(L, 14).length > 0);
    expect(свои.length).toBeGreaterThan(3);
    const слабые: string[] = [];
    let до = 0; let после = 0;
    for (const L of свои) {
      const б = типовПринимает(L, false);
      const п = типовПринимает(L, true);
      до += б; после += п;
      // Обычная ниша, где уже лежит товар, принимает РОВНО один тип — свой.
      if (б !== 1) слабые.push(`L${L}: обычная ниша приняла ${б} типов вместо одного`);
      if (п <= б) слабые.push(`L${L}: джокер принял ${п} типов при обычных ${б} — прибавки нет`);
    }
    expect(слабые).toEqual([]);
    expect(после).toBeGreaterThan(до);
  });

  /** Правило обязано быть заведено и объяснено — иначе механика идёт молча. */
  it('🔴 правило заведено с тем же порогом и переведено на двенадцать языков', () => {
    const r = GS_RULES.find((x) => x.key === 'joker');
    expect(r).toBeDefined();
    expect(r!.fromLevel).toBe(JOKER_FROM);
    const поля = ['title', 'rule', 'example'];
    const нет: string[] = [];
    const base = read('src/contexts/LanguageContext.tsx');
    for (const f of поля) if (!base.includes(`lr_goods_sort_joker_${f}:`)) нет.push(`base/${f}`);
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const f of поля) if (!src.includes(`"lr_goods_sort_joker_${f}"`)) нет.push(`${loc}/${f}`);
    }
    expect(нет).toEqual([]);
  });

  /** Конфиг уровня отдаёт джокеры вместе с остальным — экран не считает их сам. */
  it('levelCfg отдаёт джокеры, и их длина равна числу ниш', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      const { cells } = dealBoard(L, POOL, false);
      const j = jokersForBoard(L, cells);
      if (j.length !== cells.length) плохо.push(`L${L}: джокеров ${j.length} при ${cells.length} нишах`);
      if (j.filter(Boolean).length !== jokerNiches(L, cells.length).length) плохо.push(`L${L}: расходится с jokerNiches`);
    }
    expect(плохо).toEqual([]);
    expect(typeof levelCfg(36, 8, false).slots).toBe('number');
  });
});
