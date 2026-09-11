/* psygames-cake-mixed-types-measure · VER 1 · 11.09.2026 */
/**
 * ЗАМЕР: при каком ЧИСЛЕ ВИДОВ смешанная доска (круги 4/6/8) доказуема.
 *
 * Первый замер (`cake-mixed-caps.measure.ts`) менял ЗАПАС СВОБОДНЫХ ТАРЕЛОК от
 * 1 до 8 при 8–11 видах и дал 0 из 480 при 300 000 узлах — на всех запасах
 * одинаково. Контроль с одинаковыми кругами: 60 из 60 за 1,4 секунды. То есть
 * дело не в тесноте.
 *
 * Проверка «а не нерешаемы ли они по построению» диагноз НЕ подтвердила:
 * паросочетание «вид → тарелка своего круга» есть у 480 досок из 480. Значит
 * остаётся цена поиска, и правильная ось — ЧИСЛО ВИДОВ, а не запас места.
 */
import { provenSolvable } from '@/src/games/cake-sort/core/level';
import { makeBoard, type Plate } from '@/src/games/cake-sort/core/plate';

const КРУГИ = [4, 6, 8, 6] as const;
const кругиУровня = (L: number, n: number) => {
  const шаг = 1 + 2 * (L % 2);
  return Array.from({ length: n }, (_, i) => КРУГИ[(i * шаг + L) % КРУГИ.length] as number);
};
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function перемешать<T>(a: T[], r: () => number): T[] {
  const к = [...a];
  for (let i = к.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [к[i], к[j]] = [к[j] as T, к[i] as T]; }
  return к;
}
function доска(L: number, types: number, свободных: number, п: number) {
  const круги = кругиУровня(L + п, types + свободных);
  const занятые = круги.slice(0, types);
  const материал: number[] = [];
  занятые.forEach((c, i) => { for (let k = 0; k < c; k += 1) материал.push(i); });
  const стопки: number[][] = Array.from({ length: types }, () => []);
  let i = 0;
  for (const s of перемешать(материал, rng(L * 1000 + п))) {
    while (i < types && (стопки[i] as number[]).length >= (занятые[i] as number)) i += 1;
    if (i >= types) break;
    (стопки[i] as number[]).push(s);
  }
  const plates: Plate[] = [...стопки, ...Array.from({ length: свободных }, () => [] as number[])];
  return makeBoard(plates, [], круги);
}

describe('СМЁТ числа видов на смешанных кругах', () => {
  jest.setTimeout(3_600_000);
  it('доказуемость по числу видов', () => {
    const строки: string[] = [];
    for (const видов of [2, 3, 4, 5, 6, 7, 8]) {
      for (const своб of [2, 4]) {
        let д = 0; const т0 = Date.now();
        for (let п = 0; п < 8; п += 1) if (provenSolvable(доска(20 + п, видов, своб, п), 300_000)) д += 1;
        строки.push(`видов ${видов}, свободных ${своб}: ${д}/8 · ${Math.round((Date.now() - т0) / 1000)} с`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(['', 'ЧИСЛО ВИДОВ → доказано из 8:', ...строки].join('\n'));
    expect(строки.length).toBe(14);
  });
});
