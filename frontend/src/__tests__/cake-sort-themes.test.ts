/**
 * 🔴 КАРТИНКИ РАЗНЫЕ ПОД РАЗНЫЕ ПРОФИЛИ — И ЭТО ПРОВЕРЯЕТСЯ ЧИСЛОМ.
 *
 * Требование Дениса: «надо везде, где есть картинки, делать их красивыми и
 * разными под разные профили». «Разными» легко объявить и не сделать: одна
 * палитра, разложенная по девяти именам, пройдёт любую проверку вида «тема
 * есть». Поэтому здесь сверяется САМ СОСТАВ палитр и то, что профили из разных
 * групп получают РАЗНЫЕ наборы.
 *
 * ⚠️ Устройство повторяет `pairThemes.ts` намеренно: там эта задача уже решена
 * (девять наборов на тринадцать профилей), и вторая механика тем означала бы два
 * места, где профиль превращается в картинки.
 */
import { CAKE_THEMES, CAKE_FLAVORS, cakeThemeForProfile, cakeThemeNameForProfile } from '@/src/constants/cakeThemes';
import { CS_RULES } from '@/app/games/cake-sort';
import { QUEUE_FROM, levelCfg } from '@/src/games/cake-sort/core/level';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const ПРОФИЛИ = ['odv999', 'chess', 'kids', 'vasilyeva', 'nzt48', 'free',
  'drivers', 'seniors', 'execs', 'students', 'women', 'polyglot'];

/** Светлота цвета 0…255 — по ней читается различимость клиньев периферией. */
function светлота(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('темы тортов под профили', () => {
  it('есть что проверять — наборов несколько и профилей больше', () => {
    expect(Object.keys(CAKE_THEMES).length).toBeGreaterThanOrEqual(9);
    expect(ПРОФИЛИ.length).toBeGreaterThan(Object.keys(CAKE_THEMES).length);
  });

  it('🔴 палитра каждой темы покрывает потолок видов начинки', () => {
    const мало = Object.entries(CAKE_THEMES)
      .filter(([, t]) => t.colors.length < CAKE_FLAVORS)
      .map(([n, t]) => `${n}: ${t.colors.length} цветов при потолке ${CAKE_FLAVORS}`);
    expect(мало).toEqual([]);
  });

  it('🔴 внутри темы нет двух одинаковых цветов — иначе два вида сольются', () => {
    const дубли = Object.entries(CAKE_THEMES)
      .filter(([, t]) => new Set(t.colors.slice(0, CAKE_FLAVORS)).size !== CAKE_FLAVORS)
      .map(([n]) => `${n}: в палитре есть повтор`);
    expect(дубли).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ ПО ТРЕБОВАНИЮ: темы правда РАЗНЫЕ, а не переименованная одна.
   * Сравниваем состав палитр, а не имена.
   */
  it('🔴 никакие две темы не совпадают палитрой', () => {
    const имена = Object.keys(CAKE_THEMES);
    const совпали: string[] = [];
    for (let i = 0; i < имена.length; i += 1) {
      for (let j = i + 1; j < имена.length; j += 1) {
        const a = (CAKE_THEMES as any)[имена[i]].colors.slice(0, CAKE_FLAVORS).join(',');
        const b = (CAKE_THEMES as any)[имена[j]].colors.slice(0, CAKE_FLAVORS).join(',');
        if (a === b) совпали.push(`${имена[i]} и ${имена[j]} — одна палитра`);
      }
    }
    expect(совпали).toEqual([]);
  });

  it('🔴 темы не пересекаются и по составу: общих цветов меньше половины', () => {
    const имена = Object.keys(CAKE_THEMES);
    const близкие: string[] = [];
    for (let i = 0; i < имена.length; i += 1) {
      for (let j = i + 1; j < имена.length; j += 1) {
        const a = new Set((CAKE_THEMES as any)[имена[i]].colors.slice(0, CAKE_FLAVORS));
        const b: string[] = (CAKE_THEMES as any)[имена[j]].colors.slice(0, CAKE_FLAVORS);
        const общих = b.filter((c) => a.has(c)).length;
        if (общих > CAKE_FLAVORS / 2) близкие.push(`${имена[i]} и ${имена[j]}: общих ${общих} из ${CAKE_FLAVORS}`);
      }
    }
    expect(близкие).toEqual([]);
  });

  /**
   * Соседние клинья на тарелке 62–80 точек различаются периферией, и два близких
   * по СВЕТЛОТЕ тона там сливаются даже при разном оттенке. Требуем разброса.
   */
  it('🔴 внутри темы цвета разведены по светлоте, а не только по тону', () => {
    const плоские = Object.entries(CAKE_THEMES)
      .map(([n, t]) => {
        const L = t.colors.slice(0, CAKE_FLAVORS).map(светлота);
        return { n, разброс: Math.max(...L) - Math.min(...L) };
      })
      .filter(({ разброс }) => разброс < 90)
      .map(({ n, разброс }) => `${n}: разброс светлоты ${разброс.toFixed(0)} — клинья сольются`);
    expect(плоские).toEqual([]);
  });

  it('🔴 каждый профиль получает набор, и разные группы — разные наборы', () => {
    const без = ПРОФИЛИ.filter((p) => !cakeThemeForProfile(p));
    expect(без).toEqual([]);
    // Не «все разные» — наборов меньше, чем профилей, — но групп должно быть несколько.
    const наборов = new Set(ПРОФИЛИ.map(cakeThemeNameForProfile));
    expect(наборов.size).toBeGreaterThanOrEqual(8);
    // Профили с заведомо разным характером не должны делить один набор.
    expect(cakeThemeNameForProfile('kids')).not.toBe(cakeThemeNameForProfile('execs'));
    expect(cakeThemeNameForProfile('chess')).not.toBe(cakeThemeNameForProfile('kids'));
    expect(cakeThemeNameForProfile('women')).not.toBe(cakeThemeNameForProfile('drivers'));
  });

  it('незнакомый профиль получает дефолт, а не пустоту', () => {
    expect(cakeThemeForProfile(undefined).colors.length).toBeGreaterThanOrEqual(CAKE_FLAVORS);
    expect(cakeThemeForProfile('такого-профиля-нет').colors.length).toBeGreaterThanOrEqual(CAKE_FLAVORS);
  });

  it('🔴 правило очереди заведено с тем же порогом, что механика, и переведено', () => {
    const r = CS_RULES.find((x) => x.key === 'queue');
    expect(r).toBeDefined();
    expect(r!.fromLevel).toBe(QUEUE_FROM);
    // И порог правила равен ПЕРВОМУ уровню, где очередь реально появляется.
    const первый = Array.from({ length: 60 }, (_, i) => i + 1).find((L) => levelCfg(L).queue > 0);
    expect(первый).toBe(r!.fromLevel);
    const поля = ['title', 'rule', 'example'];
    const нет: string[] = [];
    const base = read('src/contexts/LanguageContext.tsx');
    for (const f of поля) if (!base.includes(`lr_cake_sort_queue_${f}:`)) нет.push(`base/${f}`);
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const f of поля) if (!src.includes(`"lr_cake_sort_queue_${f}"`)) нет.push(`${loc}/${f}`);
    }
    expect(нет).toEqual([]);
  });
});
