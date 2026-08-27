/* psygames-level-progress-labels-gate · VER 1 · 28.08.2026 */
/**
 * ПОДПИСЬ СТУПЕНИ СЛОВАМИ — НА КАРТЕ ЛЮБОЙ ИГРЫ (§7а-бис пп.10+22).
 *
 * Механизм общей подписи (tierKeyFor по доле пути) появился 19.08.2026
 * (8b6a5a36) и закрыл жалобы «не понимаю, как меняется сложность» разом для
 * всех карт — но гейта не получил: сломай кто-нибудь фолбэк, узнали бы из
 * репортов. Здесь сторожится устройство:
 *   · шкала покрывает весь путь и монотонна (позднее не легче раннего);
 *   · обе крайние ступени достижимы (иначе «Экстрим» — мёртвое слово);
 *   · ключи ступеней существуют в базовом словаре И всех десяти оверлеях —
 *     подпись не выпадает в сырой ключ ни на одном языке.
 */
import { tierKeyFor, ladderCap, LADDER_MIN } from '@/src/components/LevelProgressMap';

declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const TIERS = ['sudokuTierBeginner', 'sudokuTierEasy', 'sudokuTierMedium', 'sudokuTierHard', 'sudokuTierExpert', 'sudokuTierExtreme'];

describe('подпись ступени на карте уровней', () => {
  it('шкала монотонна и покрывает весь путь — на коротких и длинных лестницах', () => {
    for (const cap of [LADDER_MIN, 24, 57, 60]) {
      let prev = -1;
      const seen = new Set<string>();
      for (let l = 1; l <= cap; l++) {
        const key = tierKeyFor(l, cap);
        const idx = TIERS.indexOf(key);
        expect(`${cap}/${l}: ${key}`).toBe(`${cap}/${l}: ${idx >= 0 ? key : 'НЕИЗВЕСТНЫЙ КЛЮЧ'}`);
        expect(idx).toBeGreaterThanOrEqual(prev);   // позднее не легче раннего
        prev = idx;
        seen.add(key);
      }
      expect(tierKeyFor(1, cap)).toBe(TIERS[0]);
      expect(tierKeyFor(cap, cap)).toBe(TIERS[TIERS.length - 1]);
      expect(seen.size).toBe(TIERS.length);          // все шесть слов живые
    }
  });

  it('потолок карты не обрезает достигнутое', () => {
    expect(ladderCap(undefined, 3)).toBe(LADDER_MIN);
    expect(ladderCap(20, 3)).toBe(20);
    expect(ladderCap(20, 27)).toBe(27);
    expect(ladderCap(20, 3, 33)).toBe(33);
  });

  it('ключи ступеней существуют в базовом словаре и всех десяти оверлеях', () => {
    const base = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    for (const k of TIERS) {
      expect(`${k}: ${new RegExp(`\\n {2}${k}:\\s*\\{`).test(base)}`).toBe(`${k}: true`);
    }
    for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
      const overlay = readFileSync(join(__dirname, '..', 'contexts', 'translations', `${lang}.ts`), 'utf8');
      const missing = TIERS.filter((k) => !overlay.includes(`"${k}"`));
      expect(`${lang}: ${missing.join(',') || '—'}`).toBe(`${lang}: —`);
    }
  });
});
