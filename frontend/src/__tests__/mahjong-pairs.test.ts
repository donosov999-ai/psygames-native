/* psygames-mahjong-pairs-gate · VER 1 · 22.08.2026 */
/**
 * СЧЁТЧИК ДОСТУПНЫХ ПАР обязан совпадать с тем, что доска реально даёт снять.
 *
 * 🔴 ЗАЧЕМ ОН ПОЯВИЛСЯ. Верхний по полезности отзыв к Vita Mahjong (100 млн
 * установок) — жалоба на то, что из игры убрали окошко «сколько пар ещё можно
 * собрать»: человек остался с кнопкой перетасовки, которую жмёт ВСЛЕПУЮ, не зная,
 * доска встала или пара просто не бросается в глаза. У нас перетасовок одна-три на
 * уровень, то есть слепое нажатие стоит дороже, чем в образце.
 *
 * ⚠️ ЧЕМ ЛОМАЕТСЯ ТАКАЯ ЦИФРА. Ровно одним способом: счётчик заводят по СВОЕЙ
 * формуле, а доска живёт по своей. Дальше правило свободной плитки правят в одном
 * месте — и число на экране начинает врать, причём именно в тупике, где на него
 * только и смотрят. Поэтому здесь сверяются ДВА независимых пути: `availablePairs`
 * (быстрый, одним обходом — им считает шапка) и полный перебор через `isFree` (им
 * экран решает, нажимается ли плитка). Расхождение хоть на одной доске — красный.
 *
 * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Мало «числа совпали»: важно, что число ЗНАЧИТ то, что
 * обещает. Поэтому ниже стоят доски с ответом, посчитанным руками, и отдельная
 * проверка, что ноль означает вставшую доску, а не «я не досчитал».
 */
import { generateDeal } from '@/app/games/mahjong';
import { availablePairs, freeFlags, isFree, type Tile } from '@/src/games/mahjong/board';
import { silhouetteForLevel, SILHOUETTE_KEYS } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel } from '@/src/services/mahjongLevels';

declare const __dirname: string;
declare function require(m: string): any;

/**
 * ЭТАЛОН: полный перебор пар через `isFree` — тот самый путь, которым экран
 * отвечает на касание. Медленный и тупой, зато ничего общего с быстрым счётчиком.
 */
function bruteForcePairs(tiles: Tile[], alive: boolean[]): number {
  let n = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (!alive[i] || !isFree(tiles, alive, i)) continue;
    for (let j = i + 1; j < tiles.length; j += 1) {
      if (!alive[j] || !isFree(tiles, alive, j)) continue;
      if (tiles[i]?.symbol === tiles[j]?.symbol) n += 1;
    }
  }
  return n;
}

function dealLikeScreen(level: number, shape: (typeof SILHOUETTE_KEYS)[number]) {
  const p = mahjongLevel(level);
  let deal = generateDeal(p.layers, p.pairs, p.cols, shape);
  for (let tries = 0; tries < 20 && deal.tiles.length === 0; tries += 1) {
    deal = generateDeal(p.layers, p.pairs, p.cols, shape);
  }
  return deal;
}

