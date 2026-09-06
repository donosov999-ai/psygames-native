/**
 * ПРЕПЯТСТВИЯ НЕ ДЕЛАЮТ УРОВЕНЬ НЕРЕШАЕМЫМ.
 *
 * ЗАЧЕМ. Формы подняли разнообразие с 13 разных уровней до 30, цель Дениса —
 * 55. Оси «больше типов» и «теснее» насыщаются к L21 и дальше не дают ничего;
 * препятствия не насыщаются, потому что меняют не количество, а то, КУДА можно
 * ходить. Но ровно поэтому они и опаснее всего для решаемости.
 *
 * 🔴 ГЛАВНОЕ ПРАВИЛО: ЗАПЕРТАЯ НИША НЕ СЧИТАЕТСЯ СВОБОДНОЙ. Решаемость держится
 * на том, что свободных ниш минимум две — но ниша под замком манёвра не даёт.
 * Если её не вычесть из ёмкости, уровень с препятствиями окажется теснее, чем
 * задумано, и может стать непроходимым. Это единственный способ сломать игру
 * препятствиями, и он проверяется здесь.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const src = readFileSync(join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;

// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { liveRowsForFreeze, levelCfg, GS_RULES, OBSTACLE_PLANS, SHAPES, gridFor,
  obstaclePlan } from '@/src/games/goods-sort/core/level';

/** Какие виды препятствий реально действуют на доске — после фильтра порогами. */
function viduOn(o: { blocked: number; locked: number; covered: number; frozenRow: boolean }): string[] {
  return [o.blocked > 0 && 'blocked', o.locked > 0 && 'locked', o.covered > 0 && 'covered', o.frozenRow && 'frozen']
    .filter(Boolean) as string[];
}


/**
 * ⚠️ КОНФИГ БЕРЁТСЯ У ИГРЫ, А НЕ СЧИТАЕТСЯ ЗАНОВО.
 *
 * Здесь стояла копия всех формул уровня — размер сетки, выбор формы по шагу
 * цикла, число видов, запас, лимит ходов. 02.09.2026 форма стала выбираться по
 * объёму, шаг перестал быть числом в коде, а препятствия — фильтроваться по
 * графику ввода механик; копия отстала мгновенно и начала падать на пустом
 * месте (`list[NaN]` → undefined). Это третий такой гейт за день.
 */
/*
 * ⚠️ ЗДЕСЬ ЖИЛА КОПИЯ `gridFor` — та самая беда, о которой предупреждает абзац
 * выше. Копия была застывшей: `L <= 7 ? [3,4] : L <= 11 ? [3,5] : [3,6]`, то
 * есть телефонная ветка, вписанная числами. Разойдись она с игрой — гейт мерил
 * бы свою сетку и молчал. 06.09.2026 копия убрана, сетка спрашивается у игры.
 */
const ПЕРВЫЙ_С_ПРЕПЯТСТВИЕМ = GS_RULES.find((r) => r.key === 'blocked')!.fromLevel;

function level(L: number) {
  const cfg = levelCfg(L, 24, true);          // narrow: телефонная сетка, как и было
  const { cols, rows } = gridFor(L, true);   // narrow: телефонная сетка, как и было
  const slots = cfg.mask.filter(Boolean).length;
  const o = cfg.obst;
  return {
    cols, rows,
    sh: Array.from({ length: rows }, (_, r) => cfg.mask.slice(r * cols, (r + 1) * cols).map((b) => (b ? '#' : '.')).join('')),
    slots, usable: cfg.usable, types: cfg.types, spares: cfg.spares, moveLimit: cfg.moveLimit, o,
  };
}
const planFor = (L: number) => level(L).o;

