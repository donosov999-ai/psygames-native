/* __tests__/ospan-ladder · VER 3 · 07.09.2026 */
/**
 * ГЕЙТ лестницы OSPAN v2 (07.09.2026). Замер ДО (counting-chat, прямой расчёт
 * формул v1): обрыв ×1,59 на L5→L6 (рубильник hardMath: треть пула — умножение
 * и числа 9→12 разом) и КЛОНЫ с L13 (обе формулы замирали: letterMs floor 600
 * на L13, setSize cap ещё раньше). v2: нагрузка mathLoad растёт плавно до L16+,
 * letterMs до L16; умножение ПОЯВЛЯЕТСЯ ровно с L6 (порог карточки правила).
 *
 * v3 (07.09, поручение Дениса «потолков нет — считать можно бесконечно»): кламп
 * mathLoad 1,5 СНЯТ, за L16 равенства идут школьной осью (n² → √N → a×b−c),
 * гейты G5–G7. Полы letterMs 500 и setSize 9 стоят (восприятие/охват, не счёт).
 *
 * Индекс трудности (модель, та же что в замере ДО, дополнена нагрузкой):
 *   work(L) = setSize × (1100 / letterMs) × (1 + 0,45·mathLoad + (hardMath ? 0,1 : 0))
 * Гейты: [G1] скачок соседних ≤ ×1,5 · [G2] рост монотонный до L16 (клонов
 * |Δ|<2% нет — формулы детерминированы, шума нет) · [G3] умножение с L6.
 */
import { levelParams, makeEquation } from '@/app/games/ospan';

const work = (L: number) => {
  const p = levelParams(L);
  return p.setSize * (1100 / p.letterMs) * (1 + 0.45 * p.mathLoad + (p.hardMath ? 0.1 : 0));
};

describe('лестница ospan v2 (счётная ось, 07.09.2026)', () => {
  test('[G1] скачок работы между соседними уровнями ≤ ×1,5 (обрыв ×1,59 не вернулся)', () => {
    const bad: string[] = [];
    for (let L = 2; L <= 20; L++) {
      const jump = work(L) / work(L - 1);
      if (jump > 1.5) bad.push(`L${L - 1}→L${L}: ×${jump.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  test('[G2] рост живой до L16: соседние уровни различимы (клоны с L13 не вернулись)', () => {
    for (let L = 2; L <= 16; L++) {
      expect(work(L)).toBeGreaterThan(work(L - 1) * 1.02);
    }
  });

  test('[G3] умножение появляется ровно с L6 (порог карточки правила hardmath)', () => {
    expect(levelParams(5).hardMath).toBe(false);
    expect(levelParams(6).hardMath).toBe(true);
  });

  test('поля лестницы на опорных уровнях (слепок)', () => {
    expect(levelParams(1)).toEqual({ setSize: 3, letterMs: 1100, hardMath: false, mathLoad: 0 });
    expect(levelParams(7)).toEqual({ setSize: 9, letterMs: 990, hardMath: true, mathLoad: 0.375 });
    expect(levelParams(13)).toEqual({ setSize: 9, letterMs: 660, hardMath: true, mathLoad: 1.125 });
    expect(levelParams(16)).toEqual({ setSize: 9, letterMs: 500, hardMath: true, mathLoad: 1.5 });
  });

  test('[G5] потолка НЕТ (§R, Денис 07.09): нагрузка и работа растут и за L16', () => {
    for (const L of [17, 20, 24, 32, 48]) {
      expect(levelParams(L).mathLoad).toBeGreaterThan(levelParams(L - 1).mathLoad);
      expect(work(L)).toBeGreaterThan(work(L - 1) * 1.005);
    }
    expect(levelParams(20).mathLoad).toBe(2);
  });

  test('[G6] ось форм открыта (§3 плана): n²(~16) → √N(~20) → a×b−c(~24) → x-равенства(~28) → 2^k(~31)', () => {
    const forms = (load: number) => {
      const seen = { sq: 0, rt: 0, ch: 0, xq: 0, pw: 0 };
      for (let i = 0; i < 700; i++) {
        const eq = makeEquation(load, true);
        if (eq.left.startsWith('x=')) seen.xq++;
        else if (eq.left.startsWith('2') && /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(eq.left) && !eq.left.includes('²')) seen.pw++;
        else if (eq.left.length === 2 && eq.left.includes('²')) seen.sq++;
        else if (/^\d+²$/.test(eq.left)) seen.sq++;
        else if (eq.left.includes('√')) seen.rt++;
        else if (eq.left.includes('×') && eq.left.includes('−')) seen.ch++;
      }
      return seen;
    };
    const early = forms(1.0);
    expect(early).toEqual({ sq: 0, rt: 0, ch: 0, xq: 0, pw: 0 });
    const mid = forms(2.2);
    expect(mid.sq).toBeGreaterThan(0);
    expect(mid.rt).toBeGreaterThan(0);
    expect(mid.ch + mid.xq + mid.pw).toBe(0);
    const late = forms(3.2);
    expect(late.ch).toBeGreaterThan(0);
    expect(late.xq).toBeGreaterThan(0);
    expect(late.pw).toBe(0);
    const top = forms(4.2);
    expect(top.xq).toBeGreaterThan(0);
    expect(top.pw).toBeGreaterThan(0);
  });

  test('[G7] каждое равенство честное: isCorrect совпадает с арифметикой строки left', () => {
    for (const load of [0.5, 1.6, 2.3, 3.2, 4.2]) {
      for (let i = 0; i < 400; i++) {
        const eq = makeEquation(load, true);
        let real: number;
        let m: RegExpMatchArray | null;
        if ((m = eq.left.match(/^x=(\d+): (\d+)x ([+−]) (\d+)$/))) real = m[3] === '+' ? +m[2] * +m[1] + +m[4] : +m[2] * +m[1] - +m[4];
        else if ((m = eq.left.match(/^2([⁰¹²³⁴⁵⁶⁷⁸⁹])$/))) real = 2 ** '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m[1]);
        else if ((m = eq.left.match(/^(\d+) × (\d+) − (\d+)$/))) real = +m[1] * +m[2] - +m[3];
        else if ((m = eq.left.match(/^√(\d+)$/))) real = Math.sqrt(+m[1]);
        else if ((m = eq.left.match(/^(\d+)²$/))) real = +m[1] * +m[1];
        else if ((m = eq.left.match(/^(\d+) × (\d+)$/))) real = +m[1] * +m[2];
        else if ((m = eq.left.match(/^(\d+) ([+-]) (\d+)$/))) real = m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
        else throw new Error('нераспознанное равенство: ' + eq.left);
        expect({ left: eq.left, ok: eq.isCorrect }).toEqual({ left: eq.left, ok: eq.right === real });
      }
    }
  });
});
