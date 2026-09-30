/**
 * @jest-environment node
 */
/**
 * 🔴 ПРОИГРЫШ ПО БЮДЖЕТУ ХОДОВ НАЗЫВАЕТ ЧИСЛА, А НЕ МОЛЧИТ.
 *
 * 📍 ОТЧЁТ 91785f91 (17.09.2026, «Заливка», ступень 1, iOS 2.54.20). Человек
 * доиграл ЧЕТЫРЕ партии подряд за четыре минуты, каждый раз получил «Уровень 1 —
 * почти! Ещё раз» и написал «не переходит на следующий уровень». Состояние на
 * момент отзыва: `{mode: Flood, level: 1, phase: cleared, moves: 9, status: -1}`.
 *
 * Причина была в бюджете ходов — ступень 1 это `12x12c3m0`, и `m0` у автора
 * означает НОЛЬ запасных ходов (`flood.c:109`: «no extra moves for these modes»),
 * то есть лимит равен длине решения генератора. Но узнать это было неоткуда:
 *   · счётчик «9 / 8 ходов» при `FAILED!` гаснет — признак тупика проверяется
 *     раньше счётчиков, и это верно (иначе «Cannot move! Score: 96» читалось бы
 *     как бодрый счёт на мёртвой доске);
 *   · карточка итога показывала `reasonLine` ТОЛЬКО победителю (`reasonLine && passed`).
 *
 * ⚠️ ПРОБА СТОИТ НА РАЗБОРЕ СТРОКИ ДВИЖКА, а не на нашей копии бюджета: числа
 * печатает сам автор (`flood.c:1283`), и своя арифметика разошлась бы с ним молча.
 */
import { провалПоХодам, ходПартии, тупик } from '@/src/games/tatham-bridge/status';

// ⚠️ Среда node, а типов node в этом tsconfig нет — объявляем как в
// `src/games/cake-sort/tools/record-solutions.gen.ts`.
declare const __dirname: string;

describe('«Заливка»: проигрыш по ходам называет числа', () => {
  it('🔴 из строки автора берутся потрачено и лимит', () => {
    // Формат — дословно `flood.c:1283`: "%s%d / %d moves" с приставкой.
    expect(провалПоХодам('FAILED! 9 / 8 moves')).toEqual({ ходов: 9, лимит: 8 });
    expect(провалПоХодам('FAILED!  23 / 22 moves')).toEqual({ ходов: 23, лимит: 22 });
  });

  it('🔴 пока партия идёт и когда она выиграна — причины нет', () => {
    expect(провалПоХодам('5 / 22 moves')).toBeNull();
    expect(провалПоХодам('COMPLETED! 8 / 8 moves')).toBeNull();
    expect(провалПоХодам('Auto-solved. 8 / 8 moves')).toBeNull();
    expect(провалПоХодам('')).toBeNull();
  });

  it('чужие проигрыши не выдаются за проигрыш по ходам', () => {
    // «Снос групп» кончается иначе — там причина не в бюджете ходов.
    expect(провалПоХодам('Cannot move! Score: 96')).toBeNull();
    expect(провалПоХодам('DEAD!   Deaths: 1')).toBeNull();
  });

  it('📍 ПОЧЕМУ БЕЗ ЭТОГО РАЗБОРА ЧИСЛА ПРОПАДАЛИ: счётчик при провале молчит', () => {
    // Это НЕ дефект, а сознательный порядок в `status.ts`. Проба фиксирует его,
    // чтобы следующий не «починил» счётчик и не вернул «Score: 96» на мёртвой доске.
    expect(тупик('FAILED! 9 / 8 moves')).toBe(true);
    expect(ходПартии('FAILED! 9 / 8 moves')).toBeNull();
    // А пока партия идёт — счётчик на месте.
    expect(ходПартии('5 / 22 moves')).toEqual({ ключ: 'puzzleHudMovesUsed', значение: '5/22' });
  });

  it('🔴 ТЕКСТ ЧЕЛОВЕКУ СОБИРАЕТСЯ С ЧИСЛАМИ, а не остаётся шаблоном', () => {
    // ⚠️ Объект словаря из модуля не экспортируется — читаем ИСХОДНИК, ровно как
    // это делает сборщик `flutter/tools/embed-l10n.mjs`. Проверяется перенос
    // (ключ на месте и с местами под числа), а поведение — четырьмя пробами выше.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8') as string;
    const строка = /puzzleOutOfMoves:\s*\{\s*ru:\s*'([^']*)'\s*,\s*en:\s*'([^']*)'/.exec(src);
    // jest-версия `expect` берёт один аргумент — причину пишем отдельной проверкой.
    if (!строка) throw new Error('ключ puzzleOutOfMoves пропал из словаря LanguageContext.tsx');
    const [, ru, en] = строка;
    for (const [язык, t] of [['ru', ru], ['en', en]] as const) {
      if (!t.includes('{m}')) throw new Error(`${язык}: нет места под потраченные ходы`);
      if (!t.includes('{n}')) throw new Error(`${язык}: нет места под лимит`);
    }
    const готово = ru.replace('{m}', '9').replace('{n}', '8');
    expect(готово).toContain('9');
    expect(готово).toContain('8');
    expect(готово).not.toContain('{');
  });
});
