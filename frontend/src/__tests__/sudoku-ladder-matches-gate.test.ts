/**
 * ЛЕСТНИЦА ОБЕЩАЕТ РОВНО СТОЛЬКО, СКОЛЬКО ПРОВЕРЕНО.
 *
 * 🔴 ЧТО БЫЛО. Замер 03.09.2026: игра обрывала лестницу на 80-м уровне
 * (`SUDOKU_LAST_LEVEL = 80`), а `sudoku-levels.gate.ts` гонял и держал зелёными
 * 92 — уровни 81–92 (thermoknight, sandparity, killerdiag) генерировались и
 * решались, но из игры до них было не дойти. Двенадцать готовых ступеней лежали
 * мёртвыми, и заметить это можно было только сличив два числа в разных файлах.
 *
 * ⚠️ ЭТО РАСХОЖДЕНИЕ МОЛЧАЛИВОЕ В ОБЕ СТОРОНЫ. Потолок ВЫШЕ проверенного —
 * человек упирается в непроверенный уровень; потолок НИЖЕ — сделанное прячется.
 * Оба случая не видны ни из одного файла по отдельности, поэтому числа сверяются
 * здесь.
 */
declare function require(m: string): any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

function число(файл: string, имя: string): number {
  const src: string = fs.readFileSync(path.join(__dirname, '../..', файл), 'utf8')
    .split('\n').filter((l: string) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const m = new RegExp(`${имя}\\s*=\\s*(\\d+)`).exec(src);
  expect(`${имя} найдено в ${файл}: ${!!m}`).toBe(`${имя} найдено в ${файл}: true`);
  return Number(m![1]);
}

describe('лестница судоку и гейт уровней', () => {
  it('🔴 потолок игры равен последнему проверенному уровню', () => {
    const вИгре = число('app/games/sudoku.tsx', 'SUDOKU_LAST_LEVEL');
    const вГейте = число('src/__gates__/sudoku-levels.gate.ts', 'LAST_LEVEL');
    expect(`игра ${вИгре} · гейт ${вГейте}`).toBe(`игра ${вГейте} · гейт ${вГейте}`);
  });

  it('🔴 у каждого уровня до потолка есть своя настройка, а не заглушка', () => {
    const { levelConfig } = require('@/src/services/sudoku-core');
    const вИгре = число('app/games/sudoku.tsx', 'SUDOKU_LAST_LEVEL');
    const пустые: number[] = [];
    for (let L = 1; L <= вИгре; L += 1) {
      const cfg = levelConfig(L);
      if (!cfg || !cfg.N || !cfg.blanks) пустые.push(L);
    }
    expect(пустые).toEqual([]);
  });

  it('🔴 карточка «Судоку» на каждом языке называет ровно последнюю ступень', () => {
    /**
     * 🔴 02.10.2026: скрипт новых правил поднимал в подписи карточки ПЕРВОЕ число строки,
     * а в японской «1つの盤 · 104段» первое число — «одна сетка». Четыре ветки подряд несли
     * «116つの盤 · 104段», и ни одна проба этого не видела. Здесь в подписи на каждом языке
     * допустимы только два числа: последняя ступень и «1».
     */
    const last = число('app/games/sudoku.tsx', 'SUDOKU_LAST_LEVEL');
    const texts: Record<string, string> = {};
    const ctx: string = fs.readFileSync(path.join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
    const base = /sudokuTypeClassic: \{ ru: '([^']*)',\s*en: '([^']*)'/.exec(ctx);
    expect(base).not.toBeNull();
    texts.ru = base![1];
    texts.en = base![2];
    const dir = path.join(__dirname, '../contexts/translations');
    for (const f of fs.readdirSync(dir).filter((x: string) => x.endsWith('.ts'))) {
      const m = /"sudokuTypeClassic": "([^"]*)"/.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (m) texts[f.replace(/\.ts$/, '')] = m[1];
    }
    expect(Object.keys(texts).length).toBeGreaterThanOrEqual(12);
    const wrong = Object.entries(texts)
      .filter(([, t]) => {
        const nums = (t.match(/\d+/g) || []).map(Number);
        return !nums.includes(last) || nums.some((x) => x !== last && x !== 1);
      })
      .map(([lang, t]) => `${lang}: ${t}`);
    expect(wrong).toEqual([]);
  });

  it('🔴 верхний пояс не безымянный: у 81+ своя подпись', () => {
    /**
     * 🔴 СПРАШИВАЕМ ПОВЕДЕНИЕ, А НЕ ЛИТЕРАЛ В ЭКРАНЕ. До 23.09.2026 проба искала
     * строку 'sudokuBeltCombo' прямо в app/games/sudoku.tsx — и покраснела, как
     * только судоку убрало ВТОРОЙ экземпляр границ поясов из экрана и оставило
     * один источник правды (`beltKey`, коммит 107b2353). Правка была верной, а
     * проба сторожила переехавший адрес. Теперь спрашиваем то, ради чего проба и
     * заведена: у верхнего пояса есть имя, и это имя переведено.
     */
    const { beltKey } = require('@/src/services/sudoku-level-help');
    const ключ = beltKey(81);
    expect(`пояс 81: ${ключ || 'без имени'}`).toBe('пояс 81: sudokuBeltCombo');

    const словарь: string = fs.readFileSync(
      path.join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
    expect(словарь).toContain(`${ключ}:`);
  });
});
