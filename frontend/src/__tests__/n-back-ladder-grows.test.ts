/**
 * 🔴 ЛЕСТНИЦА РАЗЛИЧАЕТ СОСЕДНИЕ УРОВНИ — ДО САМОГО ВЕРХА.
 * Правило раздела: потолков нет нигде (`span-chat/RULE_NO_CEILINGS.md`).
 *
 * ЗАМЕР ДО. На L13 N упирается в 6; L14…L60 побайтово одинаковы — 47 клонов.
 * Подтверждено ИГРОЙ: L13, L14, L16 на живом билде — «repeats 6 back», L12 — «5 back».
 * ЗАМЕР ПОСЛЕ. Ось 3: интервал между стимулами растёт на 200 мс за уровень.
 */
import { levelParams, NB_VOLUME_TOP } from '@/app/games/n-back';

const подпись = (l: number) => JSON.stringify(levelParams(l));

describe('n-back: лестница различает соседние уровни', () => {
  it('замер ДО зафиксирован: N упирается в 6 на L13', () => {
    expect(levelParams(NB_VOLUME_TOP).N).toBe(6);
    expect(levelParams(NB_VOLUME_TOP - 1).N).toBe(5);
    expect(levelParams(60).N).toBe(6);   // выше по N не растёт — иначе замер был бы про другое
  });

  it('прежние полосы не тронуты: single до L5, ускорение L6-L8, dual с L9', () => {
    expect(levelParams(5)).toEqual({ N: 5, modality: 'single', showMs: 700, gapMs: 1100 });
    expect(levelParams(8).modality).toBe('single');
    expect(levelParams(9).modality).toBe('dual');
    // ⚠️ в полосе ускорения интервал СОКРАЩАЕТСЯ — там ось 2, её не трогали
    expect(levelParams(8).gapMs).toBeLessThan(levelParams(6).gapMs);
    // и до L13 задержки нет: игрокам в прежней полосе сложность не меняли
    for (let L = 9; L <= NB_VOLUME_TOP; L++) expect(`L${L} gap=${levelParams(L).gapMs}`).toBe(`L${L} gap=1100`);
  });

  it('🔴 ни одного уровня-клона на L1…L60', () => {
    const клоны: string[] = [];
    for (let L = 2; L <= 60; L++) if (подпись(L) === подпись(L - 1)) клоны.push(`L${L}=L${L - 1}`);
    expect(`клонов: ${клоны.length}${клоны.length ? ' — ' + клоны.slice(0, 6).join(', ') : ''}`).toBe('клонов: 0');
  });

  it('🔴 выше L13 растёт именно интервал, монотонно', () => {
    for (let L = NB_VOLUME_TOP + 1; L <= 60; L++) {
      expect(`L${L}: ${levelParams(L).gapMs}`).toBe(`L${L}: ${levelParams(L - 1).gapMs + 200}`);
    }
  });
});
