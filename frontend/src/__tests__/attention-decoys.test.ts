/* psygames-attention-decoys · VER 1 · 10.09.2026 */
/**
 * 🔴 ОСЬ «ПОМЕХИ ВОКРУГ СТИМУЛА» — У ДВУХ ПРОБ РАЗДЕЛА СРАЗУ.
 *
 * ПОВОД. Срез лестниц 10.09.2026: переключение задач росло ×4,0 при ДВУХ осях
 * (беднее всех десяти), Струп — ×4,1 при трёх. У обеих очевидные оси заняты или
 * запрещены, и расти было нечем.
 *
 * ⚠️ ГЛАВНОЕ ЗДЕСЬ — НЕ РОСТ, А НЕЙТРАЛЬНОСТЬ. У обеих проб мера прохода это
 * РАЗНОСТЬ:
 *   переключение — switch_cost_ms = RT(смена) − RT(повтор);
 *   Струп        — интерференция  = RT(неконгруэнтные) − RT(конгруэнтные).
 * Ось, действующая на две половины разности по-разному, попадает прямо в неё и
 * портит меру. Помехи годятся ровно тем, что они свойство САМОГО СТИМУЛА:
 * удлиняют обе половины одинаково и из разности сокращаются. Две пробы ниже
 * (по одной на игру) проверяют именно это, и они важнее всех остальных в файле.
 *
 * 📌 Заменил `switching-decoys.test.ts`: инвариант «помеха не буква и не цифра»
 * переехал в общий модуль `src/games/attention/decoys.ts`, и стеречь его должна
 * одна проба, а не по копии на игру — разошедшиеся копии в этом разделе уже
 * случались (семь копий стиля полосы ответа разъехались в одном поле).
 */
import { DECOY_GLYPHS, DECOYS_MAX, makeDecoys } from '@/src/games/attention/decoys';
import { levelParams as swParams, levelCondition as swCond, makeTrial as swTrial } from '@/app/games/switching-task';
import { levelParams as stParams, levelCondition as stCond, makeTrial as stTrial } from '@/app/games/stroop';
import { switchingLoad, stroopLoad } from '@/src/games/attention/load';

const УРОВНИ = Array.from({ length: 15 }, (_, i) => i + 1);
const среднее = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

describe('помехи вокруг стимула: общий набор знаков', () => {
  it('есть что проверять — иначе набор зелен вслепую', () => {
    expect(DECOY_GLYPHS.length).toBeGreaterThanOrEqual(4);
    expect(makeDecoys(3).length).toBe(3);
  });

  /**
   * 🔴 Помеха-буква «афишировала» бы задачу: у переключения по буквам и судят, у
   * Струпа из букв складывается слово. Проба перестала бы быть перцептивной.
   */
  it('🔴 ни один знак не буква и не цифра — ни в одной письменности', () => {
    const плохие = DECOY_GLYPHS.filter((g) => /[\p{L}\p{N}]/u.test(g));
    expect(`знаки, афиширующие задачу: ${плохие.join(', ') || '—'}`)
      .toBe('знаки, афиширующие задачу: —');
  });

  it('число знаков не выходит за предел, который влезает в коробку', () => {
    expect(makeDecoys(99).length).toBe(DECOYS_MAX);
    expect(makeDecoys(-3).length).toBe(0);
  });
});

