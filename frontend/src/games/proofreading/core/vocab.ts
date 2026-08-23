/* psygames-proofreading-sense-vocab · VER 1 · 23.08.2026 */
/**
 * СЕМАНТИЧЕСКИЕ КАТЕГОРИИ БЛОКА «СМЫСЛ» — ИЗ ТЕХ ЖЕ ДАННЫХ, ЧТО УЖЕ ЛЕЖАТ.
 *
 * ОТКУДА КАТЕГОРИИ. Двух источников, оба уже в приложении и оба уже вычитаны:
 *   · `src/constants/translationVocab.ts` — поле `cat` у каждой записи корпуса.
 *     Им уже пользуются «Сортировка слов» и подбор дистракторов Cloze;
 *   · `src/constants/anagramWords.json` — поле `t` (тема) у слов банка анаграмм.
 * Третьего словаря здесь не заводится: он разошёлся бы с этими двумя в первую же
 * правку, а вычитывать его пришлось бы заново на двенадцати языках.
 *
 * 🔴 КАТЕГОРИЯ ГОДИТСЯ В ЦЕЛЬ, ТОЛЬКО ЕСЛИ ЕЁ МОЖНО НАЗВАТЬ ЧЕЛОВЕКУ. Задание
 * блока звучит «собери только животных» — значит слово «животные» обязано быть
 * переведено. Имена категорий живут в общем словаре ключами `catVocab_<cat>`, и
 * заведены они ровно под значения `cat` корпуса (об этом сказано в шапке самого
 * корпуса). Поэтому список НАЗЫВАЕМЫХ категорий берётся из корпуса, а не пишется
 * руками — и `transport` (он есть только темой банка анаграмм, имени в словаре у
 * него нет) в цели не попадает сам, без отдельного запрета. В ОТВЛЕКАЮЩИЕ его
 * слова годятся: имя отвлекающей категории человеку не показывают никогда.
 *
 * 🔴 ЯЗЫК ПОДДЕРЖАН ИЛИ НЕТ — СЧИТАЕТСЯ ПО ДАННЫМ, ТЕМ ЖЕ ПРИЁМОМ, ЧТО В
 * `fillwords/core/words.ts`. Список руками протухает молча в обе стороны: словарь
 * пополнили — язык всё ещё «не поддержан»; словарь выкинули — режим всё ещё
 * предлагается и выдаёт поле без единого животного. Поэтому `PROOF_SENSE_LOCALES`
 * — ВЫЧИСЛЕННОЕ значение: язык годится, когда у него есть поле филвордов И
 * НЕСКОЛЬКО категорий с запасом слов (одной мало — не из чего делать отвлекающие).
 *
 * ⚠️ СЛОВО С ДВУМЯ КАТЕГОРИЯМИ ВЫБРАСЫВАЕТСЯ ЦЕЛИКОМ. Если одно и то же слово
 * числится и едой, и животным, то на поле оно окажется одновременно целью и
 * отвлекающим — и любой ответ человека будет одновременно верным и неверным.
 * Лучше потерять слово, чем сделать задание неразрешимым.
 */
import ANAGRAM_DICT from '@/src/constants/anagramWords.json';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { FILLWORDS_LOCALES, isFillwordsLocale, normalizeWord } from '@/src/games/fillwords/core';

/** Слов в категории меньше — и она повторится сама с собой уже на втором поле. */
export const MIN_CATEGORY_WORDS = 6;
/** Длин в категории меньше — и её слова не встанут в разные гнёзда раскладки. */
export const MIN_CATEGORY_LENGTHS = 2;
/**
 * Категорий в языке меньше — и «смысл» вырождается в «слово»: нечем набрать
 * отвлекающие. Три — это цель плюс минимум две чужие категории на поле.
 */
export const MIN_SENSE_CATEGORIES = 3;

/** Банк анаграмм: `{ ru: { "4": [{ w, h, t }] } }`, где `t` — тема слова. */
const ANAGRAM_BY_LOCALE = ANAGRAM_DICT as unknown as
  Record<string, Record<string, { w: string; t?: string }[]> | undefined>;

/**
 * Категории, у которых ЕСТЬ имя в словаре приложения. Считаются из корпуса, а не
 * переписываются сюда: появится в корпусе новая `cat` с переводом — она попадёт
 * в цели сама.
 */
export function namedCategories(): string[] {
  const out = new Set<string>();
  for (const entry of TRANSLATION_VOCAB) if (entry.cat) out.add(entry.cat);
  return [...out].sort();
}

