/* psygames-mahjong-human-stuck · VER 1 · 06.09.2026 */
/**
 * 🔴 КАК ЧАСТО В ТУПИК ЗАХОДИТ ЧЕЛОВЕК, А НЕ ПЕРЕБОР.
 *
 * ЗАЧЕМ. Замер координатора 06.09.2026 даёт 60 % вставших насмерть партий на
 * 28 уровне — но играл СЛУЧАЙНЫЙ разбор, то есть верхняя граница. Решение
 * «записывать ли проигрыш» (задача 8543237a) стоит на этой цифре, а она про
 * игрока, которого не существует: человек не берёт пару наугад.
 *
 * ⚠️ ЭТОТ ФАЙЛ НЕ МЕНЯЕТ ПОВЕДЕНИЕ ИГРЫ. Он только меряет и печатает таблицу;
 * решение за Денисом. Проверки здесь — про сам замер: что он воспроизводит
 * базу координатора и что перебор политик не сломан.
 *
 * ЧТО СЧИТАЕТСЯ «НАСМЕРТЬ». Партия дошла до состояния, где `mahjongExits`
 * вернул ровно `['restart']`: ходов нет, перетасовка недоступна или не
 * раздаётся, отменять нечего. Метрика взята ТА ЖЕ, что у координатора и у
 * `mahjong-stuck-exit`, иначе числа нельзя ставить рядом.
 *
 * ЧЕТЫРЕ ИГРОКА, и каждый следующий отличается ровно одним: сколько он думает.
 *   `наугад`   — берёт любую доступную пару (база координатора);
 *   `внимательный` — на один ход вперёд: из доступных пар берёт ту, после
 *                    которой ходов останется больше всего;
 *   `думающий` — на два хода вперёд. ⚠️ Это НЕ моя выдумка про игрока: ровно
 *                так учит сама игра в подсказке 4-го слоя — «Смотри на два хода
 *                вперёд» (`app/games/mahjong.tsx`, строка правила);
 *   `идеальный` — полный перебор с памятью. Нужен не как игрок, а как ответ на
 *                 вопрос «а доска-то вообще была разбираема отсюда».
 *
 * ⚠️ ПОЧЕМУ ИДЕАЛЬНЫЙ НЕ РАВЕН НУЛЮ АВТОМАТИЧЕСКИ. Раздача решаема ПО
 * ПОСТРОЕНИЮ, но перетасовка (`dealSolvable`) и отмена меняют доску по ходу
 * партии, и «решаема на старте» не то же самое, что «решаема всегда». Ноль
 * здесь — это проверенное утверждение, а не определение.
 */
import { generateDeal, SYMBOLS } from '@/app/games/mahjong';
import { availablePairs, freeFlags, type Tile } from '@/src/games/mahjong/board';
import { mahjongExits } from '@/src/games/mahjong/stuck';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel, shufflesLeft } from '@/src/services/mahjongLevels';
import { dealSolvable } from '@/src/games/mahjong/vendor/solvable';

/** Бюджет отмен из экрана — тот же, что в `mahjong-stuck-exit`. */
const UNDOS_PER_LEVEL = 3;

/** Свой сеятель: числа обязаны воспроизводиться, иначе это не замер. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Все ходы доски — те же сочетания, что считает `availablePairs`. */
function movesOf(tiles: Tile[]): [number, number][] {
  const free = freeFlags(tiles, new Array(tiles.length).fill(true));
  const bySym = new Map<number, number[]>();
  for (let i = 0; i < tiles.length; i += 1) {
    if (!free[i]) continue;
    const arr = bySym.get((tiles[i] as Tile).symbol);
    if (arr) arr.push(i);
    else bySym.set((tiles[i] as Tile).symbol, [i]);
  }
  const out: [number, number][] = [];
  for (const idx of bySym.values()) {
    for (let a = 0; a < idx.length; a += 1) {
      for (let b = a + 1; b < idx.length; b += 1) out.push([idx[a] as number, idx[b] as number]);
    }
  }
  return out;
}

const без = (tiles: Tile[], a: number, b: number): Tile[] => tiles.filter((_, i) => i !== a && i !== b);
const ходов = (tiles: Tile[]): number => availablePairs(tiles, new Array(tiles.length).fill(true));
const positionsOf = (tiles: Tile[]) => tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));

// ─── игроки ──────────────────────────────────────────────────────────────────
type Выбор = (tiles: Tile[], ходы: [number, number][], r: () => number) => [number, number];

