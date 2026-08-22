/* psygames-fillwords-i18n-gate · VER 1 · 22.08.2026 */
/**
 * ПОДПИСИ ФИЛВОРДОВ ЗНАЮТ ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ — И НИ ОДНОЙ МЁРТВОЙ СТРОКИ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Общий `dictionary-duplicates` стережёт словарь
 * приложения, а строки этого режима живут в СВОЁМ словаре модуля (почему —
 * написано в шапке `src/games/fillwords/core/i18n.ts`). Для общего гейта их
 * попросту нет: сравнивать нечего, он зелен. Ровно так уже случилось с пятью
 * лабораторными играми — их модульные словари знали два языка из двенадцати, и
 * человек с японским интерфейсом читал «Undo» посреди своего экрана. Поймать
 * это можно было только глазами носителя.
 *
 * ⚠️ ПРОВЕРЯЕТСЯ ВОЗВРАЩЁННЫЙ ОБЪЕКТ, А НЕ ИСХОДНИК. Полнота языков и ключей
 * снимается с того, что реально отдаёт `getFillwordsStrings(locale)`. Разбор
 * файла глазами регулярки засчитал бы за перевод русский комментарий рядом.
 *
 * ⚠️ И ОБРАТНАЯ СТОРОНА: КЛЮЧ, КОТОРЫЙ НИГДЕ НЕ ВЫВОДИТСЯ. Строка, переведённая
 * на двенадцать языков и не показанная ни разу, — это не запас, а ложное
 * «переведено»: в SET так умер бейдж отсчёта, написанный, переведённый и
 * покрытый гейтом. Поэтому каждый ключ обязан вызываться в коде — в модуле или
 * на экране игры, с вырезанными комментариями.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

import {
  FILLWORDS_UI_LOCALES,
  getFillwordsStrings,
  interpolate,
} from '@/src/games/fillwords/core';

const ROOT = join(__dirname, '../..');
const MODULE_DIR = join(ROOT, 'src/games/fillwords');
const SCREEN = join(ROOT, 'app/games/proofreading.tsx');

/** Комментарии убираем, строковые литералы сохраняем: в них живут обращения. */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); out += ' '; i = e < 0 ? s.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); out += ' '; i = e < 0 ? s.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === c) break; j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Весь код режима: модуль (кроме самого словаря) плюс экран-владелец. */
function modeCode(): string {
  let code = '';
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }) as any[]) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name) && !p.endsWith(join('core', 'i18n.ts'))) code += stripComments(readFileSync(p, 'utf8') as string);
    }
  };
  walk(MODULE_DIR);
  code += stripComments(readFileSync(SCREEN, 'utf8') as string);
  return code;
}

/** Обращения к словарю: `fwStrings.task`, `getFillwordsStrings(l).rules`. */
function usedKeys(code: string): Set<string> {
  const used = new Set<string>();
  for (const m of code.matchAll(/\b\w*[Ss]trings\.(\w+)\b/g)) used.add(m[1]);
  for (const m of code.matchAll(/Strings\([^)]*\)\.(\w+)/g)) used.add(m[1]);
  return used;
}

/** Языки приложения — из самого LanguageContext, а не переписаны сюда. */
const APP_LOCALES: string[] = (() => {
  const dict = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
  const decl = /type Language =([^;]+);/.exec(dict) as RegExpExecArray;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: RegExpMatchArray) => m[1]).sort();
})();

/** Подстановки строки: `{rows}` и прочие. Их набор обязан пережить перевод. */
const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/**
 * СОВПАДЕНИЕ С АНГЛИЙСКИМ РАЗРЕШЕНО ПОИМЁННО. Пусто — и хорошо: значит, ни одна
 * строка не осталась английской заглушкой. Запись сюда означает «слово в этом
 * языке и правда такое же», а не «перевод не доделан».
 */
const SAME_AS_EN: Record<string, string> = {};

