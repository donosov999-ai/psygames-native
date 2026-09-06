/* psygames-mahjong-stuck-exit-test · VER 1 · 05.09.2026 */
/**
 * 🔴 У ВСТАВШЕЙ ДОСКИ ОБЯЗАН БЫТЬ ВЫХОД, И НАЗЫВАТЬ НАДО ТОЛЬКО ВЫПОЛНИМОЕ.
 *
 * ЧТО ЛОМАЛОСЬ. На нуле доступных пар экран показывал одну строку на все случаи —
 * «Доступных пар нет — доска встала. Перемешай или отмени ход.» Обе названные
 * кнопки могли быть погашены: на 15+ уровне перетасовка ровно одна, отмен три,
 * а лента отмены обнуляется самой перетасовкой. Других действий экран не давал.
 *
 * ЗАМЕР 05.09.2026, 200 партий на уровень, случайный разбор (игрок берёт любую
 * доступную пару; перетасовка и отмена тратятся ровно по правилам экрана):
 *     ур. 1/3/6/9/12 — 0 % · ур. 20 — 2 % · ур. 25 — 12 % · ур. 30 — 10 % · ур. 40 — 26 %
 * То есть каждая четвёртая партия на 40 уровне доходила до состояния, где
 * уровень нельзя ни доиграть, ни перезапустить.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ И ТАБЛИЦА, И ПРОГОН. Таблица покрывает все ветки решения, но
 * ничего не говорит о том, БЫВАЮТ ли они в игре: гейт на недостижимом состоянии
 * зелен вслепую. Прогон отвечает на второй вопрос — и обязан ДОСТАВАТЬ до
 * «выхода нет», иначе он тоже пустой. Поэтому ниже стоит явная проверка, что
 * прогон в это состояние попал.
 *
 * ⚠️ ВЫПОЛНИМОСТЬ ПЕРЕТАСОВКИ ПРОВЕРЯЕТСЯ БОЛЬШИМ БЮДЖЕТОМ, ЧЕМ ПРЕДЛОЖЕНИЕ.
 * Экран решает по 20 заходам раздатчика; проверка добивает 200. Спросить тем же
 * числом заходов значило бы спросить у обещания про него же.
 */
import { generateDeal, SYMBOLS } from '@/app/games/mahjong';
import { availablePairs, freeFlags, type Tile } from '@/src/games/mahjong/board';
import { mahjongExits, mahjongStuckKey, MAHJONG_STUCK_KEYS, type MahjongExit } from '@/src/games/mahjong/stuck';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel, shufflesLeft } from '@/src/services/mahjongLevels';
import { dealSolvable } from '@/src/games/mahjong/vendor/solvable';

declare const __dirname: string;
declare function require(m: string): any;

/** Бюджет отмен из экрана. Разойдётся — прогон перестанет описывать игру. */
const UNDOS_PER_LEVEL = 3;

/** Свой сеятель: красное обязано быть воспроизводимым, а не «иногда падает». */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
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
    const s = (tiles[i] as Tile).symbol;
    const arr = bySym.get(s);
    if (arr) arr.push(i); else bySym.set(s, [i]);
  }
  const out: [number, number][] = [];
  for (const idx of bySym.values()) {
    for (let a = 0; a < idx.length; a += 1) {
      for (let b = a + 1; b < idx.length; b += 1) out.push([idx[a] as number, idx[b] as number]);
    }
  }
  return out;
}

const positionsOf = (tiles: Tile[]) => tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));

// ─────────────────────────────────────────────────────────────────────────────
jest.setTimeout(90_000);

