/* psygames-mahjong-vendor-solvable · VER 1 · 23.08.2026 */
/**
 * РАЗДАЧА, РЕШАЕМАЯ ПО ПОСТРОЕНИЮ — АЛГОРИТМ ИЗ ЧУЖОГО ПРОЕКТА.
 *
 * Источник:  https://github.com/ffalt/mah  (ветка main, коммит 22.08.2026)
 * Файлы:     src/app/model/builder/solvable.ts (SolvableBoardBuilderBase —
 *            assignTilePairs / buildSolvableWithRetries),
 *            src/app/model/builder/base.ts (pairedMapping, randomExtract),
 *            src/app/model/stone.ts (правило isBlocked)
 * Автор:     ffalt
 * Лицензия:  MIT — «Copyright (c) 2016 ffalt».
 *            Полный текст: src/games/mahjong/vendor/LICENSE-mah (рядом).
 *
 * 🔴 ЧТО ЭТО ЧИНИТ. Раскладка задаёт МЕСТА. Если разложить по местам случайные пары,
 * доска может встать насмерть: плитки на месте, тапы не работают, объяснить нечем.
 * Здесь порядок обратный: сначала СИМУЛИРУЕМ РАЗБОР полной доски (на каждом шаге
 * берём две СВОБОДНЫЕ позиции и «снимаем» их), и именно в момент снятия решаем,
 * какая пара там лежала. Последовательность снятия и есть готовое решение, поэтому
 * доска разбирается ПО ПОСТРОЕНИЮ, а не по удаче.
 *
 * ⚠️ ПОЧЕМУ СНЯТИЕ НИКОГДА НЕ ЗАПИРАЕТ ОСТАЛЬНЫХ. Убрать плитку можно только
 * освободив соседей — «накрыта сверху» и «зажата с боков» от удаления плиток лишь
 * слабеют. Поэтому симуляция не может загнать себя в тупик задним числом: если на
 * шаге были две свободные, снятие их не отнимет свободу у третьей.
 *
 * ЧТО ИЗ ИСТОЧНИКА НЕ ПЕРЕНЕСЕНО И ПОЧЕМУ — чтобы не тащить чужой код бездумно:
 *   • «alternative strategy» (перебор в обратном порядке групп плиток). У них
 *     плитки ходят группами по 4 с разными картинками внутри группы, и порядок
 *     групп влияет на подбор. У нас пара = два ОДИНАКОВЫХ символа, символ ставится
 *     ПОСЛЕ выбора места, поэтому на решаемость порядок символов не влияет вовсе.
 *     Перенести — значит добавить ветку, которая ничего не меняет.
 *   • «Step 4: last resort — random fill, possibly unsolvable». Ровно та дыра,
 *     которую этот репозиторий уже однажды закрывал (см. mahjong-solvable.test.ts):
 *     молча отдать нерешаемую доску хуже, чем честно пересобрать. Возвращаем пустое.
 *
 * ⚠️ ПРАВИЛО СВОБОДНОЙ ПЛИТКИ БЕРЁТСЯ НАШЕ (`freeFlags` из ../board), а не их
 * `Stone.isBlocked`. Их правило смотрит только на слой z+1, наше — на ВСЕ слои
 * выше. На 82 из 84 раскладок ответы совпадают, на «Interweaved» и «Interweaved 2»
 * расходятся (разбор — в шапке ../layouts.ts). Генератор ОБЯЗАН считать свободу тем
 * же кодом, что и экран: иначе он «решит» доску по одному правилу, а игрок упрётся
 * в другое.
 */
import { freeFlags, type Tile } from '../board';

/** Место под плитку в наших координатах (полуклетки, слой снизу вверх). */
export interface Place { x: number; y: number; layer: number }

/**
 * Раздача. `peelOrder` — пары в том порядке, в котором генератор их СНИМАЛ;
 * проигранная вперёд, эта последовательность и есть решение доски.
 *
 * Наружу отдаётся ради проверки: обещание, которое нечем перепроверить, живёт
 * ровно до первой правки. ⚠️ Но проверять решаемость ТОЛЬКО по `peelOrder` мало —
 * это вопрос генератору о его же работе. Независимый разбор — в тесте.
 */
export interface Deal { tiles: Tile[]; peelOrder: [number, number][] }

/** Их `BuilderBase.pairedMapping`: нечётное число мест — пары не сложатся, лишнее долой. */
export function pairedPlaces(places: Place[]): Place[] {
  return places.length % 2 === 0 ? places : places.slice(0, -1);
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Сколько раз пересобирать раздачу, прежде чем признать неудачу.
 *
 * У источника — 2000 (`MAX_RUNS`). Замер 23.08.2026 по 84 раскладкам × 14 уровней
 * (837 досок, по 25 заходов на доску): НИ ОДНА доска не осталась неразобранной, а
 * худшая раскладка («Superimposed») брала случайный разбор с 55 % с первой попытки.
 * 60 заходов при худшем 55 % — это 0,45⁶⁰ ≈ 10⁻²¹ на отказ, запас избыточный;
 * держать 2000 незачем — каждый заход на 144 плитках это полный разбор доски.
 */
const MAX_RUNS = 60;

/**
 * ОДИН ЗАХОД: симулируем разбор полной доски, попутно раздавая символы.
 * Пустой ответ — заход упёрся в «свободных меньше двух», надо пересобрать.
 */
function dealOnce(places: Place[], symbolCount: number): Deal {
  const total = places.length;
  const pairs = total / 2;
  const tiles: Tile[] = places.map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
  const alive = new Array<boolean>(total).fill(true);
  const peelOrder: [number, number][] = [];
  // Каждая из pairs пар получает символ по кругу: на полном наборе (72 пары,
  // 36 рисунков) выходит ровно по 4 плитки на рисунок — классический набор.
  const symSeq = shuffled(Array.from({ length: pairs }, (_, k) => k % symbolCount));

  for (let p = 0; p < pairs; p++) {
    const flags = freeFlags(tiles, alive);
    const free: number[] = [];
    for (let i = 0; i < total; i++) if (flags[i]) free.push(i);
    // Их `if (freestones.length < 2) return []` — заход провален, выкручиваться нельзя.
    if (free.length < 2) return { tiles: [], peelOrder: [] };
    const pick = shuffled(free);
    const a = pick[0] as number;
    const b = pick[1] as number;
    const sym = symSeq[p] as number;
    (tiles[a] as Tile).symbol = sym;
    (tiles[b] as Tile).symbol = sym;
    alive[a] = false;
    alive[b] = false;
    peelOrder.push([a, b]);
  }
  return { tiles, peelOrder };
}

/**
 * РАЗДАЧА ПО МЕСТАМ РАСКЛАДКИ. Пустой ответ = не собралось за MAX_RUNS заходов.
 *
 * Повторы живут ЗДЕСЬ, а не у вызывающего (у источника так же — MAX_RUNS внутри
 * builder'а): «доска решаема» — обещание этой функции, и держать его она обязана
 * сама. Раньше повторы были в экране, и любой второй вызывающий (перетасовка,
 * проверка) получал гарантию слабее, чем думал.
 */
export function dealSolvable(places: Place[], symbolCount: number, maxRuns: number = MAX_RUNS): Deal {
  const even = pairedPlaces(places);
  if (even.length < 2 || symbolCount < 1) return { tiles: [], peelOrder: [] };
  for (let run = 0; run < Math.max(1, maxRuns); run++) {
    const deal = dealOnce(even, symbolCount);
    if (deal.tiles.length > 0) return deal;
  }
  return { tiles: [], peelOrder: [] };
}