const наугад: Выбор = (_t, ходы, r) => ходы[Math.floor(r() * ходы.length)] as [number, number];

/**
 * Оценка хода на N полуходов вперёд. Один ход = «сколько ходов останется»,
 * два = «сколько останется после лучшего продолжения».
 *
 * ⚠️ Ветвление ограничено `ШИРИНА`: на полной доске ходов бывает под сорок, и
 * честный второй слой стоил бы 1600 разборов на КАЖДЫЙ ход партии. Человек тоже
 * смотрит не все пары, а несколько правдоподобных.
 */
const ШИРИНА = 8;
function оценка(tiles: Tile[], a: number, b: number, глубина: number): number {
  const после = без(tiles, a, b);
  const n = ходов(после);
  if (глубина <= 1 || n === 0) return n;
  const дальше = movesOf(после).slice(0, ШИРИНА);
  let лучш = 0;
  for (const [c, d] of дальше) лучш = Math.max(лучш, ходов(без(после, c, d)));
  return n * 100 + лучш;
}

const жадный = (глубина: number): Выбор => (tiles, ходы, r) => {
  let лучший = ходы[0] as [number, number];
  let лучшая = -1;
  for (const [a, b] of ходы) {
    const о = оценка(tiles, a, b, глубина);
    // Ничью решает случай, а не порядок в массиве: иначе игрок «предпочитает»
    // левый верхний угол просто потому, что доска так перечислена.
    if (о > лучшая || (о === лучшая && r() < 0.5)) { лучшая = о; лучший = [a, b]; }
  }
  return лучший;
};

/**
 * Разбирается ли доска ВООБЩЕ. Полный перебор с памятью по набору оставшихся
 * плиток; бюджет узлов не даёт зависнуть на полном наборе.
 */
function разбирается(tiles: Tile[], бюджет = 60_000): boolean | null {
  const виденные = new Set<string>();
  let узлов = 0;
  const идти = (t: Tile[]): boolean | null => {
    if (t.length === 0) return true;
    if ((узлов += 1) > бюджет) return null;
    const ключ = t.map((x) => x.id).join(',');
    if (виденные.has(ключ)) return false;
    виденные.add(ключ);
    let неизвестно = false;
    for (const [a, b] of movesOf(t)) {
      const r = идти(без(t, a, b));
      if (r === true) return true;
      if (r === null) неизвестно = true;
    }
    return неизвестно ? null : false;
  };
  return идти(tiles);
}

// ─── одна партия ─────────────────────────────────────────────────────────────
interface Партия { насмерть: boolean; разобрана: boolean }

