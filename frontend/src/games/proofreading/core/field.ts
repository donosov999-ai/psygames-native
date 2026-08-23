/* psygames-proofreading-series-field · VER 1 · 23.08.2026 */
/**
 * ОДНО ПОЛЕ НА ВСЮ СЕРИЮ: БУКВЫ, ЗНАК И КАТЕГОРИЯ СОБИРАЮТСЯ ЗДЕСЬ РАЗОМ.
 *
 * 🔴 ПОЧЕМУ ВСЁ ТРИ БЛОКА КОРМЯТСЯ ИЗ ОДНОГО ОБЪЕКТА. Аддитивный метод
 * (Стернберг) держится ровно на одном: блоки СТРОГО сопоставимы, иначе в разность
 * времён попадает разница полей, а не цена правила. Поэтому поле собирается
 * ОДИН раз здесь, а `blocks.ts` переносит его между блоками тем же объектом —
 * перегенерировать в переходе нечего, потому что генератора в переходе нет.
 *
 * 🔴 ЗНАК БЛОКА 1 ВЫБИРАЕТСЯ ИЗ ПОЛЯ, А НЕ ПОДСАЖИВАЕТСЯ В НЕГО. Буквы на поле —
 * это буквы уложенных слов; подмешать к ним «побольше А» значило бы испортить
 * слова, то есть сломать блоки 2 и 3. Поэтому знаки ищутся СРЕДИ уже лежащих
 * букв: берётся та одна или две буквы, чьё суммарное число вхождений ближе всего
 * к числу слов на поле.
 *
 * ⚠️ ЗАЧЕМ РАВНЯТЬ ЧИСЛО ВХОЖДЕНИЙ НА ЧИСЛО СЛОВ. Разность T₂−T₁ обязана мерить
 * добавленное правило, а не разницу в объёме работы. Уравнивается ЧИСЛО ОТВЕТОВ
 * (нажатий в блоке «Знак» примерно столько же, сколько слов в блоке «Слово»), но
 * не работа пальцем: слово ведут по 3–8 клеткам, знак закрывают одним касанием.
 * Этот остаток в разности есть, и он назван, а не спрятан.
 *
 * 🔴 ОТВЛЕКАЮЩИЕ СЛОВА — НЕ УКРАШЕНИЕ, А УСЛОВИЕ СУЩЕСТВОВАНИЯ БЛОКА «СМЫСЛ».
 * Если на поле лежат ОДНИ животные, то «собери животных» = «собери все слова»,
 * то есть блок 3 становится копией блока 2, и разность между ними — шум. Отсюда
 * два требования к раскладке, и оба выполняются ПО ПОСТРОЕНИЮ:
 *   1. слов чужих категорий на поле не меньше, чем целевых;
 *   2. у КАЖДОГО целевого слова есть чужое слово ТОЙ ЖЕ ДЛИНЫ. Иначе длина
 *      змейки становится подсказкой, и человек отбирает цели, не читая их.
 *
 * ⚠️ КАК ЭТО СДЕЛАНО, НЕ ТРОГАЯ ГЕНЕРАТОР ФИЛВОРДОВ. Раскладку (разрез поля на
 * непересекающиеся змейки) целиком делает `generateFillwords` — она уже умеет
 * гарантировать покрытие построением, и переписывать её ради категорий было бы
 * заменой работающего решения на своё. Здесь меняются только СЛОВА в готовых
 * гнёздах: гнёзда группируются по длине, в каждой группе первая половина мест
 * отдаётся целевой категории, вторая — чужим, и буквы переписываются по тем же
 * путям. Пути не меняются вовсе, поэтому разбиение поля остаётся тем же самым —
 * `assertFullCoverage` стоит тут тripwire'ом, а не вежливостью.
 */
import {
  FILLWORDS_MAX_WORD,
  assertFullCoverage,
  createRng,
  generateFillwords,
  normalizeSeed,
  type FillwordsPuzzle,
  type FillwordsRng,
  type PlantedWord,
} from '@/src/games/fillwords/core';
import { categoryWords, isSenseLocale, otherCategoryWords, sensePool, type SensePool } from './vocab';

/** Сложность серии крутится РАЗМЕРОМ поля — не долями проб и не таймером. */
export const PROOF_MIN_SIZE = 5;
export const PROOF_MAX_SIZE = 8;

/** Целевых слов на поле меньше двух — и блок «Смысл» становится одним ответом. */
export const MIN_SENSE_WORDS = 2;
/**
 * Вхождений знака меньше — и блок «Знак» перестаёт быть поиском. Число не
 * выдумано: ровно такой пол держит одиночный режим «Знак» этого же экрана
 * (`minTargets = Math.max(4, клеток / 16)`).
 */
