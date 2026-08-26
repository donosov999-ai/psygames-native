/* psygames-nback-sequence · VER 1 · 26.08.2026 */
/**
 * ПОСЛЕДОВАТЕЛЬНОСТЬ N-BACK СТРОИТСЯ ЗАРАНЕЕ И ПО КВОТЕ, А НЕ БРОСКОМ МОНЕТЫ.
 *
 * 🔴 ЧТО БЫЛО. Экран собирал стимулы по одному прямо в момент подачи:
 *   if (canMatch && Math.random() < 0.3) vStim = vHist[i - n];
 *   else { do { vStim = rnd(9); } while (canMatch && vStim === vHist[i - n] && Math.random() < 0.5); }
 * Второй бросок отвергал случайное совпадение лишь В ПОЛОВИНЕ случаев, поэтому
 * оно выживало с вероятностью около 1/17. Заявленные 30% матчей превращались в
 * ~34%, и доля ПЛАВАЛА от блока к блоку.
 *
 * Почему это дороже, чем звучит: d′ считается из долей попаданий и ложных
 * тревог. Если доля матчей у двух блоков разная, их d′ несравнимы — и «прогресс»
 * игрока частично оказывается шумом генератора, а не изменением в человеке.
 * N-back — флагман научного обоснования продукта (Jaeggi et al., 2008, PNAS),
 * здесь генератор обязан быть безупречным.
 *
 * 🔴 ЛУРЫ НЕ КОНТРОЛИРОВАЛИСЬ ВООБЩЕ. Лур — повтор на лаге n−1 или n+1: главный
 * источник интерференции в этой парадигме, именно он отличает «держит позицию в
 * уме» от «узнаёт знакомое». Их доля прежде складывалась как придётся, то есть
 * трудность блока менялась независимо от уровня.
 *
 * ЗДЕСЬ: число матчей и число луров ЗАДАНЫ ТОЧНО, остальные позиции заполняются
 * значениями, которые не образуют ни матча, ни лура случайно.
 *
 * ⚠️ ГПСЧ — ПАРАМЕТР, А НЕ `Math.random`. Иначе проверку не написать: она либо
 * шаткая, либо мерит не то. В бою передаётся обычный `Math.random`.
 */

/** Источник случайности: возвращает число в [0, 1). */
export type Rng = () => number;

export interface NbackSequence {
  /** Индексы стимулов, `0..alphabet-1`. */
  items: number[];
  /** Позиции, где стимул совпадает с тем, что был n назад. */
  matchAt: number[];
  /** Позиции луров — повтор на лаге n−1 или n+1, но НЕ на n. */
  lureAt: number[];
}

/**
 * Сколько матчей и луров в блоке.
 *
 * ⚠️ ДОЛЯ МАТЧЕЙ ФИКСИРОВАНА и НЕ является ручкой сложности — это ровно тот
 * дефект, что чинился в пяти играх с конфликтными парадигмами: доля проб задаёт
 * величину измеряемого эффекта, поэтому крутить ею сложность значит ломать
 * мерку. Сложность n-back крутится глубиной `n`, темпом и длиной блока.
 * Луры растут с глубиной: на 1-back лура быть не может по определению (лаг 0),
 * дальше их доля повышается — это добавляет интерференции, не трогая долю целей.
 */
export const MATCH_RATE = 0.3;

export function lureRateFor(n: number): number {
  if (n <= 1) return 0;      // лаг n−1 = 0 — это сам текущий стимул, лура нет
  return Math.min(0.2, 0.1 + (n - 2) * 0.05);
}

/** Перемешивание Фишера — Йетса на переданном ГПСЧ. */
function shuffle<T>(rng: Rng, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Построить блок.
 *
 * @param trials   сколько стимулов в блоке
 * @param n        глубина n-back
 * @param alphabet сколько разных стимулов бывает (9 клеток, либо число букв)
 */
export function buildNbackSequence(
  trials: number, n: number, alphabet: number, rng: Rng,
): NbackSequence {
  /**
   * 🔴 СОБИРАЕМ ДО ТОЧНОГО ПОПАДАНИЯ, А НЕ «ПОЧТИ».
   * Замер 26.08.2026 на 75 блоках: матчи выходили ровно всегда, а луры
   * недобирали ОДИН в 6 случаях из 75 — и только на большой глубине. Причина:
   * позиция, у которой ОБА соседних лага несут то же значение, что и лаг n; лур
   * там невозможен по построению, и квота молча просаживалась.
   *
   * Чинить перестановкой уже готового массива нельзя: правка одной ячейки
   * меняет контекст соседних и может породить случайный матч — то самое, от чего
   * уходили. Поэтому пересобираем блок целиком: ГПСЧ идёт дальше, раскладка
   * позиций другая, и на следующей попытке узкое место обычно исчезает.
   *
   * Попыток 40. Ниже — честная развилка: если и они не дали точного попадания
   * (не встречалось ни разу), отдаём последнюю сборку, а не падаем посреди
   * партии у человека. Расхождение при этом остаётся видимым: `matchAt`/`lureAt`
   * говорят, что заказывалось, а сам массив — что вышло.
   */
  let last: NbackSequence | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const built = buildOnce(trials, n, alphabet, rng);
    last = built;
    if (countMatches(built.items, n) === built.matchAt.length
      && countLures(built.items, n) === built.lureAt.length) return built;
  }
  return last as NbackSequence;
}

