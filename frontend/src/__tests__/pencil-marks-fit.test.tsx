/* psygames-gate-pencil-fit · VER 1 · 08.09.2026 */
/**
 * ТРИ ПОМЕТКИ ОБЯЗАНЫ ВЛЕЗАТЬ В ОДИН РЯД.
 *
 * 🔴 ЗАЧЕМ. Отчёт тестировщиков `faecbd12`: «пометки не работают — цифры пляшут мимо
 * квадратиков, больше одной не поставить». Механика при этом была цела (её держат 27
 * проб в `sudoku-pencil.test.ts`), ломалась ТОЛЬКО геометрия: слот считался как треть
 * КЛЕТКИ, а слой лежит внутри рамки, и трети клетки там нет.
 *
 * 📍 ЗАМЕР 08.09.2026 в браузере (клетка 48, слоты по 16, коробочная модель как у
 * react-native-web):
 *
 *   рамка 2 (граница блока) → внутрь 46, в первом ряду 2 цифры, рядов 5, стопка 80,
 *                             вылезает за клетку на 32 точки;
 *   рамка 1 (обычная линия) → внутрь 47, ровно то же самое — дефект во ВСЕХ клетках;
 *   слот ⌊(48−2)/3⌋ = 15    → в ряду 3, рядов 3, стопка 45,8, внутри клетки.
 *
 * ⚠️ ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ ВЫЗОВОМ. Компонент действительно рендерится, и ширины
 * слотов читаются из ОТДАННЫХ ИМ СТИЛЕЙ, а не из исходника. Пороги записаны ЛИТЕРАЛАМИ:
 * проба через собственную константу двигала бы оба конца сразу и не мерила бы ничего.
 */
import React from 'react';
import { Text } from 'react-native';
import { PencilMarksLayer } from '@/src/components/PencilMarksLayer';
import { PENCIL_CELL_BORDER, pencilSlotSize, pencilFontSize } from '@/src/services/pencilMarks';
import { contrastRatio } from '@/src/services/onGradientText';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

/**
 * Смонтировать слой и отдать дерево. Гасим ВСЕГДА (unmount в конце пробы): непогашенный
 * экран убивает весь прогон без единого FAIL — граблю ловили 06.09.2026.
 */
function mount(props: { digits: number[]; cellSize: number; slots?: number; color?: string }) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(<PencilMarksLayer color="#333" {...props} />);
  });
  return {
    tree: r,
    slots: () => r.root.findAllByType(Text),
    style: (n: any) => (Array.isArray(n.props.style) ? Object.assign({}, ...n.props.style) : n.props.style),
    unmount: () => TestRenderer.act(() => r.unmount()),
  };
}