describe('быстрая свобода = медленная свобода', () => {
  it('freeFlags совпадает с isFree плитка в плитку на всех этапах разбора', () => {
    const bad: string[] = [];
    for (const shape of SILHOUETTE_KEYS) {
      const deal = dealLikeScreen(12, shape);
      const alive = new Array(deal.tiles.length).fill(true);
      for (let step = 0; step < deal.peelOrder.length; step += 1) {
        const flags = freeFlags(deal.tiles, alive);
        for (let i = 0; i < deal.tiles.length; i += 1) {
          const slow = alive[i] && isFree(deal.tiles, alive, i);
          if (flags[i] !== slow) bad.push(`${shape} шаг ${step} плитка ${i}: быстро=${flags[i]}, медленно=${slow}`);
        }
        const [a, b] = deal.peelOrder[step] as [number, number];
        alive[a] = false; alive[b] = false;
      }
    }
    expect(`расхождений: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('расхождений: 0 → ');
  }, 120000);
});

describe('счётчик совпадает с тем, что реально можно снять', () => {
  it.each(SILHOUETTE_KEYS)('%s: на каждом шаге разбора число сходится с полным перебором', (shape) => {
    const deal = dealLikeScreen(9, shape);
    const alive = new Array(deal.tiles.length).fill(true);
    const bad: string[] = [];
    for (let step = 0; step < deal.peelOrder.length; step += 1) {
      const fast = availablePairs(deal.tiles, alive);
      const slow = bruteForcePairs(deal.tiles, alive);
      if (fast !== slow) bad.push(`шаг ${step}: счётчик ${fast}, перебор ${slow}`);
      // Доска собрана снятием пар, значит ход есть ВСЕГДА, пока плитки остались.
      if (fast === 0) bad.push(`шаг ${step}: ходов нет на решаемой доске`);
      const [a, b] = deal.peelOrder[step] as [number, number];
      alive[a] = false; alive[b] = false;
    }
    expect(`${shape}: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe(`${shape}: 0 → `);
  }, 120000);

  it('пара, которую генератор снимает следующей, ВХОДИТ в посчитанные', () => {
    // Иначе счётчик считал бы «какие-то» пары, а не те, что доска даёт нажать.
    const deal = dealLikeScreen(6, 'butterfly');
    const alive = new Array(deal.tiles.length).fill(true);
    const bad: string[] = [];
    for (let step = 0; step < deal.peelOrder.length; step += 1) {
      const [a, b] = deal.peelOrder[step] as [number, number];
      const flags = freeFlags(deal.tiles, alive);
      if (!flags[a] || !flags[b]) bad.push(`шаг ${step}: снимаемая пара не числится свободной`);
      alive[a] = false; alive[b] = false;
    }
    expect(`${bad.length} → ${bad.slice(0, 2).join(' | ')}`).toBe('0 → ');
  });
});

describe('число значит ровно то, что обещает', () => {
  const row = (xs: number[], symbols: number[]): Tile[] =>
    xs.map((x, i) => ({ id: i, x, y: 0, layer: 0, symbol: symbols[i] as number }));
  const allAlive = (t: Tile[]) => new Array(t.length).fill(true);

  it('две одинаковые свободные плитки — один ход', () => {
    const t = row([0, 6], [1, 1]);
    expect(availablePairs(t, allAlive(t))).toBe(1);
  });

  it('ТРИ одинаковые свободные плитки — три хода, а не один', () => {
    /**
     * Считаются СОЧЕТАНИЯ. Какие две снимешь — такая третья останется, и от этого
     * зависит, откроется низ или запрётся; значит это три РАЗНЫХ хода. Округление
     * до «одной пары» скрыло бы от игрока именно тот выбор, ради которого он на
     * счётчик и смотрит.
     */
    const t = row([0, 6, 12], [1, 1, 1]);
    expect(availablePairs(t, allAlive(t))).toBe(3);
    expect(bruteForcePairs(t, allAlive(t))).toBe(3);
  });

  it('разные символы ходов не дают', () => {
    const t = row([0, 6, 12], [1, 2, 3]);
    expect(availablePairs(t, allAlive(t))).toBe(0);
  });

  it('🔴 ноль — это вставшая доска, а не «не досчитал»', () => {
    // Классический мёртвый случай: одинаковая пара стоит вертикальной стопкой.
    // Верхняя свободна, нижняя накрыта — снять такую пару нельзя НИКОГДА.
    const stack: Tile[] = [
      { id: 0, x: 4, y: 4, layer: 0, symbol: 1 },
      { id: 1, x: 4, y: 4, layer: 1, symbol: 1 },
    ];
    expect(availablePairs(stack, allAlive(stack))).toBe(0);
    expect(bruteForcePairs(stack, allAlive(stack))).toBe(0);
  });

  it('зажатая с обоих боков плитка в счёт не идёт', () => {
    /**
     * Пятёрка вплотную: символ 1 лежит на местах 2 и 6 — обе зажаты соседями с двух
     * сторон, значит ходов ноль, хотя одинаковая пара на доске есть и видна.
     * Уберём то, что их держит слева, — и та же пара становится ходом.
     */
    const t = row([0, 2, 4, 6, 8], [3, 1, 4, 1, 5]);
    const alive = allAlive(t);
    expect(availablePairs(t, alive)).toBe(0);
    expect(bruteForcePairs(t, alive)).toBe(0);
    alive[0] = false; alive[2] = false;      // сняли соседей слева от обеих единиц
    expect(availablePairs(t, alive)).toBe(1);
  });

  it('снятые плитки перестают считаться', () => {
    const t = row([0, 6, 12, 18], [1, 1, 2, 2]);
    const alive = allAlive(t);
    expect(availablePairs(t, alive)).toBe(2);
    alive[0] = false; alive[1] = false;
    expect(availablePairs(t, alive)).toBe(1);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ. Эталон обязан РАСХОДИТЬСЯ с заведомо неверной формулой —
   * иначе он согласится с чем угодно, и все сверки выше ничего не стоят.
   */
  it('эталон не соглашается с формулой «сколько пар снимется подряд»', () => {
    const t = row([0, 6, 12], [1, 1, 1]);
    const naive = Math.floor(3 / 2);   // «три свободные одинаковые = одна пара»
    expect(bruteForcePairs(t, allAlive(t))).not.toBe(naive);
  });
});

describe('цифра доходит до экрана, а ноль — говорит', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const screen = code(read('../../app/games/mahjong.tsx'));

  /**
   * 🔴 ПОЧЕМУ ПРОВЕРЯЕТСЯ РАЗМЕТКА, А НЕ ТОЛЬКО ФУНКЦИЯ. Свежая грабля этого репозитория:
   * в SET бейдж отсчёта был написан, переведён на 12 языков и покрыт гейтом — и не
   * показывался ни разу. Считать правильно и не показать — то же самое, что не считать.
   */
  it('счётчик считается ядром доски, а не своей формулой в экране', () => {
    expect(screen).toMatch(/const openPairs = React\.useMemo\(\s*\(\) => availablePairs\(tiles, aliveMaskRef\.current\)/);
  });

  it('бейдж с числом стоит в шапке рядом с остальными счётчиками', () => {
    const stats = screen.slice(screen.indexOf('stats={'), screen.indexOf('headerActions='));
    expect(stats).toMatch(/HudBadge[\s\S]*value=\{openPairs\}/);
    expect(stats).toMatch(/label=\{t\('mahjongPairsOpen'\)\}/);
  });

  it('ноль читается как «доска встала», а не молчит', () => {
    expect(screen).toMatch(/const boardStuck = openPairs === 0/);
    // Красная пилюля — заметить, строка под доской — понять, что делать.
    expect(screen).toMatch(/boardStuck \? \['#fb7185', '#e11d48'\]/);
    /**
     * ⚠️ ЗДЕСЬ СТОЯЛ ЛИТЕРАЛ `boardStuck ? t('mahjongNoPairs') : t('mahjongHint')`,
     * и 05.09.2026 он покраснел на ПОЧИНКЕ. Текст на вставшей доске стал одним из
     * четырёх: прежний звал в перетасовку и отмену, которых на 15+ уровне могло не
     * быть ни одной (замер — 26 % партий на 40 уровне без единого выхода). Гейт,
     * прибитый к тексту, требовал вернуть враньё.
     *
     * Поэтому он прибит к СУТИ: ноль обязан говорить, и что именно сказать —
     * решает `mahjongStuckKey` (src/games/mahjong/stuck.ts), а не константа в
     * экране. Оно же решает набор кнопок, поэтому текст и кнопки разойтись не могут.
     */
    expect(screen).toMatch(/const stuckKey = boardStuck \? mahjongStuckKey\(/);
    expect(screen).toMatch(/t\(stuckKey \?\? 'mahjongHint'\)/);
  });

  it('обе подписи есть во ВСЕХ двенадцати языках', () => {
    const base = read('../contexts/LanguageContext.tsx');
    for (const key of ['mahjongPairsOpen', 'mahjongNoPairs']) {
      expect(base).toMatch(new RegExp(`^ {2}${key}:\\s*\\{`, 'm'));
      for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
        const dict = read(`../contexts/translations/${loc}.ts`);
        // Ключ, забытый в одной локали, роняет гейт dictionary-duplicates — но
        // узнать об этом лучше здесь, рядом с самой правкой.
        expect(`${loc}/${key}: ${new RegExp(`"${key}":\\s*"[^"]+"`).test(dict)}`).toBe(`${loc}/${key}: true`);
      }
    }
  });

  it('силуэт и счётчик — из ядра игры, а не из копии в экране', () => {
    expect(screen).toMatch(/from '@\/src\/games\/mahjong\/board'/);
    expect(screen).toMatch(/from '@\/src\/games\/mahjong\/silhouettes'/);
    expect(silhouetteForLevel(1)).toBeTruthy();
  });
});
