/* psygames-story-keys-typable · VER 1 · 22.08.2026 */
/**
 * КЛЮЧ РАССКАЗА ОБЯЗАН БЫТЬ НАБИРАЕМЫМ — И РОВНО ОДИН РАЗ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В ключах пятого рассказа стояло `'садa'` — три кириллические буквы и
 * ЛАТИНСКАЯ `a` в конце (U+0061). Сравнение идёт по стему из 4–5 букв, то есть по всему
 * слову вместе с чужой буквой; «сада», «садик», «садом» начинаются с кириллической `а` и
 * не совпадут никогда — ни при какой раскладке. Ключ был недостижим физически.
 *
 * Рядом жила вторая беда, обратная по знаку: считали по одному списку, делили на другой.
 *
 *   «миллионов» и «миллиона» → один стем «милли»: одно написанное слово давало ДВА балла;
 *   «9» дважды в одном рассказе → в множество попадал один, а делили на 18 → безупречный
 *   пересказ давал 17 из 18, и в сессию писалась «ошибка».
 *
 * Всего по шестнадцати рассказам: 1 чужая буква, 5 повторов, 1 слипшаяся пара.
 *
 * Гейт проверяет весь набор целиком, а не найденные случаи: новый рассказ с такой же
 * бедой покраснеет здесь до того, как его увидит человек.
 */
import { STORIES, storyKeys, storyStem, countStoryMatches } from '@/app/games/story-recall';

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

interface Story { ru: string; en: string; keywords_ru: string[]; keywords_en: string[] }
const LISTS: Array<[string, string[]]> = [];
(STORIES as Story[]).forEach((s, i) => {
  LISTS.push([`#${i} ru`, s.keywords_ru]);
  LISTS.push([`#${i} en`, s.keywords_en]);
});

describe('ключи рассказов', () => {
  it('есть что проверять', () => {
    expect(STORIES.length).toBeGreaterThan(10);
    expect(LISTS.every(([, l]) => l.length >= 10)).toBe(true);
  });

  it('🔴 ни один ключ не смешивает две письменности', () => {
    const bad: string[] = [];
    for (const [name, list] of LISTS) {
      for (const kw of list) {
        if (CYRILLIC.test(kw) && LATIN.test(kw)) {
          bad.push(`${name}: «${kw}» = ${[...kw].map((ch) => 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * Числитель и знаменатель обязаны брать ОДИН список. Проверяем это поведением:
   * пересказ, где названы все ключи, обязан дать ровно столько, сколько считается всего.
   */
  it('🔴 безупречный пересказ даёт полный балл, а не «почти»', () => {
    for (const [name, list] of LISTS) {
      const keys = storyKeys(list);
      const perfect = keys.join(' ');
      expect(`${name}: ${countStoryMatches(perfect, list)}/${keys.length}`).toBe(`${name}: ${keys.length}/${keys.length}`);
    }
  });

  it('🔴 одно написанное слово не приносит двух баллов', () => {
    for (const [name, list] of LISTS) {
      const keys = storyKeys(list);
      for (const kw of keys) {
        expect(`${name} «${kw}»: ${countStoryMatches(kw, list)}`).toBe(`${name} «${kw}»: 1`);
      }
    }
  });

  it('🔴 у зачётных ключей нет ни одинаковых, ни вложенных стемов', () => {
    const bad: string[] = [];
    for (const [name, list] of LISTS) {
      const stems = storyKeys(list).map(storyStem);
      for (let i = 0; i < stems.length; i++) {
        for (let j = i + 1; j < stems.length; j++) {
          const a = stems[i] as string, b = stems[j] as string;
          if (a === b || a.startsWith(b) || b.startsWith(a)) bad.push(`${name}: «${a}» и «${b}»`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ ВСТРЕЧНО: отсев не должен съедать рассказ. Иначе «полный балл» достигается тем,
   * что считать стало нечего.
   */
  it('🔴 отсев убирает единицы, а не рассказ', () => {
    for (const [name, list] of LISTS) {
      const keys = storyKeys(list);
      expect(`${name}: осталось ${keys.length} из ${list.length}`).toBe(`${name}: осталось ${Math.max(keys.length, list.length - 2)} из ${list.length}`);
      expect(keys.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('🔴 пустой пересказ — ноль, а не «полдела»', () => {
    for (const [name, list] of LISTS) {
      expect(`${name}: ${countStoryMatches('', list)}`).toBe(`${name}: 0`);
      expect(`${name}: ${countStoryMatches('кот пришёл домой zzz', list)} < ${storyKeys(list).length}`)
        .toBe(`${name}: ${Math.min(countStoryMatches('кот пришёл домой zzz', list), storyKeys(list).length - 1)} < ${storyKeys(list).length}`);
    }
  });

  /** Правило одно: экран не считает по своей копии. */
  it('🔴 экран берёт и счёт, и знаменатель из общего правила', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/story-recall.tsx'), 'utf8');
    const body = src.slice(src.indexOf('export default function StoryRecallGame'));
    expect(body).toMatch(/countMatches = \(text: string, keywords: string\[\]\): number => countStoryMatches\(text, keywords\)/);
    expect(body).not.toMatch(/const total = kws\.length/);
    expect(body).not.toMatch(/story\.keywords_ru\.length/);
  });
});

declare const __dirname: string;
declare function require(id: string): any;
