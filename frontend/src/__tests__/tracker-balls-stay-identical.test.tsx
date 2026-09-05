/**
 * 🔴 ШАРЫ В ТРЕКЕРЕ ОБЯЗАНЫ БЫТЬ НЕРАЗЛИЧИМЫ — В ЭТОМ ВСЯ ИГРА.
 *
 * Multiple Object Tracking работает ровно потому, что цель НИЧЕМ не отличается
 * от соседей: удержать её можно только вниманием. Дай объектам разные цвета или
 * фактуры — и следить станет не за чем, цель будет видно боковым зрением, а
 * упражнение превратится в поиск.
 *
 * 05.09.2026 плоскую заливку заменили картинками девяти фактур (задача Дениса:
 * «шарики плохие, дай выбор»). Ровно здесь и появляется соблазн, который ломает
 * игру: «пусть каждый шар будет своего цвета, так красивее». Проба стоит против
 * этого: она сравнивает КАРТИНКИ всех объектов на поле и требует, чтобы они были
 * одной и той же.
 *
 * ⚠️ Отличаться разрешено только КОЛЬЦУ — и только в показе целей и при выборе,
 * когда движения нет. Это проверяется отдельно: если кольцо начнёт светиться во
 * время движения, игра сломается так же.
 */
import React from 'react';
import {
  BALL_STYLES, BALL_COLORS, ballColorForLevel, ballImage,
} from '@/src/games/balls/ballChoice';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

describe('шары трекера', () => {
  it('есть что проверять: девять фактур на десять цветов, все картинки на месте', () => {
    expect(BALL_STYLES.length).toBe(9);
    expect(BALL_COLORS.length).toBe(10);
    const нет: string[] = [];
    for (const s of BALL_STYLES) {
      for (const c of BALL_COLORS) if (!ballImage(s, c)) нет.push(`${s}-${c}`);
    }
    expect(нет).toEqual([]);
  });

  it('🔴 цвет раунда зависит ТОЛЬКО от уровня — иначе шары замигают при перерисовке', () => {
    for (const lvl of [1, 7, 23, 41]) {
      const первый = ballColorForLevel(lvl);
      for (let i = 0; i < 20; i++) expect(ballColorForLevel(lvl)).toBe(первый);
    }
    // и он всё-таки меняется с уровнем, иначе «зависит от уровня» — пустые слова
    const все = new Set(Array.from({ length: 41 }, (_, i) => ballColorForLevel(i + 1)));
    expect(все.size).toBeGreaterThan(5);
  });

  it('🔴 отрицательный или дробный уровень не выносит за край набора', () => {
    for (const lvl of [-5, 0, 1.7, 999999, Number.NaN]) {
      expect(BALL_COLORS).toContain(ballColorForLevel(lvl as number));
    }
  });

  it('🔴 на поле у ВСЕХ объектов одна и та же картинка', () => {
    const {
      default: ObjectTrackerGame,
    } = require('@/src/games/object-tracker/ObjectTrackerGame');  // eslint-disable-line @typescript-eslint/no-require-imports
    const theme = {
      background: '#fff', surface: '#eee', text: '#000', textSecondary: '#555',
      border: '#ccc', primary: '#70f', onPrimary: '#fff', success: '#0a0',
      danger: '#a00', warning: '#fa0',
    };
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        React.createElement(ObjectTrackerGame, {
          seed: 'проба', level: 12, locale: 'ru', reducedMotion: true, screenWidth: 390,
          now: () => 0, theme, gameGradient: ['#70f', '#0af'] as const,
          ballStyle: 'fluffy', onComplete: () => {},
        }),
      );
    });
    // Картинки объектов — все <Image> внутри нажимаемых кружков поля.
    const картинки = r.root.findAll(
      (n: any) => n.type === 'Image' && n.props?.source && n.props?.resizeMode === 'contain',
    ).map((n: any) => JSON.stringify(n.props.source));
    expect(картинки.length).toBeGreaterThan(3);      // объектов на поле хотя бы четыре
    expect(new Set(картинки).size).toBe(1);          // и все они одинаковы
    // ⚠️ И это именно ВЫБРАННАЯ фактура, а не умолчание: иначе выбор ничего не делает.
    expect(картинки[0]).toBe(JSON.stringify(ballImage('fluffy', ballColorForLevel(12))));
    TestRenderer.act(() => { r.unmount(); });
  });
});
