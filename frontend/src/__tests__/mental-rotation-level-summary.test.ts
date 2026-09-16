/* psygames-mental-rotation-level-summary · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961 */
/**
 * 🔴 ОПИСАНИЕ УРОВНЯ «МЫСЛЕННОГО ВРАЩЕНИЯ» — ОДНО НА ДВЕНАДЦАТЬ ЯЗЫКОВ И ГОВОРИТ ПРАВДУ.
 *
 * Замер 16.09.2026 по коду экрана настройки: русскому показывалась заметка ядра
 * «4 кубиков: X90° → Y90°/180°, три варианта.», остальным — «4–4 cubes · X+Y axes ·
 * oblique». Развилка `if(language==='ru')return …` гейт `ci-i18n-hardcode-guard`
 * не видит: он ловит тернарник, а не ранний возврат.
 *
 * 🔬 УГЛЫ СВЕРЯЮТСЯ С НАСТОЯЩИМИ ЗАДАНИЯМИ. Текст обещает «90–180°» — проба строит
 * по тридцать заданий уровня и требует, чтобы `angleSum` принимал ровно два
 * крайних значения из описания. Иначе описание и генератор разошлись бы молча.
 */
import {
  buildRotationTask, createRng, getMentalRotationStrings, levelSummary, rotationLevelSpec,
} from '@/src/games/mental-rotation/core';
import type { MentalRotationLocale } from '@/src/games/mental-rotation/core';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ЯЗЫКИ: MentalRotationLocale[] = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];
const УРОВНИ = Array.from({ length: 50 }, (_, i) => i + 1);
const текст = (язык: MentalRotationLocale, уровень: number) => levelSummary(уровень, getMentalRotationStrings(язык));

describe('описание уровня «Мысленного вращения»', () => {
  it('🔴 кроме русского — ни одной кириллической буквы', () => {
    const плохо = ЯЗЫКИ.filter((я) => я !== 'ru').flatMap((я) => УРОВНИ.filter((у) => /[А-Яа-яЁё]/.test(текст(я, у))).map((у) => `${я} L${у}: ${текст(я, у)}`));
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('🔴 заметка ядра на экран не идёт, «4–4» и оси для разработчика — тоже', () => {
    const плохо: string[] = [];
    for (const я of ЯЗЫКИ) for (const у of УРОВНИ) {
      const т = текст(я, у);
      if (т === rotationLevelSpec(у).change || /\d+–\d+ |X90|Y90|\{\w+\}|undefined/.test(т)) плохо.push(`${я} L${у}: ${т}`);
    }
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('на каждом языке пятьдесят разных описаний — уровни различимы словами', () => {
    const плохо = ЯЗЫКИ.filter((я) => new Set(УРОВНИ.map((у) => текст(я, у))).size !== 50);
    expect(плохо).toEqual([]);
  });

  it('перевод свой у каждого языка, а не английский запасным ходом', () => {
    const плохо = ЯЗЫКИ.filter((я) => я !== 'en').flatMap((я) => УРОВНИ.filter((у) => текст(я, у) === текст('en', у)).map((у) => `${я} L${у}`));
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('🔴 числа описания — это числа уровня', () => {
    const плохо: string[] = [];
    for (const я of ЯЗЫКИ) for (const у of УРОВНИ) {
      const s = rotationLevelSpec(у), т = текст(я, у), цифры: string[] = т.match(/\d+/g) ?? [];
      for (const n of [s.cubes, s.optionCount, 90 * s.path.length, 90 * (s.path.length + 1)]) {
        if (!цифры.includes(String(n))) плохо.push(`${я} L${у}: нет ${n} в «${т}»`);
      }
    }
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('🔴 углы из описания — ровно те, что выпадают в заданиях уровня', () => {
    const плохо: string[] = [];
    for (const у of УРОВНИ.slice(0, 10)) {
      const s = rotationLevelSpec(у), обещано = [90 * s.path.length, 90 * (s.path.length + 1)];
      const углы = new Set<number>();
      for (let i = 0; i < 30; i++) углы.add(buildRotationTask(у, createRng(`summary-${у}-${i}`)).angleSum);
      const выпало = [...углы].sort((a, b) => a - b);
      if (выпало.join(',') !== обещано.join(',')) плохо.push(`L${у}: описание ${обещано.join('–')}°, в заданиях ${выпало.join(', ')}°`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 «в плоскости экрана» — там, где задания крутят вокруг одной оси, «по двум осям» — где вокруг двух', () => {
    const плохо: string[] = [];
    for (const у of УРОВНИ.slice(0, 10)) {
      const оси = new Set<string>();
      for (let i = 0; i < 20; i++) for (const шаг of buildRotationTask(у, createRng(`axes-${у}-${i}`)).steps) оси.add(шаг.axis);
      const т = текст('en', у);
      const ждём = оси.size === 1 ? 'screen plane' : 'two axes';
      if (!т.includes(ждём)) плохо.push(`L${у}: в заданиях осей ${оси.size}, а описание «${т}»`);
    }
    expect(плохо).toEqual([]);
  });

  it('контроль: «в плоскости» и «в объёме» различаются у разных уровней, а не совпали везде', () => {
    const en = УРОВНИ.map((у) => текст('en', у));
    expect(en.filter((т) => т.includes('screen plane')).length).toBeGreaterThan(5);
    expect(en.filter((т) => т.includes('two axes')).length).toBeGreaterThan(5);
    expect(new Set(УРОВНИ.map((у) => new Set(rotationLevelSpec(у).path).size))).toEqual(new Set([1, 2]));
  });

  /**
   * ⚠️ ЕДИНСТВЕННАЯ ПРОВЕРКА ПО ИСХОДНИКУ, УЗКАЯ НАМЕРЕННО: функция может быть верной, а экран —
   * снова развилкой по языку печатать заметку ядра мимо неё. Комментарии вырезаются.
   */
  it('экран настройки печатает levelSummary, а не spec.change и не развилку по языку', () => {
    const код = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'mental-rotation.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(код).toMatch(/levelSummary\(selectedLevel, strings\)/);
    expect(код).not.toMatch(/rotationLevelSpec\([^)]*\)\.change/);
    expect(код).not.toMatch(/'mrCubes'|'mrAxisXY'|'mrOblique'/);
  });
});