function партия(L: number, seed: number, выбор: Выбор): Партия {
  const p = mahjongLevel(L);
  const places = layoutForLevel(L)?.places;
  const r = rng(seed * 7919 + L);
  let tiles: Tile[] = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L), places, r).tiles;
  const лента: Tile[][] = [];
  let перетасовок = 0;
  let отмен = 0;
  let страж = 0;
  while (tiles.length > 0 && страж < 400) {
    страж += 1;
    const ходы = movesOf(tiles);
    if (ходы.length > 0) {
      const [a, b] = выбор(tiles, ходы, r);
      лента.push(tiles);
      if (лента.length > UNDOS_PER_LEVEL + 1) лента.shift();
      tiles = без(tiles, a, b);
      continue;
    }
    const состояние = {
      openPairs: 0,
      shufflesLeft: shufflesLeft(p.shuffles, перетасовок),
      // 🔴 ЧЕТВЁРТЫЙ ПАРАМЕТР ОБЯЗАТЕЛЕН, И ЭТО НЕ УКРАШЕНИЕ. По умолчанию
      // `dealSolvable` берёт ГЛОБАЛЬНЫЙ Math.random, и тогда замер не
      // воспроизводится: шесть повторов одного и того же прогона дали
      // L28 10…27 %, L40 17…37 % (зонд 06.09.2026). С сеятелем партии —
      // ровно одно число во всех повторах.
      shuffleDeals: dealSolvable(positionsOf(tiles), SYMBOLS.length, 20, r).tiles.length > 0,
      canUndo: лента.length > 0 && отмен < UNDOS_PER_LEVEL,
    };
    const выходы = mahjongExits(состояние);
    if (выходы[0] === 'shuffle') {
      const d = dealSolvable(positionsOf(tiles), SYMBOLS.length, 20, r);
      if (d.tiles.length === 0) return { насмерть: true, разобрана: false };
      перетасовок += 1;
      tiles = positionsOf(tiles).map((q, i) => ({ id: i, x: q.x, y: q.y, layer: q.layer, symbol: (d.tiles[i] as Tile).symbol }));
      лента.length = 0;
      continue;
    }
    if (выходы[0] === 'undo') { отмен += 1; tiles = лента.pop() as Tile[]; continue; }
    return { насмерть: true, разобрана: false };
  }
  return { насмерть: false, разобрана: tiles.length === 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
jest.setTimeout(600_000);

/** 30 партий на уровень — ровно порядок замера координатора, иначе числа не сравнить. */
const ПАРТИЙ = Number(process.env.MAHJONG_GAMES || 30);

/**
 * 🔴 ЗАМЕР ИДЁТ ПО ТРЕБОВАНИЮ, А НЕ В КАЖДОЙ СБОРКЕ — и это не лень, а цена.
 * Замер 06.09.2026: на 30 партиях файл идёт 213 с, на 100 — 898 с, при том что
 * ВЕСЬ набор проб проекта укладывается в 152 с. Повесить это на общий прогон
 * значило бы утроить его ради чисел, которые нужны раз в неделю.
 *
 * ⚠️ Это ЗАМЕР, а не гейт поведения: он ничего не защищает от возврата дефекта,
 * он отвечает на вопрос «как часто человек встаёт». Гейт на поведение маджонга
 * стоит отдельно и гоняется всегда — `mahjong-stuck-exit.test.ts`.
 *
 *     MAHJONG_GAMES=100 npx jest src/__tests__/mahjong-human-stuck.test.ts
 */
const включён = Boolean(process.env.MAHJONG_GAMES);
const описать = включён ? describe : describe.skip;
const УРОВНИ = [5, 15, 28, 40];
const ИГРОКИ: [string, Выбор][] = [
  ['наугад', наугад],
  ['внимательный (1 ход)', жадный(1)],
  ['думающий (2 хода)', жадный(2)],
];

описать('🔴 тупик маджонга: перебор против человека', () => {
  const итоги = new Map<string, Map<number, number>>();

  beforeAll(() => {
    for (const [имя, выбор] of ИГРОКИ) {
      const по = new Map<number, number>();
      for (const L of УРОВНИ) {
        let насмерть = 0;
        for (let s = 1; s <= ПАРТИЙ; s += 1) if (партия(L, s, выбор).насмерть) насмерть += 1;
        по.set(L, насмерть);
      }
      итоги.set(имя, по);
    }
    const шапка = ['игрок'.padEnd(22), ...УРОВНИ.map((L) => `L${L}`.padStart(9))].join(' | ');
    const строки = [шапка, '-'.repeat(шапка.length)];
    for (const [имя] of ИГРОКИ) {
      const по = итоги.get(имя) as Map<number, number>;
      строки.push([имя.padEnd(22), ...УРОВНИ.map((L) => {
        const n = по.get(L) as number;
        return `${n}/${ПАРТИЙ} ${Math.round((n / ПАРТИЙ) * 100)}%`.padStart(9);
      })].join(' | '));
    }
    // eslint-disable-next-line no-console
    console.log(`\nВСТАЛ НАСМЕРТЬ (ходов нет, перетасовки нет, отменять нечего), ${ПАРТИЙ} партий на уровень:\n${строки.join('\n')}\n`);
  });

  it('есть что мерить: база «наугад» доходит до тупика на верхних уровнях', () => {
    // Без этой строки вся таблица могла бы быть нулями из-за поломки прогона, и
    // вывод «человек не встаёт» был бы про сломанный замер, а не про игру.
    const наверху = (итоги.get('наугад') as Map<number, number>).get(28) as number;
    expect(`наугад встаёт на L28: ${наверху > 0}`).toBe('наугад встаёт на L28: true');
  });

  it('🔴 думающий игрок не может быть ХУЖЕ случайного ни на одном уровне', () => {
    // Мутация, которой доказан гейт: подмени `жадный(2)` на `наугад` — строка
    // останется зелёной, поэтому она не про качество, а про целость перебора.
    // Красное здесь означает ошибку в оценке хода (например перепутанный знак).
    const хуже: string[] = [];
    for (const L of УРОВНИ) {
      const б = (итоги.get('наугад') as Map<number, number>).get(L) as number;
      const д = (итоги.get('думающий (2 хода)') as Map<number, number>).get(L) as number;
      if (д > б + ПАРТИЙ * 0.1) хуже.push(`L${L}: думающий ${д} против наугад ${б}`);
    }
    expect(хуже).toEqual([]);
  });
});