describe('филворды: подписи знают все двенадцать языков', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(APP_LOCALES.length).toBe(12);
    expect(Object.keys(getFillwordsStrings('ru')).length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 языки словаря режима и языки приложения — один список', () => {
    expect([...FILLWORDS_UI_LOCALES].sort()).toEqual(APP_LOCALES);
  });

  it('🔴 в каждом языке те же ключи, и ни одна строка не пустая', () => {
    const ruKeys = Object.keys(getFillwordsStrings('ru')).sort();
    const holes: string[] = [];
    for (const locale of APP_LOCALES) {
      const strings = getFillwordsStrings(locale) as unknown as Record<string, string>;
      const keys = Object.keys(strings).sort();
      for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
      for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
      for (const [k, v] of Object.entries(strings)) {
        if (typeof v !== 'string' || v.trim().length === 0) holes.push(`${locale}.${k}: пусто`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 ни одна строка не осталась английской копией', () => {
    const en = getFillwordsStrings('en') as unknown as Record<string, string>;
    const stub: string[] = [];
    for (const locale of APP_LOCALES) {
      if (locale === 'en') continue;
      const strings = getFillwordsStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(strings)) {
        if (v === en[k] && !SAME_AS_EN[`${locale}.${k}`]) stub.push(`${locale}.${k}: «${v}» — как по-английски`);
      }
    }
    expect(stub).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      const strings = getFillwordsStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(strings)) {
        const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(v))) bad.push(`${locale}.${k}: «${v}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ПОДСТАНОВКА, ПОТЕРЯННАЯ ПРИ ПЕРЕВОДЕ, — ЭТО ПРОПАВШЕЕ ЧИСЛО НА ЭКРАНЕ.
   * Потеряй `{sec}` в корейской строке — кореец увидит параметры уровня без
   * лимита времени и не поймёт, почему партия оборвалась.
   */
  it('🔴 набор подстановок одинаков во всех языках', () => {
    const ru = getFillwordsStrings('ru') as unknown as Record<string, string>;
    const bad: string[] = [];
    for (const locale of APP_LOCALES) {
      const strings = getFillwordsStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(strings)) {
        const mine = slots(v).join(',');
        const theirs = slots(ru[k]).join(',');
        if (mine !== theirs) bad.push(`${locale}.${k}: подстановки «${mine}» вместо «${theirs}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 каждый ключ словаря режима выводится на экран', () => {
    const used = usedKeys(modeCode());
    const dead = Object.keys(getFillwordsStrings('ru')).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  /**
   * ⚠️ САМОПРОВЕРКА. Проба выше стоит ровно столько, сколько стоит её умение
   * УВИДЕТЬ вызов: сломай регулярку — и «мёртвых ключей нет» станет «ключей не
   * нашлось вовсе», то есть зелёным по недоразумению.
   */
  it('гейт отличает вызов от упоминания в комментарии', () => {
    expect([...usedKeys('const a = fwStrings.rules;')]).toContain('rules');
    expect([...usedKeys('getFillwordsStrings(language).task')]).toContain('task');
    expect([...usedKeys(stripComments('/* fwStrings.rules живёт тут */\n// fwStrings.task\n'))]).toEqual([]);
    expect(usedKeys(modeCode()).size).toBeGreaterThanOrEqual(6);
  });

  it('🔴 экран отдаёт словарю ПОЛНЫЙ язык, а не пару ru/en', () => {
    const screen = stripComments(readFileSync(SCREEN, 'utf8') as string);
    expect(screen).toContain('getFillwordsStrings(language)');
    expect(/language\s*===\s*'ru'\s*\?\s*'ru'\s*:\s*'en'/.test(screen)).toBe(false);
  });

  it('подстановка значений работает и не съедает незнакомое имя', () => {
    expect(interpolate('{a}+{b}', { a: 1, b: 2 })).toBe('1+2');
    expect(interpolate('{a}+{b}', { a: 1 })).toBe('1+{b}');
  });
});
