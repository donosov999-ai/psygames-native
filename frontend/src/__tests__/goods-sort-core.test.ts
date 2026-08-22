/* psygames-goods-sort-core · VER 1 · 22.08.2026 */
/**
 * ЯДРО СОРТИРОВКИ: ВМЕСТИМОСТЬ НИШИ — ПЕРВОКЛАССНОЕ ПОНЯТИЕ.
 *
 * 🔴 ЗАЧЕМ ЭТО ЯДРО ВООБЩЕ ЗАВЕДЕНО. За один день 22.08.2026 в игре нашлось
 * ЧЕТЫРЕ дефекта, и все четыре — одна ошибка в разных местах: код писался под
 * «в каждой нише три места», а с 18-го уровня ниши бывают на два и на четыре.
 * Раздача теряла свободные ниши, перемешивание ТЕРЯЛО ТОВАР (14–48 % нажатий),
 * решатель разрешал невозможный ход на 69–100 % досок и не видел тройку в нише
 * на четыре.
 *
 * Ковырять их по одному можно долго. Здесь содержимое и ёмкости лежат ОДНИМ
 * объектом: взять клетки без ёмкостей нельзя, и ошибка «забыл про вместимость»
 * перестаёт компилироваться.
 */
import {
  makeBoard, capOf, roomIn, isEmpty, isFull, isCleared,
  tripleIn, removeTriple, canPlace, collapseTriples, moveTop, freeNiches, TRIPLE,
} from '@/src/games/goods-sort/core/board';
import {
  solveStrict, solvableStrict, hasAnyMove, hintMove, pendingTriple,
} from '@/src/games/goods-sort/core/solver';

const B = (cells: number[][], caps: number[]) => makeBoard(cells, caps);

describe('доска знает свою вместимость', () => {
  it('ниши и ёмкости обязаны совпадать по числу — иначе это не доска', () => {
    expect(() => makeBoard([[], []], [3])).toThrow();
  });

  it('🔴 место считается по СВОЕЙ нише, а не по тройке', () => {
    const b = B([[1, 1], [1], []], [2, 4, 3]);
    expect(roomIn(b, 0)).toBe(0);        // ниша на ДВА и в ней два — места нет
    expect(roomIn(b, 1)).toBe(3);        // ниша на ЧЕТЫРЕ и в ней один
    expect(isFull(b, 0)).toBe(true);
    expect(isFull(b, 1)).toBe(false);
  });

  it('в нишу на два третий товар не кладётся', () => {
    const b = B([[7, 7]], [2]);
    expect(canPlace(b, 0, 7, true)).toBe(false);
    expect(canPlace(b, 0, 7, false)).toBe(false);
  });

  it('🔴 тройка в нише на ЧЕТЫРЕ находится — она лежит рядом с четвёртым', () => {
    expect(tripleIn([5, 5, 5, 9])).toBe(5);
    expect(tripleIn([9, 5, 5, 5])).toBe(5);
    expect(tripleIn([5, 5, 9, 5])).toBe(5);
  });

  it('двух одинаковых для тройки мало', () => {
    expect(tripleIn([5, 5])).toBeNull();
    expect(TRIPLE).toBe(3);
  });

  it('убираем ровно тройку, остальное остаётся на месте', () => {
    expect(removeTriple([5, 5, 9, 5], 5)).toEqual([9]);
    expect(removeTriple([5, 5, 5, 5], 5)).toEqual([5]);
  });

  it('строгая укладка пускает к своему типу и в пустую', () => {
    const b = B([[3], [4], []], [3, 3, 3]);
    expect(canPlace(b, 0, 3, true)).toBe(true);
    expect(canPlace(b, 1, 3, true)).toBe(false);
    expect(canPlace(b, 2, 3, true)).toBe(true);
  });

  it('сложенные тройки схлопываются, пока складываются', () => {
    const b = collapseTriples(B([[2, 2, 2], [8, 8, 8, 1]], [3, 4]));
    expect(b.cells[0]).toEqual([]);
    expect(b.cells[1]).toEqual([1]);
  });

  it('ход перекладывает верхний и сразу убирает сложившуюся тройку', () => {
    const after = moveTop(B([[6], [6, 6]], [3, 3]), 0, 1, true);
    expect(after).not.toBeNull();
    expect((after as NonNullable<typeof after>).cells[1]).toEqual([]);
  });

  it('невозможный ход возвращает null, а не молчаливую копию', () => {
    expect(moveTop(B([[1], [2, 2]], [3, 2]), 0, 1, true)).toBeNull();   // чужой тип и нет места
    expect(moveTop(B([[], [2]], [3, 3]), 0, 1, true)).toBeNull();       // брать нечего
    expect(moveTop(B([[1], [2]], [3, 3]), 0, 0, true)).toBeNull();      // сам в себя
  });

  it('свободные ниши — пустые и не под препятствием', () => {
    const b = B([[], [], [5]], [3, 3, 3]);
    expect(freeNiches(b)).toBe(2);
    expect(freeNiches(b, [false, true, false])).toBe(1);
  });
});

