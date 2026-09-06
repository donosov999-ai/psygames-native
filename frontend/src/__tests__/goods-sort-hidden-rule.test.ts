/**
 * 🔴 МЕХАНИКА БЕЗ ПРАВИЛА — ЭТО НЕ СЛОЖНОСТЬ, А НЕОБЪЯСНЁННАЯ ИГРА.
 *
 * С шестнадцатого уровня сортировки часть товара прячется под «?», и полтора
 * месяца об этом не сообщалось нигде: правила `hidden` в списке не было, а долг
 * висел комментарием у `hiddenInfo` — «словарь занят другой правкой». Правило
 * заведено 02.09.2026 вместе с переводом на двенадцать языков.
 *
 * Гейт сторожит ТРИ вещи, каждая из которых уже ломалась в этом файле:
 *  1) уровень включения правила совпадает с уровнем включения самой механики —
 *     `fromLevel` записан числом, потому что `HIDDEN_FROM` объявлен ниже списка,
 *     и разъехаться этим двум ничто, кроме теста, не мешает;
 *  2) отбор правил на уровень идёт по САМИМ механикам, а не по `fromLevel`:
 *     обе прорежены (не каждый уровень), и «номер больше — значит показываем»
 *     зажигало бы значок в шапке вхолостую;
 *  3) тексты есть во всех двенадцати словарях, а не в двух: инлайн ru/en в
 *     `LevelRule` помечен устаревшим, и новое правило обязано жить в словаре.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { GS_RULES, gsRulesForLevel, hiddenInfo, strictPlacement, HIDDEN_FROM } from '@/src/games/goods-sort/core/level';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('скрытая информация объяснена правилом', () => {
  it('правило заведено и включается ровно с того уровня, что и механика', () => {
    const rule = GS_RULES.find((r) => r.key === 'hidden');
    expect(rule).toBeDefined();
    expect(rule!.fromLevel).toBe(HIDDEN_FROM);
  });

  it('🔴 отбор правил идёт по механике, а не по номеру уровня', () => {
    const wrong: string[] = [];
    for (let L = 1; L <= 60; L++) {
      const keys = gsRulesForLevel(L).map((r) => r.key);
      if (keys.includes('hidden') !== hiddenInfo(L)) wrong.push(`L${L}: hidden ${keys.includes('hidden')} ≠ ${hiddenInfo(L)}`);
      if (keys.includes('strict') !== strictPlacement(L)) wrong.push(`L${L}: strict ${keys.includes('strict')} ≠ ${strictPlacement(L)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('проверка исполняется: на уровнях без механики правила нет, с механикой — есть', () => {
    const on: number[] = [];
    const off: number[] = [];
    for (let L = 1; L <= 60; L++) (hiddenInfo(L) ? on : off).push(L);
    // Обе стороны непусты — иначе тест выше зеленел бы на пустом множестве.
    expect(on.length).toBeGreaterThan(2);
    expect(off.length).toBeGreaterThan(20);
    expect(gsRulesForLevel(on[0]).map((r) => r.key)).toContain('hidden');
    expect(gsRulesForLevel(off[0]).map((r) => r.key)).not.toContain('hidden');
  });

  it('🔴 тексты правила есть во всех двенадцати словарях', () => {
    const fields = ['title', 'rule', 'example'];
    const base = read('src/contexts/LanguageContext.tsx');
    const missing: string[] = [];
    for (const f of fields) if (!base.includes(`lr_goods_sort_hidden_${f}:`)) missing.push(`base/${f}`);
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const f of fields) if (!src.includes(`"lr_goods_sort_hidden_${f}"`)) missing.push(`${loc}/${f}`);
    }
    expect(missing).toEqual([]);
  });

  it('значок в шапке подписан из словаря, а не тернарником по языку', () => {
    const src = read('app/games/goods-sort.tsx');
    expect(src).toContain('levelRuleText(language, GS_GAME_ID, r).title');
    expect(src).not.toMatch(/label: ru \? '/);
  });
});
