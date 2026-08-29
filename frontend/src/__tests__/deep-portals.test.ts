/* psygames-deep-portals-test · VER 1 · 29.08.2026 */
/**
 * ПОРТАЛЫ БЕЗДНЫ (X5) — босс-приём на ленивом дереве.
 *
 * Классы багов, которые тут сторожатся:
 *  · нечестная пара: доска порознь ОДНОЗНАЧНА (портал — декорация, вывод и так есть)
 *    или вместе НЕ единственна («второе решение с полным правом», класс L30 evenodd);
 *  · разъезд цифры после кормящих свопов: цифры листьев свопаются РАЗНЫМИ парами
 *    (centre↔feedDigit), и «общая» цифра, выбранная до свопов, у сторон разошлась бы;
 *  · недетерминизм: снимок партии хранит только (seed, path) — второй заход обязан
 *    получить те же порталы, иначе resume откроет другую партию.
 */
import {
  deepPortalsFor, portalOfLeaf, materializeNode, childPath,
  DEEP_N, type DeepCfg,
} from '@/src/services/fractal-deep';
import { countSolutionsFast } from '@/src/services/fractal-sudoku';

const cfg: DeepCfg = { depth: 2, feedCount: 9, rating: 1.2, unlockShare: 0.24 };

const flat = (g: number[][], drop?: [number, number]): Int8Array => {
  const f = new Int8Array(DEEP_N * DEEP_N);
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) f[r * DEEP_N + c] = g[r]![c]!;
  if (drop) f[drop[0] * DEEP_N + drop[1]] = 0;
  return f;
};

/** Первый seed из ряда, дающий хотя бы один портал (замер 29.08: 17 порталов на 10 seed'ов). */
function seedWithPortal(): { seed: string; portals: ReturnType<typeof deepPortalsFor> } {
  for (let i = 0; i < 12; i++) {
    const seed = `portal-gate-${i}`;
    const root = materializeNode(seed, '', cfg, 0);
    const portals = deepPortalsFor(seed, '', cfg, root.solution);
    if (portals.length > 0) return { seed, portals };
  }
  throw new Error('ни один из 12 seed не дал портала — движок деградировал (замер давал 17/10)');
}

describe('порталы Бездны', () => {
  it('🔴 пара честная: порознь ≥2 решений у обеих, вместе ровно 1', () => {
    const { seed, portals } = seedWithPortal();
    const root = materializeNode(seed, '', cfg, 0);
    for (const p of portals) {
      const digitA = root.solution[Number(p.aPath.split(',')[0])]![Number(p.aPath.split(',')[1])]!;
      const digitB = root.solution[Number(p.bPath.split(',')[0])]![Number(p.bPath.split(',')[1])]!;
      const A = materializeNode(seed, p.aPath, cfg, digitA);
      const B = materializeNode(seed, p.bPath, cfg, digitB);
      const aF = flat(A.puzzle, p.aDrop);
      const bF = flat(B.puzzle, p.bDrop);
      expect(countSolutionsFast(aF, 2)).toBeGreaterThanOrEqual(2);
      expect(countSolutionsFast(bF, 2)).toBeGreaterThanOrEqual(2);
      let joint = 0;
      for (let v = 1; v <= DEEP_N; v++) {
        const fa = Int8Array.from(aF); fa[p.aCell[0] * DEEP_N + p.aCell[1]] = v;
        const na = countSolutionsFast(fa, 2);
        if (na === 0) continue;
        const fb = Int8Array.from(bF); fb[p.bCell[0] * DEEP_N + p.bCell[1]] = v;
        joint += na * countSolutionsFast(fb, 2);
      }
      expect(joint).toBe(1);
    }
  });

  it('🔴 цифра портала общая ПОСЛЕ кормящих свопов обеих сторон', () => {
    const { seed, portals } = seedWithPortal();
    const root = materializeNode(seed, '', cfg, 0);
    for (const p of portals) {
      const [ar, ac] = p.aPath.split(',').map(Number);
      const [br, bc] = p.bPath.split(',').map(Number);
      const A = materializeNode(seed, p.aPath, cfg, root.solution[ar!]![ac!]!);
      const B = materializeNode(seed, p.bPath, cfg, root.solution[br!]![bc!]!);
      expect(A.solution[p.aCell[0]]![p.aCell[1]]).toBe(p.digit);
      expect(B.solution[p.bCell[0]]![p.bCell[1]]).toBe(p.digit);
    }
  });

  it('план детерминирован: второй вызов даёт те же порталы (контракт resume)', () => {
    const { seed, portals } = seedWithPortal();
    const root = materializeNode(seed, '', cfg, 0);
    const again = deepPortalsFor(seed, '', cfg, root.solution);
    expect(again).toEqual(portals);
  });

  it('portalOfLeaf отдаёт сторону листа с партнёром, чужому листу — null', () => {
    const { portals } = seedWithPortal();
    const p = portals[0]!;
    const a = portalOfLeaf(portals, p.aPath)!;
    expect(a.cell).toEqual(p.aCell);
    expect(a.partnerPath).toBe(p.bPath);
    expect(a.partnerCell).toEqual(p.bCell);
    const b = portalOfLeaf(portals, p.bPath)!;
    expect(b.cell).toEqual(p.bCell);
    expect(b.partnerPath).toBe(p.aPath);
    expect(portalOfLeaf(portals, childPath('', 0, 0) === p.aPath ? '8,8' : '0,0')).toBeFalsy();
  });

  it('дроп и портальная клетка не совпадают, дроп был подсказкой, портал — дыркой', () => {
    const { seed, portals } = seedWithPortal();
    const root = materializeNode(seed, '', cfg, 0);
    for (const p of portals) {
      const [ar, ac] = p.aPath.split(',').map(Number);
      const A = materializeNode(seed, p.aPath, cfg, root.solution[ar!]![ac!]!);
      expect(p.aCell).not.toEqual(p.aDrop);
      expect(A.puzzle[p.aDrop[0]]![p.aDrop[1]]).not.toBe(0);   // дроп снимает ПОДСКАЗКУ
      expect(A.puzzle[p.aCell[0]]![p.aCell[1]]).toBe(0);        // портал живёт в дырке
    }
  });

  it('порталы только на предпоследнем слое: не-родителю листьев план пуст', () => {
    const deep3: DeepCfg = { ...cfg, depth: 3 };
    const root = materializeNode('depth-guard', '', deep3, 0);
    // depth 3: корень (0) — НЕ предпоследний слой (1), план обязан быть пустым.
    expect(deepPortalsFor('depth-guard', '', deep3, root.solution)).toEqual([]);
  });
});
