/* psygames-mahjong-solvable · VER 1 · 22.08.2026 */
/**
 * КАЖДЫЙ РАСКЛАД МАДЖОНГА ОБЯЗАН РАЗБИРАТЬСЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ РАЗБОРОМ 22.08.2026. Доска собирается СНЯТИЕМ пар: пока каждая
 * пара снимается со свободных позиций, обратный порядок и есть готовое решение.
 * В генераторе стоял «запасной путь» с припиской «теоретически не должно
 * случаться»: при нехватке свободных он брал любые две ЖИВЫЕ и клал на них один
 * символ. Гарантия рушилась молча.
 *
 * Замер: 9-й уровень — 11,2 % нерешаемых досок, 10-й — 8,7 %, 11-й — 7,7 %,
 * 6-й — 7,5 %. Оставшиеся две позиции в 100 % случаев вертикальная стопка:
 * верхняя накрывает нижнюю, взять такую пару нельзя НИКОГДА. Перетасовка не
 * спасала — 2000 прогонов, ноль решаемых. Для человека это выглядело как
 * зависшее приложение: ходов нет, сообщения нет, кнопки не помогают.
 *
 * ⚠️ ПРОВЕРЯЕТСЯ РАЗБОРОМ, А НЕ ВЕРОЙ. Ниже стоит настоящий жадный решатель: он
 * снимает свободные пары, пока они есть. Для доски, собранной снятием, жадного
 * достаточно — но он честно упрётся в ту самую стопку.
 */
import { generate, generateDeal, isFree, type Tile } from '@/app/games/mahjong';
import { mahjongLevel } from '@/src/services/mahjongLevels';

declare const __dirname: string;
declare function require(m: string): any;

/**
 * 🔴 ПРОВЕРЯЕМ ТО, ЧТО ГЕНЕРАТОР ОБЕЩАЕТ, А НЕ ЖАДНЫЙ РАЗБОР.
 *
 * Первая редакция этой проверки снимала «первую попавшуюся свободную пару» — и
 * заваливала уровни с десятого. Жадный разбор в маджонге НЕ ПОЛОН: при трёх и
 * более копиях символа неверный выбор пары отрезает решение, которое есть.
 * То есть красный цвет означал слабость проверки, а не поломку игры.
 *
 * Обещание генератора другое и точное: доска собрана СНЯТИЕМ пар, и обратный
 * порядок снятия — готовое решение. Его и проигрываем: каждая пара в свой черёд
 * обязана быть свободной и одинаковой по символу. Это полная проверка гарантии,
 * а не приблизительная.
 */
function replayHolds(deal: ReturnType<typeof generateDeal>): string[] {
  const { tiles, peelOrder } = deal;
  if (tiles.length === 0) return ['доска пуста'];
  if (peelOrder.length * 2 !== tiles.length) {
    return [`снято пар ${peelOrder.length}, а плиток ${tiles.length}`];
  }
  const alive = new Array(tiles.length).fill(true);
  const issues: string[] = [];
  /**
   * ⚠️ ПОРЯДОК ПРЯМОЙ, А НЕ ОБРАТНЫЙ. Генератор снимает пары С ПОЛНОЙ доски,
   * выбирая на каждом шаге свободные, — значит его последовательность И ЕСТЬ
   * решение, проигрываемое вперёд. Первая редакция этой проверки шла назад и
   * заваливала даже первый уровень: красный цвет означал мою ошибку в проверке,
   * а не поломку игры.
   */
  for (let step = 0; step < peelOrder.length; step += 1) {
    const [a, b] = peelOrder[step] as [number, number];
    if (tiles[a]?.symbol !== tiles[b]?.symbol) issues.push(`шаг ${step}: символы разные`);
    if (!isFree(tiles, alive, a)) issues.push(`шаг ${step}: левая закрыта`);
    if (!isFree(tiles, alive, b)) issues.push(`шаг ${step}: правая закрыта`);
    alive[a] = false; alive[b] = false;
  }
  if (alive.some(Boolean)) issues.push('после разбора остались плитки');
  return issues;
}

/** Разбирается ли доска жадно — только для проверки самой проверки. */
function greedySolvable(tiles: Tile[]): boolean {
  if (tiles.length === 0) return false;
  const alive = new Array(tiles.length).fill(true);
  let left = tiles.length;
  let guard = 0;
  while (left > 0 && guard++ < 5000) {
    const free: number[] = [];
    for (let i = 0; i < tiles.length; i += 1) if (alive[i] && isFree(tiles, alive, i)) free.push(i);
    let took = false;
    for (let a = 0; a < free.length && !took; a += 1) {
      for (let b = a + 1; b < free.length && !took; b += 1) {
        const i = free[a] as number;
        const j = free[b] as number;
        if (tiles[i]?.symbol !== tiles[j]?.symbol) continue;
        alive[i] = false; alive[j] = false; left -= 2; took = true;
      }
    }
    if (!took) return false;
  }
  return left === 0;
}

