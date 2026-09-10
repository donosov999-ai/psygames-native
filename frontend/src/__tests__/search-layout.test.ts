/* psygames-search-layout-gate · VER 1 · 09.09.2026 */
/**
 * 🔴 ГЕОМЕТРИЯ РАЗДЕЛА «ПОИСК» НЕ ЗАВИСИТ ОТ ТЕЛЕФОНА И ОТ УРОВНЯ.
 *
 * ЗАЧЕМ. Замер 09.09.2026 на собранном бандле: центр поля гулял на 67 точек
 * (экран 390) и 97 (360), а нижняя полоса быстрого счёта была 133 на 390 против
 * 193 на 360 — тот же уровень, тот же экран, разные телефоны. В «Зарядке» игры
 * идут вперемешку, и человек видит именно этот скачок.
 *
 * ⚠️ ЗДЕСЬ ПРОГОНЯЮТСЯ ФУНКЦИИ, А НЕ ЧИТАЕТСЯ ИСХОДНИК. Числа в раздельном
 * модуле легко «проверить» глазами по константам — и пропустить, что формула на
 * узком экране даёт кнопку 31 px. Поэтому раскладка считается на четырёх
 * ширинах, а окно ответа — на всей лестнице и на каждом возможном `n`.
 * Единственная проверка по коду помечена отдельно и объяснена.
 */
import { ANSWER_BAR_H } from '@/src/games/attention/layout';
import {
  ANSWER_MAX, BTN_GAP, GUTTER_BOTH, MIN_TAP, SEARCH_BAR_H,
  answerGrid, reserveBottom,
} from '@/src/games/search/layout';
import { levelParams, QUICK_COUNT_LEVELS, answerChoices, answerWindow } from '@/app/games/quick-count';
import { исходникЭкрана } from './helpers/screenSource';

/** Телефоны, на которых обязана сходиться геометрия: от самого узкого до крупного. */
const ЭКРАНЫ = [320, 360, 390, 430];

