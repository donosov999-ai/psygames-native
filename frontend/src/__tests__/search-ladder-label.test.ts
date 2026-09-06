/* psygames-search-ladder-label · VER 1 · 06.09.2026 */
/**
 * 🔴 ОБЪЯВЛЕННЫЙ ПОТОЛОК ОБЯЗАН РАВНЯТЬСЯ НАСТОЯЩЕМУ.
 *
 * ЧТО ЛОМАЛОСЬ. Карта уровней подписывает экран «Уровень N/M», где M берётся из
 * `maxLevel`. Не передал — берётся умолчание `LADDER_MIN = 15`. Замер живьём
 * 06.09.2026 22:52 на дев-сервере: маджонг писал «1/15» при лестнице до 28,
 * быстрый счёт «1/15» при лестнице до 31. Игрок читал «осталось 14», когда
 * впереди 27, то есть игра занижала себя вдвое.
 *
 * ⚠️ ЭТОГО НЕ ВИДЕЛ МОЙ ЖЕ ПРОГОН ВСЕХ 400 УРОВНЕЙ. Он мерил ФУНКЦИЮ уровня, а
 * врала ПОДПИСЬ на экране — разные вещи. Нашлось только игрой. Ровно об этом
 * `CHATS_RULES.md` §0.2.3: «не читаешь код — ИГРАЕШЬ».
 *
 * 🔴 ГЕЙТ ЗОВЁТ НАСТОЯЩИЙ `ladderCap` ИЗ САМОГО КОМПОНЕНТА, а не повторяет его
 * формулу: повтор зеленел бы и после того, как компонент передумает.
 *
 * ⚠️ Потолок нигде не вписан числом — он СЧИТАЕТСЯ из `levelParams` каждой игры.
 * Вписанное число разошлось бы с лестницей при первой же её правке молча, а это
 * и есть чинимый дефект. Поэтому гейт сверяет два ИСПОЛНЕНИЯ, а не число с числом.
 */
import { ladderCap, LADDER_MIN } from '@/src/components/LevelProgressMap';
import { mahjongLevel, MAHJONG_LEVELS } from '@/src/services/mahjongLevels';
import { levelParams as quickCount, QUICK_COUNT_LEVELS } from '@/app/games/quick-count';
import { levelParams as visualSearch } from '@/app/games/visual-search';
import { levelParams as proofreading } from '@/app/games/proofreading';
import { levelParams as findDifferences } from '@/app/games/find-differences';
import { levelParams as schulte } from '@/app/games/schulte';
import { LEVELS as TRACKER_LEVELS } from '@/src/games/object-tracker/core/types';

// Те же две строки, что в `mahjong-stuck-exit`: jest-окружение даёт их в рантайме,
// а `tsc` о них не знает — без объявления сборка типов краснеет.
declare const __dirname: string;
declare function require(m: string): any;

/** Последний уровень, на котором настройки ещё МЕНЯЮТСЯ. Тот же перебор, что в экранах. */
function вершина(подпись: (L: number) => unknown, предел = 200): number {
  let последний = 1;
  let прежняя = JSON.stringify(подпись(1));
  for (let L = 2; L <= предел; L += 1) {
    const текущая = JSON.stringify(подпись(L));
    if (текущая !== прежняя) { последний = L; прежняя = текущая; }
  }
  return последний;
}

/**
 * Семь игр раздела. `объявлено` — ровно то, что экран отдаёт в `maxLevel`
 * на СТАРТЕ (уровень 1, рекорд 0): именно там подпись и врала.
 *
 * ⚠️ У зрительного поиска подпись берётся по ПЕРВОМУ раунду уровня — это то,
 * что игрок видит, открыв уровень. Полная подпись со всеми раундами меняется до
 * 84-го, но там растёт лишь скорость добора объектов ВНУТРИ партии, а не то,
 * чем L60 отличается от L20 на старте.
 */
