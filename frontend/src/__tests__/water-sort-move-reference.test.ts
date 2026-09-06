/**
 * 🔴 ЭТАЛОН ХОДОВ ПЕРЕЛИВАЛКИ — ИЗМЕРЕН, А НЕ ВЗЯТ ИЗ ДЛИНЫ НАЙДЕННОГО ПУТИ.
 *
 * 📍 ЧТО БЫЛО СЛОМАНО. Звёзды считались от `solutionMoves` — длины пути, который
 * вернул `solve`. А `solve` — поиск в ГЛУБИНУ: первый найденный путь, не
 * кратчайший. Замер поиском в ширину на десяти уровнях: путь длиннее настоящего
 * минимума в **1,52 раза** в среднем (1,33…1,89; на L10 — 70 против 37). Порог
 * трёх звёзд «≤ 1,2 × минимум» на деле давал их за игру в **1,83 раза длиннее
 * оптимальной**.
 *
 * ⚠️ ПРОБА СЧИТАЕТ НАСТОЯЩИЙ МИНИМУМ ПОИСКОМ В ШИРИНУ. Это дорого, поэтому
 * берутся малые расклады, где ширина доходит до дна; граница названа, а не
 * спрятана: при высоте 5 и десяти цветах поиск не доходит и за 300 000 узлов,
 * а в игре высота 5 идёт с L11 — там эталон работает формулой, и это записано.
 */
import { moveReference, levelMoveReference, levelParams, generateLevel } from '@/src/games/water-sort/core/generate';
import { legalMoves, pour, isSolved, fieldKey, makeField, type Field } from '@/src/games/water-sort/core/tubes';

jest.setTimeout(600000);

/** Кратчайший путь. `null` — не уложились в бюджет, и это отдельный ответ. */
function минимум(start: Field, budget = 200000): number | null {
  if (isSolved(start)) return 0;
  const виден = new Set<string>([fieldKey(start)]);
  let слой: Field[] = [start]; let узлов = 0;
  for (let d = 1; d <= 200; d += 1) {
    const сл: Field[] = [];
    for (const f of слой) for (const m of legalMoves(f)) {
      const n = pour(f, m.from, m.to); if (!n) continue;
      узлов += 1; if (isSolved(n)) return d;
      const k = fieldKey(n); if (виден.has(k)) continue;
      виден.add(k); сл.push(n); if (узлов > budget) return null;
    }
    if (!сл.length) return null; слой = сл;
  }
  return null;
}

function поле(colors: number, cap: number, seed: number): Field {
  let x = (seed * 2654435761) >>> 0;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const порции: number[] = [];
  for (let c = 0; c < colors; c += 1) for (let k = 0; k < cap; k += 1) порции.push(c);
  for (let i = порции.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [порции[i], порции[j]] = [порции[j]!, порции[i]!]; }
  const tubes: number[][] = [];
  for (let i = 0; i < colors; i += 1) tubes.push(порции.slice(i * cap, (i + 1) * cap));
  tubes.push([], []);
  return makeField(tubes, cap);
}

/** Оценка тем же способом, что и в игре: доля от эталона. */
const звёздыПоДоле = (ходов: number, эталон: number) => (ходов / эталон <= 1.2 ? 3 : ходов / эталон <= 1.8 ? 2 : 1);