function buildOnce(
  trials: number, n: number, alphabet: number, rng: Rng,
): NbackSequence {
  const items: number[] = new Array(trials).fill(-1);

  /**
   * Позиции, на которых матч ВОЗМОЖЕН: раньше `n` сравнивать не с чем.
   * Доли считаются от них, а не от всей длины блока — иначе на коротких блоках
   * с большой глубиной доля выходила бы заниженной молча.
   */
  const eligible: number[] = [];
  for (let i = n; i < trials; i++) eligible.push(i);

  const matchCount = Math.round(eligible.length * MATCH_RATE);
  const lureCount = Math.round(eligible.length * lureRateFor(n));

  const shuffled = shuffle(rng, eligible);
  const matchAt = shuffled.slice(0, matchCount).sort((a, b) => a - b);
  /**
   * ⚠️ Луры выбираются из позиций, СВОБОДНЫХ от матчей. Позиция не может быть
   * одновременно и целью, и приманкой: игрок обязан ответить на неё однозначно,
   * иначе проба не измеряет ничего.
   */
  const lureAt = shuffled.slice(matchCount, matchCount + lureCount).sort((a, b) => a - b);

  const isMatch = new Set(matchAt);
  const isLure = new Set(lureAt);

  for (let i = 0; i < trials; i++) {
    if (isMatch.has(i)) { items[i] = items[i - n]; continue; }

    /**
     * Значения, которые НЕЛЬЗЯ ставить на обычную позицию: они дали бы матч или
     * лур случайно — то самое, из-за чего доля плавала.
     */
    const forbidden = new Set<number>();
    if (i - n >= 0) forbidden.add(items[i - n]);                     // случайный матч
    if (i - (n - 1) >= 0 && n - 1 > 0) forbidden.add(items[i - (n - 1)]);  // случайный лур
    if (i - (n + 1) >= 0) forbidden.add(items[i - (n + 1)]);              // случайный лур

    if (isLure.has(i)) {
      /**
       * ⚠️ ПЕРЕБИРАЕМ ОБА ЛАГА, А НЕ ОДИН НАУГАД. Первая редакция брала один
       * случайный лаг и, если его значение совпадало ещё и с лагом n, отступала
       * и ставила обычный стимул. Замер: заказано 7 луров, фактически 5 — то
       * есть заданная интерференция молча недобиралась на один-два.
       * Значение на соседнем лаге совпадает с матчем нечасто, но когда это
       * случается, второй лаг почти всегда свободен.
       */
      const lagCandidates = shuffle(rng, [n - 1, n + 1].filter((lag) => lag > 0 && i - lag >= 0));
      let placed = false;
      for (const lag of lagCandidates) {
        const value = items[i - lag];
        if (i - n >= 0 && items[i - n] === value) continue;   // это был бы матч, не лур
        items[i] = value; placed = true; break;
      }
      if (placed) continue;
    }

    const pool: number[] = [];
    for (let v = 0; v < alphabet; v++) if (!forbidden.has(v)) pool.push(v);
    /**
     * ⚠️ Запас всегда есть, и это не удача: запрещено максимум три значения, а
     * алфавит не меньше девяти. Пустой `pool` означал бы, что где-то поменяли
     * алфавит и не заметили — тогда честнее упасть, чем молча поставить матч.
     */
    if (!pool.length) throw new Error(`n-back: алфавита ${alphabet} не хватает при n=${n}`);
    items[i] = pool[Math.floor(rng() * pool.length)];
  }

  return { items, matchAt, lureAt };
}

/** Настоящее число совпадений в готовой последовательности — для проверок. */
export function countMatches(items: readonly number[], n: number): number {
  let c = 0;
  for (let i = n; i < items.length; i++) if (items[i] === items[i - n]) c += 1;
  return c;
}

/** Настоящее число луров: повтор на лаге n±1, не являющийся матчем. */
export function countLures(items: readonly number[], n: number): number {
  let c = 0;
  for (let i = 0; i < items.length; i++) {
    if (i - n >= 0 && items[i] === items[i - n]) continue;   // это матч, не лур
    for (const lag of [n - 1, n + 1]) {
      if (lag > 0 && i - lag >= 0 && items[i] === items[i - lag]) { c += 1; break; }
    }
  }
  return c;
}