describe('единая геометрия раздела «Поиск»', () => {
  it('есть что проверять: модуль отдаёт числа, а лестница не пуста', () => {
    expect(SEARCH_BAR_H).toBeGreaterThan(0);
    expect(QUICK_COUNT_LEVELS).toBeGreaterThan(10);
  });

  it('🔴 полоса ответа раздела РАВНА полосе «Внимания» — разделы не разъезжаются', () => {
    // В «Зарядке» пробы идут вперемешку И ЧЕРЕЗ РАЗДЕЛ. Свои 118 или 124 вернули
    // бы скачок, только реже — а редкий скачок ищут дольше, чем постоянный.
    expect(`Поиск ${SEARCH_BAR_H} = Внимание ${ANSWER_BAR_H}`).toBe(`Поиск ${SEARCH_BAR_H} = Внимание ${SEARCH_BAR_H}`);
  });

  it('🔴 число РЯДОВ кнопок одинаково на всех телефонах', () => {
    // Ровно то, что было сломано: на 390 вставало 4 кнопки в ряд, на 360 — три,
    // и полоса менялась со 133 на 193 при одном и том же уровне.
    const плохо: string[] = [];
    for (let n = 1; n <= ANSWER_MAX; n++) {
      const ряды = ЭКРАНЫ.map((w) => answerGrid(n, w).rows);
      if (new Set(ряды).size !== 1) плохо.push(`вариантов ${n}: ряды ${ряды.join('/')} на ${ЭКРАНЫ.join('/')}`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 кнопка никогда не мельче нормы пальца — даже на самом узком экране', () => {
    const мелкие: string[] = [];
    for (let n = 1; n <= ANSWER_MAX; n++) {
      for (const w of ЭКРАНЫ) {
        const g = answerGrid(n, w);
        if (g.size < MIN_TAP) мелкие.push(`вариантов ${n}, экран ${w}: кнопка ${g.size} < ${MIN_TAP}`);
      }
    }
    expect(мелкие).toEqual([]);
  });

  it('🔴 кнопки помещаются в полосу и по высоте, и по ширине', () => {
    const вылезли: string[] = [];
    for (let n = 1; n <= ANSWER_MAX; n++) {
      for (const w of ЭКРАНЫ) {
        const g = answerGrid(n, w);
        const высота = g.rows * g.size + (g.rows - 1) * BTN_GAP;
        const ширина = g.cols * g.size + (g.cols - 1) * BTN_GAP;
        if (высота > SEARCH_BAR_H) вылезли.push(`вариантов ${n}, экран ${w}: высота ${высота} > ${SEARCH_BAR_H}`);
        if (ширина > w - GUTTER_BOTH) вылезли.push(`вариантов ${n}, экран ${w}: ширина ${ширина} > ${w - GUTTER_BOTH}`);
      }
    }
    expect(вылезли).toEqual([]);
  });

  it('🔴 нулевой первый кадр не ломает раскладку', () => {
    // Веб-сборка на первом кадре отдаёт ширину 0; у соседей на этом уже горело.
    for (const мусор of [0, -50, Number.NaN]) {
      const g = answerGrid(ANSWER_MAX, мусор as number);
      expect(`ширина ${мусор}: кнопка ${g.size >= MIN_TAP}`).toBe(`ширина ${мусор}: кнопка true`);
    }
  });

  it('🔴 ВЕРНЫЙ ОТВЕТ ВСЕГДА В ОКНЕ — на каждом уровне и при каждом возможном n', () => {
    // Главное свойство окна. Полный диапазон `answerChoices` держит чужой гейт
    // `winnable-levels`; здесь — что сужение до ANSWER_MAX его не потеряло.
    const потеряли: string[] = [];
    for (let L = 1; L <= QUICK_COUNT_LEVELS; L++) {
      const p = levelParams(L) as { minN: number; maxN: number };
      for (let n = p.minN; n <= p.maxN; n++) {
        for (let сдвиг = 0; сдвиг < ANSWER_MAX; сдвиг++) {
          const окно = answerWindow(p, n, сдвиг);
          if (!окно.includes(n)) потеряли.push(`L${L} n=${n} сдвиг=${сдвиг}: окно ${окно.join(',')}`);
        }
      }
    }
    expect(потеряли.slice(0, 5)).toEqual([]);
  });

  it('🔴 вариантов на экране не больше, чем влезает', () => {
    const много: string[] = [];
    for (let L = 1; L <= QUICK_COUNT_LEVELS; L++) {
      const p = levelParams(L) as { minN: number; maxN: number };
      const окно = answerWindow(p, p.minN, 0);
      if (окно.length > ANSWER_MAX) много.push(`L${L}: ${окно.length} > ${ANSWER_MAX}`);
    }
    expect(много).toEqual([]);
  });

  it('🔴 верный ответ НЕ стоит всегда на одном месте — иначе он раздаётся даром', () => {
    // Окно «n−3…n+3» выглядело бы аккуратно и всегда клало бы верную кнопку в
    // середину: человек нашёл бы правило за три пробы и перестал считать точки.
    const p = levelParams(Math.floor(QUICK_COUNT_LEVELS / 2)) as { minN: number; maxN: number };
    const n = Math.round((p.minN + p.maxN) / 2);
    const места = new Set<number>();
    for (let сдвиг = 0; сдвиг < ANSWER_MAX; сдвиг++) места.add(answerWindow(p, n, сдвиг).indexOf(n));
    expect(`разных мест верного ответа: ${места.size > 1}`).toBe('разных мест верного ответа: true');
  });

  it('🔴 окно — подмножество полного диапазона, а не соседние числа наугад', () => {
    const чужие: string[] = [];
    for (let L = 1; L <= QUICK_COUNT_LEVELS; L++) {
      const p = levelParams(L) as { minN: number; maxN: number };
      const все = new Set(answerChoices(p));
      for (let сдвиг = 0; сдвиг < ANSWER_MAX; сдвиг++) {
        for (const v of answerWindow(p, p.maxN, сдвиг)) {
          if (!все.has(v)) чужие.push(`L${L}: ${v} вне полного диапазона`);
        }
      }
    }
    expect(чужие.slice(0, 5)).toEqual([]);
  });

  it('🔴 резерв низа равен ПОЛНОЙ высоте слота полосы, а не высоте кнопок', () => {
    // Каркас добавляет paddingTop 10, paddingBottom max(inset,10) и волосок.
    // Считать по одному SEARCH_BAR_H значило бы недобрать 21 точку.
    expect(reserveBottom(0)).toBe(SEARCH_BAR_H + 10 + 10 + 1);
    expect(reserveBottom(34)).toBe(SEARCH_BAR_H + 10 + 34 + 1);
    // Мусор из системы не должен давать отрицательный или нулевой резерв.
    expect(reserveBottom(Number.NaN)).toBe(reserveBottom(0));
  });

  it('🔴 ПО КОДУ (помечено): все пять игр без полосы берут резерв из модуля', () => {
    // Проверка по исходнику названа явно: сам факт «поле сдвинулось» меряется
    // браузером, а здесь сторожится, что число берётся из ОДНОГО места и никто
    // не вписал своё. Разъехавшиеся числа — ровно то, что чинил этот заход.
    const БЕЗ_ПОЛОСЫ = ['visual-search', 'find-differences', 'mahjong', 'schulte', 'object-tracker'];
    const свои = БЕЗ_ПОЛОСЫ.filter((g) => !/reserveBottom\(/.test(исходникЭкрана(g)));
    expect(свои).toEqual([]);
  });
});
