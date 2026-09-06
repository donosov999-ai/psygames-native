/**
 * 🔴 КАЛИБРОВКА ЭТАЛОНА ЗАМЕРЕНА ДЛЯ ШЕСТЁРОК, А НЕ УНАСЛЕДОВАНА ОТ ТРОЕК.
 *
 * ТЗ раздела требует дословно: «калибровка `REF_PER_TYPE = 2.2` снята под
 * тройки; для шестёрок она неверна — перезамерь A*, а не переноси число».
 *
 * ЗАМЕР ДО (что было бы при унаследованном 2,2): порог трёх звёзд — «ходов
 * ≤ 1,15 × эталон», то есть 2,53 × виды. Настоящий минимум, найденный A* на 40
 * столах, — 5,37…5,92 × виды (среднее 5,63). Высшая оценка недостижима на
 * КАЖДОМ столе.
 *
 * ЗАМЕР ПОСЛЕ: при 5,6 порог трёх звёзд 6,44 × виды, минимум укладывается в него
 * с запасом, и три звезды достижимы.
 *
 * ⚠️ Проверка ИСПОЛНЯЕТ настоящий A* на настоящих столах, а не пересказывает
 * числа из комментария. Столы берутся маленькие: с шести видов A* перестаёт
 * доходить до дна, и это записано как граница замера, а не спрятано.
 */
import { CIRCLE, makeBoard } from '@/src/games/cake-sort/core/plate';
import { minMoves } from '@/src/games/cake-sort/core/solver';
import { REF_PER_TYPE, moveReference, starsForMoves } from '@/src/games/cake-sort/core/stars';

jest.setTimeout(300000);

/** Число, которое было бы, унаследуй мы калибровку сортировки товаров. */
const УНАСЛЕДОВАННОЕ = 2.2;

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Стол из `types` видов на `plates` тарелках. Тот же способ раздачи, что в игре. */
function стол(types: number, plates: number, seed: number) {
  const все: number[] = [];
  for (let t = 0; t < types; t += 1) for (let k = 0; k < CIRCLE; k += 1) все.push(t);
  const rand = rng(seed);
  for (let i = все.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [все[i], все[j]] = [все[j] as number, все[i] as number];
  }
  const out: number[][] = Array.from({ length: plates }, () => []);
  let i = 0;
  for (const s of все) { while ((out[i] as number[]).length >= CIRCLE) i += 1; (out[i] as number[]).push(s); }
  return makeBoard(out, []);
}

/** Столы, на которых A* заведомо доходит до дна. Границу подобрал замер, а не вкус. */
const СТОЛЫ: [number, number][] = [[3, 5], [3, 6], [4, 6], [4, 7], [5, 7], [5, 8]];

interface Замер { types: number; min: number }

function замерить(): Замер[] {
  const out: Замер[] = [];
  for (const [types, plates] of СТОЛЫ) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const m = minMoves(стол(types, plates, seed), 200000);
      if (m.moves !== null) out.push({ types, min: m.moves });
    }
  }
  return out;
}

describe('эталон ходов для круга из шести', () => {
  const замеры = замерить();

  it('есть что проверять — A* дошёл до дна на достаточном числе столов', () => {
    expect(замеры.length).toBeGreaterThanOrEqual(20);
  });

  /**
   * 🔴 ГЛАВНОЕ: при унаследованном 2,2 три звезды недостижимы. Этот пункт и
   * краснел бы на состоянии ДО — он проверяет ровно тот дефект, ради которого
   * ТЗ запрещает переносить число.
   */
  it('🔴 унаследованное 2,2 сделало бы высшую оценку недостижимой', () => {
    const достижимо = замеры.filter(({ types, min }) => {
      const эталон = Math.round(types * УНАСЛЕДОВАННОЕ);
      return starsForMoves(min, эталон) === 3;
    });
    // Не «мало», а НИ ОДНОГО: порог 2,53 × виды против минимума 5,4…5,9 × виды.
    expect(достижимо.length).toBe(0);
  });

  it('🔴 при замеренной калибровке три звезды достижимы на КАЖДОМ столе', () => {
    const недостижимо = замеры
      .filter(({ types, min }) => starsForMoves(min, moveReference(types)) !== 3)
      .map(({ types, min }) => `виды ${types}: минимум ${min} при эталоне ${moveReference(types)}`);
    expect(недостижимо).toEqual([]);
  });

  /**
   * Калибровка обязана лежать в измеренном коридоре. Слишком мало — три звезды
   * снова недостижимы; слишком много — их дают за небрежную игру, и оценка
   * перестаёт что-либо значить.
   */
  it('🔴 калибровка лежит в коридоре, который дал замер', () => {
    const отношения = замеры.map(({ types, min }) => min / types);
    const среднее = отношения.reduce((a, b) => a + b, 0) / отношения.length;
    expect(среднее).toBeGreaterThan(5.0);
    expect(среднее).toBeLessThan(6.3);
    expect(REF_PER_TYPE).toBeGreaterThan(среднее - 0.7);
    expect(REF_PER_TYPE).toBeLessThan(среднее + 0.7);
  });

  /**
   * 📌 Структура, из-за которой перенос был обречён: эталон пропорционален
   * `CIRCLE − 1`, а не постоянен. Для троек 2,2 ≈ 2 × 1,1; для шестёрок
   * 5,6 ≈ 5 × 1,12. Проверяем, что наше число этой форме отвечает, — иначе
   * следующий круг (восьмёрка, четвёрка) снова унаследуют не то.
   */
  it('эталон пропорционален «круг минус один», а не взят постоянным', () => {
    const наПеренос = REF_PER_TYPE / (CIRCLE - 1);
    expect(наПеренос).toBeGreaterThan(1.0);
    expect(наПеренос).toBeLessThan(1.3);
  });

  it('звёзды считаются от эталона и различают игру', () => {
    const э = moveReference(5);
    expect(starsForMoves(Math.round(э * 1.0), э)).toBe(3);
    expect(starsForMoves(Math.round(э * 1.4), э)).toBe(2);
    expect(starsForMoves(Math.round(э * 2.0), э)).toBe(1);
  });
});
