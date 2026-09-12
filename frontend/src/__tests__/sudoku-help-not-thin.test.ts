/* psygames-gate-sudoku-help-not-thin · VER 1 · 12.09.2026 */
/**
 * СПРАВКА УРОВНЯ НЕ ВЫРОЖДАЕТСЯ ТАМ, ГДЕ ОНА НУЖНЕЕ ВСЕГО.
 *
 * 🔴 ПОВОД — ЖИВОЙ ОТЧЁТ. Валя, 12.09.2026: «на 58 уровне не вижу нормальной
 * расшифровки и правил уровня, старый косяк». Замер подтвердил поштучно:
 *   · Ур.57 — заголовок «Ур.57 · ⧉ кривые блоки», ПЯТЬ разделов, 492 знака;
 *   · Ур.58 — заголовок голый «Ур.58», ТРИ раздела, 362 знака.
 * И так 23 уровня подряд, 58…80. По всей лестнице было: 5 разделов у 61 уровня,
 * 3 — у 31.
 *
 * 🔴 ПОЧЕМУ ЭТО ХУЖЕ, ЧЕМ «МЕНЬШЕ ТЕКСТА». Беднела справка ровно на самых трудных
 * досках: оценщик там молчит (замер 09.09: 92 доски из 92), варианта нет, и
 * человеку доставался ТЕРМИН БЕЗ РАСШИФРОВКИ — «Пояс ALS». Слово с решательских
 * форумов вместо объяснения.
 *
 * ⚠️ ЧЕГО ГЕЙТ НЕ ЛОВИТ: качество самих слов. Он сторожит, что разделы на месте,
 * имя у уровня есть, а термин не выходит к человеку голым. Что текст понятен —
 * проверяет только человек.
 */
import { buildLevelHelp, beltKey, beltHowKey } from '@/src/services/sudoku-level-help';
import { levelConfig, dimsForSize, type Variant } from '@/src/services/sudoku-core';
import { targetTier } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const СЛОВАРЬ = fs.readFileSync(path.join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8') as string;
/** ru-строка прямо из словаря: мерим то, что видит человек, а не ключ. */
function ru(key: string): string {
  const m = СЛОВАРЬ.match(new RegExp(`^  ${key}: \\{ ru: '((?:[^'\\\\]|\\\\.)*)'`, 'm'));
  return m ? m[1]!.replace(/\\'/g, "'") : key;
}

const LAST = 92;
/** Уровни-новички: 6×6 без варианта, там расшифровывать нечего. Их и было восемь. */
const НОВИЧКИ = 8;

function справка(L: number) {
  const c = levelConfig(L) as unknown as { N: 6 | 9; variant: Variant; hintMax: number };
  const d = dimsForSize(c.N);
  // Банковский пояс: замер 09.09.2026 — градатор молчит на 92 досках из 92.
  const молчит = c.variant === 'none' && c.N === 9 && L >= 58;
  /**
   * ⚠️ `targetTier` отдаёт ПОЛОСУ {min,max}, а справке нужна ОДНА ступень — та, что
   * градатор посчитал для выданной доски. В пробе берём верх полосы: так уровень
   * получает самую трудную из ожидаемых техник, то есть худший случай для проверки.
   * (Собственный промах: в первом замере я передал сюда объект, и `Math.round` от
   * него дал NaN — все уровни получали подпись первой техники. На счёт разделов это
   * не влияло, но подпись была не та.)
   */
  const tier = молчит ? null : targetTier(L).max;
  return buildLevelHelp(
    { mode: 'levels', level: L, N: d.N, variant: c.variant, tier, hintMax: c.hintMax, errorMax: 3 },
    ru, 'ru',
  );
}
const разделов = (h: { body: string }) => h.body.split('\n\n').length;

describe('справка уровня не худеет на трудных досках', () => {
  it('🔴 у КАЖДОГО уровня выше новичковых — пять разделов', () => {
    const тощие: string[] = [];
    for (let L = НОВИЧКИ + 1; L <= LAST; L++) {
      const n = разделов(справка(L));
      if (n < 5) тощие.push(`Ур.${L}→${n}`);
    }
    expect(`тощих ${тощие.length}: ${тощие.slice(0, 8).join(' ') || 'нет'}`).toBe('тощих 0: нет');
  });

  it('🔴 заголовок называет уровень, а не только номер', () => {
    const безымянные: number[] = [];
    for (let L = НОВИЧКИ + 1; L <= LAST; L++) if (!справка(L).title.includes('·')) безымянные.push(L);
    expect(`безымянных ${безымянные.length}: ${безымянные.slice(0, 8).join(',') || 'нет'}`).toBe('безымянных 0: нет');
  });

  /**
   * Главная. «Пояс ALS» само по себе — жаргон; человек прочтёт и не узнает ничего.
   * Требуем: где назван пояс, там рядом стоит его расшифровка.
   */
  it('🔴 названный пояс не выходит к человеку без расшифровки', () => {
    const голые: string[] = [];
    for (let L = 1; L <= LAST; L++) {
      const belt = beltKey(L);
      if (!belt) continue;
      const c = levelConfig(L) as unknown as { variant: Variant };
      if (c.variant !== 'none') continue;   // у комбо-пояса есть свой вариант и своё правило
      const body = справка(L).body;
      const имя = ru(belt);
      const how = beltHowKey(L);
      if (!body.includes(имя)) continue;
      if (!how || !body.includes(ru(how))) голые.push(`Ур.${L}(${имя})`);
    }
    expect(`без расшифровки ${голые.length}: ${голые.slice(0, 6).join(' ') || 'нет'}`).toBe('без расшифровки 0: нет');
  });

  it('🔴 раздел «как смотреть» есть и на классике высокого пояса', () => {
    const без: number[] = [];
    for (let L = 58; L <= LAST; L++) {
      const c = levelConfig(L) as unknown as { variant: Variant };
      if (c.variant !== 'none') continue;
      if (!справка(L).body.includes(ru('sudokuScanLabel'))) без.push(L);
    }
    expect(`без раздела ${без.length}: ${без.slice(0, 8).join(',') || 'нет'}`).toBe('без раздела 0: нет');
  });

  it('есть что мерить — иначе проба зелена вслепую', () => {
    expect(`уровней ${LAST}, поясов ${new Set([58, 66, 80, 81].map(beltKey)).size}`).toBe('уровней 92, поясов 4');
  });
});
