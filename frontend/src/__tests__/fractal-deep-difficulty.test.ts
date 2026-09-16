/* psygames-gate-fractal-deep-difficulty · VER 1 · 11.09.2026 */
/**
 * ТРУДНОСТЬ БЕЗДНЫ — ОСЬ, А НЕ ОДНА РУЧКА С ОБЪЁМОМ.
 *
 * 🔴 ЗАЧЕМ. До 11.09.2026 полоса банка была впаяна в пресет объёма: scout = SE 1.2,
 * trek = 1.5, abyss = 1.7. Следствие, замеренное в тот день: маленькой, но трудной
 * партии не существовало вовсе, а марафон на недели приходил ВСЕГДА на трёх самых
 * лёгких полосах банка — три из 37 в RATING_LADDER, то есть 8% лестницы, и все три
 * снизу. Причина потолка к тому моменту уже устарела: он ставился под «пометок в
 * первой версии нет», а пометки приехали в X5.
 *
 * ⚠️ ЧЕГО ЭТОТ ГЕЙТ НЕ ЛОВИТ. Он смотрит на ЛЕСТНИЦУ, а не на экран: что экран
 * действительно отдал выбранную полосу в cfg, проверяет не он. Разводка «ступень →
 * cfg.rating» живёт в app/games/sudoku-fractal-deep.tsx и сторожится тем, что полоса
 * входит в зерно выбора доски (см. пробу про разные доски ниже) — но если экран
 * перестанет передавать rating вовсе, красной станет не эта проба.
 */
import {
  DEEP_BANDS, deepBandRating, deepBandName, clampDeepBand,
  materializePick, type DeepCfg,
} from '@/src/services/fractal-deep';
import { RATING_LADDER } from '@/src/services/sudoku-bank';
import { LANGUAGES } from '@/src/contexts/LanguageContext';

/** Словарь читается текстом: тянуть React-контекст ради имён ключей незачем. */
declare const __dirname: string;
declare function require(id: string): any;

/** Охват лестницы банка на 11.09.2026: 6 полос из 37. Менять ТОЛЬКО в большую сторону. */
const KNOWN_REACH = 6;

const cfgAt = (band: number): DeepCfg => ({
  depth: 3, feedCount: 'all', rating: deepBandRating(band), unlockShare: 0.24,
});

describe(`трудность Бездны: ${DEEP_BANDS.length} ступеней, полосы ${DEEP_BANDS.map((b) => b.rating).join('/')}`, () => {
  it('🔴 ступени идут строго вверх по полосе банка', () => {
    const r = DEEP_BANDS.map((b) => b.rating);
    const вверх = [...r].sort((a, b) => a - b);
    expect(r.join(' ')).toBe(вверх.join(' '));
    expect(new Set(r).size).toBe(r.length);   // одинаковые полосы = две ступени-близнеца
  });

  it('🔴 у каждой ступени СВОЁ имя — двух одинаковых подписей нет', () => {
    const keys = DEEP_BANDS.map((b) => b.nameKey);
    expect(`${new Set(keys).size} разных из ${keys.length}`).toBe(`${keys.length} разных из ${keys.length}`);
    expect(DEEP_BANDS.map((b, i) => deepBandName(i)).join(' ')).toBe(keys.join(' '));
  });

  /**
   * Подпись обязана БЫТЬ В СЛОВАРЕ. Ключ, которого нет, t() отдаст как есть, и человек
   * увидит на кнопке `sudokuTierExpert` — мимо tsc, мимо линта, мимо всех остальных проб.
   */
  it('🔴 имена ступеней переведены, а не напечатаны ключами', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8') as string;
    const нет = DEEP_BANDS.map((b) => b.nameKey).filter((k) => !new RegExp(`^  ${k}: \\{`, 'm').test(src));
    expect(`без перевода: ${нет.join(',') || 'нет'}`).toBe('без перевода: нет');
    expect(LANGUAGES.length).toBeGreaterThan(1);
  });

  it('🔴 полосы лестницы существуют в банке — иначе выбор доски упадёт', () => {
    const есть = new Set(RATING_LADDER.map((r) => r.rating));
    const чужие = DEEP_BANDS.map((b) => b.rating).filter((r) => !есть.has(r));
    expect(`вне банка: ${чужие.join(',') || 'нет'}`).toBe('вне банка: нет');
  });

  /**
   * Главная проба: ось обязана МЕНЯТЬ ПАРТИЮ, а не только подпись. Полоса входит в
   * зерно выбора доски (pickBoard), поэтому при том же зерне и том же пресете разные
   * ступени обязаны дать разные доски. Если кто-то снова впаяет полосу в пресет,
   * доски совпадут и проба покраснеет.
   */
  it('🔴 разные ступени дают разные доски при одном зерне и пресете', () => {
    const доска = (band: number) => materializePick('гейт-трудности', '', cfgAt(band)).puzzle.flat().join('');
    const первая = доска(0);
    const разных = new Set(DEEP_BANDS.map((_, i) => доска(i)));
    expect(`разных досок ${разных.size} из ${DEEP_BANDS.length}`).toBe(`разных досок ${DEEP_BANDS.length} из ${DEEP_BANDS.length}`);
    expect(доска(DEEP_BANDS.length - 1)).not.toBe(первая);
  });

  /**
   * Храповик охвата. Требовать «ровно 6» значит краснеть на каждом расширении
   * лестницы, то есть наказывать за улучшение. Поэтому охват может только расти:
   * сузили — красная; расширили — красная с просьбой поднять число, чтобы
   * достижение закрепилось и назад дороги не было.
   */
  it(`🔴 охват лестницы банка не сужается (сейчас ${DEEP_BANDS.length} полос из ${new Set(RATING_LADDER.map((r) => r.rating)).size})`, () => {
    expect(`ступеней ${DEEP_BANDS.length}, известно ${KNOWN_REACH}`)
      .toBe(`ступеней ${Math.max(DEEP_BANDS.length, KNOWN_REACH)}, известно ${KNOWN_REACH}`);
    expect(`известно ${KNOWN_REACH}, фактически ${DEEP_BANDS.length}`)
      .toBe(`известно ${DEEP_BANDS.length}, фактически ${DEEP_BANDS.length}`);
  });

  it('номер ступени из чужого снимка не роняет партию', () => {
    const края = [-5, 0, DEEP_BANDS.length - 1, DEEP_BANDS.length + 99, NaN, 1.7];
    for (const x of края) {
      const i = clampDeepBand(x);
      expect(Number.isInteger(i) && i >= 0 && i < DEEP_BANDS.length).toBe(true);
      expect(deepBandRating(x)).toBe(DEEP_BANDS[i]!.rating);
      expect(deepBandName(x)).toBe(DEEP_BANDS[i]!.nameKey);
    }
  });
});