export interface SensePool {
  locale: string;
  /** Слово ЗАГЛАВНЫМИ → его категория. Только однозначно отнесённые слова. */
  catOf: Map<string, string>;
  /** Категория → длина слова → слова (по алфавиту, ради детерминизма поля). */
  byCategory: Map<string, Map<number, string[]>>;
  /** Категории, годные В ЦЕЛЬ: имя есть и слов хватает. Алфавитный порядок. */
  targets: string[];
}

const POOL_CACHE = new Map<string, SensePool>();

/** Слово → все категории, в которых оно встретилось (для отсева двусмысленных). */
function rawCategories(locale: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (raw: string | undefined, cat: string | undefined): void => {
    if (!raw || !cat) return;
    const word = normalizeWord(raw);
    if (!word) return;
    const set = out.get(word);
    if (set) set.add(cat);
    else out.set(word, new Set([cat]));
  };
  for (const entry of TRANSLATION_VOCAB) add(entry[locale], entry.cat);
  const bank = ANAGRAM_BY_LOCALE[locale];
  if (bank) for (const bucket of Object.values(bank)) for (const item of bucket || []) add(item?.w, item?.t);
  return out;
}

/** Категорийный пул языка. Считается один раз: перебор корпуса — не на каждый кадр. */
export function sensePool(locale: string): SensePool {
  const cached = POOL_CACHE.get(locale);
  if (cached) return cached;

  const catOf = new Map<string, string>();
  for (const [word, cats] of rawCategories(locale)) {
    if (cats.size !== 1) continue;                 // двусмысленное слово — мимо
    catOf.set(word, [...cats][0]);
  }

  const byCategory = new Map<string, Map<number, string[]>>();
  for (const word of [...catOf.keys()].sort()) {
    const cat = catOf.get(word) as string;
    const lengths = byCategory.get(cat) || new Map<number, string[]>();
    const list = lengths.get(word.length) || [];
    list.push(word);
    lengths.set(word.length, list);
    byCategory.set(cat, lengths);
  }

  const named = new Set(namedCategories());
  const targets = [...byCategory.keys()].filter((cat) => named.has(cat) && isRichCategory(byCategory.get(cat))).sort();

  const pool: SensePool = { locale, catOf, byCategory, targets };
  POOL_CACHE.set(locale, pool);
  return pool;
}

/** Хватает ли категории слов и длин, чтобы вставать в разные гнёзда раскладки. */
function isRichCategory(lengths: Map<number, string[]> | undefined): boolean {
  if (!lengths) return false;
  let words = 0;
  let spread = 0;
  for (const list of lengths.values()) {
    words += list.length;
    if (list.length > 0) spread += 1;
  }
  return words >= MIN_CATEGORY_WORDS && spread >= MIN_CATEGORY_LENGTHS;
}

/** Слова категории заданной длины. Пустой список — законный ответ. */
export function categoryWords(pool: SensePool, cat: string, len: number): string[] {
  return pool.byCategory.get(cat)?.get(len) || [];
}

/** Слова ЧУЖИХ категорий заданной длины — материал отвлекающих. */
export function otherCategoryWords(pool: SensePool, cat: string, len: number): string[] {
  const out: string[] = [];
  for (const [key, lengths] of pool.byCategory) {
    if (key === cat) continue;
    for (const word of lengths.get(len) || []) out.push(word);
  }
  return out.sort();
}

/**
 * Годится ли язык для блока «Смысл». Два условия, и оба про игру:
 *   · есть поле филвордов — без него блокам «Слово» и «Смысл» не на чем идти;
 *   · есть НЕСКОЛЬКО категорий с запасом — иначе отвлекающие брать неоткуда, и
 *     «найди животных» превращается в «найди хоть что-нибудь».
 */
export function isSenseLocale(locale: string): boolean {
  if (!isFillwordsLocale(locale)) return false;
  return sensePool(locale).targets.length >= MIN_SENSE_CATEGORIES;
}

/**
 * Языки, на которых серия предлагается. ВЫЧИСЛЕНО, не объявлено — см. шапку.
 * Основание — уже вычисленный список филвордов: поле у серии их, значит язык без
 * филвордов не может быть языком серии ни при каких категориях.
 */
export const PROOF_SENSE_LOCALES: string[] = FILLWORDS_LOCALES.filter(isSenseLocale);
