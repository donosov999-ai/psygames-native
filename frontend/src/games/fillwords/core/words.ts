/* psygames-fillwords-words · VER 1 · 22.08.2026 */
/**
 * СЛОВАРНЫЙ СЛОЙ ФИЛВОРДОВ: БЕРЁМ УЖЕ ИМЕЮЩЕЕСЯ, НОВОГО НЕ ЗАВОДИМ.
 *
 * ОТКУДА СЛОВА. Двух источников, оба уже живут в приложении и уже вычитаны:
 *   · `src/constants/translationVocab.ts` — общий корпус (~190 записей на язык),
 *     из него кормятся «Пары слов», «Сортировка слов» и подбор дистракторов;
 *   · `src/constants/anagramWords.json` — банк анаграмм (549 RU / 489 EN слов
 *     длиной 4–9). Он есть только на двух языках, и это НЕ повод их уравнивать
 *     вниз: где банк есть — там поле разнообразнее, и хорошо.
 * Своего словаря филворды не заводят: третий список тех же слов пришлось бы
 * вычитывать заново на двенадцати языках, а расходиться он начал бы с первой
 * же правки соседей.
 *
 * 🔴 ГЛАВНОЕ РЕШЕНИЕ ЭТОГО ФАЙЛА: ЯЗЫК ПОДДЕРЖАН ИЛИ НЕТ — СЧИТАЕТСЯ ПО ДАННЫМ,
 * А НЕ ОБЪЯВЛЕН СПИСКОМ. Список руками протухает молча: словарь пополнили — а
 * язык всё ещё «не поддержан»; словарь выкинули — а режим всё ещё предлагается
 * и выдаёт пустое поле. Здесь наоборот: пул строится из настоящих слов, и язык
 * считается пригодным ровно тогда, когда пул проходит порог ниже. Поэтому
 * `FILLWORDS_LOCALES` — вычисленное значение, а не константа-обещание.
 *
 * ⚠️ ПОЧЕМУ ФИЛЬТР «ОДИН СИМВОЛ — ОДНА КЛЕТКА» ОТСЕКАЕТ ЯЗЫКИ, И ЭТО ЧЕСТНО.
 * Филворды кладут в клетку РОВНО ОДНУ букву. Это условие проходит не всякая
 * письменность:
 *   · деванагари (hi): «पानी» — четыре кодовые точки, но ा и ी это ЗНАКИ ОГЛАСОВКИ
 *     (категория Unicode Mark, не Letter). Разложив их по клеткам, мы показали бы
 *     человеку висящие в воздухе значки — не буквы, а обломки букв;
 *   · китайский (zh): в корпусе почти всё — слова из одного-двух иероглифов,
 *     «слово» из одной клетки филвордом не является вовсе;
 *   · fr/it/ja/ko/ar: слов в корпусе нет ни одного.
 * Ни один из этих языков не отключён вручную — все три случая отсеиваются
 * порогом сами. Отдельная проба в гейте проверяет ИМЕННО ЭТО: что список
 * поддержанных получен фильтром, а не переписан с потолка.
 */
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import ANAGRAM_DICT from '@/src/constants/anagramWords.json';

/** Короче трёх букв слова в поле не кладём: «дом» ещё слово, «до» — уже слог. */
export const FILLWORDS_MIN_WORD = 3;
/** Длиннее восьми не кладём: змея из девяти букв на поле 5×5 съедает треть поля. */
export const FILLWORDS_MAX_WORD = 8;

/** Длины, на которых держится раскладка: любое число клеток ≥ 3 набирается из 3/4/5. */
const CORE_LENGTHS = [3, 4, 5] as const;
/** Порог на опорную длину: меньше — и набор длин упрётся в потолок повторов. */
const MIN_PER_CORE_LENGTH = 8;
/** Порог на весь пул: меньше — и слова начнут повторяться из партии в партию. */
const MIN_POOL = 60;

export interface FillwordsPool {
  locale: string;
  /** Все годные слова ЗАГЛАВНЫМИ, по возрастанию длины и алфавиту (детерминизм). */
  all: string[];
  /** Слова по длине. Ключ — число букв. */
  byLength: Map<number, string[]>;
}

