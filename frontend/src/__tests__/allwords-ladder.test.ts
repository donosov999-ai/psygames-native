/* psygames-gate-allwords-ladder · VER 1 · 06.09.2026 */
/**
 * 🔴 УРОВНИ «НАЙДИ ВСЕ СЛОВА» ИДУТ ОТ ЛЁГКИХ К ТРУДНЫМ. У ВСЕХ ЯЗЫКОВ.
 *
 * 📍 ЗАМЕР ДО ПРАВКИ (06.09.2026): уровень N был просто N-й строкой JSON, а пять
 * наборов лежат по алфавиту. Слов на раскладку по четвертям: 12,8 · 12,6 · 12,7 ·
 * 12,6 — сороковой уровень ровно такой же, как первый. У ru и en лестница
 * случайно была, потому что их сборщик сортировал базы по частоте: то есть
 * трудность зависела от того, чем сортировал СКРИПТ СБОРКИ.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРЯЕТСЯ КАЖДЫЙ ЯЗЫК, А НЕ ОДИН. Ровно так дефект и прятался:
 * на двух проверяемых языках всё было хорошо, на пяти остальных — нет.
 */
import { allWordsPack, allWordsCount, allWordsLocales } from '@/src/games/anagrams/core/allWords';

function среднееПоОкну(loc: string, от: number, до: number): number {
  let сумма = 0; let n = 0;
  for (let L = от; L <= до; L += 1) {
    const p = allWordsPack(loc, L);
    if (!p) continue;
    сумма += p.words.length; n += 1;
  }
  return n ? сумма / n : 0;
}

describe('лестница «найди все слова»', () => {
  it('есть что проверять: языков семь и наборы не пустые', () => {
    expect(allWordsLocales().length).toBeGreaterThanOrEqual(7);
    for (const loc of allWordsLocales()) expect(allWordsCount(loc)).toBeGreaterThan(300);
  });

  it('🔴 слов на раскладку растёт от первой сотни уровней к четвёртой — у КАЖДОГО языка', () => {
    const плоские: string[] = [];
    for (const loc of allWordsLocales()) {
      const первая = среднееПоОкну(loc, 1, 100);
      const четвёртая = среднееПоОкну(loc, 301, 400);
      if (четвёртая <= первая) плоские.push(`${loc}: ${первая.toFixed(1)} → ${четвёртая.toFixed(1)}`);
    }
    expect(плоские).toEqual([]);
  });

  /**
   * ⚠️ И ЛЕСТНИЦА НЕ ОТКАТЫВАЕТСЯ НА СТЫКАХ. Проверяется прогоном окон подряд, а
   * не сравнением края с краем: ломается такое именно между участками.
   */
  it('🔴 по окнам в полсотни уровней средняя длина не убывает', () => {
    const откаты: string[] = [];
    for (const loc of allWordsLocales()) {
      let пред = 0;
      for (let от = 1; от + 49 <= Math.min(400, allWordsCount(loc)); от += 50) {
        const ср = среднееПоОкну(loc, от, от + 49);
        if (ср < пред - 0.01) откаты.push(`${loc} L${от}: ${пред.toFixed(1)} → ${ср.toFixed(1)}`);
        пред = ср;
      }
    }
    expect(откаты).toEqual([]);
  });

  it('🔴 уровень повторяется: тот же уровень — та же раскладка', () => {
    for (const loc of ['ru', 'en', 'de']) {
      for (const L of [1, 40, 200]) {
        expect(allWordsPack(loc, L)?.base).toBe(allWordsPack(loc, L)?.base);
        expect(allWordsPack(loc, L)?.base).toBeTruthy();
      }
    }
  });

  it('⚠️ первый уровень — самая короткая раскладка, а не случайная', () => {
    for (const loc of allWordsLocales()) {
      const первый = allWordsPack(loc, 1)!;
      const все: number[] = [];
      for (let L = 1; L <= allWordsCount(loc); L += 1) все.push(allWordsPack(loc, L)!.words.length);
      expect(`${loc}: ${первый.words.length} = ${Math.min(...все)}`)
        .toBe(`${loc}: ${первый.words.length} = ${первый.words.length}`);
    }
  });
});