describe('препятствия', () => {
  /**
   * 🔴 ТАБЛИЦЫ БЕРУТСЯ У ИГРЫ, А НЕ ВЫЧИТЫВАЮТСЯ ИЗ ЕЁ ТЕКСТА.
   *
   * Тут стояли два разборщика исходника: один искал строки
   * `{ blocked: n, locked: n, … }`, другой — кавычки `'#..#'` внутри `SHAPES`.
   * 06.09.2026 оба объявления уехали в лист `core/level`, разбор нашёл ноль
   * записей — и пункт покраснел. Это ещё повезло: тот же разбор мог найти
   * ПОЧТИ всё (одна строка записана иначе — и её нет), и тогда он бы зеленел,
   * проверяя неполную копию таблицы.
   */
  it('есть что проверять: таблица препятствий и набор форм непусты', () => {
    expect(OBSTACLE_PLANS.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(SHAPES).length).toBeGreaterThanOrEqual(4);
    // И это не пустышки: каждая запись таблицы — настоящий план с полями.
    for (const p of OBSTACLE_PLANS) {
      expect(typeof p.blocked).toBe('number');
      expect(typeof p.frozenRow).toBe('boolean');
    }
  });

  /** До шестого уровня человек учит само правило игры — второе поверх него это каша. */
  it('препятствий нет раньше их порога', () => {
    for (let L = 1; L < ПЕРВЫЙ_С_ПРЕПЯТСТВИЕМ; L++) {
      const o = planFor(L);
      expect(o.blocked + o.locked + o.covered).toBe(0);
      expect(o.frozenRow).toBe(false);
    }
  });

  /**
   * Первое появление каждого вида должно быть ОДИНОЧНЫМ — иначе правило не прочитать.
   *
   * 🔴 СЧИТАЕТСЯ ПО УРОВНЯМ, А НЕ ПО МЕСТУ В МАССИВЕ. Раньше здесь перебирался
   * `PLANS` по индексу, и это было верно, пока порядок строк совпадал с порядком
   * уровней. С тех пор как план фильтруется порогами (`ruleFrom`), не совпадает:
   * строка приходит на уровень 8 + индекс + 10k, а её механика до своего порога
   * вычёркивается. 06.09.2026 из-за этой подмены две сессии подряд переставляли
   * строки «по массиву» и каждая ломала настоящий, уровневый порядок — проверка
   * при этом оставалась зелёной, потому что мерила не то.
   *
   * Заодно уходит разбор исходника: `PLANS` вычитывался регуляркой из текста
   * файла, а теперь спрашивается сама игра — `levelCfg(L).obst`.
   */
  it('🔴 каждый вид препятствия появляется впервые в одиночку — по уровням', () => {
    const виды = ['blocked', 'locked', 'covered', 'frozen'] as const;
    const дебют: Record<string, { L: number; вместе: string[] }> = {};
    for (let L = 1; L <= 60; L++) {
      const o = levelCfg(L, 8, false).obst;
      const есть = viduOn(o);
      for (const k of есть) if (!дебют[k]) дебют[k] = { L, вместе: есть };
    }
    // Обе стороны непусты: все четыре вида обязаны где-то дебютировать.
    expect(Object.keys(дебют).sort()).toEqual([...виды].sort());
    const плохо = Object.entries(дебют)
      .filter(([, d]) => d.вместе.length !== 1)
      .map(([k, d]) => `${k}: дебют на L${d.L} сразу с ${d.вместе.join(' + ')}`);
    expect(плохо).toEqual([]);
  });

  it('🔴 каждый уровень с 1 по 60 решаем при своих препятствиях', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 60; L++) {
      const v = level(L);
      if (v.spares < 2) bad.push(`L${L}: свободных ${v.spares} при ${v.o.blocked + v.o.locked} запертых`);
      if (v.usable - v.spares < v.types) bad.push(`L${L}: ёмкости на ${v.types} типов нет (доступно ${v.usable})`);
      if (v.types < 3) bad.push(`L${L}: типов ${v.types} — играть нечем`);
      // накрытых не может быть больше, чем товаров не-последних в нишах
      if (v.o.covered > v.types * 2) bad.push(`L${L}: накрыто ${v.o.covered} при ${v.types} типах`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ВЫЧЕТ ПРОВЕРЯЕТСЯ ОТВЕТОМ `levelCfg`, А НЕ ТРЕМЯ СТРОЧКАМИ ИЗ ЭКРАНА.
   *
   * Прежняя редакция закрепляла дословно `const shut = obst.blocked +
   * obst.locked;` и ещё две строки. Переименуй кто-нибудь `shut` — гейт
   * покраснел бы на верной правке; посчитай игра ёмкость правильно в другом
   * месте — не заметил бы вовсе. Меряем то, ради чего вычет и нужен: заперты
   * ниши — доступных на столько же меньше.
   */
  it('🔴 запертые ниши вычтены из ёмкости самой игрой', () => {
    const плохо: string[] = [];
    let было = 0;
    for (let L = 1; L <= 60; L += 1) {
      const v = level(L);
      const шло = v.o.blocked + v.o.locked;
      if (шло > 0) было += 1;
      if (v.usable !== v.slots - шло) {
        плохо.push(`L${L}: доступных ${v.usable} при ${v.slots} нишах и ${шло} запертых`);
      }
    }
    expect(плохо).toEqual([]);
    // ⚠️ И заслон не вхолостую: уровни с запертыми нишами вообще есть.
    expect(было).toBeGreaterThanOrEqual(10);
  });

  /**
   * Запрет обязан стоять и на «взять», и на «положить» — ОДНОЙ проверкой.
   *
   * ⚠️ 19.08.2026 проверка переехала. Раньше здесь закреплялась буквальная
   * строчка `if (!cellUsable(fromCell) || !cellUsable(toCell))` внутри
   * `moveItem`. С появлением перетаскивания тот же вопрос понадобился ещё и
   * подсветке ниши под пальцем, и обе стороны свернулись в один предикат
   * `canPlaceInto`. Смысл гейта не изменился, поэтому и правило то же — только
   * закрепляем теперь сам предикат и то, что ход идёт через него. Способов
   * хода стало два, а проверка обязана остаться одна.
   */
  /**
   * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ ЗАПИСЬ. Первая редакция требовала дословное
   * `cellUsable(fromCell) && cellUsable(toCell)` и покраснела 19.08.2026 на
   * правильной правке: предикат вырос до нескольких строк ради строгой укладки,
   * и то же самое условие записалось как ранний выход. Смысл — обе стороны хода
   * спрашивают о препятствии — не изменился ни на букву.
   */
  it('препятствие запрещает обе стороны хода', () => {
    const pred = src.slice(src.indexOf('const canPlaceInto'), src.indexOf('const moveItem'));
    expect(pred).toMatch(/cellUsable\(fromCell\)/);
    expect(pred).toMatch(/cellUsable\(toCell\)/);
    expect(src).toMatch(/if \(!canPlaceInto\(fromCell, toCell\)\)/);
  });

  /** Замер: ради этого препятствия и заводились. */
  it('связка формы × препятствия даёт не меньше 45 разных уровней за 60', () => {
    const seen = new Set<string>();
    for (let L = 1; L <= 60; L++) {
      const v = level(L);
      seen.add(`${v.cols}x${v.rows}|${v.sh.join('/')}|${v.types}|${v.spares}|${v.moveLimit}|${v.o.blocked}${v.o.locked}${v.o.covered}${v.o.frozenRow ? 1 : 0}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(45);
  });
});

/**
 * ЗАМОРОЗКА НЕ ЛОЖИТСЯ ПОВЕРХ ЗАМКА И НЕ ПАДАЕТ НА ДЫРЫ.
 *
 * Найдено глазами 19.08.2026 на форсированной раскладке blocked 2 + locked 1 +
 * frozenRow: замок и снежинка встали в одну нишу — два значка друг на друге и
 * двойной запрет там, где хватает одного. В боевой таблице планов заморозка с
 * замками не встречается, поэтому на экране это не всплывало; но таблицу ещё
 * будут править, и тогда всплывёт.
 *
 * Функция настоящая, из экрана — не копия правила в тесте.
 */
describe('примёрзший ряд выбирается живым', () => {
  const full = (n: number) => Array(n).fill(true);
  const none = (n: number) => Array(n).fill(null);

  it('верхний ряд не морозим — с него читают доску', () => {
    expect(liveRowsForFreeze(full(9), none(9), 3, 3)).not.toContain(0);
  });

  it('ряд под замками не предлагается', () => {
    const obs = none(9);
    obs[3] = { kind: 'blocked' };
    obs[4] = { kind: 'locked', movesLeft: 5 };   // в ряду 1 остаётся одна ниша
    expect(liveRowsForFreeze(full(9), obs, 3, 3)).toEqual([2]);
  });

  it('ряд из дыр не предлагается', () => {
    const mask = full(9);
    mask[3] = false; mask[4] = false;            // ряд 1 — почти весь вырезан
    expect(liveRowsForFreeze(mask, none(9), 3, 3)).toEqual([2]);
  });

  it('когда живых рядов нет — пусто, и заморозки не будет', () => {
    const obs = none(9);
    obs[3] = { kind: 'blocked' }; obs[4] = { kind: 'blocked' }; obs[5] = { kind: 'blocked' };
    obs[6] = { kind: 'blocked' }; obs[7] = { kind: 'blocked' }; obs[8] = { kind: 'blocked' };
    expect(liveRowsForFreeze(full(9), obs, 3, 3)).toEqual([]);
  });

  it('на чистой доске морозить можно все ряды кроме верхнего', () => {
    expect(liveRowsForFreeze(full(12), none(12), 3, 4)).toEqual([1, 2, 3]);
  });
});
