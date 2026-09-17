/* psygames-mental-rotation-review-notes-fit · VER 2 · 17.09.2026 */
/* psygames-spatial-claude-mac · найдено при приёмке «Среза» (задача 4f85b6a9) */
/**
 * 🔴 ПОДПИСЬ ПОД ВАРИАНТОМ В РАЗБОРЕ ДОЛЖНА ЧИТАТЬСЯ ЦЕЛИКОМ.
 *
 * Замер 17.09.2026 на экспорт-сборке: в живой элемент подписи подставлены все 108 строк
 * (9 подписей × 12 языков). В одну строку на 390×844 обрезались 18 — «вид с другой стороны»,
 * «Ansicht von einer anderen Seite», «キューブが一つずれている»… А в сжатом разборе (высота
 * окна < 720, варианты в один ряд) на 375×667 — 86 из 108: на карточке оставалось «друг…».
 * Кадр: песочница сессии, shots/section/notes-before-375x667.png.
 *
 * Починка: в обычном разборе подпись в две строки; в сжатом подписей под карточками нет, а под
 * рядом одна строка — чем плох выбранный вариант. После неё тот же прибор: 0 из 108 и там, и там.
 *
 * Проба не заменяет замер — вёрстку jest не видит. Она держит устройство починки и длину строк:
 * самая длинная подпись сейчас 31 знак («Ansicht von einer anderen Seite», в две строки влезает).
 * Новая подпись длиннее порога зажжёт пробу — тогда перемерить прибором, а не поднимать порог.
 */
import { getMentalRotationStrings } from '@/src/games/mental-rotation/core';
import type { MentalRotationLocale } from '@/src/games/mental-rotation/core';
import { LANGUAGES } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

// VER 2 (17.09.2026, «Сечение», задача 4f85b6a9): +3 подписи — как видно на рисунке, тень на грань, другая плоскость.
// Самая длинная из новых — «wie in der Zeichnung gesehen», 28 знаков: порог прежний.
const ПОДПИСИ = ['optionCorrect', 'optionMirror', 'optionOther', 'optionOtherView', 'optionEditedShape', 'optionSwap', 'optionWholeFigure', 'optionNeighbourLayer', 'optionTurned', 'optionSeenAtAngle', 'optionShadow', 'optionOtherPlane'] as const;
const ПОРОГ = 32;

describe('подписи под вариантами в разборе «Мысленного вращения»', () => {
  it('прибор жив: 12 подписей × 12 языков, самая длинная — 31 знак', () => {
    expect(LANGUAGES.length).toBe(12);
    const длины = LANGUAGES.flatMap(({ code }) => ПОДПИСИ.map((k) => [...getMentalRotationStrings(code as MentalRotationLocale)[k]].length));
    expect(длины.length).toBe(144);
    expect(Math.max(...длины)).toBe(31);
  });

  it('🔴 ни одна подпись не длиннее порога, под который мерилась вёрстка', () => {
    const плохо = LANGUAGES.flatMap(({ code }) => ПОДПИСИ
      .map((k) => [k, getMentalRotationStrings(code as MentalRotationLocale)[k]] as const)
      .filter(([, v]) => [...v].length > ПОРОГ)
      .map(([k, v]) => `${code}.${k}: ${[...v].length} знаков «${v}»`));
    expect(плохо).toEqual([]);
  });

  it('🔴 в обычном разборе подпись в две строки, в сжатом — одна строка под рядом про выбранный вариант', () => {
    const экран = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'mental-rotation.tsx'), 'utf8');
    expect(экран).toMatch(/\{feedback&&!compactReview&&<Text numberOfLines=\{2\} style=\{\[styles\.optionLabel2[^\n]*\n\s*\{optionNote\(opt\)\}/);
    expect(экран).not.toMatch(/numberOfLines=\{1\}[^\n]*\n\s*\{optionNote\(opt\)\}/);
    expect(экран).toMatch(/\{reviewing && compactReview && feedback \? \(\s*<Text testID="mental-picked-note" numberOfLines=\{2\}[^\n]*\n\s*\{optionNote\(task\.options\[feedback\.idx\]\)\}/);
  });
});