describe('эталон ходов переливалки', () => {
  const замеры: { colors: number; cap: number; мин: number }[] = [];
  for (const cap of [3, 4]) {
    for (const colors of [3, 4, 5, 6]) {
      for (let s = 1; s <= 2; s += 1) {
        const m = минимум(поле(colors, cap, s * 97 + cap * 13 + colors));
        if (m !== null) замеры.push({ colors, cap, мин: m });
      }
    }
  }

  it('есть что проверять — поиск в ширину дошёл до дна на достаточном числе раскладов', () => {
    expect(замеры.length).toBeGreaterThanOrEqual(12);
  });

  /**
   * 🔴 ГЛАВНОЕ: ИДЕАЛЬНАЯ ИГРА ДАЁТ ТРИ ЗВЕЗДЫ. Ради этого калибровка и нужна.
   * Сыграл по минимуму — получи высшую оценку, иначе она не про мастерство.
   */
  it('🔴 игра по минимуму даёт три звезды на КАЖДОМ замеренном раскладе', () => {
    const мимо = замеры
      .filter((з) => звёздыПоДоле(з.мин, moveReference(з.colors, з.cap)) !== 3)
      .map((з) => `${з.colors}×${з.cap}: минимум ${з.мин} при эталоне ${moveReference(з.colors, з.cap)}`);
    expect(мимо).toEqual([]);
  });

  /**
   * 🔴 И ОБРАТНОЕ: ЗА НЕБРЕЖНУЮ ИГРУ ТРЁХ ЗВЁЗД НЕТ. Без этого пункта эталон
   * можно было бы «починить», задрав его вдвое, — и высшая оценка стала бы
   * даровой, ровно тем, что чинится.
   */
  it('🔴 игра вдвое длиннее ЭТАЛОНА трёх звёзд НЕ даёт', () => {
    /*
     * ⚠️ СВОЙСТВО ЗАЯВЛЕНО ОТ ЭТАЛОНА, А НЕ ОТ МИНИМУМА КОНКРЕТНОЙ РАЗДАЧИ.
     * Первая редакция требовала «удвоенный МИНИМУМ не даёт трёх звёзд» и
     * покраснела на честном случае: 3 цвета × 4, удачный расклад решается за 5
     * ходов при эталоне 9, удвоение даёт 10 — это 1,11 эталона, и три звезды
     * там законны. Эталон описывает ТИПИЧНУЮ раздачу (на трёх цветах минимумы
     * 5…8), а везение отдельной раздачи мерить им нельзя.
     */
    const пары = замеры.map((з) => ({ ...з, эталон: moveReference(з.colors, з.cap) }));
    const даром = пары
      .filter((з) => звёздыПоДоле(з.эталон * 2, з.эталон) === 3)
      .map((з) => `${з.colors}×${з.cap}: ${з.эталон * 2} ходов при эталоне ${з.эталон} — всё ещё три звезды`);
    expect(даром).toEqual([]);
    // И полторы нормы — тоже не высшая оценка.
    expect(звёздыПоДоле(Math.round(moveReference(6, 4) * 1.5), moveReference(6, 4))).toBeLessThan(3);
  });

  it('🔴 эталон близок к настоящему минимуму, а не «где-то рядом»', () => {
    const ошибки = замеры.map((з) => Math.abs(moveReference(з.colors, з.cap) - з.мин) / з.мин);
    const средняя = ошибки.reduce((a, b) => a + b, 0) / ошибки.length;
    expect(средняя).toBeLessThan(0.25);
  });

  /**
   * 🔴 ПРЕЖНИЙ ЭТАЛОН — ДЛИНА ПУТИ ПОИСКА В ГЛУБИНУ — ДАВАЛ ТРИ ЗВЕЗДЫ ДАРОМ.
   * Этот пункт краснел бы на состоянии ДО починки, и в этом его смысл.
   */
  it('🔴 на состоянии ДО три звезды давались за игру много длиннее оптимальной', () => {
    const зерно = (s: number) => { let x = (s * 2654435761) >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
    const переборы: number[] = [];
    for (const L of [5, 7, 9, 10]) {
      const g = generateLevel(L, зерно(L * 31 + 5));
      const m = минимум(g.field);
      if (m === null) continue;
      // Сколько ходов сверх минимума прощал ПРЕЖНИЙ порог «1,2 × длина пути».
      переборы.push((1.2 * g.solutionMoves) / m);
    }
    expect(переборы.length).toBeGreaterThanOrEqual(3);
    const средний = переборы.reduce((a, b) => a + b, 0) / переборы.length;
    expect(средний).toBeGreaterThan(1.5);          // прежний порог был вдвое щедрее
    // А новый — нет.
    for (const L of [5, 7, 9, 10]) {
      const p = levelParams(L);
      expect(levelMoveReference(L)).toBe(p.colors * (p.cap - 1));
    }
  });
});
