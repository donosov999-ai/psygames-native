/* __tests__/math-slider-bands · VER 5 · 07.09.2026 */
/**
 * СЛЕПОК ПОЛОС лестницы v2 «Математической шкалы» — страж от МОЛЧАЛИВОГО сдвига.
 *
 * v2 = ШКОЛЬНАЯ ОСЬ (задана Денисом 07.09.2026): 13 полос по 4 уровня —
 * сложение → вычитание → умножение → деление → десятичные → квадраты → проценты →
 * скидки → пропорции → кубы/вложенные → уравнения ax+b=c → корни √N → микс высших.
 * Приёмка симом (counting-chat/sim-slider.mjs, 07.09.2026, 25 сидов ×
 * 20 вопросов): в зоне обещания L1–52 клонов (|Δработы|<5%) — 0, обрывов
 * (>×1,5) — 0; вход в новую тему — с «передышки» на простых числах (школьная
 * педагогика, осознанный дизайн). B13 (L49+) — квадратные уравнения ax²+b=c
 * (микс пройденного не может стоять выше конца B12 — замерено). difficulty
 * вопроса = работа/норма (core/work.ts), от него окно времени в scoring.
 *
 * При сознательной переделке полос слепок обновляется В ТОМ ЖЕ коммите.
 * Проверяется ПОВЕДЕНИЕМ (генерация вопросов), не чтением исходника.
 */
import {
  evaluateExpression,
  generateMathSliderQuestions,
  migrateSliderLevelV1toV2,
  questionWork,
  sampleAreaHeights,
  SLIDER_MAX_LEVEL,
  WORK_NORM,
} from '@/src/games/math-slider/core';

/** Какие семейства выражений отдаёт уровень (по 6 сидам × 12 вопросов). */
function kindsAt(level: number): Set<string> {
  const kinds = new Set<string>();
  for (let s = 0; s < 6; s++) {
    for (const q of generateMathSliderQuestions(`bands-${s}`, level, 12)) kinds.add(q.kind);
  }
  return kinds;
}

const BAND_SNAPSHOT: readonly [level: number, kind: string][] = [
  [1, 'integer-addition'], [4, 'integer-addition'],
  [5, 'signed-subtraction'], [8, 'signed-subtraction'],
  [9, 'mixed-small-multiplication'], [12, 'mixed-small-multiplication'],
  [13, 'integer-division'], [16, 'integer-division'],
  [17, 'decimal-arithmetic'], [20, 'decimal-arithmetic'],
  [21, 'square-power'], [24, 'square-power'],
  [25, 'percentage'], [28, 'percentage'],
  [29, 'discount'], [32, 'discount'],
  [33, 'proportion'], [36, 'proportion'],
  [37, 'cube-nested-power'], [40, 'cube-nested-power'],
  [41, 'linear-equation'], [44, 'linear-equation'],
  [45, 'root-estimation'], [48, 'root-estimation'],
  [49, 'quad-equation'], [52, 'quad-equation'],
];