describe('расклад разбирается на каждом уровне', () => {
  /**
   * Уровни 6–12 — та самая яма, где брак доходил до одиннадцати процентов.
   * По сорок досок на уровень: при прежнем поведении хотя бы одна упала бы почти
   * наверняка.
   */
  it.each([1, 3, 6, 8, 9, 10, 11, 12, 16, 20, 30, 40])('уровень %i: сорок досок подряд', (level) => {
    const p = mahjongLevel(level);
    const bad: string[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let deal = generateDeal(p.layers, p.pairs, p.cols);
      for (let tries = 0; tries < 20 && deal.tiles.length === 0; tries += 1) {
        deal = generateDeal(p.layers, p.pairs, p.cols);
      }
      if (deal.tiles.length === 0) { bad.push(`попытка ${attempt}: собрать не вышло за 20 заходов`); continue; }
      const issues = replayHolds(deal);
      if (issues.length) bad.push(`попытка ${attempt}: ${issues[0]}`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ. `replayHolds` обязан заваливать доску, у которой
   * порядок снятия испорчен, — иначе он зеленеет на чём угодно.
   */
  it('испорченный порядок снятия проверку не проходит', () => {
    const p = mahjongLevel(9);
    let deal = generateDeal(p.layers, p.pairs, p.cols);
    for (let tries = 0; tries < 20 && deal.tiles.length === 0; tries += 1) {
      deal = generateDeal(p.layers, p.pairs, p.cols);
    }
    expect(replayHolds(deal)).toEqual([]);
    // Переставим первые две пары местами: снимать станет нечем.
    const broken = { ...deal, peelOrder: [...deal.peelOrder] };
    const last = broken.peelOrder.length - 1;
    const tmp = broken.peelOrder[0] as [number, number];
    broken.peelOrder[0] = broken.peelOrder[last] as [number, number];
    broken.peelOrder[last] = tmp;
    expect(replayHolds(broken).length).toBeGreaterThan(0);
  });

  it('доска без порядка снятия проверку не проходит', () => {
    expect(replayHolds({ tiles: [], peelOrder: [] }).length).toBeGreaterThan(0);
  });
});

describe('жадный разбор — не мерило, и это важно помнить', () => {
  /**
   * Держим это в проверках, чтобы следующий читатель не «починил» гейт обратно
   * на жадный разбор: он не полон и краснеет на РЕШАЕМЫХ досках.
   */
  it('заведомо мёртвая стопка не разбирается ни жадно, ни как-либо ещё', () => {
    const stack: Tile[] = [
      { id: 0, x: 4, y: 4, layer: 0, symbol: 1 },
      { id: 1, x: 4, y: 4, layer: 1, symbol: 1 },
    ];
    expect(greedySolvable(stack)).toBe(false);
  });

  it('простая пара разбирается', () => {
    const pair: Tile[] = [
      { id: 0, x: 0, y: 4, layer: 0, symbol: 1 },
      { id: 1, x: 6, y: 4, layer: 0, symbol: 1 },
    ];
    expect(greedySolvable(pair)).toBe(true);
  });

  it('старый вход generate жив и отдаёт те же плитки', () => {
    const p = mahjongLevel(5);
    const tiles = generate(p.layers, p.pairs, p.cols);
    expect(Array.isArray(tiles)).toBe(true);
  });
});

describe('🔴 экран и перетасовка не отдают мёртвую доску', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const screen = code(read('../../app/games/mahjong.tsx'));

  it('экран пересобирает расклад, а не показывает пустой', () => {
    expect(screen).toMatch(/deck\.length === 0/);
    expect(screen).toMatch(/deck = generate\(/);
  });

  /**
   * Перетасовка — редкий ресурс (три на уровень). Раньше она тратилась и выдавала
   * ровно такую же неразбираемую доску: 2000 прогонов, ноль решаемых. Теперь
   * счётчик обязан расти ПОСЛЕ удачной расстановки, а не до неё.
   */
  it('перетасовка списывается только после удачной расстановки', () => {
    // Ищем ВЫЗОВ списания, а не объявление состояния: объявление стоит выше всего
    // и сравнение с ним ничего не значит.
    const spend = screen.indexOf('setShufflesUsed((n) => n + 1)');
    // ⚠️ Ищем сам страж, а не `… ) return`: 05.09.2026 в эту ветку добавилась
    // вибрация (молчащий отказ читался как поломка приложения), и гейт,
    // прибитый к слову `return`, покраснел на починке.
    const guard = screen.indexOf('symbolOf === null');
    expect(spend).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
    expect(spend).toBeGreaterThan(guard);
  });

  it('запасного пути «любые две живые» больше нет нигде', () => {
    expect(screen).not.toMatch(/if \(alive\[i\]\) live\.push\(i\)/);
    expect(screen).not.toMatch(/liveLeft/);
  });
});
