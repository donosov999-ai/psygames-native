/* psygames-mahjong-layouts · VER 1 · 23.08.2026 */
/**
 * БИБЛИОТЕКА РАСКЛАДОК: 84 рисованные вручную доски вместо семи процедурных силуэтов.
 *
 * ДАННЫЕ ЧУЖИЕ: ffalt/mah, MIT, «Copyright (c) 2016 ffalt» — см. ./vendor/LICENSE-mah.
 * Здесь НАШ код: как чужая раскладка ложится на нашу лесенку уровней.
 *
 * 🔴 ЧТО БЫЛО. Форм было семь, и рисовались они неравенствами (эллипсы, треугольники).
 * На больших уровнях выходило прилично, на маленьких — «внутренность выпуклой фигуры
 * это круг, чем бы фигура ни была снаружи»: черепаха, пирамида и ромб на двадцати
 * плитках совпадали побуквенно. У образцов (Vita Mahjong, Mahjong Blast) витринная
 * строка — «сотни вручную проработанных раскладок», и это не про формулы.
 *
 * ⚠️ ГЛАВНОЕ ОГРАНИЧЕНИЕ БИБЛИОТЕКИ, О КОТОРОМ НАДО ЗНАТЬ СРАЗУ: все 84 раскладки —
 * РОВНО 144 плитки (72 пары). Разброса по размеру там НЕТ ВООБЩЕ: mah — чистый
 * маджонг-пасьянс, он всегда раскладывает полный набор. То есть «лесенка от малых
 * раскладок к большим» из этой библиотеки НЕ СОБИРАЕТСЯ — брать нечего.
 *
 * ПОЭТОМУ ЛЕСЕНКА РАСТЁТ НЕ ВЫБОРОМ РАСКЛАДКИ, А ГЛУБИНОЙ ЕЁ РАЗБОРКИ. Число пар
 * задаёт `mahjongLevel` (10 → 72, монотонно), а раскладка ужимается под заказ:
 *   1. срезаются слои выше обещанных уровнем (снять верх — всегда безопасно);
 *   2. лишнее снимается по одной плитке — ТОЛЬКО с тех, НА КОТОРЫХ НИЧЕГО НЕ ЛЕЖИТ.
 * К 28 уровню заказ дорастает до 144, и раскладка выкладывается ЦЕЛИКОМ, как задумана.
 *
 * ⚠️ ПОЧЕМУ СНИМАЕМ ТОЛЬКО НЕПРИКРЫТЫЕ, А НЕ «ЛИШНИЕ ПО ВКУСУ». Убери плитку из-под
 * стопки — и верхняя повиснет над пустотой: горка выглядит развалившейся, а правило
 * «на ней ничего не лежит» начинает срабатывать на плитках, под которыми дыра.
 * Снятие неприкрытых даёт это даром: любая ужатая доска — это ДОСТИЖИМОЕ СОСТОЯНИЕ
 * исходной раскладки, то есть «черепаха, у которой уже разобрали верх». Ничего
 * невозможного в такой доске появиться не может по построению.
 *
 * 🔴 ИХ ПРАВИЛО СВОБОДНОЙ ПЛИТКИ И НАШЕ РАСХОДЯТСЯ — И МЫ ОСТАВЛЯЕМ НАШЕ.
 * Их `Stone.isBlocked` считает плитку накрытой, только если что-то лежит на
 * СЛЕДУЮЩЕМ слое (z+1). Наш `blockersOf`/`freeFlags` смотрит на ВСЕ слои выше.
 * Замер 23.08.2026 по всем 84 раскладкам: ответы совпадают на 82, расходятся на
 * «Interweaved» (2 плитки) и «Interweaved 2» (5 плиток) — там плитка слоя 3-4
 * ПЕРЕКИНУТА аркой над плиткой слоя 0-1, а промежуточные слои в этом месте пусты.
 * ⚠️ По ПОКРЫТИЮ расхождений больше (4 и 10), но на части этих плиток запрет всё
 * равно даёт правило боков, и итоговый ответ сходится: считать надо ИТОГ, а не
 * его слагаемое. Первая редакция этой шапки несла 4 и 10 — цифры покрытия,
 * выданные за итог; поймала подстановка в проверке, а не глаз.
 * В динамике (разбор случайными парами, 18 143 состояния доски) разошлись 654 раза.
 *
 * Оставляем НАШЕ, и вот почему: экран рисует слои со сдвигом (`tilePlacement`), то
 * есть плитка арки ФИЗИЧЕСКИ ЗАКРЫВАЕТ собой часть нижней. По их правилу игрок
 * увидел бы наполовину спрятанную плитку, которая нажимается, рядом с открытой,
 * которая нет. Это ровно тот «отказ без объяснения», ради которого писался
 * `blockersOf`. Правило обязано читаться глазами, а не только в справке.
 * ⚠️ Раздачу генератор считает ТЕМ ЖЕ `freeFlags` — расхождение поэтому не может
 * сделать доску нерешаемой: обе спорные раскладки отдельно прогнаны независимым
 * разбором в `src/__tests__/mahjong-layouts.test.ts`, и обе разбираются.
 */