describe('таблица решений: что предлагаем и когда', () => {
  const базис = { openPairs: 0, shufflesLeft: 1, shuffleDeals: true, canUndo: true };

  it('есть что проверять — на живой доске выходов не предлагаем вовсе', () => {
    expect(mahjongExits({ ...базис, openPairs: 3 })).toEqual([]);
    expect(mahjongStuckKey({ ...базис, openPairs: 3 })).toBeNull();
  });

  it('🔴 на вставшей доске список НИКОГДА не пуст', () => {
    const пустые: string[] = [];
    for (const sl of [-1, 0, 1, 3]) {
      for (const sd of [true, false]) {
        for (const cu of [true, false]) {
          const e = mahjongExits({ openPairs: 0, shufflesLeft: sl, shuffleDeals: sd, canUndo: cu });
          if (e.length === 0) пустые.push(`ост=${sl} раздаётся=${sd} отмена=${cu}`);
        }
      }
    }
    expect(пустые).toEqual([]);
  });

  it('🔴 перетасовку не предлагаем ни без бюджета, ни без раздачи', () => {
    const врёт: string[] = [];
    for (const sl of [-1, 0, 1, 3]) {
      for (const sd of [true, false]) {
        for (const cu of [true, false]) {
          const e = mahjongExits({ openPairs: 0, shufflesLeft: sl, shuffleDeals: sd, canUndo: cu });
          const можно = sl !== 0 && sd;
          if (e.includes('shuffle') !== можно) врёт.push(`ост=${sl} раздаётся=${sd}: предложено=${e.includes('shuffle')}, возможно=${можно}`);
          if (e.includes('undo') !== cu) врёт.push(`отмена=${cu}: предложено=${e.includes('undo')}`);
        }
      }
    }
    expect(врёт).toEqual([]);
  });

  it('🔴 «заново» появляется ровно тогда, когда больше нечего', () => {
    expect(mahjongExits({ openPairs: 0, shufflesLeft: 0, shuffleDeals: false, canUndo: false })).toEqual(['restart']);
    // ⚠️ Бюджет есть, а раздать нечего — это тоже «нечего»: вечный отказ
    // раздатчика замерен на 15 уровне (1 партия из 60, 4000 заходов впустую).
    expect(mahjongExits({ openPairs: 0, shufflesLeft: 1, shuffleDeals: false, canUndo: false })).toEqual(['restart']);
    expect(mahjongExits({ openPairs: 0, shufflesLeft: 0, shuffleDeals: true, canUndo: false })).toEqual(['restart']);
    // А вот когда хоть что-то есть — пересдачу НЕ навязываем.
    expect(mahjongExits({ openPairs: 0, shufflesLeft: 0, shuffleDeals: false, canUndo: true })).toEqual(['undo']);
    expect(mahjongExits({ openPairs: 0, shufflesLeft: -1, shuffleDeals: true, canUndo: false })).toEqual(['shuffle']);
  });

  it('🔴 строка называет РОВНО те действия, что в списке', () => {
    const ожидание: Record<string, string> = {
      'shuffle,undo': 'mahjongNoPairs',
      shuffle: 'mahjongStuckShuffle',
      undo: 'mahjongStuckUndo',
      restart: 'mahjongStuckRestart',
    };
    const врёт: string[] = [];
    for (const sl of [-1, 0, 1]) {
      for (const sd of [true, false]) {
        for (const cu of [true, false]) {
          const s = { openPairs: 0, shufflesLeft: sl, shuffleDeals: sd, canUndo: cu };
          const ключ = mahjongStuckKey(s);
          const ждём = ожидание[mahjongExits(s).join(',')];
          if (ключ !== ждём) врёт.push(`ост=${sl} раздаётся=${sd} отмена=${cu}: ${ключ} вместо ${ждём}`);
        }
      }
    }
    expect(врёт).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 прогон настоящей партии: предложенное выполнимо, невыполнимое не предложено', () => {
  /**
   * ДВА УРОВНЯ, И ОБА ВЫБРАНЫ ЗАМЕРОМ, А НЕ НА ГЛАЗ.
   *   ур. 40 — полный набор, пять слоёв, ОДНА перетасовка: тупик без единого
   *            выхода встречается чаще всего именно тут (26 % партий);
   *   ур. 15 — здесь замерен ВЕЧНЫЙ отказ раздатчика (1 партия из 60: набор
   *            оставшихся мест не раздаётся и за 4000 заходов). Без этого
   *            уровня ветка «бюджет есть, а перетасовки не будет» покрывалась
   *            бы только таблицей, то есть в живой партии не проверялась вовсе.
   */
  const УРОВНИ: [number, number][] = [[15, 60], [40, 40]];

  interface Итог { мёртвых: number; проверок: number; вранья: string[]; партий: number; отказов: number }

  const прогон = (L: number, партий: number): Итог => {
    const p = mahjongLevel(L);
    const places = layoutForLevel(L)?.places;
    const итог: Итог = { мёртвых: 0, проверок: 0, вранья: [], партий, отказов: 0 };
    for (let s = 1; s <= партий; s += 1) {
      const r = rng(s * 7919 + L);
      let tiles: Tile[] = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L), places, r).tiles;
      const лента: Tile[][] = [];
      let перетасовок = 0; let отмен = 0; let страж = 0;
      while (tiles.length > 0 && страж < 400) {
        страж += 1;
        const ходы = movesOf(tiles);
        if (ходы.length > 0) {
          // Число в шапке обязано совпадать с числом настоящих ходов — иначе
          // «доска встала» объявляется не там, где она встала.
          if (availablePairs(tiles, new Array(tiles.length).fill(true)) !== ходы.length) {
            итог.вранья.push(`ур.${L} партия ${s}: счётчик ${availablePairs(tiles, new Array(tiles.length).fill(true))} против ходов ${ходы.length}`);
          }
          const [a, b] = ходы[Math.floor(r() * ходы.length)] as [number, number];
          лента.push(tiles);
          if (лента.length > UNDOS_PER_LEVEL + 1) лента.shift();
          tiles = tiles.filter((_, i) => i !== a && i !== b);
          continue;
        }

        // ─── ДОСКА ВСТАЛА. Спрашиваем игру, что она предлагает. ───
        const состояние = {
          openPairs: 0,
          shufflesLeft: shufflesLeft(p.shuffles, перетасовок),
          // ⚠️ Ровно как в экране: 20 заходов раздатчика, не больше.
          shuffleDeals: dealSolvable(positionsOf(tiles), SYMBOLS.length, 20).tiles.length > 0,
          canUndo: лента.length > 0 && отмен < UNDOS_PER_LEVEL,
        };
        const выходы = mahjongExits(состояние);
        итог.проверок += 1;
        if (!состояние.shuffleDeals) итог.отказов += 1;
        if (выходы.length === 0) итог.вранья.push(`ур.${L} партия ${s}: выходов не предложено вовсе`);

        // Каждое ПРЕДЛОЖЕННОЕ действие обязано выполниться.
        for (const e of выходы as MahjongExit[]) {
          if (e === 'shuffle') {
            if (состояние.shufflesLeft === 0) итог.вранья.push(`ур.${L} партия ${s}: перетасовка предложена без бюджета`);
            // Добиваем бо́льшим бюджетом, чем то, на котором давалось обещание.
            if (dealSolvable(positionsOf(tiles), SYMBOLS.length, 200).tiles.length === 0) {
              итог.вранья.push(`ур.${L} партия ${s}: обещанная перетасовка не раздаётся и за 200 заходов`);
            }
          }
          if (e === 'undo' && !(лента.length > 0 && отмен < UNDOS_PER_LEVEL)) {
            итог.вранья.push(`ур.${L} партия ${s}: отмена предложена, а отменять нечего`);
          }
          if (e === 'restart') {
            итог.мёртвых += 1;
            // Пересдача обязана быть НАСТОЯЩИМ выходом: свежая доска этого же
            // уровня разбирается с первого хода, иначе мы обещаем второй тупик.
            const свежая = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L), places, rng(s * 31 + 1)).tiles;
            if (movesOf(свежая).length === 0) итог.вранья.push(`ур.${L} партия ${s}: пересдача выдала мёртвую доску`);
          }
        }

        // Действуем ровно по первому предложенному — так же, как игрок.
        if (выходы[0] === 'shuffle') {
          const d = dealSolvable(positionsOf(tiles), SYMBOLS.length, 20);
          // ⚠️ БЕЗ ЭТОЙ ЗАЩЁЛКИ ПРОБА ПАДАЛА ИСКЛЮЧЕНИЕМ, А НЕ ВНЯТНЫМ КРАСНЫМ.
          // Проверял подстановкой: убрал у `mahjongExits` проверку раздатчика —
          // прогон полез читать `d.tiles[i].symbol` у пустой раздачи и уронил
          // весь файл («Tests: 0 total»). Красное это, конечно, тоже, но по
          // такому красному не понять, ЧТО сломали.
          if (d.tiles.length === 0) {
            итог.вранья.push(`ур.${L} партия ${s}: предложена перетасовка, а раздачи нет`);
            break;
          }
          перетасовок += 1;
          const пос = positionsOf(tiles);
          tiles = пос.map((q, i) => ({ id: i, x: q.x, y: q.y, layer: q.layer, symbol: (d.tiles[i] as Tile).symbol }));
          лента.length = 0;    // экран обнуляет ленту отмены вместе с перетасовкой
          continue;
        }
        if (выходы[0] === 'undo') { отмен += 1; tiles = лента.pop() as Tile[]; continue; }
        break;               // 'restart' — партия здесь и кончается
      }
    }
    return итог;
  };

  /**
   * 🔴 ПРОГОН — В `beforeAll`, А НЕ В ТЕЛЕ `describe`.
   *
   * Замер 06.09.2026 по сборке 34016966105: этот файл идёт 21,1 с на машине
   * сборки против 5,3 с локально, при потолке проверки 20 с. Пока сто партий
   * считались в теле `describe`, они шли на ЭТАПЕ СБОРА проверок, куда
   * `testTimeout` не достаёт вовсе: замедление машины дало бы не честный
   * «проверка не уложилась», а зависание или падение без адреса. Именно так
   * этот файл и получил репутацию шаткого — хотя зерно у него фиксировано
   * (`rng(s * 7919 + L)`), времени в бюджете раздатчика нет, и шесть прогонов
   * подряд зелены.
   *
   * В `beforeAll` тот же прогон накрыт потолком и падает с адресом. Потолок
   * поднят ниже — по замеру, а не на глаз.
   */
  let итоги: Итог[] = [];
  beforeAll(() => { итоги = УРОВНИ.map(([L, n]) => прогон(L, n)); });

  it('есть что проверять: прогон реально доходил до вставшей доски', () => {
    expect(итоги.map((и) => и.проверок > 0)).toEqual([true, true]);
  });

  it('🔴 прогон ДОСТАЁТ до «выхода нет» — иначе гейт зелен вслепую', () => {
    // Замер 05.09.2026: на 40 уровне таких партий 26 %. Порог 1 — гейт про
    // достижимость, а не про точный процент: он не должен краснеть от того,
    // что случайность легла иначе.
    const всего = итоги.reduce((a, и) => a + и.мёртвых, 0);
    expect(`мёртвых досок в прогоне: ${всего >= 1}`).toBe('мёртвых досок в прогоне: true');
  });

  it('🔴 прогон ДОСТАЁТ и до отказа раздатчика — ветка «бюджет есть, перетасовки нет»', () => {
    // Замер 05.09.2026: ур.15, 1 отказ из 60 партий, и он вечный (4000 заходов
    // впустую). Без этой строки ветка проверялась бы только таблицей, а таблица
    // ничего не говорит о достижимости.
    const всего = итоги.reduce((a, и) => a + и.отказов, 0);
    expect(`отказов раздатчика в прогоне: ${всего >= 1}`).toBe('отказов раздатчика в прогоне: true');
  });

  it('🔴 ни одного предложения, которое нельзя выполнить', () => {
    expect(итоги.flatMap((и) => и.вранья)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('строки выхода доходят до человека', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('🔴 все четыре строки есть во ВСЕХ двенадцати языках', () => {
    const base = read('../contexts/LanguageContext.tsx');
    const пробелы: string[] = [];
    for (const key of MAHJONG_STUCK_KEYS) {
      if (!new RegExp(`^ {2}${key}:\\s*\\{`, 'm').test(base)) пробелы.push(`ru/en: ${key}`);
      for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
        if (!new RegExp(`"${key}":\\s*"[^"]+"`).test(read(`../contexts/translations/${loc}.ts`))) пробелы.push(`${loc}: ${key}`);
      }
    }
    // ⚠️ Ключ берётся из СПИСКА, который ведёт сама логика (MAHJONG_STUCK_KEYS).
    // Перечислить их здесь руками значило бы забыть новый при следующей правке.
    expect(пробелы).toEqual([]);
  });

  it('🔴 кнопка пересдачи стоит на экране и по тому же условию, что строка', () => {
    const screen = code(read('../../app/games/mahjong.tsx'));
    // Строка и кнопка обязаны считаться ОДНИМ решением: разойдутся — экран снова
    // начнёт называть действие, которого на нём нет.
    expect(screen).toMatch(/const stuckExits = boardStuck \? mahjongExits\(/);
    expect(screen).toMatch(/stuckExits\.includes\('restart'\)/);
    expect(screen).toMatch(/onPress=\{restartLevel\}/);
    expect(screen).toMatch(/t\('mahjongRestartLevel'\)/);
  });

  it('🔴 пересдача откатывает очки за уровень — иначе это ферма', () => {
    const screen = code(read('../../app/games/mahjong.tsx'));
    // Без отката: набрал двадцать пар по 20 очков, загнал доску в тупик, начал
    // заново — и те же пары приносят очки второй раз.
    expect(screen).toMatch(/scoreRef\.current = levelScoreRef\.current/);
    expect(screen).toMatch(/levelScoreRef\.current = scoreRef\.current/);
  });

  it('🔴 пересдача выбрасывает снимок мёртвой доски из хранилища', () => {
    const screen = code(read('../../app/games/mahjong.tsx'));
    // Найдено при разборе собственной правки: свежая раскладка не «тронута»,
    // автосохранение по ней не срабатывает, и «Продолжить» с главной звало бы
    // обратно в тот же тупик. Снимок обязан гаситься в самой пересдаче.
    const тело = screen.slice(screen.indexOf('const restartLevel = () =>'));
    const конец = тело.indexOf('loadLevel(level)');
    expect(конец).toBeGreaterThan(0);
    expect(тело.slice(0, конец)).toMatch(/clearResume\(GAME_ID, profile\.id\)/);
  });
});
