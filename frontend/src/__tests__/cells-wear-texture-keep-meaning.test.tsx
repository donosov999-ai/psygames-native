/**
 * 🔴 КЛЕТКИ НОСЯТ ФАКТУРУ, НО ЦВЕТ ПРОДОЛЖАЕТ ЗНАЧИТЬ.
 *
 * Денис 05.09.2026: «трекер объектов и ещё куча упражнений с плохими шариками и
 * кубиками — отрисуй сеткой их, разные по стилю». Кубики нарисованы теми же
 * девятью фактурами, что и шары, и легли в общую клетку `FlashCell` — а её
 * используют «Матрица памяти», «Кубики Корси», N-back и «размах».
 *
 * ⚠️ ЗДЕСЬ ДВА ТРЕБОВАНИЯ, И ВТОРОЕ ВАЖНЕЕ ПЕРВОГО.
 *
 * 1. Фактура должна ДОЙТИ до клетки: 90 картинок в сборке, которых никто не
 *    показывает, — это лишний вес и невыполненная задача.
 * 2. Цвет обязан по-прежнему означать состояние. В этих играх подсветка, выбор,
 *    «верно» и «неверно» различаются ЦВЕТОМ, и подмена его одной красивой
 *    картинкой стёрла бы смысл. Поэтому картинка ложится поверх градиента
 *    ближайшим цветом набора, а сам градиент остаётся снизу.
 *
 * И третье, отдельной проверкой: значки для тех, кто не различает цвета (точка,
 * крест, кольцо), обязаны остаться ПОВЕРХ фактуры, а не под ней.
 */
import React from 'react';
import FlashCell from '@/src/components/juice/FlashCell';
import { nearestPieceColor, blockImage, BALL_COLORS } from '@/src/games/balls/ballChoice';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

function нарисовать(props: Record<string, unknown>) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      <FlashCell size={48} state="idle" idleColor="#444" borderColor="#666" {...props} />,
    );
  });
  const картинки = r.root.findAll((n: any) => n.type === 'Image' && n.props?.source)
    .map((n: any) => JSON.stringify(n.props.source));
  const градиенты = r.root.findAll(
    (n: any) => typeof n.type !== 'string' && Array.isArray(n.props?.colors),
  ).length;
  TestRenderer.act(() => { r.unmount(); });
  return { картинки, градиенты };
}

describe('клетки носят фактуру, а цвет продолжает значить', () => {
  it('есть что проверять: у каждого цвета набора есть квадратная плитка', () => {
    const нет = BALL_COLORS.filter((c) => !blockImage('glossy', c));
    expect(нет).toEqual([]);
    expect(BALL_COLORS.length).toBe(10);
  });

  it('🔴 фактура доходит до клетки — и в покое, и в подсветке', () => {
    expect(нарисовать({ state: 'idle' }).картинки.length).toBe(1);
    expect(нарисовать({ state: 'lit', litColor: '#8e2de2' }).картинки.length).toBe(1);
  });

  it('🔴 градиент состояния НЕ убран — цвет по-прежнему отвечает за смысл', () => {
    expect(нарисовать({ state: 'lit', litColor: '#8e2de2' }).градиенты).toBeGreaterThan(0);
  });

  it('🔴 разные состояния дают РАЗНЫЕ плитки — иначе смысл стёрт', () => {
    const виды = [
      нарисовать({ state: 'lit', litColor: '#8e2de2' }).картинки[0],     // фиолетовая
      нарисовать({ state: 'correct' }).картинки[0],                       // зелёная
      нарисовать({ state: 'wrong' }).картинки[0],                         // красная
    ];
    expect(new Set(виды).size).toBe(3);
  });

  it('🔴 цвет игры переводится в БЛИЖАЙШИЙ набора, а не в один и тот же', () => {
    expect(nearestPieceColor('#d63a3a')).toBe('red');
    expect(nearestPieceColor('#4876d6')).toBe('blue');
    expect(nearestPieceColor('#68be4a')).toBe('green');
    expect(nearestPieceColor('#eef0f4')).toBe('white');
    // и разные входные цвета не схлопываются в один
    const разные = ['#d63a3a', '#4876d6', '#68be4a', '#a654d6', '#ebca3c'].map(nearestPieceColor);
    expect(new Set(разные).size).toBe(5);
  });

  it('🔴 мусор на входе не роняет клетку, а даёт запасной цвет', () => {
    for (const плохой of ['', 'не цвет', '#zz', 'rgb(1,2,3)']) {
      expect(BALL_COLORS).toContain(nearestPieceColor(плохой));
    }
  });

  it('🔴 значки различения без цвета остались — их не закрыла фактура', () => {
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(<FlashCell size={48} state="wrong" idleColor="#444" borderColor="#666" />);
    });
    // Крест собран из двух повёрнутых полос — ищем их по трансформации.
    const полосы = r.root.findAll((n: any) => {
      const st = n.props?.style;
      const плоско = Array.isArray(st) ? st.flat(3) : [st];
      return плоско.some((x: any) => x && Array.isArray(x.transform)
        && x.transform.some((t: any) => typeof t?.rotate === 'string'));
    });
    expect(полосы.length).toBeGreaterThanOrEqual(2);
    TestRenderer.act(() => { r.unmount(); });
  });
});
