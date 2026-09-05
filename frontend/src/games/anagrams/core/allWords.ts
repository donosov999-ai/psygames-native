/* psygames-anagrams-all-words · VER 1 · 06.09.2026 */
/**
 * 🔴 РЕЖИМ «НАЙДИ ВСЕ СЛОВА»: ОДИН НАБОР БУКВ — ВСЕ СЛОВА, КОТОРЫЕ ИЗ НЕГО ВЫХОДЯТ.
 *
 * 📍 ВОПРОС ДЕНИСА 06.09.2026 со скриншотами «Моря слов» (10 млн скачиваний) и
 * Zen Word (50 млн): «это на механику какой игры похоже что у нас есть? куда
 * режимом можем сделать?». Ответ: это наши анаграммы по содержанию (все слова из
 * одного набора букв) и наши филворды по жесту (ведение линии). Отличие одно: у
 * нас за круг ОДНО загаданное слово, а там надо найти ВСЕ, и длины показаны
 * пустыми клетками.
 *
 * ⚠️ РЕЖИМ УПИРАЛСЯ НЕ В КОД, А В ДАННЫЕ. Весь словарь проекта — 628 русских
 * слов и 543 английских, и база из семи букв давала МЕДИАНУ ОДНО подслово: на
 * экране была бы полторы клетки вместо двадцати. Наборы собраны отдельно, из
 * источников со свободной лицензией, проверенной файлом; замеры и лицензии — в
 * `WORDLIST_RESEARCH.md`, сборка — в `wordlist-build/`.
 */
import RU from '@/src/constants/allWordsRu.json';
import EN from '@/src/constants/allWordsEn.json';

export interface AllWordsPack {
  /** База: 7–8 букв, из них складываются все цели. */
  base: string;
  /** Цели, отсортированы. Их 6–14: больше на экран не помещается. */
  words: string[];
}

const НАБОРЫ: Record<string, AllWordsPack[]> = {
  ru: RU as AllWordsPack[],
  en: EN as AllWordsPack[],
};

export function allWordsLocales(): string[] {
  return Object.keys(НАБОРЫ).sort();
}

export function allWordsCount(locale: string): number {
  return (НАБОРЫ[locale] ?? НАБОРЫ.en ?? []).length;
}

/**
 * Раскладка уровня. Детерминированно от уровня: уровень N всегда даёт одну и ту
 * же раскладку, а набор проходится по кругу.
 */
export function allWordsPack(locale: string, level: number): AllWordsPack | null {
  const набор = НАБОРЫ[locale] ?? НАБОРЫ.en ?? [];
  if (набор.length === 0) return null;
  const i = (Math.max(1, Math.floor(level)) - 1) % набор.length;
  return набор[i] ?? null;
}

/**
 * Буквы банка — это ПЛИТКИ базы, перемешанные детерминированно от уровня.
 *
 * ⚠️ Порядок перемешивается, а состав нет: банк обязан быть ровно буквами базы,
 * иначе слово из целей окажется несобираемым. Тот же урок, что в «Слове-квадрате»,
 * где САЛАТ не набирался при одной плитке «А».
 */
export function allWordsLetters(pack: AllWordsPack, seed: number): string[] {
  const буквы = [...pack.base];
  let s = (Math.floor(seed) || 1) >>> 0;
  const дальше = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = буквы.length - 1; i > 0; i--) {
    const j = Math.floor(дальше() * (i + 1));
    [буквы[i], буквы[j]] = [буквы[j]!, буквы[i]!];
  }
  return буквы;
}

/** Собирается ли слово из плиток банка, беря каждую не больше раза. */
export function собираетсяИзПлиток(слово: string, плитки: readonly string[]): boolean {
  const остаток = [...плитки];
  for (const ch of слово) {
    const i = остаток.indexOf(ch);
    if (i < 0) return false;
    остаток.splice(i, 1);
  }
  return true;
}

export type ИсходСлова = 'цель' | 'повтор' | 'мимо';

/** Что случилось со сданным словом. Найденные передаются, а не хранятся тут. */
export function сдатьСлово(pack: AllWordsPack, слово: string, найдены: readonly string[]): ИсходСлова {
  const w = слово.toLowerCase();
  if (найдены.indexOf(w) >= 0) return 'повтор';
  return pack.words.indexOf(w) >= 0 ? 'цель' : 'мимо';
}

export function всёНайдено(pack: AllWordsPack, найдены: readonly string[]): boolean {
  return pack.words.every((w) => найдены.indexOf(w) >= 0);
}

/**
 * Подсказка: самое КОРОТКОЕ ненайденное слово, и открывается у него первая буква.
 * Короткое, потому что подсказка обязана сдвинуть с мёртвой точки, а не решить
 * уровень; урок филвордов того же дня — подсказка, не окупающая свою цену,
 * читается как «не работает».
 */
export function подсказкаAllWords(pack: AllWordsPack, найдены: readonly string[]): { слово: string; открыто: number } | null {
  const осталось = pack.words.filter((w) => найдены.indexOf(w) < 0);
  if (осталось.length === 0) return null;
  const слово = осталось.reduce((a, b) => (b.length < a.length ? b : a));
  return { слово, открыто: 1 };
}

/** «Есть что терять»: хоть одно слово найдено. */
export function allWordsНачат(найдены: readonly string[]): boolean {
  return найдены.length > 0;
}
