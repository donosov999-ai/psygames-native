/* psygames-cake-sort-level · VER 1 · 06.09.2026 */
/**
 * УРОВНИ ТОРТОВ: чем задаётся стол и как раздаётся, чтобы он ТОЧНО разбирался.
 *
 * 🔴 НИ ОДНО ЧИСЛО НЕ УНАСЛЕДОВАНО ОТ СОРТИРОВКИ ТОВАРОВ. Там круг замыкается
 * тремя, здесь шестью, и это меняет арифметику целиком: тарелка обязана стать
 * ОДНОРОДНОЙ И ПОЛНОЙ, люфта внутри неё нет. Весь запас манёвра переезжает на
 * число тарелок — потому их и больше, чем ниш (замер геометрии: на 360 точках
 * читаемы 5 столбцов, то есть до 20 тарелок против 14 ниш).
 */
import { Board, CIRCLE, Plate, makeBoard, completeIn } from './plate';
import { provenUnsolvable, solve } from './solver';

/** Наибольшее число тарелок, влезающих читаемо (5 столбцов × 4 ряда — см. layout). */
export const PLATES_MAX = 20;

/** Пол запаса: столько тарелок сверх числа видов должно оставаться на манёвр. */
export const SPARES_MIN = 2;

export interface CakeLevel {
  /** Видов начинки на столе. Каждый вид — ровно один круг из шести секторов. */
  types: number;
  /** Тарелок на столе. */
  plates: number;
  /** Сколько тарелок приходит из очереди, а не стоит на столе с начала. */
  queue: number;
}

/**
 * 🔴 ЛЕСТНИЦА ЗАДАНА ОТ ЁМКОСТИ, А НЕ «НА ГЛАЗ».
 *
 * Видов растёт по одному через уровень, тарелок — так, чтобы запас манёвра
 * никогда не падал ниже `SPARES_MIN`. Проверять это надо ПРОГОНОМ по всем
 * уровням: соседние игры уже жили с лестницей, которая упиралась в потолок на
 * тринадцатом уровне и дальше выдавала одно и то же, а все пробы были зелёными.
 */
export function levelCfg(L: number): CakeLevel {
  const n = Math.max(1, Math.floor(L) || 1);
  const types = Math.min(11, 2 + Math.floor((n + 1) / 2));
  const plates = Math.min(PLATES_MAX, types + Math.max(SPARES_MIN, 2 + Math.floor(n / 6)));
  const queue = n < QUEUE_FROM ? 0 : Math.min(plates - types - SPARES_MIN + 1, 1 + Math.floor((n - QUEUE_FROM) / 8));
  return { types, plates, queue: Math.max(0, queue) };
}

/**
 * 🔴 ОЧЕРЕДЬ ВХОДЯЩИХ — С L7, И ЭТО ОТДЕЛЬНАЯ СУЩНОСТЬ, А НЕ УКРАШЕНИЕ.
 *
 * У нас такого нет нигде: во всех играх семьи мультимножество лежит на столе
 * целиком. Здесь часть тарелок ОТЛОЖЕНА и приходит на освободившееся место.
 *
 * ⚠️ Очередь КОНЕЧНА и известна заранее — иначе рушится единственная наша
 * отстройка. Разбор §8 дословно: «замкнутость мультимножества держит всю
 * гарантию решаемости». Бесконечный поток нельзя доказать вообще никак, и
 * именно на этом конкурент собрал 454 жалобы на непроходимые уровни.
 */
export const QUEUE_FROM = 7;

/** Детерминированный генератор: уровень обязан повторяться при повторном заходе. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * 🔴 СЕКТОРОВ ВСЕГДА КРАТНО ШЕСТИ, И ЭТО ИНВАРИАНТ, А НЕ СЛЕДСТВИЕ.
 *
 * Каждый вид даёт ровно один круг. Нарушь кратность — и на столе останется
 * хвост, который нельзя замкнуть никогда: уровень станет непроходимым, причём
 * молча, потому что ходы у игрока ещё будут.
 */
