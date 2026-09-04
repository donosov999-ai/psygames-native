/**
 * ФРАЗЫ ДИКТАНТА СОБИРАЮТСЯ ИЗ УЖЕ ИМЕЮЩИХСЯ ДАННЫХ (задача f618c79b).
 *
 * Банк не заводился заново: 40 cloze-фраз на язык уже есть, в них дырка `___`, а
 * ответ лежит в словаре переводов по ключу `answerEn`. Проверяем, что сборка даёт
 * ПОЛНЫЕ фразы на каждом языке и что лестница по длине работает.
 */
import { buildPhrases, dictationLangs, levelPhrases, levelCount } from '@/src/games/dictation/core/phrases';

describe('фразы диктанта', () => {
  const языки = dictationLangs();

  it('🔴 языков не меньше пяти — иначе упражнение пустое', () => {
    expect(языки.length).toBeGreaterThanOrEqual(5);
  });

  it('🔴 ни в одной собранной фразе не осталось пропуска', () => {
    const битые: string[] = [];
    for (const l of языки) for (const ф of buildPhrases(l)) if (ф.text.includes('___')) битые.push(`${l}: ${ф.text}`);
    expect(битые).toEqual([]);
  });

  it('на каждом языке набралось хотя бы двадцать фраз', () => {
    const мало = языки.filter((l) => buildPhrases(l).length < 20).map((l) => `${l}: ${buildPhrases(l).length}`);
    expect(мало).toEqual([]);
  });

  it('подставленное слово действительно стоит во фразе', () => {
    for (const l of языки) {
      for (const ф of buildPhrases(l).slice(0, 8)) {
        expect(ф.text).toContain(ф.answer);
      }
    }
  });

  it('🔴 лестница короче на первых уровнях и шире дальше', () => {
    for (const l of языки) {
      const все = buildPhrases(l);
      const первый = levelPhrases(все, 1);
      const десятый = levelPhrases(все, 10);
      expect(десятый.length).toBeGreaterThanOrEqual(первый.length);
      const срПервый = первый.reduce((s, ф) => s + ф.length, 0) / первый.length;
      const срДесятый = десятый.reduce((s, ф) => s + ф.length, 0) / десятый.length;
      expect(`${l}: ${срПервый <= срДесятый}`).toBe(`${l}: true`);
    }
  });

  it('порог берётся по ДЛИНЕ, а не по номеру: у языков банки разной длины', () => {
    // Китайская фраза короче немецкой в знаках — «первые пять» дали бы разную трудность.
    const длины = языки.map((l) => {
      const в = buildPhrases(l);
      return Math.round(в.reduce((s, ф) => s + ф.length, 0) / в.length);
    });
    expect(Math.max(...длины) - Math.min(...длины)).toBeGreaterThan(5);
  });

  it('в заходе растёт число фраз', () => {
    expect(levelCount(1)).toBeLessThan(levelCount(10));
  });

  it('неизвестный язык не роняет, а отдаёт пусто', () => {
    expect(buildPhrases('такого-языка-нет')).toEqual([]);
  });
});
