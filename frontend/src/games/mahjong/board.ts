/* psygames-mahjong-board · VER 1 · 22.08.2026 */
/**
 * ЯДРО ДОСКИ МАДЖОНГА: что такое плитка, когда она свободна и сколько пар можно
 * снять ПРЯМО СЕЙЧАС.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. `isFree` жил в экране `app/games/mahjong.tsx`, и всё, чему
 * он нужен (счётчик доступных пар, набор силуэтов, проверки), тянуло бы за собой
 * целый экран с React, роутером и контекстами. Экран по-прежнему реэкспортирует
 * `Tile`/`isFree` — старые импорты и проверки не тронуты.
 */

/** Плитка на доске. x,y — в ПОЛУКЛЕТКАХ: сама плитка занимает 2×2 полуклетки. */
export interface Tile { id: number; x: number; y: number; layer: number; symbol: number; }

/** «Перекрывает ли» позиция верхнего слоя позицию нижнего (тайл 2×2 в полуклетках). */
export function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

/** Свободен ли тайл i среди ОСТАВШИХСЯ: (а) сверху нет перекрывающего, (б) слева ИЛИ справа открыто. */
export function isFree(tiles: Tile[], alive: boolean[], i: number): boolean {
  const t = tiles[i];
  // (а) ничего на слое выше, перекрывающего позицию
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer > t.layer && overlaps(tiles[j], t)) return false;
  }
  // (б) сосед на ТОМ ЖЕ слое вплотную слева / справа (та же y-полоса, x±2)
  let blockedL = false, blockedR = false;
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer !== t.layer) continue;
    if (Math.abs(tiles[j].y - t.y) < 2) {
      if (Math.abs(tiles[j].x - (t.x - 2)) < 1) blockedL = true;
      if (Math.abs(tiles[j].x - (t.x + 2)) < 1) blockedR = true;
    }
  }
  return !(blockedL && blockedR);
}

/**
 * Свобода СРАЗУ ДЛЯ ВСЕХ плиток одним проходом.
 *
 * Зачем не звать `isFree` в цикле: он сам обходит доску, и цикл поверх него даёт
 * O(n²) на каждый пересчёт — при 144 плитках это 20 тысяч сравнений на КАЖДУЮ
 * перерисовку шапки. Здесь тот же ответ считается за один обход: покрытие сверху и
 * соседей слева/справа собираем в один проход по парам, дальше только чтение.
 *
 * ⚠️ Ответ обязан СОВПАДАТЬ с `isFree` плитка-в-плитку — иначе счётчик в шапке
 * начнёт расходиться с тем, что доска реально даёт нажать. Совпадение сторожит
 * проверка `mahjong-pairs.test.ts`, и ломается она нарочно (см. её шапку).
 */
export function freeFlags(tiles: Tile[], alive: boolean[]): boolean[] {
  const n = tiles.length;
  const covered = new Array<boolean>(n).fill(false);
  const blockedL = new Array<boolean>(n).fill(false);
  const blockedR = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const a = tiles[i];
    for (let j = i + 1; j < n; j++) {
      if (!alive[j]) continue;
      const b = tiles[j];
      if (a.layer !== b.layer) {
        // Кто выше — тот накрывает, и только при перекрытии клеток.
        if (overlaps(a, b)) { if (b.layer > a.layer) covered[i] = true; else covered[j] = true; }
        continue;
      }
      if (Math.abs(a.y - b.y) >= 2) continue;
      if (Math.abs(b.x - (a.x - 2)) < 1) { blockedL[i] = true; blockedR[j] = true; }
      else if (Math.abs(b.x - (a.x + 2)) < 1) { blockedR[i] = true; blockedL[j] = true; }
    }
  }
  const out = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) out[i] = alive[i] && !covered[i] && !(blockedL[i] && blockedR[i]);
  return out;
}

/**
 * СКОЛЬКО ПАР МОЖНО СНЯТЬ ПРЯМО СЕЙЧАС.
 *
 * 🔴 ЗАЧЕМ ЭТО ВООБЩЕ. Верхний по полезности отзыв к Vita Mahjong (100 млн
 * установок) — жалоба на то, что из игры убрали окошко «сколько пар ещё можно
 * собрать»: без него человек жмёт перетасовку ВСЛЕПУЮ, не зная, встала доска или он
 * просто не видит пару. У нас перетасовка — расходуемый ресурс (одна-три на
 * уровень), то есть цена слепого нажатия ещё выше, чем в образце.
 *
 * ЗАМЕР 22.08.2026, ЗАЧЕМ ЭТО НЕ УКРАШЕНИЕ. Прогнал случайный разбор (игрок берёт
 * любую доступную пару) по 100 партий на уровень, силуэты вперемешку: доска встаёт
 * НАСМЕРТЬ в 31 % партий на 6 уровне, 38 % на 12-м и 44 % на 20-м. То есть примерно
 * каждая третья партия доходит до состояния, о котором раньше игра не сообщала
 * НИЧЕМ: плитки на месте, тапы не работают, объяснения нет. Минимум ходов, увиденный
 * по ходу партии, — один: между «всё хорошо» и «конец» бывает ровно один шаг.
 *
 * ⚠️ СЧИТАЮТСЯ СОЧЕТАНИЯ, А НЕ «сколько снимется подряд». Если свободны ТРИ
 * одинаковые плитки — это 3 разных хода (C(3,2)), а не один: какие две снимешь,
 * такая третья останется, и от выбора зависит, откроется низ или запрётся. Число
 * на экране отвечает ровно на вопрос «сколько у меня сейчас ходов», а не «сколько
 * пар доживёт до конца» — последнее без полного перебора не считается вовсе.
 */
export function availablePairs(tiles: Tile[], alive: boolean[]): number {
  const free = freeFlags(tiles, alive);
  const bySymbol = new Map<number, number>();
  for (let i = 0; i < tiles.length; i++) {
    if (!free[i]) continue;
    const s = tiles[i].symbol;
    bySymbol.set(s, (bySymbol.get(s) ?? 0) + 1);
  }
  let pairs = 0;
  for (const k of bySymbol.values()) pairs += (k * (k - 1)) / 2;
  return pairs;
}

/**
 * ГДЕ РИСОВАТЬ ПЛИТКУ: пиксельный сдвиг относительно левого верхнего угла поля.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНОЙ ФУНКЦИЕЙ, А НЕ ДВУМЯ СТРОКАМИ В РАЗМЕТКЕ. Раньше верхний слой
 * был сдвинут ещё и В ДАННЫХ (к координате прибавлялась клетка на слой), и формула
 * `y * half - layer * offset` не могла уйти в минус. Силуэты кладут слои РОВНО друг
 * на друга, и плитка верхнего слоя в самой верхней строке (крепость и ромб на 1
 * уровне, бабочка на 6-м, замер 22.08.2026) уезжала за край контейнера и обрезалась.
 *
 * Поэтому подъём считается ОТ САМОГО ВЕРХНЕГО слоя вниз: картинка та же (чем выше
 * слой, тем выше плитка), но отрицательных координат не бывает по построению.
 * Проверка `mahjong-silhouettes.test.ts` зовёт именно эту функцию на настоящих
 * раскладках всех форм.
 */
export function tilePlacement(
  t: { x: number; y: number; layer: number }, maxLayer: number, half: number, layerOffset: number,
): { left: number; top: number } {
  return {
    left: t.x * half + t.layer * layerOffset,
    top: t.y * half + (maxLayer - t.layer) * layerOffset,
  };
}