export const MIN_SIGN_CELLS = 4;

/**
 * Сколько раскладок пробуем, прежде чем сдаться. Пересборка нужна редко (обычно
 * первая же годится), но нужна: длины гнёзд выбирает генератор, и изредка они
 * выпадают все разными — тогда парного гнезда под цель просто нет.
 */
const FIELD_ATTEMPTS = 24;

export interface ProofField {
  readonly locale: string;
  /** Сторона квадрата. Она же уровень серии: общий для всех блоков. */
  readonly size: number;
  /** Раскладка. ОДНА на всю серию — переносится между блоками этим же объектом. */
  readonly puzzle: FillwordsPuzzle;
  /** Искомые знаки блока 1 — одна или две буквы, взятые ИЗ букв поля. */
  readonly signs: readonly string[];
  /** Клетки этих знаков. Служат счётчиком «сколько всего», а не судьёй попадания. */
  readonly signCells: readonly number[];
  /** Категория блока 3 — ключ `catVocab_<cat>` общего словаря. */
  readonly category: string;
  /** Индексы слов этой категории в `puzzle.words`. Остальные слова — отвлекающие. */
  readonly senseWords: readonly number[];
}

export function clampProofSize(size: number): number {
  const n = Math.round(Number.isFinite(size) ? size : PROOF_MIN_SIZE);
  return Math.min(PROOF_MAX_SIZE, Math.max(PROOF_MIN_SIZE, n));
}

/** Гнёзда раскладки по длине слова: длина → индексы слов в `puzzle.words`. */
function slotsByLength(puzzle: FillwordsPuzzle): Map<number, number[]> {
  const out = new Map<number, number[]>();
  puzzle.words.forEach((planted, index) => {
    const list = out.get(planted.path.length);
    if (list) list.push(index);
    else out.set(planted.path.length, [index]);
  });
  return out;
}

/**
 * Сколько мест в группе одинаковых длин отдаём цели. Половина вниз: у каждой
 * цели остаётся напарник той же длины, а одиночное гнездо целью не бывает вовсе.
 */
function targetSeats(groupSize: number): number {
  return Math.floor(groupSize / 2);
}

/**
 * Годится ли категория этой раскладке. Считаем ОБЕ стороны: своих слов хватает
 * на места целей, чужих — на все остальные гнёзда. Проверить только цели значило
 * бы упереться в отсутствие отвлекающих уже на середине укладки.
 */
function categoryFits(pool: SensePool, cat: string, slots: Map<number, number[]>): boolean {
  let seats = 0;
  for (const [len, list] of slots) {
    const mine = Math.min(targetSeats(list.length), categoryWords(pool, cat, len).length);
    if (otherCategoryWords(pool, cat, len).length < list.length - mine) return false;
    seats += mine;
  }
  return seats >= MIN_SENSE_WORDS;
}

/**
 * Переписать слова готовой раскладки: цели одной категории + отвлекающие чужих.
 * `null` — эта раскладка не подошла (см. FIELD_ATTEMPTS).
 */
function dressWithCategories(
  base: FillwordsPuzzle,
  pool: SensePool,
  rng: FillwordsRng,
): { puzzle: FillwordsPuzzle; category: string; senseWords: number[] } | null {
  const slots = slotsByLength(base);
  const fit = pool.targets.filter((cat) => categoryFits(pool, cat, slots));
  if (fit.length === 0) return null;
  const category = rng.pick(fit) as string;

  const used = new Set<string>();
  const chosen = new Array<string>(base.words.length).fill('');
  const senseWords: number[] = [];

  for (const len of [...slots.keys()].sort((a, b) => a - b)) {
    // Места внутри группы перемешиваем: иначе цель всегда оказывалась бы первой
    // по порядку чтения, и её можно было бы брать, не читая.
    const group = rng.shuffle([...(slots.get(len) as number[])]);
    const seats = Math.min(targetSeats(group.length), categoryWords(pool, category, len).length);
    group.forEach((slot, i) => {
      const wantTarget = i < seats;
      const bank = (wantTarget ? categoryWords(pool, category, len) : otherCategoryWords(pool, category, len))
        .filter((w) => !used.has(w));
      const word = rng.pick(bank);
      if (!word) return;                       // не набралось — гнездо останется пустым
      used.add(word);
      chosen[slot] = word;
      if (wantTarget) senseWords.push(slot);
    });
  }

  if (chosen.some((w) => !w)) return null;     // пустое гнездо = дыра в поле, поле не выдаём
  if (senseWords.length < MIN_SENSE_WORDS) return null;
  // Отвлекающих должно быть не меньше, чем целей: иначе «чужие» становятся
  // исключением, и категорию видно по тому, что её слов большинство.
  if (base.words.length - senseWords.length < senseWords.length) return null;

  const letters = [...base.letters];
  const words: PlantedWord[] = base.words.map((planted, index) => {
    const word = chosen[index];
    [...word].forEach((ch, i) => { letters[planted.path[i]] = ch; });
    return { word, path: planted.path };
  });
  const puzzle: FillwordsPuzzle = { ...base, letters, words };
  // Пути не трогали, но проверяем: цена ошибки здесь — неразбираемое поле.
  assertFullCoverage(puzzle);
  return { puzzle, category, senseWords: senseWords.sort((a, b) => a - b) };
}

