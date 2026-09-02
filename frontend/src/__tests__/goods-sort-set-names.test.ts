/**
 * 🔴 НАЗВАНИЕ НАБОРА БЕРЁТСЯ ИЗ СЛОВАРЯ — И ПОТОМУ ОБЯЗАНО ТАМ БЫТЬ.
 *
 * Замер живьём 02.09.2026 на https://psy-games.pro/play/games/goods-sort:
 * шестая кнопка выбора набора подписана «goodsSet_pets» — сырым ключом. Набор
 * «Зверята» завели 30.08 с полями ru/en прямо в объекте, а подпись рисуется
 * через `t('goodsSet_' + key)`; ключа в словаре не было, и `t()` честно вернул
 * сам ключ. На проде это провисело три дня и его никто не поймал: инлайн-поля
 * в объекте создают ВПЕЧАТЛЕНИЕ, что название заведено.
 *
 * Поэтому гейт проверяет не «есть ли ключ у pets», а связь целиком: каждому
 * набору из `GOOD_SETS` — ключ в базовом словаре и во всех десяти локалях.
 * Седьмой набор без перевода теперь красит сборку, а не экран игрока.
 */
import { GOOD_SETS } from '../../app/games/goods-sort';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('наборы товаров названы, а не показаны ключом', () => {
  it('проверка исполняется: наборов больше одного и у каждого есть ключ', () => {
    expect(GOOD_SETS.length).toBeGreaterThan(3);
    expect(GOOD_SETS.every((s) => typeof s.key === 'string' && s.key.length > 0)).toBe(true);
  });

  it('🔴 у каждого набора есть название в базовом словаре', () => {
    const base = read('src/contexts/LanguageContext.tsx');
    const missing = GOOD_SETS.filter((s) => !base.includes(`goodsSet_${s.key}:`)).map((s) => s.key);
    expect(missing).toEqual([]);
  });

  it('🔴 у каждого набора есть название во всех десяти локалях', () => {
    const missing: string[] = [];
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const s of GOOD_SETS) if (!src.includes(`"goodsSet_${s.key}"`)) missing.push(`${loc}/${s.key}`);
    }
    expect(missing).toEqual([]);
  });
});