/**
 * Годится ли символ в клетку. Требований два, и оба про «одна клетка — одна буква»:
 * это БУКВА (а не пробел, дефис, цифра или знак огласовки) и её заглавная форма
 * тоже длиной в один символ.
 *
 * ⚠️ Второе условие выглядит придиркой, пока не встретишь немецкое «ß»:
 * `'ß'.toUpperCase()` даёт «SS» — два символа. Поле рисуется заглавными, и такое
 * слово ломало бы соответствие «буква ↔ клетка» прямо на экране: клеток пять,
 * букв шесть. Таких слов в корпусе шесть (Fuß, groß, weiß, Straße, Großmutter,
 * Großvater) — они просто не попадают в пул.
 */
function usableChar(ch: string): boolean {
  if (!/\p{L}/u.test(ch)) return false;
  return [...ch.toUpperCase()].length === 1;
}

/** Слово → форма для поля (заглавные) либо null, если оно не годится. */
export function normalizeWord(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const chars = [...trimmed];
  if (chars.length < FILLWORDS_MIN_WORD || chars.length > FILLWORDS_MAX_WORD) return null;
  for (const ch of chars) if (!usableChar(ch)) return null;
  return chars.map((ch) => ch.toUpperCase()).join('');
}

/** Банк анаграмм: `{ ru: { "4": [{ w, h }] } }`. Ключи языков динамические — отсюда каст. */
const ANAGRAM_BY_LOCALE = ANAGRAM_DICT as unknown as Record<string, Record<string, { w: string }[]> | undefined>;

/**
 * Языки-кандидаты берутся ИЗ САМИХ ДАННЫХ, а не переписываются сюда: ключи
 * записей корпуса плюс языки банка анаграмм. Появится в корпусе новый язык —
 * он попадёт в кандидаты сам, и дальше решит порог.
 *
 * ⚠️ `cat` — не язык, а семантическая категория записи (поле корпуса). Не
 * отсеяв его, мы бы завели язык «cat» с одним словом.
 */
function candidateLocales(): string[] {
  const out = new Set<string>();
  for (const entry of TRANSLATION_VOCAB) {
    for (const key of Object.keys(entry)) if (key !== 'cat') out.add(key);
  }
  for (const key of Object.keys(ANAGRAM_BY_LOCALE)) if (key !== 'themes') out.add(key);
  return [...out].sort();
}

const POOL_CACHE = new Map<string, FillwordsPool>();

/**
 * Пул слов языка. Считается один раз на язык: перебор корпуса на каждую
 * раскладку — это 190 регулярок на клик, а поле пересобирается на каждом уровне.
 */
export function wordPool(locale: string): FillwordsPool {
  const cached = POOL_CACHE.get(locale);
  if (cached) return cached;

  const seen = new Set<string>();
  for (const entry of TRANSLATION_VOCAB) {
    const w = entry[locale];
    if (!w) continue;
    const norm = normalizeWord(w);
    if (norm) seen.add(norm);
  }
  const extra = ANAGRAM_BY_LOCALE[locale];
  if (extra) {
    for (const bucket of Object.values(extra)) {
      for (const item of bucket || []) {
        const norm = normalizeWord(item?.w || '');
        if (norm) seen.add(norm);
      }
    }
  }

  const all = [...seen].sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
  const byLength = new Map<number, string[]>();
  for (const w of all) {
    const list = byLength.get(w.length);
    if (list) list.push(w);
    else byLength.set(w.length, [w]);
  }
  const pool: FillwordsPool = { locale, all, byLength };
  POOL_CACHE.set(locale, pool);
  return pool;
}

/** Сколько РАЗНЫХ слов такой длины есть у языка (потолок для набора длин). */
export function wordsOfLength(pool: FillwordsPool, len: number): string[] {
  return pool.byLength.get(len) || [];
}

/**
 * Хватает ли языку слов на филворды. Два условия, и оба про игру, а не про
 * красоту числа:
 *   · весь пул ≥ MIN_POOL — иначе одни и те же слова из партии в партию;
 *   · на каждой опорной длине (3/4/5) ≥ MIN_PER_CORE_LENGTH — именно ими
 *     добирается остаток поля, и если их мало, набор длин упирается в потолок
 *     повторов и раскладка не собирается вовсе.
 */
export function isFillwordsLocale(locale: string): boolean {
  const pool = wordPool(locale);
  if (pool.all.length < MIN_POOL) return false;
  return CORE_LENGTHS.every((len) => wordsOfLength(pool, len).length >= MIN_PER_CORE_LENGTH);
}

/**
 * Языки, на которых режим предлагается. ВЫЧИСЛЕНО, не объявлено — см. шапку.
 * Порядок алфавитный: список показывается человеку там, где режима нет.
 */
export const FILLWORDS_LOCALES: string[] = candidateLocales().filter(isFillwordsLocale);
