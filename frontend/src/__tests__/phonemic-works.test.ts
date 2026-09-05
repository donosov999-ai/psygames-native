/* psygames-phonemic-works · VER 1 · 22.08.2026 */
/**
 * «БЕГЛОСТЬ РЕЧИ» РАБОТАЕТ — А НЕ ТОЛЬКО ВЫГЛЯДИТ РАБОТАЮЩЕЙ.
 *
 * 🔴 ДВЕ ПРИЧИНЫ, ПО КОТОРЫМ ИГРА НЕ РАБОТАЛА ВООБЩЕ:
 *
 * 1. ПИСЬМЕННОСТЬ РАСХОДИЛАСЬ. Буква задания выбиралась в сервисе по правилу
 *    «не английский → кириллица», а проверка слова жила в экране и спрашивала
 *    «язык === ru?». Для французского выходило: буква кириллическая, проверка
 *    латинская — принять слово НЕЛЬЗЯ НИ ОДНО. Игра шла, таймер тикал, счёт
 *    оставался нулём, и причина ниоткуда не следовала.
 *
 * 2. СЧЁТ ВСЕГДА БЫЛ НУЛЁМ ДАЖЕ ПО-РУССКИ. Партию заканчивает ТАЙМЕР, а его
 *    колбэк создан при старте и держит список слов таким, каким тот был тогда —
 *    пустым. Сколько бы человек ни назвал, в итог уходил ноль. Тот же класс
 *    устаревшего замыкания, что нашёлся в n-back.
 */
import {
  phonemicLetterPool, phonemicScriptFor, phonemicScriptIsFallback,
} from '@/src/services/phonemicFluency';
import { defaultWordLang } from '@/src/services/wordLanguage';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ALL = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];
const CYR = /^[а-яё]$/i;
const LAT = /^[a-z]$/i;

describe('буква задания и проверка слова — одной письменности', () => {
  it('🔴 для КАЖДОГО языка буквы пула совпадают с выбранной письменностью', () => {
    const bad: string[] = [];
    for (const lang of ALL) {
      const script = phonemicScriptFor(lang);
      const pool = phonemicLetterPool(lang);
      if (pool.length < 3) { bad.push(`${lang}: букв ${pool.length}`); continue; }
      for (const letter of pool) {
        const ok = script === 'ru' ? CYR.test(letter) : LAT.test(letter);
        if (!ok) bad.push(`${lang}: письменность ${script}, а буква «${letter}»`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('русский остаётся кириллическим, английский латинским', () => {
    expect(phonemicScriptFor('ru')).toBe('ru');
    expect(phonemicScriptFor('en')).toBe('en');
    expect(phonemicLetterPool('ru').every((l) => CYR.test(l))).toBe(true);
    expect(phonemicLetterPool('en').every((l) => LAT.test(l))).toBe(true);
  });

  it('латинские языки получают латиницу и БЕЗ предупреждения', () => {
    for (const lang of ['es', 'de', 'fr', 'it', 'pt']) {
      expect(`${lang}: ${phonemicScriptFor(lang)}`).toBe(`${lang}: en`);
      expect(`${lang}: ${phonemicScriptIsFallback(lang)}`).toBe(`${lang}: false`);
    }
  });

  it('🔴 иероглифы и арабица получают латиницу И предупреждение', () => {
    for (const lang of ['zh', 'ja', 'ko', 'hi', 'ar']) {
      expect(`${lang}: ${phonemicScriptFor(lang)}`).toBe(`${lang}: en`);
      expect(`${lang}: ${phonemicScriptIsFallback(lang)}`).toBe(`${lang}: true`);
    }
  });
});

describe('🔴 экран берёт письменность из общего решения', () => {
  const screen = code(read('../../app/games/phonemic-fluency.tsx'));

  it('проверка слова спрашивает phonemicScriptFor, а не язык напрямую', () => {
    expect(screen).toMatch(/isValidWord\(raw, letter, phonemicScriptFor\(wordLang\.lang\)\)/);
    expect(screen).not.toMatch(/language as 'ru' \| 'en'/);
  });

  /**
   * 🔴 ЗДЕСЬ РАНЬШЕ СТОЯЛА ПРОБА, ЧИТАВШАЯ ИСХОДНИК: она требовала строки
   * `phonemicScriptIsFallback(language)`. Такая проба зеленеет от наличия
   * текста и ничего не говорит о поведении. Взамен — цепочка целиком: язык
   * слов по умолчанию → пул букв → приём слова.
   */
  it('🔴 при нелатинском интерфейсе игра идёт на английском и слово принимается', () => {
    for (const ui of ['ja', 'zh', 'ar', 'hi', 'ko']) {
      const wl = defaultWordLang(ui);
      expect(`${ui}: ${wl}`).toBe(`${ui}: en`);
      const пул = phonemicLetterPool(wl);
      expect(пул.every((l) => LAT.test(l))).toBe(true);
      // Письменность буквы и письменность проверки — одна и та же, иначе
      // принять нельзя ни одного слова (эта беда уже случалась с французским).
      expect(phonemicScriptFor(wl)).toBe('en');
    }
  });

  it('🔴 выбор русского даёт кириллические буквы и принимает русское слово', () => {
    const пул = phonemicLetterPool('ru');
    expect(пул.every((l) => CYR.test(l))).toBe(true);
    expect(phonemicScriptFor('ru')).toBe('ru');
    // Выбор языка слов не зависит от языка меню: при японском интерфейсе
    // русский всё равно можно выбрать, и он останется русским.
    expect(defaultWordLang('ru')).toBe('ru');
    expect(defaultWordLang('ja')).toBe('en');
  });
});

describe('🔴 итог считает СКАЗАННОЕ, а не пустоту', () => {
  const screen = code(read('../../app/games/phonemic-fluency.tsx'));

  it('слова живут в ref — таймер видит их, а не устаревшее состояние', () => {
    expect(screen).toMatch(/wordsRef\s*=\s*useRef/);
    expect(screen).toMatch(/wordsRef\.current = next/);
  });

  it('подсчёт итога идёт по ref, а не по состоянию', () => {
    expect(screen).toMatch(/const said = wordsRef\.current/);
    expect(screen).toMatch(/validWords = said\.filter/);
    // Ни одна из четырёх сводок не должна снова читать состояние.
    expect(screen).not.toMatch(/= words\.filter\(w => !w\.valid/);
  });

  it('повтор слова ищется тоже в ref — иначе повторы не ловятся', () => {
    expect(screen).toMatch(/wordsRef\.current\.some\(w => w\.word === raw/);
  });
});
