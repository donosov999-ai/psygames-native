/**
 * 🔴 ЛЕСТНИЦА РАЗЛИЧАЕТ СОСЕДНИЕ УРОВНИ — ДО САМОГО ВЕРХА.
 * Правило раздела: потолков нет нигде (`span-chat/RULE_NO_CEILINGS.md`).
 *
 * ЗАМЕР ДО. На L13 N упирается в 6; L14…L60 побайтово одинаковы — 47 клонов.
 * Подтверждено ИГРОЙ: L13, L14, L16 на живом билде — «repeats 6 back», L12 — «5 back».
 * ЗАМЕР ПОСЛЕ. Ось 3: интервал между стимулами растёт на 200 мс за уровень.
 * С 02.10.2026 в полосе L27…L33 вместо интервала растёт ось 9 — глубина меняется внутри
 * партии всё чаще (задача 103cd98d); с L34 интервал растёт снова. На каждой ступени растёт
 * ровно одна ось — две в одной полосе дали бы обрыв вместо ступени.
 */
import { levelParams, NB_SWITCH_FLOOR, NB_SWITCH_FROM, NB_SWITCH_START, NB_VOLUME_TOP } from '@/app/games/n-back';

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

  it('🔴 выше L13 растёт интервал — кроме полосы оси 9, где он стоит, а смена глубины учащается', () => {
    const floorAt = NB_SWITCH_FROM + (NB_SWITCH_START - NB_SWITCH_FLOOR);
    const wrong: string[] = [];
    for (let L = NB_VOLUME_TOP + 1; L <= 60; L++) {
      const gapStep = levelParams(L).gapMs - levelParams(L - 1).gapMs;
      const inSwitchBand = L >= NB_SWITCH_FROM && L <= floorAt;
      if (inSwitchBand ? gapStep !== 0 : gapStep !== 200) wrong.push(`L${L}: интервал +${gapStep}`);
    }
    expect(`нарушений: ${wrong.join(', ') || '—'}`).toBe('нарушений: —');
  });

  it('🔴 ось 9: с L27 глубина меняется внутри партии — каждые 10 проб, на уровень чаще, до 4 на L33', () => {
    expect(levelParams(NB_SWITCH_FROM - 1).switchEvery).toBeUndefined();
    expect([27, 28, 30, 33, 34, 60].map((L) => `L${L}:${levelParams(L).switchEvery}`).join(' '))
      .toBe('L27:10 L28:9 L30:7 L33:4 L34:4 L60:4');
  });
});
