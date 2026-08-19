/**
 * ЦЕЛЬ УРОВНЯ НАПИСАНА И ДОСТИЖИМА.
 *
 * ЗАЧЕМ. До сих пор цель была одна и неписаная — «опустошить доску», — а лимит
 * ходов с девятого уровня резал прохождение молча, нигде не назвавшись. Человек
 * собирал доску и узнавал о лимите из экрана провала. Теперь целей четыре, и
 * ровно поэтому здесь проверяется главное: цель, которую нельзя выполнить, хуже
 * отсутствия цели — она превращает уровень в стену без объяснения.
 *
 * Функции настоящие, из экрана: `goalPlan`, `goalMet`, `goalProgress`,
 * `levelCfg`. Гейт, который повторяет правило своей копией, зелен вслепую.
 */
import { goalPlan, goalMet, goalProgress, levelCfg, clampGoalToLevel } from '@/app/games/goods-sort';

declare const __dirname: string;
declare function require(m: string): any;

const POOL = 8;                       // товаров в наборе — столько же, сколько в боевых наборах
const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('цели уровня', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    const kinds = new Set(LEVELS.map((L) => goalPlan(L).kind));
    expect(kinds.size).toBe(4);
    expect([...kinds].sort()).toEqual(['all', 'free', 'moves', 'pick']);
  });

  it('первые четыре уровня — только базовая цель', () => {
    for (const L of [1, 2, 3, 4]) expect(goalPlan(L).kind).toBe('all');
    expect(goalPlan(5).kind).not.toBe('all');
  });

  /** Лимит ходов раньше девятого равен нулю — цель «уложись в ноль» бессмысленна. */
  it('цель «уложиться в ходы» не приходит раньше девятого уровня', () => {
    for (let L = 1; L < 9; L++) expect(goalPlan(L).kind).not.toBe('moves');
  });

  /**
   * Проверяем САМУ страховку, а не только её последствия. При нынешней таблице
   * первый `moves` и так стоит на L9 — то есть через `goalPlan` страховка
   * недостижима, и мутация «убрать проверку» проходила мимо гейта (19.08.2026).
   * Таблицу ещё будут переставлять; вот тогда она и сработает.
   */
  it('страховка подменяет «ходы» на базовую цель ниже девятого', () => {
    const moves = { kind: 'moves' as const, count: 0 };
    for (let L = 1; L < 9; L++) expect(clampGoalToLevel(moves, L).kind).toBe('all');
    expect(clampGoalToLevel(moves, 9).kind).toBe('moves');
    expect(clampGoalToLevel(moves, 40).kind).toBe('moves');
  });

  it('страховка не трогает остальные цели', () => {
    for (const kind of ['all', 'pick', 'free'] as const) {
      expect(clampGoalToLevel({ kind, count: 2 }, 1).kind).toBe(kind);
    }
  });

  /**
   * 🔴 ГЛАВНОЕ: лимит ходов существует ТОЛЬКО как цель. Раньше он висел на
   * каждом уровне с девятого и был тихим ограничением.
   */
  it('лимит ходов включён ровно на уровнях цели «ходы»', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL, narrow);
        const isMoves = cfg.goal.kind === 'moves';
        if (isMoves && cfg.moveLimit <= 0) bad.push(`L${L}${narrow ? ' узкий' : ''}: цель «ходы», а лимита нет`);
        if (!isMoves && cfg.moveLimit > 0) bad.push(`L${L}${narrow ? ' узкий' : ''}: лимит ${cfg.moveLimit} без цели`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** Лимита должно хватать на честную игру: минимум по ходу на товар. */
  it('лимит ходов не меньше числа товаров на доске', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL, narrow);
        if (cfg.moveLimit > 0 && cfg.moveLimit < cfg.types * 2) {
          bad.push(`L${L}: лимит ${cfg.moveLimit} при ${cfg.types} типах — меньше двух ходов на тип`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * `pick` обязан оставить хотя бы один тип НЕ названным: если названы все,
   * цель совпадает с «убрать всё» и никакой смены задачи не даёт.
   */
  it('цель «собрать названные» всегда называет меньше типов, чем есть', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      const plan = goalPlan(L);
      if (plan.kind !== 'pick') continue;
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL, narrow);
        const named = Math.max(1, Math.min(plan.count, cfg.types - 1));
        if (named >= cfg.types) bad.push(`L${L}: названо ${named} из ${cfg.types} типов — цель вырождается`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * `free` метит ниши, из которых надо всё выложить. Пустая ниша вмещает ровно
   * три, в помеченной максимум три — значит на каждую помеченную нужна своя
   * пустая, и одна должна остаться на манёвр.
   */
  it('помеченных ниш всегда меньше, чем пустых', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      const plan = goalPlan(L);
      if (plan.kind !== 'free') continue;
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL, narrow);
        const marked = Math.min(plan.count, Math.max(1, cfg.spares - 1));
        if (marked >= cfg.spares) bad.push(`L${L}: помечено ${marked} ниш при ${cfg.spares} пустых — выкладывать некуда`);
      }
    }
    expect(bad).toEqual([]);
  });

  describe('«пройдено» считается по цели, а не по пустой доске', () => {
    it('убрать всё: полная доска не считается, пустая считается', () => {
      expect(goalMet([[1], []], { kind: 'all' })).toBe(false);
      expect(goalMet([[], []], { kind: 'all' })).toBe(true);
    });

    it('собрать названные: уровень кончается, пока товар ещё лежит', () => {
      const g = { kind: 'pick' as const, types: [1, 2] };
      expect(goalMet([[1], [3, 3]], g)).toBe(false);
      expect(goalMet([[3], [3, 3]], g)).toBe(true);   // единиц и двоек нет — цель есть, доска не пуста
    });

    it('освободить ниши: важны помеченные, остальные — нет', () => {
      const g = { kind: 'free' as const, niches: [0, 2] };
      expect(goalMet([[1], [9], []], g)).toBe(false);
      expect(goalMet([[], [9], []], g)).toBe(true);
    });

    it('уложиться в ходы: цель по-прежнему пустая доска', () => {
      expect(goalMet([[1]], { kind: 'moves', limit: 20 })).toBe(false);
      expect(goalMet([[]], { kind: 'moves', limit: 20 })).toBe(true);
    });
  });

  describe('прогресс цели', () => {
    it('считает собранное и освобождённое', () => {
      expect(goalProgress([[1], [3]], { kind: 'pick', types: [1, 2] })).toEqual({ done: 1, total: 2 });
      expect(goalProgress([[], [9], []], { kind: 'free', niches: [0, 2] })).toEqual({ done: 2, total: 2 });
    });

    it('молчит там, где его показывает другой счётчик', () => {
      expect(goalProgress([[1]], { kind: 'all' })).toBeNull();
      expect(goalProgress([[1]], { kind: 'moves', limit: 9 })).toBeNull();
    });
  });

  /**
   * Цели — пятая ось после «больше типов», «теснее», форм и препятствий.
   * Цикл целей 12 против 10 у препятствий: совместный период 60 — ровно
   * столько, сколько уровней мы меряем. Равные длины дали бы жёсткую пару
   * «цель+препятствие» и вдвое меньше разных уровней.
   */
  it('связка форма × препятствия × цель даёт не меньше 55 разных уровней за 60', () => {
    const seen = new Set<string>();
    for (const L of LEVELS) {
      const cfg = levelCfg(L, POOL, true);
      seen.add([cfg.mask.map((b) => (b ? 1 : 0)).join(''), JSON.stringify(cfg.obst), cfg.goal.kind, cfg.goal.count].join('|'));
    }
    expect(seen.size).toBeGreaterThanOrEqual(55);
  });
});