/**
 * ЗНАКИ БЛОКА 1: одна или две буквы поля, дающие вместе примерно столько же
 * ответов, сколько в блоке слов.
 *
 * ⚠️ ДВЕ БУКВЫ — НЕ УСЛОЖНЕНИЕ, А ТА ЖЕ КОРРЕКТУРНАЯ ПРОБА, ЧТО НА ЭТОМ ЭКРАНЕ
 * УЖЕ ЕСТЬ: одиночный режим «Знак» тоже даёт две цели (`generateGrid`). Пара
 * нужна ещё и по счёту: на поле 5×5 самая частая буква встречается три-четыре
 * раза, а слов там семь, и блок из трёх нажатий против блока из семи слов сделал
 * бы разность замером ОБЪЁМА РАБОТЫ, а не правила. Пара подтягивает число
 * ответов к числу слов, и это единственная причина, по которой она здесь.
 *
 * `null`, если и пара не набирает минимума — такое поле не выдаём.
 */
function pickSigns(puzzle: FillwordsPuzzle): { signs: string[]; cells: number[] } | null {
  const counts = new Map<string, number[]>();
  puzzle.letters.forEach((ch, index) => {
    const list = counts.get(ch);
    if (list) list.push(index);
    else counts.set(ch, [index]);
  });
  // Порядок перебора алфавитный: при равном отклонении ответ не должен зависеть
  // от того, в каком порядке буквы попались на поле.
  const alphabet = [...counts.keys()].sort();
  const want = puzzle.words.length;
  let best: { signs: string[]; cells: number[] } | null = null;
  const offer = (signs: string[]): void => {
    const cells = signs.flatMap((s) => counts.get(s) as number[]).sort((a, b) => a - b);
    if (cells.length < MIN_SIGN_CELLS) return;
    if (!best) { best = { signs, cells }; return; }
    const mine = Math.abs(cells.length - want);
    const theirs = Math.abs(best.cells.length - want);
    // При равном отклонении берём МЕНЬШЕ букв: одна цель проще двух, и усложнять
    // задание без выигрыша по числу ответов незачем.
    if (mine < theirs || (mine === theirs && signs.length < best.signs.length)) best = { signs, cells };
  };
  for (const a of alphabet) offer([a]);
  for (let i = 0; i < alphabet.length; i += 1) {
    for (let j = i + 1; j < alphabet.length; j += 1) offer([alphabet[i], alphabet[j]]);
  }
  return best;
}

/**
 * Собрать поле серии. Бросает, если у языка нет ни поля, ни категорий: на экран
 * это состояние не попадает (серия там не предлагается), а молча отдать поле без
 * целевой категории — попадёт, и человек получит блок, который нельзя пройти.
 */
export function buildProofField(locale: string, size: number, seed: number): ProofField {
  if (!isSenseLocale(locale)) throw new Error(`proofreading: нет категорий для языка ${locale}`);
  const n = clampProofSize(size);
  const pool = sensePool(locale);
  const maxWordLen = Math.min(FILLWORDS_MAX_WORD, n);

  for (let attempt = 0; attempt < FIELD_ATTEMPTS; attempt += 1) {
    const attemptSeed = normalizeSeed(seed + attempt * 7919);
    const base = generateFillwords({ rows: n, cols: n, locale, seed: attemptSeed, maxWordLen });
    const dressed = dressWithCategories(base, pool, createRng(attemptSeed + 1));
    if (!dressed) continue;
    const sign = pickSigns(dressed.puzzle);
    if (!sign) continue;
    return {
      locale,
      size: n,
      puzzle: dressed.puzzle,
      signs: sign.signs,
      signCells: sign.cells,
      category: dressed.category,
      senseWords: dressed.senseWords,
    };
  }
  throw new Error(`proofreading: поле серии ${n}×${n} не собралось на языке ${locale}`);
}