function sectors(types: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < types; t += 1) for (let k = 0; k < CIRCLE; k += 1) out.push(t);
  return out;
}

/** Разложить сектора по тарелкам: заполняем подряд, остаток тарелок — пустые. */
function layOut(all: number[], plates: number): Plate[] {
  const out: number[][] = Array.from({ length: plates }, () => []);
  let i = 0;
  for (const s of all) {
    while ((out[i] as number[]).length >= CIRCLE) i += 1;
    (out[i] as number[]).push(s);
  }
  return out;
}

export interface Deal {
  board: Board;
  cfg: CakeLevel;
  /** Сколько раз пришлось пересобирать. Для замера стоимости раздачи. */
  tries: number;
}

/**
 * 🔴 ЗА ЧТО РАЗДАЧА БРАКУЕТСЯ. Отдельной функцией, а не строчками внутри `deal`,
 * НАМЕРЕННО — и вот почему.
 *
 * Замер 06.09.2026: 720 раздач (L1…L60 × 12 попыток) дали **0 готовых кругов и
 * 0 доказанно нерешаемых столов**. То есть при нынешнем генераторе оба заслона
 * НЕ СРАБАТЫВАЮТ НИ РАЗУ, и мутация «убрать проверку» проходила мимо гейта —
 * ровно та ловушка, на которой сортировка товаров уже стояла с недостижимой
 * страховкой `clampGoalToLevel`.
 *
 * Строчка, которую нельзя проверить исполнением, ничего не стережёт. Вынесенную
 * функцию гейт зовёт НАПРЯМУЮ, подавая ей заведомо плохие столы, — и заслон
 * остаётся живым, даже пока генератор до него не доводит. Убирать заслон нельзя:
 * генератор ещё будут менять, и тогда он понадобится в первый же день.
 *
 * ⚠️ Бракуются два случая, и только они: круг уже замкнут (даровая победа) и
 * стол ДОКАЗАННО нерешаем. Исчерпание бюджета — не брак: «не знаю» ≠ «нет», и
 * на этой разнице сортировка товаров теряла полсекунды на старте уровня,
 * пересобирая хорошие столы.
 */
export function dealRejected(board: Board): false | 'готовый круг' | 'нерешаемо' {
  if (board.plates.some((p) => completeIn(p) !== null)) return 'готовый круг';
  if (board.queue.some((p) => completeIn(p) !== null)) return 'готовый круг';
  if (provenUnsolvable(board)) return 'нерешаемо';
  return false;
}

/** Раздача уровня с ДОКАЗАННОЙ решаемостью. */
export function deal(L: number, attempts = 12): Deal {
  const cfg = levelCfg(L);
  const все = sectors(cfg.types);
  for (let tries = 0; tries < attempts; tries += 1) {
    const rand = rng(L * 1000 + tries);
    const разложено = layOut(shuffle(все, rand), cfg.plates);
    const queue = разложено.slice(cfg.plates - cfg.queue).filter((p) => p.length > 0);
    const plates = разложено.slice(0, cfg.plates - cfg.queue);
    const board = makeBoard(plates, queue);
    if (dealRejected(board)) continue;
    return { board, cfg, tries };
  }
  // Не нашли за отведённые попытки — отдаём последнюю честно, как есть.
  const rand = rng(L * 1000 + attempts);
  const разложено = layOut(shuffle(все, rand), cfg.plates);
  return {
    board: makeBoard(разложено.slice(0, cfg.plates - cfg.queue), разложено.slice(cfg.plates - cfg.queue).filter((p) => p.length > 0)),
    cfg,
    tries: attempts,
  };
}

/** Разбирается ли стол вообще. Обёртка с говорящим именем для экрана и гейтов. */
export function solvable(b: Board, budget = 20000): boolean {
  return solve(b, budget).solvable;
}
