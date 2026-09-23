/**
 * @jest-environment node
 */
/**
 * ЗАПИСАННЫЕ РЕШЕНИЯ ВШИТЫХ УРОВНЕЙ — ПРОИГРЫВАЮТСЯ, А НЕ ПЕРЕСЧИТЫВАЮТСЯ.
 *
 * 🔴 ЗАЧЕМ ЭТА ПРОБА ЗАМЕНЯЕТ ПОИСК (задача af4c7ff1). Решаемость лестницы
 * доказывалась поиском на каждом уровне, и цена растёт с ветвлением: замер
 * 23.09.2026 на бюджете 20000 дал L1 — 119 мс, L5 — 4,2 с, L10 — 25,0 с, L20 —
 * больше минуты. В CI это выглядело как `cake-sort-levels` 1267 с и
 * `cake-sort-hint`, не уложившаяся в 43 минуты.
 *
 * Проигрывание ЗАПИСАННОГО решения не только дешевле — оно ДОКАЗАТЕЛЬНЕЕ:
 * видно конкретную последовательность ходов, которая разбирает стол, а не
 * «поиск что-то нашёл и не сказал что». Если правила игры изменятся, записанный
 * путь перестанет играться, и проба назовёт уровень и ход — поиск в такой
 * ситуации просто молча пойдёт другой дорогой.
 *
 * ⚠️ ПУТЬ НЕ ОБЯЗАН БЫТЬ КРАТЧАЙШИМ. Его ищет луч (`beamMoves`), а минимум для
 * звёзд считается отдельно (`min` в `levels.json`) точным поиском.
 */
import { isCleared, makeBoard, moveType, type Board } from '@/src/games/cake-sort/core/plate';
import { prebuilt, PREBUILT_COUNT } from '@/src/games/cake-sort/core/prebuilt';
import { prebuiltSolution, solutionsCount } from '@/src/games/cake-sort/core/solutions';

const доскаУровня = (L: number): Board | null => {
  const p = prebuilt(L);
  return p ? makeBoard(p.plates, p.queue) : null;
};

/** Проигрывает ходы и возвращает, на каком ходу сломалось (или −1, если дошли). */
function проиграть(b: Board, ходы: { from: number; type: number; to: number }[]): { шаг: number; стол: Board } {
  let стол = b;
  for (let i = 0; i < ходы.length; i += 1) {
    const m = ходы[i] as { from: number; type: number; to: number };
    const следующая = moveType(стол, m.from, m.type, m.to);
    if (!следующая) return { шаг: i, стол };
    стол = следующая;
  }
  return { шаг: -1, стол };
}

describe('записанные решения вшитых уровней', () => {
  it('есть что проверять: решение записано каждому вшитому уровню', () => {
    expect(PREBUILT_COUNT).toBeGreaterThanOrEqual(120);
    expect(solutionsCount()).toBe(PREBUILT_COUNT);
    // Пустой список ходов — это «уровень уже решён»: такого среди вшитых быть не может.
    const пустые = Array.from({ length: PREBUILT_COUNT }, (_, i) => i + 1)
      .filter((L) => (prebuiltSolution(L) ?? []).length === 0);
    expect(пустые).toEqual([]);
  });

  it('🔴 КАЖДОЕ решение проигрывается и разбирает стол до конца', () => {
    const плохо: string[] = [];
    let ходовВсего = 0;
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const b = доскаУровня(L);
      const ходы = prebuiltSolution(L);
      if (!b || !ходы) { плохо.push(`L${L}: нет доски или решения`); continue; }
      ходовВсего += ходы.length;
      const { шаг, стол } = проиграть(b, ходы);
      if (шаг >= 0) {
        const m = ходы[шаг] as { from: number; type: number; to: number };
        плохо.push(`L${L}: ход ${шаг + 1} из ${ходы.length} незаконен (${m.from}→${m.to}, вид ${m.type})`);
        continue;
      }
      if (!isCleared(стол)) плохо.push(`L${L}: ходы кончились, а стол не разобран`);
    }
    expect(плохо).toEqual([]);
    // Порядок величины: сто двадцать уровней это тысячи ходов, а не десятки.
    expect(ходовВсего).toBeGreaterThan(3000);
  });

  it('🔴 первый ход решения законен на нетронутой доске — с него начинается подсказка', () => {
    const плохо: string[] = [];
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const b = доскаУровня(L);
      const ходы = prebuiltSolution(L);
      if (!b || !ходы?.length) continue;
      const m = ходы[0] as { from: number; type: number; to: number };
      if (!moveType(b, m.from, m.type, m.to)) плохо.push(`L${L}: ${m.from}→${m.to}, вид ${m.type}`);
    }
    expect(плохо).toEqual([]);
  });

  it('решение возвращается КОПИЕЙ — экран режет путь по мере ходов', () => {
    // Отдай общий массив, и первый же сыгранный уровень укоротил бы путь всем
    // остальным: следующая партия получила бы обрезок вместо решения.
    const первый = prebuiltSolution(1)!;
    первый.shift();
    expect(prebuiltSolution(1)!.length).toBe(первый.length + 1);
  });

  it('у уровня за пределами вшитых решения нет — и это не поломка', () => {
    expect(prebuiltSolution(PREBUILT_COUNT + 50)).toBeNull();
  });
});