/** Ширины слотов, как их получил рендер компонента. */
function slotWidths(cellSize: number, digits = [1, 2, 3], slots = 9): number[] {
  const m = mount({ digits, cellSize, slots });
  const widths = m.slots().map((n: any) => m.style(n).width as number);
  m.unmount();
  return widths;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ГЕОМЕТРИЯ: ТРИ СЛОТА В СТРОКУ, СЧИТАЯ ПО САМОЙ ТОЛСТОЙ РАМКЕ
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 три слота влезают в клетку — при любой её стороне', () => {
  // Реальные стороны клетки: 6×6 на узком телефоне ≈ 52, 9×9 ≈ 36, самурай в зуме ≈ 26,
  // планшет ≈ 64. Порог 24 — нижняя граница показа пометок (PENCIL_MIN_CELL).
  const SIDES = [24, 26, 30, 33, 36, 40, 44, 48, 52, 58, 64, 72, 96];

  it('🔴 три ширины слота ≤ внутреннего бокса клетки с рамкой в 2 точки', () => {
    for (const side of SIDES) {
      const w = slotWidths(side);
      expect(`клетка ${side}: слотов ${w.length}`).toBe(`клетка ${side}: слотов 9`);
      // 2 — самая толстая рамка судоку (граница блока). Литерал, не константа.
      expect(`клетка ${side}: ${w[0] * 3} ≤ ${side - 2}`).toBe(`клетка ${side}: ${w[0] * 3} ≤ ${side - 2}`);
      expect(w[0] * 3).toBeLessThanOrEqual(side - 2);
      expect(new Set(w).size).toBe(1);        // все слоты одинаковы — иначе ряд поедет
    }
  });

  it('🔴 и ровно ТРИ, а не два: слот не ужат до неразличимого', () => {
    // Верхняя граница: слот обязан быть не мельче трети минус одна точка, иначе
    // «влезает» достигалось бы схлопыванием цифры в пыль.
    for (const side of SIDES) {
      const w = slotWidths(side)[0];
      expect(`клетка ${side}: слот ${w} ≥ ${Math.floor(side / 3) - 1}`)
        .toBe(`клетка ${side}: слот ${w} ≥ ${Math.floor(side / 3) - 1}`);
      expect(w).toBeGreaterThanOrEqual(Math.floor(side / 3) - 1);
    }
  });

  it('🔴 КОНТРПРОБА: прежняя треть клетки эту проверку валит', () => {
    // Ровно то, что стояло в четырёх экранах до 08.09.2026.
    for (const side of [24, 36, 48, 64]) {
      expect(`клетка ${side}: (side/3)*3 = ${(side / 3) * 3} > ${side - 2}`)
        .toBe(`клетка ${side}: (side/3)*3 = ${side} > ${side - 2}`);
      expect((side / 3) * 3).toBeGreaterThan(side - 2);
    }
  });

  it('🔴 КОНТРПРОБА: и «cell / 3.2» из глубокого фрактала тоже — при клетке с полями', () => {
    // Там слой стоял в потоке с paddingHorizontal: 1 с двух сторон, то есть внутрь
    // оставалось side − 2 (рамка) − 2 (поля). Магическая 3.2 спасала только от 64.
    const fits = (side: number) => (side / 3.2) * 3 <= side - 4;
    expect(`24: ${fits(24)} · 36: ${fits(36)} · 48: ${fits(48)} · 64: ${fits(64)}`)
      .toBe('24: false · 36: false · 48: false · 64: true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. СЛОТЫ СТОЯТ НА МЕСТАХ, А НЕ СЪЕЗЖАЮТ СПИСКОМ
// ─────────────────────────────────────────────────────────────────────────────

describe('неподвижная сетка кандидатов', () => {
  it('🔴 отсутствующая цифра прозрачна, но место занимает', () => {
    const m = mount({ digits: [2, 7], cellSize: 48 });
    const nodes = m.slots();
    expect(nodes.length).toBe(9);                       // все девять слотов на месте
    const colorOf = (i: number) => m.style(nodes[i]).color;
    expect([colorOf(1), colorOf(6)]).toEqual(['#333', '#333']);   // двойка и семёрка видны
    expect([colorOf(0), colorOf(8)]).toEqual(['transparent', 'transparent']);
    expect(nodes.map((n: any) => n.props.children)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    m.unmount();
  });

  it('на доске 6×6 слотов шесть — семёрки там не существует', () => {
    const m = mount({ digits: [1, 5], cellSize: 52, slots: 6 });
    expect(m.slots().map((n: any) => n.props.children)).toEqual([1, 2, 3, 4, 5, 6]);
    m.unmount();
  });

  it('пустая клетка не рисует ничего — иначе девять прозрачных цифр на каждой клетке доски', () => {
    const m = mount({ digits: [], cellSize: 48 });
    expect(m.tree.toJSON()).toBeNull();
    m.unmount();
  });

  it('🔴 слой не перехватывает касаний — палец попадает в клетку, а не в цифру поверх неё', () => {
    const m = mount({ digits: [1], cellSize: 48 });
    expect(m.tree.toJSON()!.props.pointerEvents).toBe('none');
    m.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ЧИСТАЯ АРИФМЕТИКА — ЛИТЕРАЛАМИ
// ─────────────────────────────────────────────────────────────────────────────

describe('pencilSlotSize и кегль', () => {
  it('считает по внутреннему боксу, а не по стороне клетки', () => {
    expect(pencilSlotSize(48)).toBe(15);      // ⌊(48−2)/3⌋
    expect(pencilSlotSize(36)).toBe(11);      // ⌊(36−2)/3⌋ = 11,33 → 11
    expect(pencilSlotSize(24)).toBe(7);       // ⌊(24−2)/3⌋ = 7,33 → 7
    expect(pencilSlotSize(48, 1)).toBe(15);   // волосяная линия — та же треть
    expect(PENCIL_CELL_BORDER).toBe(2);       // самая толстая рамка судоку
  });

  it('слот не уходит в ноль и не становится отрицательным на вырожденной клетке', () => {
    expect(pencilSlotSize(0)).toBe(1);
    expect(pencilSlotSize(2)).toBe(1);
  });

  it('кегль держит прежнюю пропорцию и не падает ниже читаемого', () => {
    expect(pencilFontSize(15)).toBe(11);      // было Math.max(6, 48 × 0.235) = 11,28
    expect(pencilFontSize(11)).toBe(8);
    expect(pencilFontSize(1)).toBe(6);        // пол
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ПОМЕТКУ ВИДНО НА ЛЮБОМ ФОНЕ КЛЕТКИ
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 пометка читается и на выделенной клетке', () => {
  /**
   * 📍 ЗАМЕР 08.09.2026 на живом экране (Metro из этого дерева, судоку 6×6):
   * пометка `#6e6e73` на выделенной клетке `#5b4fd1` — контраст 1,19 при планке 4,5;
   * на обычной клетке `#f3f3fb` — 4,59. То есть первую пометку было не видно ровно
   * до того, как уйдёшь с клетки, — вторая половина жалобы «больше одной не поставить».
   *
   * Планка записана ЛИТЕРАЛОМ: взять её у проверяемого — двигать оба конца разом.
   */
  const contrast = (fg: string, bg: string) => contrastRatio(fg, bg);

  const shownColor = (color: string, on?: string) => {
    const m = mount({ digits: [1], cellSize: 48, color, ...(on ? { on } : {}) } as any);
    const c = m.style(m.slots()[0]).color;
    m.unmount();
    return c;
  };

  it('🔴 на выделенной клетке слой берёт читаемый цвет вместо заданного', () => {
    const ЗАДАННЫЙ = '#6e6e73';
    const ВЫДЕЛЕНИЕ = '#5b4fd1';
    expect(+contrast(ЗАДАННЫЙ, ВЫДЕЛЕНИЕ).toFixed(2)).toBeLessThan(4.5);   // так было
    const shown = shownColor(ЗАДАННЫЙ, ВЫДЕЛЕНИЕ);
    expect(`показан ${shown === ЗАДАННЫЙ ? 'нечитаемый заданный' : 'подобранный'}`)
      .toBe('показан подобранный');
    expect(contrast(shown, ВЫДЕЛЕНИЕ)).toBeGreaterThanOrEqual(4.5);
  });

  it('на читаемом фоне цвет НЕ подменяется — иначе пометки поплывут по доске', () => {
    const ЗАДАННЫЙ = '#6e6e73';
    expect(contrast(ЗАДАННЫЙ, '#f3f3fb')).toBeGreaterThanOrEqual(4.5);
    expect(shownColor(ЗАДАННЫЙ, '#f3f3fb')).toBe(ЗАДАННЫЙ);
  });

  it('без фона слой ничего не выдумывает — цвет остаётся заданным', () => {
    expect(shownColor('#6e6e73')).toBe('#6e6e73');
  });

  it('незнакомый формат фона не роняет экран и не портит цвет', () => {
    expect(shownColor('#6e6e73', 'rgba(0,0,0,0.5)')).toBe('#6e6e73');
    expect(shownColor('#6e6e73', 'какой-то')).toBe('#6e6e73');
  });

  it('🔴 КОНТРПРОБА: планка 4,5 — не украшение, красная клетка ошибки её тоже не проходит', () => {
    // Второй тёмный фон судоку: клетка с неверной цифрой под выделением (#ef4444).
    expect(contrast('#6e6e73', '#ef4444')).toBeLessThan(4.5);
    expect(contrast(shownColor('#6e6e73', '#ef4444'), '#ef4444')).toBeGreaterThanOrEqual(4.5);
  });
});