import { VENDOR_BOARDS } from './vendor/boards';
import { expandMapping } from './vendor/mapping';
import type { Place } from './vendor/solvable';
import { mahjongLevel } from '@/src/services/mahjongLevels';

export interface MahjongLayout {
  id: string;
  /** Имя из источника: Turtle, Butterfly, Pikachu… */
  name: string;
  /** Категория из источника: Animals / Architecture / Shapes / Symbols / Plants. */
  cat: string;
  /** Все 144 места в наших координатах (полуклетки, слой снизу вверх). */
  places: Place[];
  /** Сколько слоёв в раскладке как она задумана. */
  layers: number;
  /** Габарит в полуклетках. */
  width: number;
  height: number;
}

/**
 * ШИРИНА, ПОСЛЕ КОТОРОЙ ДОСКА НЕ ЧИТАЕТСЯ НА ТЕЛЕФОНЕ.
 *
 * Раскладки источника доходят до 37 полуклеток (18,5 плитки в ряд) — он рисует их
 * на десктопе с панорамированием и зумом, у нас доска влезает в экран целиком.
 * На телефоне 390 px под доску остаётся ~354 px: при 26 полуклетках плитка выходит
 * 22 px, при 35 — 16 px, и рисунок на ней уже не разобрать. Замер 23.08.2026:
 * с потолком 26 на верхних уровнях остаётся 18 раскладок, на средних 25-35 — то
 * есть выбор всё равно вдвое-втрое шире прежних семи силуэтов.
 */
export const MAX_LAYOUT_HALF_X = 26;

let cache: MahjongLayout[] | null = null;

/** Каталог раскладок. Разворачивается один раз: 84 × 144 места. */
export function layoutCatalogue(): MahjongLayout[] {
  if (cache) return cache;
  cache = VENDOR_BOARDS.map((b) => {
    const places: Place[] = expandMapping(b.map).map(([z, x, y]) => ({ x, y, layer: z }));
    let layers = 0; let width = 0; let height = 0;
    for (const p of places) {
      if (p.layer + 1 > layers) layers = p.layer + 1;
      if (p.x + 2 > width) width = p.x + 2;
      if (p.y + 2 > height) height = p.y + 2;
    }
    return { id: b.id, name: b.name, cat: b.cat, places, layers, width, height };
  });
  return cache;
}

/**
 * УЖАТЬ РАСКЛАДКУ ДО ЗАКАЗА УРОВНЯ. `null` = из этой раскладки такой доски не выйдет.
 *
 * Порядок: срезать слои выше `maxLayers`, затем снимать по одной НЕПРИКРЫТОЙ плитке,
 * пока не останется ровно `need`. Какую именно снять — решает счёт:
 *
 *   доля_слоя × 1e6 + квадрат расстояния от центра слоя
 *
 * ⚠️ ДОЛЯ СЛОЯ, А НЕ ЕГО РАЗМЕР. Если брать «где больше плиток», нижний слой худеет
 * до размера верхнего, и горка превращается в двухэтажную стенку: почти на каждой
 * нижней плитке лежит верхняя, снимать нечего. Доля срезанного держит ПРОПОРЦИИ
 * стопки — низ остаётся широким, верх узким. Расстояние от центра срезает по
 * контуру, то есть силуэт ужимается, а не дырявится изнутри.
 *
 * ⚠️ ПОЛ У СЛОЯ — ДВЕ ПЛИТКИ, НО ОН УСТУПАЕТ. Слой в одну плитку — это слой, из
 * которого нельзя снять пару. Но у настоящих раскладок верхушка часто И ЕСТЬ одна
 * плитка (венец черепахи), а у «Three Pyramids» три отдельные верхушки: при жёстком
 * поле 2 сжатие вставало наглухо на уровнях 15-18 — все неприкрытые плитки лежали в
 * слоях, уже ужатых до двух. Поэтому пол сначала 2, и только если снять нечего —
 * 1. Замер 23.08.2026: с уступкой отказов 0 из 84 раскладок × 60 уровней, без неё 4.
 */