const ИГРЫ: { имя: string; лестница: (L: number) => unknown; объявлено: number | undefined }[] = [
  { имя: 'маджонг', лестница: mahjongLevel, объявлено: MAHJONG_LEVELS },
  { имя: 'быстрый счёт', лестница: quickCount, объявлено: QUICK_COUNT_LEVELS },
  { имя: 'слежение за объектами', лестница: () => 0, объявлено: TRACKER_LEVELS },
  { имя: 'зрительный поиск', лестница: (L) => visualSearch(L, 1), объявлено: undefined },
  { имя: 'корректура', лестница: proofreading, объявлено: undefined },
  { имя: 'найди отличия', лестница: findDifferences, объявлено: undefined },
  { имя: 'Шульте', лестница: schulte, объявлено: undefined },
];

describe('🔴 подпись «Уровень N/M» не занижает лестницу', () => {
  it('есть что проверять: без maxLevel карта и правда обещает пятнадцать', () => {
    // Если это перестанет быть правдой, весь гейт ниже теряет смысл — и об этом
    // надо узнать здесь, а не гадать, почему он вечно зелёный.
    expect(ladderCap(undefined, 1, 0)).toBe(LADDER_MIN);
    expect(LADDER_MIN).toBe(15);
  });

  it('🔴 у каждой игры объявленный потолок ≥ настоящего', () => {
    const врут: string[] = [];
    for (const g of ИГРЫ) {
      if (g.имя === 'слежение за объектами') continue;   // у неё лестница внутри генератора
      const настоящий = вершина(g.лестница);
      const обещано = ladderCap(g.объявлено, 1, 0);
      if (обещано < настоящий) врут.push(`${g.имя}: обещано ${обещано}, лестница до ${настоящий}`);
    }
    expect(врут).toEqual([]);
  });

  it('🔴 маджонг и быстрый счёт — те самые две, что занижали', () => {
    // Числа здесь НЕ вписаны: сверяются два исполнения. Замер 06.09.2026 дал
    // 28 и 31; вырастет лестница — вырастут оба, и строка останется зелёной.
    expect(MAHJONG_LEVELS).toBe(вершина(mahjongLevel));
    expect(QUICK_COUNT_LEVELS).toBe(вершина(quickCount));
    // А вот занижение проверяется прямо: старое поведение обязано краснеть.
    expect(ladderCap(Math.max(15, 1, 0), 1, 0)).toBeLessThan(вершина(mahjongLevel));
    expect(ladderCap(undefined, 1, 0)).toBeLessThan(вершина(quickCount));
  });

  it('слежение объявляет свой потолок честно', () => {
    expect(ladderCap(TRACKER_LEVELS, 1, 0)).toBe(TRACKER_LEVELS);
    expect(TRACKER_LEVELS).toBeGreaterThan(LADDER_MIN);
  });

  it('четыре игры на 15 совпадают с умолчанием НЕ случайно — а потому что там правда 15', () => {
    // Иначе «совпало» читалось бы как «работает», и рост любой из четырёх
    // лестниц прошёл бы мимо подписи молча.
    for (const имя of ['зрительный поиск', 'корректура', 'найди отличия', 'Шульте']) {
      const g = ИГРЫ.find((x) => x.имя === имя) as (typeof ИГРЫ)[number];
      expect(`${имя}: ${вершина(g.лестница)}`).toBe(`${имя}: ${LADDER_MIN}`);
    }
  });
});

describe('проводка: константа доехала до экрана', () => {
  /**
   * ⚠️ ЭТО ПРОВЕРКА ИСХОДНИКА, И Я НАЗЫВАЮ ЕЁ СВОИМ ИМЕНЕМ. Гейты выше меряют
   * поведение; но константу можно посчитать верно и забыть ПЕРЕДАТЬ — тогда
   * подпись снова возьмёт умолчание, а поведенческие строки останутся зелёными.
   * Отрендерить экран целиком в jsdom дороже, чем эта строка стоит.
   */
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;

  it('🔴 оба экрана передают карте посчитанный потолок, а не число', () => {
    expect(read('../../app/games/mahjong.tsx')).toMatch(/maxLevel=\{Math\.max\(MAHJONG_LEVELS, level, lvl\.best\)\}/);
    expect(read('../../app/games/quick-count.tsx')).toMatch(/maxLevel=\{QUICK_COUNT_LEVELS\}/);
  });
});
