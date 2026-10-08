/* psygames-lexical-decision-norm-test · VER 1 · 02.10.2026 */
/**
 * «ПО НОРМЕ?» — ДАННЫЕ И СБОРКА ПАРТИИ (задача d0ad03d9).
 * Данные: `src/constants/nonstandardForms.ts`, сборка: `src/games/lexical-decision/norm.ts`.
 */
import { NONSTANDARD_FORMS, NONSTANDARD_LANGS, nonstandardSourceUrl } from '@/src/constants/nonstandardForms';
import { buildNormTrials, normTiers, normPool } from '@/src/games/lexical-decision/norm';
import { levelParams } from '@/app/games/lexical-decision';

const RU_VOWELS = 'аеёиоуыэюя';

describe('данные ненормативных форм', () => {
  it('🔴 английский и русский есть, английский — первым', () => {
    expect(NONSTANDARD_LANGS.slice(0, 2)).toEqual(['en', 'ru']);
  });

  it('у каждой пары форма ≠ норма, есть источник и пометка', () => {
    const bad: string[] = [];
    for (const lang of NONSTANDARD_LANGS) {
      for (const x of NONSTANDARD_FORMS[lang]!) {
        if (x.form === x.norm) bad.push(`${lang}:${x.form} = норма`);
        if (!x.label.trim()) bad.push(`${lang}:${x.form} без пометки`);
        if (!/^https:\/\//.test(nonstandardSourceUrl(lang, x))) bad.push(`${lang}:${x.form} без адреса`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 ни один текст не бывает и нормой, и не нормой — иначе ответ спорный', () => {
    const clash: string[] = [];
    for (const lang of NONSTANDARD_LANGS) {
      // Точное сравнение: у ударения «тОрты» и «тортЫ» различаются только прописной буквой.
      const forms = new Set(NONSTANDARD_FORMS[lang]!.map((x) => x.form));
      for (const x of NONSTANDARD_FORMS[lang]!) if (forms.has(x.norm)) clash.push(`${lang}:${x.norm}`);
    }
    expect(clash).toEqual([]);
  });

  it('ударение: одна прописная гласная, буквы формы и нормы совпадают', () => {
    const bad: string[] = [];
    for (const x of NONSTANDARD_FORMS.ru!.filter((y) => y.rule === 'stress')) {
      for (const s of [x.form, x.norm]) {
        const caps = [...s].filter((c) => RU_VOWELS.includes(c.toLowerCase()) && c !== c.toLowerCase());
        if (caps.length !== 1) bad.push(`${s}: прописных гласных ${caps.length}`);
      }
      const plain = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
      if (plain(x.form) !== plain(x.norm)) bad.push(`${x.form} ≠ ${x.norm} по буквам`);
    }
    expect(bad).toEqual([]);
  });
});

describe('сборка партии «По норме?»', () => {
  it('🔴 половина — ненормативные формы, половина — нормы; тексты не повторяются', () => {
    for (const lang of NONSTANDARD_LANGS) {
      for (const level of [1, 7, 12, 25]) {
        const { trials: count } = levelParams(level);
        const t = buildNormTrials({ target: lang, level, count });
        expect(`${lang} ур.${level}: ${t.length}`).toBe(`${lang} ур.${level}: ${count}`);
        expect(t.filter((x) => !x.isNorm)).toHaveLength(Math.floor(count / 2));
        expect(new Set(t.map((x) => x.text)).size).toBe(count);
        for (const x of t) {
          expect(x.text).toBe(x.isNorm ? x.item.norm : x.item.form);
          expect(normTiers(level)).toContain(x.item.tier);
        }
      }
    }
  });

  it('ступени сдвигаются: на первом уровне грубые, после десятого — ударение и спутанные пары', () => {
    expect(normTiers(1)).toEqual([1]);
    expect(normTiers(8)).toEqual([1, 2]);
    expect(normTiers(40)).toEqual([2, 3]);
    expect(normPool('ru', [3]).every((x) => x.rule === 'stress')).toBe(true);
    expect(normPool('en', [3]).every((x) => x.rule === 'confused')).toBe(true);
  });

  it('🔴 «ихний» и «irregardless» доходят до партии первого уровня', () => {
    const seen = (lang: string, text: string) => Array.from({ length: 40 }, () =>
      buildNormTrials({ target: lang, level: 1, count: 14 })).some((t) => t.some((x) => x.text === text && !x.isNorm));
    expect(seen('ru', 'ихний')).toBe(true);
    expect(seen('en', 'irregardless')).toBe(true);
  });

  it('язык без данных — пустая партия, а не чужие формы', () => {
    expect(buildNormTrials({ target: 'de', level: 1, count: 14 })).toEqual([]);
  });
});

declare const __dirname: string;
declare function require(m: string): { readFileSync: (p: string, e: string) => string; join: (...a: string[]) => string };
const fs = require('fs');
const path = require('path');
describe('экран веба: режим «По норме?» подключён', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../app/games/lexical-decision.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  it('🔴 партия «По норме?» собирается из данных, своя лестница, разбор на ошибке', () => {
    expect(src).toMatch(/norm\s*\?\s*buildNormTrials\(/);
    expect(src).toMatch(/usePersistentLevel\('lexical_decision_norm'\)/);
    expect(src).toMatch(/nsRule_\$\{trial\.ns\.rule\}/);
    expect(src).toMatch(/hasNonstandardForms\(tgt\)/);
  });
});