export function reduceLayout(places: Place[], maxLayers: number, need: number): Place[] | null {
  const keep = places.filter((p) => p.layer < maxLayers);
  if (need <= 0 || keep.length < need) return null;
  const n = keep.length;
  let nLayers = 0;
  for (const p of keep) if (p.layer + 1 > nLayers) nLayers = p.layer + 1;

  // Кто под кем: `above[i]` — сколько ЖИВЫХ плиток накрывает i. Считается один раз,
  // дальше только уменьшается — иначе каждое снятие стоило бы полного обхода доски.
  const under: number[][] = Array.from({ length: n }, () => [] as number[]);
  const above = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = keep[i] as Place;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = keep[j] as Place;
      if (b.layer > a.layer && Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2) {
        (under[j] as number[]).push(i);
        above[i] = (above[i] as number) + 1;
      }
    }
  }

  const alive = new Array<boolean>(n).fill(true);
  const cur = new Array<number>(nLayers).fill(0);
  for (const p of keep) cur[p.layer] = (cur[p.layer] as number) + 1;
  const orig = [...cur];
  let count = n;

  while (count > need) {
    const cx = new Array<number>(nLayers).fill(0);
    const cy = new Array<number>(nLayers).fill(0);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const p = keep[i] as Place;
      cx[p.layer] = (cx[p.layer] as number) + p.x;
      cy[p.layer] = (cy[p.layer] as number) + p.y;
    }
    for (let k = 0; k < nLayers; k++) {
      const c = cur[k] as number;
      if (c > 0) { cx[k] = (cx[k] as number) / c; cy[k] = (cy[k] as number) / c; }
    }
    let best = -1;
    for (let floor = 2; floor >= 1 && best < 0; floor--) {
      let bestScore = -1;
      for (let i = 0; i < n; i++) {
        if (!alive[i] || (above[i] as number) > 0) continue;
        const p = keep[i] as Place;
        if ((cur[p.layer] as number) <= floor) continue;
        const dx = p.x - (cx[p.layer] as number);
        const dy = p.y - (cy[p.layer] as number);
        const score = ((cur[p.layer] as number) / (orig[p.layer] as number)) * 1e6 + dx * dx + dy * dy;
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    if (best < 0) return null;
    alive[best] = false;
    const p = keep[best] as Place;
    cur[p.layer] = (cur[p.layer] as number) - 1;
    count -= 1;
    for (const i of under[best] as number[]) above[i] = (above[i] as number) - 1;
  }

  // ⚠️ КООРДИНАТЫ НЕ СДВИГАЕМ. Ужатая доска обязана остаться ПОДМНОЖЕСТВОМ исходной
  // раскладки — только так проверяется главное свойство: «снято лишь то, на чём
  // ничего не лежало». Прижать к нулю — забота показа, этим занят `normalize`.
  return keep.filter((_, i) => alive[i]);
}

/**
 * Прижать доску к нулю. Пустые строки сверху и колонки слева в габарит входят, а
 * плиток не показывают: экран считает размер плитки по крайним координатам, и
 * полоса пустоты просто отбирает у плиток пиксели.
 */
export function normalize(places: Place[]): Place[] {
  let minX = Infinity; let minY = Infinity;
  for (const q of places) { if (q.x < minX) minX = q.x; if (q.y < minY) minY = q.y; }
  if (!Number.isFinite(minX)) return [];
  return places.map((q) => ({ x: q.x - minX, y: q.y - minY, layer: q.layer }));
}

/** Годится ли раскладка под заказ уровня — дёшево, без самой сборки. */
function eligible(l: MahjongLayout, layers: number, need: number): boolean {
  if (l.layers < layers) return false;
  let cnt = 0;
  for (const p of l.places) if (p.layer < layers) cnt += 1;
  return cnt >= need;
}

export interface LevelLayout { layout: MahjongLayout; places: Place[] }

const perLevel = new Map<number, LevelLayout | null>();

/**
 * КАКАЯ РАСКЛАДКА У УРОВНЯ И КАК ОНА ЛОЖИТСЯ.
 *
 * Детерминированно — уровень 7 сегодня и через месяц выглядит одинаково, иначе
 * поднятая из хранилища недоигранная партия оживала бы другой доской.
 *
 * Шаг 29 (простое) по списку годных: соседние уровни почти никогда не совпадают,
 * а список годных сам меняется со ступенями слоёв, так что «после моста всегда
 * паук» не запоминается. Годные — те, у кого хватает слоёв и мест под заказ;
 * дальше берётся первая, чья ужатая доска влезает в телефон по ширине.
 */
export function layoutForLevel(level: number): LevelLayout | null {
  const n = Math.max(1, Math.floor(level) || 1);
  const cached = perLevel.get(n);
  if (cached !== undefined) return cached;

  const p = mahjongLevel(n);
  const need = p.pairs * 2;
  const all = layoutCatalogue();
  const fit = all.filter((l) => eligible(l, p.layers, need));
  let answer: LevelLayout | null = null;
  if (fit.length > 0) {
    const start = (n * 29) % fit.length;
    let wide: LevelLayout | null = null;   // подходит, но широковата — запасной вариант
    for (let k = 0; k < fit.length && !answer; k++) {
      const layout = fit[(start + k) % fit.length] as MahjongLayout;
      const kept = reduceLayout(layout.places, p.layers, need);
      if (!kept) continue;
      const places = normalize(kept);
      let w = 0;
      for (const q of places) if (q.x + 2 > w) w = q.x + 2;
      if (w <= MAX_LAYOUT_HALF_X) answer = { layout, places };
      else if (!wide) wide = { layout, places };
    }
    // Узкой не нашлось — широкая всё равно лучше, чем отсутствие раскладки.
    if (!answer) answer = wide;
  }
  perLevel.set(n, answer);
  return answer;
}