describe('решатель знает про ёмкости', () => {
  it('доска, которая разбирается, признаётся разбираемой', () => {
    // Три двойки и три тройки, места хватает.
    const b = B([[2, 3, 2], [3, 2, 3], [], []], [3, 3, 3, 3]);
    expect(solvableStrict(b)).toBe(true);
  });

  it('🔴 доска, которую губит НИША НА ДВА, не признаётся разбираемой', () => {
    /**
     * Три одинаковых товара и единственная свободная ниша на ДВА: собрать тройку
     * негде. Прежний решатель считал эту нишу трёхместной и говорил «решается».
     */
    const b = B([[7], [7], [7], []], [1, 1, 1, 2]);
    expect(solvableStrict(b)).toBe(false);
  });

  it('пустая доска разобрана по определению', () => {
    expect(isCleared(B([[], []], [3, 3]))).toBe(true);
    expect(solvableStrict(B([[], []], [3, 3]))).toBe(true);
  });

  it('упёрлись в бюджет — честно говорим «не знаю», а не «нерешаемо»', () => {
    /**
     * ⚠️ ДОСКА ДОЛЖНА ДАВАТЬ БОЛЬШОЙ ПЕРЕБОР. Первая редакция брала доску, где
     * все ниши полны и ходов нет вовсе: перебор заканчивался на первом узле, до
     * бюджета не доходил, и `exhausted` честно оставался ложным. Проверка
     * краснела на верном коде — случай был выбран не тот.
     */
    const wide = Array.from({ length: 9 }, (_, i) => [i % 5, (i + 1) % 5]);
    const r = solveStrict(B(wide, Array(9).fill(3)), 5);
    expect(r.exhausted).toBe(true);
    expect(r.solvable).toBe(false);         // «не знаю» наружу выглядит как «нет»
  });

  it('при большом бюджете тот же перебор в потолок НЕ упирается', () => {
    const easy = B([[6], [6, 6], [], []], [3, 3, 3, 3]);
    expect(solveStrict(easy, 20000).exhausted).toBe(false);
  });

  it('🔴 подсказка берётся ИЗ РЕШЕНИЯ и потому законна', () => {
    const b = B([[6], [6, 6], [], []], [3, 3, 3, 3]);
    const move = hintMove(b);
    expect(move).not.toBeNull();
    const m = move as NonNullable<typeof move>;
    expect(moveTop(b, m.from, m.to, true)).not.toBeNull();   // ход, который игра примет
  });

  it('подсказки на разобранной доске нет', () => {
    expect(hintMove(B([[], []], [3, 3]))).toBeNull();
  });
});

describe('🔴 тупик распознаётся — этого не было вовсе', () => {
  it('ход есть — тупика нет', () => {
    expect(hasAnyMove(B([[1], [1, 1], []], [3, 3, 3]), true)).toBe(true);
  });

  it('все ниши полны чужими типами — ход невозможен', () => {
    const b = B([[1, 2], [3, 4], [5, 6]], [2, 2, 2]);
    expect(hasAnyMove(b, true)).toBe(false);
  });

  it('переезд одинокого товара в пустую нишу ходом не считается', () => {
    // Иначе «ход есть» будет верным вечно и тупик не наступит никогда.
    expect(hasAnyMove(B([[9], []], [3, 3]), true)).toBe(false);
  });

  it('без строгой укладки ходов больше — и это разные ответы', () => {
    const b = B([[1], [2], []], [3, 3, 3]);
    expect(hasAnyMove(b, true)).toBe(false);
    expect(hasAnyMove(b, false)).toBe(true);
  });

  it('сложенная тройка на доске видна отдельно', () => {
    expect(pendingTriple(B([[4, 4, 4]], [3]))).toBe(true);
    expect(pendingTriple(B([[4, 4]], [3]))).toBe(false);
  });
});
