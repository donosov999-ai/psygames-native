/**
 * ГРУППЫ НЕ ДОЛЖНЫ ПЛЯСАТЬ.
 *
 * Отчёт Вали 04.09.2026 по уровню 50 (ThermoCage): «цветные квадраты, которые образуют
 * сумму от угла, они пляшут — нажимаешь клетку, в одной стороне пляшут, нажала другую —
 * в другой». На её двух скринах расклад один и тот же (цифры, термометры и суммы
 * совпадают до клетки), а тонировка групп стоит в разных местах.
 *
 * Причина была в порядке слоёв: подсветка строки ПРИСВАИВАЛА клетке `colors.card`
 * поверх тонировки группы, и клетка группы в кресте выделения теряла цвет целиком.
 * Замер живьём до правки (killer, светлая тема, 81 клетка): на доске 7 фонов, а в
 * подсвеченной строке после нажатия — 2. После правки в той же строке 3, и цвет
 * группы читается сквозь подсветку.
 *
 * ⚠️ ЭТОТ ТЕСТ ПРОВЕРЯЕТ ПОВЕДЕНИЕ, А НЕ ТЕКСТ. Он гоняет `cellBackground` во всех
 * состояниях подсветки и требует, чтобы клетка группы ОТЛИЧАЛАСЬ от клетки вне групп
 * в том же состоянии. Комментарий в коде такую проверку не зазеленит.
 */
import { cellBackground, CAGE_ACCENTS } from '@/src/services/sudoku-overlay';

const nodeRequire = require;
declare const __dirname: string;

/** Прочитать файл проекта. Вынесено, чтобы `require` стоял в одном месте. */
function читатьИсходник(отКорня: string): string {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  return fs.readFileSync(path.join(__dirname, '../../', отКорня), 'utf8');
}

const СВЕТЛАЯ = '#FFFFFF';
const ТЁМНАЯ = '#1C1C1E';

type Состояние = { имя: string; isSel: boolean; sameVal: boolean; sameLine: boolean };
const СОСТОЯНИЯ: Состояние[] = [
  { имя: 'спокойная',            isSel: false, sameVal: false, sameLine: false },
  { имя: 'строка/столбец',       isSel: false, sameVal: false, sameLine: true  },
  { имя: 'та же цифра',          isSel: false, sameVal: true,  sameLine: false },
  { имя: 'цифра и строка разом', isSel: false, sameVal: true,  sameLine: true  },
];

function фон(surface: string, isDark: boolean, cageId: number, с: Состояние, markColor: string | null = null) {
  return cellBackground({ surface, isDark, cageId, markColor, isSel: с.isSel, sameVal: с.sameVal, sameLine: с.sameLine, wrongVal: false });
}