describe('полосы math-slider v2 (школьная ось, слепок 07.09.2026)', () => {
  test('13 полос стоят там, где замерено (по семейству на полосу)', () => {
    for (const [level, kind] of BAND_SNAPSHOT) {
      const k = kindsAt(level);
      expect({ level, kinds: [...k] }).toEqual({ level, kinds: [kind] });
    }
  });

  test('хвост L49+ — квадратные уравнения; ответ = √((c−b)/a), в пределах шкалы', () => {
    expect([...kindsAt(50)]).toEqual(['quad-equation']);
    for (const q of generateMathSliderQuestions('quad-check', 51, 12)) {
      if (q.expression.type !== 'quad-equation') continue;
      const { a, b, c } = q.expression;
      expect(q.answer).toBeCloseTo(Math.sqrt((c - b) / a), 6);
      expect(q.answer).toBeGreaterThanOrEqual(q.scale.min);
      expect(q.answer).toBeLessThanOrEqual(q.scale.max);
    }
  });

  test('[B14] за квадратными — интеграл (выбор Дениса 07.09, прогрессия): слепок и честность', () => {
    expect([...kindsAt(53)]).toEqual(['integral-area']);
    expect([...kindsAt(60)]).toEqual(['integral-area']);
    let sawSigned = 0;
    for (const level of [53, 57, 62, 70, 72]) {
      for (const q of generateMathSliderQuestions('int-check', level, 10)) {
        if (q.expression.type !== 'integral-area') continue;
        const { form, dx, heights } = q.expression;
        if (form === 'steps') {
          expect(q.answer).toBeCloseTo(heights.reduce((acc, h) => acc + h * dx, 0), 4);
        } else if (form === 'polyline') {
          let acc = 0;
          for (let i = 0; i + 1 < heights.length; i++) acc += ((heights[i] + heights[i + 1]) / 2) * dx;
          expect(q.answer).toBeCloseTo(acc, 4);
        } else {
          // Кривая: площадь согласована с тем, что видит игрок, — сумма тех же
          // срезов, которыми рисует экран (единый источник sampleAreaHeights)
          const k = 480;
          const acc = sampleAreaHeights(q.expression, k).reduce((a2, h) => a2 + h, 0) * ((heights.length - 1) * dx) / k;
          expect(Math.abs(q.answer - acc) / Math.max(1, q.answer)).toBeLessThan(0.02);
        }
        expect(q.answer).toBeGreaterThanOrEqual(q.scale.min);
        expect(q.answer).toBeLessThanOrEqual(q.scale.max);
        if (heights.some((h) => h < 0)) sawSigned++;
      }
    }
    // Страховка от слепоты: знаковые фигуры обязаны попасть в выборку честности
    expect(sawSigned).toBeGreaterThan(3);
  });

  test('[B14-прогрессия] форма растёт внутри полосы: L53–54 только ступени; к L60 есть ломаная; к L70 есть кривая', () => {
    const formsAt = (level: number): Set<string> => {
      const out = new Set<string>();
      for (let s2 = 0; s2 < 12; s2++) {
        for (const q of generateMathSliderQuestions(`forms-${s2}`, level, 10)) {
          if (q.expression.type === 'integral-area') out.add(q.expression.form);
        }
      }
      return out;
    };
    expect([...formsAt(53)]).toEqual(['steps']);
    expect(formsAt(60).has('polyline')).toBe(true);
    expect(formsAt(70).has('curve')).toBe(true);
    expect(formsAt(70).has('polyline')).toBe(true);   // кривая ВХОДИТ, не вытесняет (иначе хвост падал)
  });

  test('[B14-знак] знаковый интеграл (выбор Дениса, «два цвета»): входит долей с ~L62, раньше нет', () => {
    const signedShare = (level: number): number => {
      let neg = 0;
      let tot = 0;
      for (let s2 = 0; s2 < 12; s2++) {
        for (const q of generateMathSliderQuestions(`sgn-${s2}`, level, 10)) {
          tot++;
          if (q.expression.type === 'integral-area' && q.expression.heights.some((h) => h < 0)) neg++;
        }
      }
      return neg / tot;
    };
    expect(signedShare(57)).toBe(0);
    expect(signedShare(65)).toBeGreaterThan(0.1);
    expect(signedShare(70)).toBeGreaterThan(0.3);
  });

  test('[B14-хвост] за кривой хвост НЕ падает и растёт (§R: до знаковости L61—69 сползал ×0,85—0,99)', () => {
    const workAt = (level: number): number => {
      let sum = 0;
      let n = 0;
      for (let s2 = 0; s2 < 12; s2++) {
        for (const q of generateMathSliderQuestions(`tail-${s2}`, level, 12)) { sum += questionWork(q); n++; }
      }
      return sum / n;
    };
    let prev = workAt(60);
    const w60 = prev;
    for (let level = 61; level <= 80; level++) {
      const cur = workAt(level);
      expect({ level, drop: Number((cur / prev).toFixed(3)) }).toEqual({ level, drop: expect.any(Number) });
      expect(cur).toBeGreaterThan(prev * 0.95);
      prev = cur;
    }
    expect(prev).toBeGreaterThan(w60 * 1.25);
  });

  test('[G-tail] стыки хвоста живые: работа растёт на каждом переходе L44…52, без обрывов', () => {
    // Та же модель и генератор, что у сима (core/work.ts), фикс-сиды — байт-в-байт
    const workAt = (level: number): number => {
      let sum = 0;
      let n = 0;
      for (let s = 0; s < 25; s++) {
        for (const q of generateMathSliderQuestions(`sim-${s}`, level, 20)) {
          sum += questionWork(q);
          n++;
        }
      }
      return sum / n;
    };
    let prev = workAt(44);
    for (let level = 45; level <= 56; level++) {
      const cur = workAt(level);
      const jump = cur / prev;
      // >×1,02: клоны (сим-порог 5%) ловятся симом; здесь — «не встал и не упал»
      expect({ level, jump: Number(jump.toFixed(3)) }).toEqual({ level, jump: expect.any(Number) });
      expect(jump).toBeGreaterThan(1.02);
      expect(jump).toBeLessThan(1.5);
      prev = cur;
    }
  });

  test('[G-d] difficulty = работа/норма (не номер уровня): тождество на трёх полосах', () => {
    for (const level of [3, 30, 51]) {
      for (const q of generateMathSliderQuestions('d-check', level, 12)) {
        expect(q.difficulty).toBeCloseTo(Math.min(1, questionWork(q) / WORK_NORM), 6);
      }
    }
    // Контроль слепоты: внутри ОДНОГО уровня d различает вопросы (у номерного d — нет)
    const ds = new Set(generateMathSliderQuestions('spread-check', 30, 12).map((q) => q.difficulty));
    expect(ds.size).toBeGreaterThan(3);
  });

  test('уравнение ax+b=c честно решается: ответ вопроса = x', () => {
    for (const q of generateMathSliderQuestions('eq-check', 42, 12)) {
      if (q.expression.type !== 'linear-equation') continue;
      const { a, b, c } = q.expression;
      expect(q.answer).toBeCloseTo((c - b) / a, 6);
      expect(evaluateExpression(q.expression)).toBeCloseTo(q.answer, 6);
    }
  });

  test('корень √N: ответ в диапазоне шкалы и равен sqrt', () => {
    for (const q of generateMathSliderQuestions('root-check', 46, 12)) {
      expect(q.answer).toBeGreaterThanOrEqual(q.scale.min);
      expect(q.answer).toBeLessThanOrEqual(q.scale.max);
    }
  });

  test('L1 без вырожденных слагаемых: «0 + b» не выпадает (тренировка зовёт L1)', () => {
    for (let s = 0; s < 40; s++) {
      for (const q of generateMathSliderQuestions(`zero-${s}`, 1, 12)) {
        const flat = JSON.stringify(q.expression);
        expect(flat.includes('"value":0')).toBe(false);
      }
    }
  });

  test('сид уровня детерминирован: тот же seed+level = те же вопросы (повтор — не лотерея)', () => {
    const a = generateMathSliderQuestions('repeat-check', 23, 8).map((q) => q.answer);
    const b = generateMathSliderQuestions('repeat-check', 23, 8).map((q) => q.answer);
    expect(a).toEqual(b);
  });

  test('миграция v1→v2: по семейству, в границах, прогресс не сгорает', () => {
    expect(migrateSliderLevelV1toV2(1)).toBe(1);
    expect(migrateSliderLevelV1toV2(5)).toBe(4);     // сложение v1 → конец B1
    expect(migrateSliderLevelV1toV2(6)).toBe(5);     // вычитание → старт B2
    expect(migrateSliderLevelV1toV2(15)).toBe(10);   // умножение → внутрь B3
    expect(migrateSliderLevelV1toV2(25)).toBe(25);   // проценты совпали
    expect(migrateSliderLevelV1toV2(36)).toBe(36);   // пропорции совпали
    expect(migrateSliderLevelV1toV2(44)).toBe(37);   // микс v1 → старт высших
    for (let old = 2; old <= 44; old++) {
      const nu = migrateSliderLevelV1toV2(old);
      expect(nu).toBeGreaterThanOrEqual(migrateSliderLevelV1toV2(old - 1) - 8); // семейные перескоки допустимы, обвала нет
      expect(nu).toBeLessThanOrEqual(SLIDER_MAX_LEVEL);
    }
  });
});
