/**
 * СМЕШАННАЯ ЁМКОСТЬ НИШ НЕ ЛОМАЕТ АРИФМЕТИКУ РЕШАЕМОСТИ.
 *
 * 🔴 ЗАЧЕМ. Когда все ниши одинаковы, через десяток уровней рука ходит сама:
 * видишь пару — несёшь третий, не глядя. Ниша на ДВА тройку не вместит вовсе,
 * ниша на ЧЕТЫРЕ вмещает тройку и ещё лишний товар — автоматизм ломается.
 *
 * Но вся арифметика решаемости (запас пустых, потолок типов, ёмкость за вычетом
 * запертых) посчитана из «ниш × 3». Урежь общую ёмкость — и уровень станет
 * теснее задуманного, причём МОЛЧА, без единой ошибки. Поэтому здесь главная
 * проверка — сумма ёмкостей не меняется.
 */
declare const __dirname: string;
declare function require(m: string): any;

import { capsFor, CAP_ONE, CAP_MIN, CAP_MAX, MIXED_CAP_FROM, placementOk, tripleIn, removeTriple } from '@/app/games/goods-sort';

const SLOTS = [9, 12, 15, 16, 18];

describe('ёмкости ниш', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(CAP_MIN).toBeLessThan(3);
    expect(CAP_MAX).toBeGreaterThan(3);
    expect(MIXED_CAP_FROM).toBeGreaterThan(10);
  });

  it('до своего уровня все ниши одинаковы', () => {
    for (let L = 1; L < MIXED_CAP_FROM; L++) {
      for (const slots of SLOTS) {
        expect(new Set(capsFor(L, slots)).size).toBe(1);
      }
    }
  });

  it('после — уже не одинаковы', () => {
    const mixed = SLOTS.filter((slots) => new Set(capsFor(MIXED_CAP_FROM, slots)).size > 1);
    expect(mixed.length).toBeGreaterThan(0);
  });

  /** 🔴 ГЛАВНОЕ: доска не стала теснее. */
  it('сумма ёмкостей всегда равна «ниш × 3»', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 60; L++) {
      for (const slots of SLOTS) {
        const total = capsFor(L, slots).reduce((a, b) => a + b, 0);
        if (total !== slots * 3) bad.push(`L${L}, ниш ${slots}: ёмкость ${total} вместо ${slots * 3}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ёмкость каждой ниши в разумных пределах', () => {
    /**
     * 🔴 НИЖНЯЯ ГРАНИЦА ОПУЩЕНА ДО ЕДИНИЦЫ 06.09.2026 — по просьбе Дениса
     * («у них есть полки на 4 товара и на 1 товар, у нас только на 3»).
     * Проверка осталась настоящей: границы стерегутся, просто нижняя другая.
     */
    for (let L = 1; L <= 60; L++) {
      for (const slots of SLOTS) {
        for (const c of capsFor(L, slots)) {
          expect(c).toBeGreaterThanOrEqual(CAP_ONE);
          expect(c).toBeLessThanOrEqual(CAP_MAX);
        }
      }
    }
  });

  /**
   * 🔴 ЛЕСТНИЦА НЕ ОТКАТЫВАЕТСЯ. Проба написана потому, что первая версия
   * `capsFor` откатывалась: общий потолок нетиповых ниш урезал пары, когда
   * появлялась группа с единицей, и доска на стыке становилась ПРОЩЕ
   * предыдущей. Замер до правки — 202 отката на 400 уровнях × 35 размеров
   * доски; чтение формулы глазами этого не показывало.
   *
   * ⚠️ Поэтому здесь именно ПРОГОН всех уровней подряд, а не сравнение первого
   * с последним: ломается такое на границе между участками.
   */
  it('🔴 доля ниш не на три растёт по уровням и не откатывается', () => {
    const откаты: string[] = [];
    for (const slots of SLOTS) {
      let пред = 0;
      for (let L = 1; L <= 200; L++) {
        const н = capsFor(L, slots).filter((c) => c !== 3).length;
        if (н < пред) откаты.push(`ниш ${slots}, L${L}: было ${пред}, стало ${н}`);
        пред = н;
      }
    }
    expect(откаты).toEqual([]);
  });

  /**
   * ⚠️ И НИША НА ОДИН ТОВАР ДЕЙСТВИТЕЛЬНО ПОЯВЛЯЕТСЯ. Без этой строки проба
   * выше зеленеет и на схеме, где единиц нет вовсе: «ноль не меньше нуля».
   */
  it('🔴 ниша на один товар выдаётся на всех размерах доски', () => {
    const без: string[] = [];
    for (const slots of SLOTS) {
      if (slots < 7) continue;
      const есть = Array.from({ length: 200 }, (_, i) => i + 1)
        .some((L) => capsFor(L, slots).includes(CAP_ONE));
      if (!есть) без.push(`ниш ${slots}: ни на одном уровне до 200`);
    }
    expect(без).toEqual([]);
  });

  /** Повтор уровня обязан давать ту же форму доски: расклад случаен, форма нет. */
  it('один и тот же уровень даёт одни и те же ёмкости', () => {
    for (const L of [20, 33, 47]) {
      expect(capsFor(L, 12)).toEqual(capsFor(L, 12));
      expect(capsFor(L, 12)).not.toEqual(capsFor(L + 1, 12));
    }
  });

  /** Узкие ниши не должны съесть больше трети доски — иначе играть негде. */
  it('узких ниш не больше трети', () => {
    for (let L = MIXED_CAP_FROM; L <= 60; L++) {
      for (const slots of SLOTS) {
        const small = capsFor(L, slots).filter((c) => c === CAP_MIN).length;
        expect(small).toBeLessThanOrEqual(Math.ceil(slots / 3));
      }
    }
  });
});

describe('сбор тройки при разной ёмкости', () => {
  /**
   * 🔴 Ниша на четыре держит тройку И лишний товар. Проверяй «ровно три в
   * нише» — и на четырёхместной тройка не соберётся НИКОГДА. Самый обидный вид
   * тихой поломки: механика есть, ниша есть, а работать не будет.
   */
  it('тройка находится и когда в нише есть лишний', () => {
    expect(tripleIn([1, 1, 1])).toBe(1);
    expect(tripleIn([2, 1, 1, 1])).toBe(1);     // четырёхместная: тройка + чужой
    expect(tripleIn([1, 1, 2, 1])).toBe(1);     // и вразбивку тоже
    expect(tripleIn([1, 1, 2])).toBeNull();
    expect(tripleIn([])).toBeNull();
  });

  it('исчезает ровно тройка, лишнее остаётся', () => {
    expect(removeTriple([2, 1, 1, 1], 1)).toEqual([2]);
    expect(removeTriple([1, 1, 1], 1)).toEqual([]);
    expect(removeTriple([1, 1, 2, 1], 1)).toEqual([2]);
  });

  it('в двухместную нишу третий товар не влезает', () => {
    expect(placementOk([9, 9], 9, false, CAP_MIN)).toBe(false);
    expect(placementOk([9], 9, false, CAP_MIN)).toBe(true);
  });

  it('в четырёхместную влезает четвёртый', () => {
    expect(placementOk([9, 8, 7], 6, false, CAP_MAX)).toBe(true);
    expect(placementOk([9, 8, 7, 6], 5, false, CAP_MAX)).toBe(false);
  });
});

/**
 * НАБОР НАМЕРЕННО ПОХОЖИХ ТОВАРОВ.
 *
 * 🔴 ЗАЧЕМ. Разбор жанра называет перцептивную близость единственной механикой,
 * которая превращает задачу из «НАЙТИ» в «РАЗЛИЧИТЬ». Во всех прочих наборах
 * товары отличаются силуэтом и цветом — глаз хватает их периферией, и работа
 * сводится к моторике. Здесь девять белых предметов одного роста.
 *
 * Гейт стережёт две вещи, каждая из которых уже ломалась в этом файле:
 * спрайт, объявленный без файла (игра покажет пустоту), и набор, для которого
 * не завели подпись во всех двенадцати языках.
 */
describe('набор похожих товаров', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '../..');
  const GAME = fs.readFileSync(path.join(ROOT, 'app/games/goods-sort.tsx'), 'utf8') as string;

  /** Пул набора читаем ИЗ ЭКРАНА — не из своей копии. */
  const pool: number[] = (() => {
    const m = GAME.match(/key: 'dairy'[^\]]*pool: \[([^\]]+)\]/);
    return m ? m[1].split(',').map((x) => Number(x.trim())) : [];
  })();

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(pool.length).toBeGreaterThanOrEqual(6);
  });

  it('каждый спрайт набора объявлен и лежит на диске', () => {
    const missing: string[] = [];
    for (const idx of pool) {
      if (!GAME.includes(`goods/good${idx}.webp`)) { missing.push(`good${idx}: не объявлен в списке спрайтов`); continue; }
      const f = path.join(ROOT, `assets/images/goods/good${idx}.webp`);
      if (!fs.existsSync(f)) missing.push(`good${idx}.webp: файла нет`);
    }
    expect(missing).toEqual([]);
  });

  /** Спрайты режутся из общего листа — вылезший фон виден только глазами, а вес ловится тут. */
  it('спрайты не раздуты', () => {
    const heavy: string[] = [];
    for (const idx of pool) {
      const size = fs.statSync(path.join(ROOT, `assets/images/goods/good${idx}.webp`)).size;
      if (size > 40 * 1024) heavy.push(`good${idx}.webp: ${Math.round(size / 1024)} КБ`);
    }
    expect(heavy).toEqual([]);
  });

  it('подпись набора есть во всех двенадцати языках', () => {
    const base = fs.readFileSync(path.join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
    expect(base).toMatch(/goodsSet_dairy:\s*\{[^}]*ru:/);
    expect(base).toMatch(/goodsSet_dairy:\s*\{[^}]*en:/);
    const dir = path.join(ROOT, 'src/contexts/translations');
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir) as string[]) {
      if (!f.endsWith('.ts')) continue;
      if (!fs.readFileSync(path.join(dir, f), 'utf8').includes('"goodsSet_dairy"')) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  /** Смысл набора — в его чистоте: подмешай туда разноцветное, и различать станет нечего. */
  it('набор не пересекается с прочими — иначе он перестаёт быть трудным', () => {
    const others = [...GAME.matchAll(/key: '(drinks|food|toys)'[^\]]*pool: \[([^\]]+)\]/g)]
      .flatMap((m) => m[2].split(',').map((x) => Number(x.trim())));
    expect(pool.filter((i) => others.includes(i))).toEqual([]);
  });
});