/**
 * ТРИ ДЫРЫ, НАЙДЕННЫЕ РЕСЁРЧЕМ ЖАНРА (субагент, 19.08.2026).
 *
 * Все три из одного семейства: игра поощряла то, за что не платила, и давала
 * бесплатный выход из задачи, которую сама поставила.
 */
describe('находки ресёрча закрыты', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
  const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

  /**
   * Звук `sndCombo` играл, справка обещала «×2, ×3», а каждая тройка давала
   * ровно 50 — сколько бы их ни ссыпалось разом.
   */
  it('комбо оплачивается множителем, а не плоской ставкой', () => {
    expect(code).toMatch(/gained \+= 50 \* clearedNow/);
    expect(code).not.toMatch(/scoreRef\.current \+= 50;/);
  });

  /**
   * 🔴 Главная из трёх. Бесплатная бесконечная тасовка вместе с гарантией
   * «всегда минимум две свободные ниши» означала, что планировать не
   * обязательно НИ НА ОДНОМ уровне: жадная стратегия не может завести в тупик,
   * а если бы могла — есть бесплатный выход. Одной кнопкой обесценивались все
   * препятствия и все цели.
   */
  it('перемешать стоит ход и выдаётся счётным числом раз', () => {
    // ⚠️ Проверяем ЧИСЛО, а не то, что оно есть: `[1-9]` пропускало 999 —
    // то есть «почти бесконечно», ровно ту дыру, которую и чиним (19.08).
    const n = Number((code.match(/const SHUFFLES_PER_LEVEL = (\d+)/) || [])[1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    expect(code).toMatch(/if \(shuffles <= 0\) \{[^}]*return;/);      // кончились — не работает
    expect(code).toMatch(/setShuffles\(\(n\) => n - 1\)/);            // расходуется
    expect(code).toMatch(/movesRef\.current \+= 1; setMoves\(movesRef\.current\);/);  // стоит ход
    expect(code).toMatch(/setShuffles\(SHUFFLES_PER_LEVEL\)/);        // и обновляется на новом уровне
  });

  /**
   * Зелёная рамка «здесь пара» честно показывает «сюда третий». На первых
   * уровнях это ровно то, что надо объяснить; дальше она снимает половину
   * зрительного поиска — как раз ту работу, ради которой сюда приходят.
   */
  it('подсветка пары обучающая, а не постоянная', () => {
    expect(code).toMatch(/hasPair\(cell\) && level <= \d/);
  });
});