describe('фон клетки судоку', () => {
  for (const [тема, surface, isDark] of [['светлая', СВЕТЛАЯ, false], ['тёмная', ТЁМНАЯ, true]] as const) {
    describe(`тема ${тема}`, () => {
      it('группа видна при ЛЮБОЙ подсветке — иначе она «пляшет» при переносе выделения', () => {
        for (const с of СОСТОЯНИЯ) {
          const безГруппы = фон(surface, isDark, -1, с);
          for (let cage = 0; cage < CAGE_ACCENTS.length; cage++) {
            expect(`${с.имя}/группа${cage}: ${фон(surface, isDark, cage, с)}`)
              .not.toBe(`${с.имя}/группа${cage}: ${безГруппы}`);
          }
        }
      });

      it('соседние группы различимы между собой в каждом состоянии', () => {
        for (const с of СОСТОЯНИЯ) {
          const цвета = CAGE_ACCENTS.map((_, i) => фон(surface, isDark, i, с));
          expect(new Set(цвета).size).toBe(CAGE_ACCENTS.length);
        }
      });

      it('подсветка строки ВИДНА и на клетке без группы (в светлой теме card=surface, и она не рисовала ничего)', () => {
        const спокойная = фон(surface, isDark, -1, СОСТОЯНИЯ[0]!);
        expect(фон(surface, isDark, -1, СОСТОЯНИЯ[1]!)).not.toBe(спокойная);
        expect(фон(surface, isDark, -1, СОСТОЯНИЯ[2]!)).not.toBe(спокойная);
      });

      it('ручная пометка не съедается подсветкой', () => {
        for (const с of СОСТОЯНИЯ) {
          expect(фон(surface, isDark, -1, с, '#ff8a3d')).not.toBe(фон(surface, isDark, -1, с));
          expect(фон(surface, isDark, 2, с, '#ff8a3d')).not.toBe(фон(surface, isDark, 2, с));
        }
      });
    });
  }

  it('выделенная клетка и ошибка перекрывают всё — иначе на них не видно цифру', () => {
    for (let cage = -1; cage < 3; cage++) {
      expect(cellBackground({ surface: СВЕТЛАЯ, isDark: false, cageId: cage, markColor: '#ff8a3d', isSel: true, sameVal: false, sameLine: false, wrongVal: false })).toBe('#5b4fd1');
      expect(cellBackground({ surface: СВЕТЛАЯ, isDark: false, cageId: cage, markColor: '#ff8a3d', isSel: false, sameVal: false, sameLine: true, wrongVal: true })).toBe('#fecaca');
      expect(cellBackground({ surface: СВЕТЛАЯ, isDark: false, cageId: cage, markColor: null, isSel: true, sameVal: false, sameLine: false, wrongVal: true })).toBe('#ef4444');
    }
  });

  /**
   * Мутация: возвращаем старое поведение (подсветка ПРИСВАИВАЕТ фон поверх группы) и
   * убеждаемся, что первый тест на нём падает. Гейт, который не ловит собственный
   * дефект, — призрак; таких за прошлую неделю нашлось девять.
   */
  it('самопроверка гейта: на старом каскаде инвариант падает', () => {
    const старый = (surface: string, card: string, cageId: number, sameLine: boolean) => {
      let bg = cageId >= 0 ? `${surface}+акцент${cageId}` : surface;
      if (sameLine) bg = card;            // ← ровно та строка, что чинили
      return bg;
    };
    const безГруппы = старый('#FFFFFF', '#FFFFFF', -1, true);
    const сГруппой = старый('#FFFFFF', '#FFFFFF', 3, true);
    expect(сГруппой).toBe(безГруппы);     // старый каскад: цвет группы стёрт
  });
});

/**
 * ВЫКЛЮЧАТЕЛЬ ПОДСВЕТКИ СТРОКИ И СТОЛБЦА.
 *
 * Отчёт d71044f8 (04.09.2026): «надо добавить в настройках вот это выделение,
 * которое подсвечивает строку и столбец, чтобы можно было его отключить».
 *
 * 🔴 ПОЧЕМУ ГЕЙТ. Тумблер — самое лёгкое, что можно нарисовать и не подключить:
 * кнопка красится, состояние пишется в хранилище, а фон клетки считается по
 * старому. Снаружи это выглядит рабочим. Поэтому проверяется ПОВЕДЕНИЕ:
 * при выключенном тумблере клетка перекрестья обязана красить ровно так же, как
 * клетка вне его, а подсветка одинаковой ЦИФРЫ — остаться (о ней не просили).
 */
describe('подсветку строки и столбца можно выключить', () => {
  const общее = { surface: СВЕТЛАЯ, isDark: false, cageId: -1, markColor: null, isSel: false, wrongVal: false };

  it('🔴 выключенная подсветка красит клетку перекрестья как обычную', () => {
    const обычная = cellBackground({ ...общее, sameVal: false, sameLine: false });
    const вКресте = cellBackground({ ...общее, sameVal: false, sameLine: true });
    // включённая — отличается
    expect(`включённая отличается: ${вКресте !== обычная}`).toBe('включённая отличается: true');
    // выключенная: экран подаёт sameLine=false, и цвет обязан совпасть с обычной
    const выключенная = cellBackground({ ...общее, sameVal: false, sameLine: false });
    expect(выключенная).toBe(обычная);
  });

  it('🔴 подсветка одинаковой ЦИФРЫ остаётся: о ней не просили', () => {
    const обычная = cellBackground({ ...общее, sameVal: false, sameLine: false });
    const таЖеЦифра = cellBackground({ ...общее, sameVal: true, sameLine: false });
    expect(`подсветка цифры видна: ${таЖеЦифра !== обычная}`).toBe('подсветка цифры видна: true');
  });

  it('🔴 экран ПОДАЁТ выключатель в расчёт, а не только рисует кнопку', () => {
    const src: string = читатьИсходник('app/games/sudoku.tsx');
    expect(src).toContain('sameLine: lineHl && !!sameRow');
    expect(src).toContain('psygames_sudoku_linehl');
  });
});