describe('переключение задач: помехи не трогают switch_cost', () => {
  /** Настоящий поток: следующая задача зависит от предыдущей. */
  function поток(level: number, n = 6000) {
    let last: number | null = null;
    const смены: number[] = [], повторы: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = swTrial('mix', level, last); last = t.taskIdx;
      (t.isSwitch ? смены : повторы).push(t.decoys.length);
    }
    return { смены: среднее(смены), повторы: среднее(повторы), сменПроб: смены.length };
  }

  it('🔴 помех поровну на сменах и повторах — иначе ось потечёт в разность', () => {
    const мимо: string[] = [];
    for (const L of [5, 10, 15]) {
      const r = поток(L);
      if (r.сменПроб < 100) { мимо.push(`L${L}: смен всего ${r.сменПроб}`); continue; }
      if (Math.abs(r.смены - r.повторы) > 0.001) мимо.push(`L${L}: смены ${r.смены.toFixed(3)} ≠ повторы ${r.повторы.toFixed(3)}`);
    }
    expect(мимо).toEqual([]);
  });

  it('число помех в раздаче совпадает с объявленным на каждом уровне', () => {
    const мимо: string[] = [];
    for (const L of УРОВНИ) {
      const ждём = swParams(L).decoys;
      let last: number | null = null;
      for (let i = 0; i < 200; i++) {
        const t = swTrial('num2', L, last); last = t.taskIdx;
        if (t.decoys.length !== ждём) { мимо.push(`L${L}: ждали ${ждём}, раздали ${t.decoys.length}`); break; }
      }
    }
    expect(мимо).toEqual([]);
  });

  it('🔴 мера уровня видит помехи (шаг 1.5 числом, не импортом)', () => {
    const p3 = swParams(3), p4 = swParams(4);
    expect(`объём одинаков: ${p3.trials === p4.trials}`).toBe('объём одинаков: true');
    expect(`${(switchingLoad(4) / switchingLoad(3)).toFixed(3)}`)
      .toBe(`${((p3.windowMs / p4.windowMs) * 1.5).toFixed(3)}`);
  });

  it('условие партии несёт помехи', () => {
    expect(Object.keys(swCond(1))).toContain('decoys');
  });
});

describe('Струп: помехи не трогают интерференцию', () => {
  function поток(level: number, n = 20000) {
    const конг: number[] = [], неконг: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = stTrial(level);
      (t.congruent ? конг : неконг).push(t.decoys.length);
    }
    return { конг: среднее(конг), неконг: среднее(неконг), конгПроб: конг.length };
  }

  /**
   * 🔴 САМАЯ ВАЖНАЯ ПРОБА ДЛЯ СТРУПА. Помехи раздаются ДО ветвления по
   * конгруэнтности — значит их поровну в обеих половинах разности.
   */
  it('🔴 помех поровну на конгруэнтных и неконгруэнтных', () => {
    const мимо: string[] = [];
    for (const L of [5, 10, 15]) {
      const r = поток(L);
      if (r.конгПроб < 100) { мимо.push(`L${L}: конгруэнтных всего ${r.конгПроб}`); continue; }
      if (Math.abs(r.конг - r.неконг) > 0.001) мимо.push(`L${L}: конгр ${r.конг.toFixed(3)} ≠ неконгр ${r.неконг.toFixed(3)}`);
    }
    expect(мимо).toEqual([]);
  });

  it('число помех в раздаче совпадает с объявленным на каждом уровне', () => {
    const мимо: string[] = [];
    for (const L of УРОВНИ) {
      const ждём = stParams(L).decoys;
      for (let i = 0; i < 200; i++) {
        if (stTrial(L).decoys.length !== ждём) { мимо.push(`L${L}: ждали ${ждём}`); break; }
      }
    }
    expect(мимо).toEqual([]);
  });

  it('лестница помех растёт и доходит до предела; первые ступени чисты', () => {
    for (const [имя, П] of [['переключение', swParams], ['Струп', stParams]] as const) {
      const ряд = УРОВНИ.map((L) => П(L).decoys);
      expect(`${имя}: откатов ${ряд.filter((v, i) => i > 0 && v < ряд[i - 1]).length}`).toBe(`${имя}: откатов 0`);
      expect(`${имя}: L1 ${ряд[0]} · L15 ${ряд[14]} · значений ${new Set(ряд).size}`)
        .toBe(`${имя}: L1 0 · L15 ${DECOYS_MAX} · значений 3`);
    }
  });

  it('🔴 мера уровня Струпа видит помехи', () => {
    const p3 = stParams(3), p4 = stParams(4);
    expect(`помехи ${p3.decoys} → ${p4.decoys}`).toBe('помехи 0 → 2');
    const ждём = (p3.windowMs / p4.windowMs) * ((1 + p4.switchRate) / (1 + p3.switchRate)) * 1.5;
    expect(`${(stroopLoad(4) / stroopLoad(3)).toFixed(3)}`).toBe(`${ждём.toFixed(3)}`);
  });

  it('условие партии несёт помехи — у Струпа условия не было вовсе', () => {
    expect(Object.keys(stCond(1))).toEqual(expect.arrayContaining(['trials', 'windowMs', 'switchRate', 'decoys']));
  });
});
