/**
 * ПРАВИЛА СТОЛА: круг замыкается ШЕСТЬЮ, и тарелка обязана быть однородной.
 *
 * 🔴 ГЛАВНАЯ РАЗНИЦА С СОРТИРОВКОЙ ТОВАРОВ. Там тройка лежит в нише на четыре
 * РЯДОМ с лишним предметом, и проверка «в нише есть три одинаковых» обязана
 * смотреть состав. Здесь наоборот: тарелка ровно на шесть, и соблазн написать
 * «длина = 6» стоит до первой смешанной тарелки — она полна и тортом не
 * является. Поэтому `completeIn` проверяет И длину, И однородность.
 */
import {
  CIRCLE, makeBoard, canPlace, completeIn, collapse, moveTop, isCleared, roomIn, hasAnyMove, allSectors,
} from '@/src/games/cake-sort/core/plate';

describe('стол тортов', () => {
  it('есть что проверять — круг из шести', () => {
    expect(CIRCLE).toBe(6);
  });

  it('🔴 круг замыкается только полной И однородной тарелкой', () => {
    expect(completeIn([1, 1, 1, 1, 1, 1])).toBe(1);
    expect(completeIn([1, 1, 1, 1, 1, 2])).toBeNull();   // полна, но смешана
    expect(completeIn([1, 1, 1, 1, 1])).toBeNull();      // однородна, но неполна
    expect(completeIn([])).toBeNull();
  });

  it('класть можно только к своему типу или на пустую, и только пока есть место', () => {
    const b = makeBoard([[1, 1], [2], []]);
    expect(canPlace(b, 0, 1)).toBe(true);
    expect(canPlace(b, 0, 2)).toBe(false);
    expect(canPlace(b, 2, 9)).toBe(true);
    expect(canPlace(makeBoard([[1, 1, 1, 1, 1, 1]]), 0, 1)).toBe(false);   // мест нет
    expect(roomIn(makeBoard([[1, 1]]), 0)).toBe(CIRCLE - 2);
  });

  it('🔴 замкнувшийся круг уходит со стола', () => {
    const b = makeBoard([[7, 7, 7, 7, 7], [7]]);
    const после = moveTop(b, 1, 0);
    expect(после).not.toBeNull();
    expect(после!.plates[0]).toEqual([]);
    expect(после!.plates[1]).toEqual([]);
    expect(isCleared(после!)).toBe(true);
  });

  /**
   * 🔴 ОЧЕРЕДЬ ПОДАЁТСЯ ТЕМ ЖЕ СОБЫТИЕМ, что снимает круг. Разведи их — и
   * появится состояние «тарелка снята, очередь ещё не подана», из которого
   * решатель посчитает не тот стол, что видит игрок.
   */
  it('🔴 на освободившееся место сразу приходит тарелка из очереди', () => {
    const b = makeBoard([[7, 7, 7, 7, 7, 7], [1]], [[3, 3]]);
    const { board, cleared } = collapse(b);
    expect(cleared).toEqual([7]);
    expect(board.plates[0]).toEqual([3, 3]);
    expect(board.queue.length).toBe(0);
  });

  it('очередь кончилась — место остаётся пустым, а не выдумывает тарелку', () => {
    const { board } = collapse(makeBoard([[7, 7, 7, 7, 7, 7]], []));
    expect(board.plates[0]).toEqual([]);
    expect(board.queue.length).toBe(0);
  });

  /** Ход не создаёт и не теряет секторов: мультимножество замкнуто. */
  it('🔴 ход ничего не создаёт и не теряет', () => {
    const b = makeBoard([[1, 2], [2], [1]], [[5, 5]]);
    const до = allSectors(b).slice().sort((x, y) => x - y).join(',');
    const после = moveTop(b, 0, 1);
    expect(после).not.toBeNull();
    expect(allSectors(после!).slice().sort((x, y) => x - y).join(',')).toBe(до);
  });

  it('невозможный ход возвращает null, а не портит стол', () => {
    const b = makeBoard([[1], [2]]);
    expect(moveTop(b, 0, 1)).toBeNull();   // чужой тип сверху
    expect(moveTop(b, 0, 0)).toBeNull();   // сам в себя
    expect(moveTop(b, 1, 1)).toBeNull();
    expect(moveTop(makeBoard([[], [1]]), 0, 1)).toBeNull();   // брать нечего
  });

  it('«стол встал» отличается от «стол разобран»', () => {
    // Все тарелки полны и разнотипны — ходов нет, но стол не пуст.
    const встал = makeBoard([[1, 1, 1, 1, 1, 2], [3, 3, 3, 3, 3, 4]]);
    expect(hasAnyMove(встал)).toBe(false);
    expect(isCleared(встал)).toBe(false);
    expect(hasAnyMove(makeBoard([[1], []]))).toBe(true);
  });

  it('тарелка больше круга — это ошибка сборки, а не тихая порча', () => {
    expect(() => makeBoard([[1, 1, 1, 1, 1, 1, 1]])).toThrow();
    expect(() => makeBoard([[]], [[2, 2, 2, 2, 2, 2, 2]])).toThrow();
  });
});
