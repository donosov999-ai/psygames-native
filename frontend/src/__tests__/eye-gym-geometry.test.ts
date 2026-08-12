import { eyeGymGeometry } from '@/src/services/eyeGymGeometry';

describe('eyeGymGeometry — точка целиком внутри фактического поля', () => {
  it.each([
    ['portrait 375×812', { width: 375, height: 812 }, { width: 343, height: 580 }],
    ['short portrait 375×768', { width: 375, height: 768 }, { width: 343, height: 536 }],
    ['phone landscape', { width: 812, height: 375 }, { width: 780, height: 178 }],
  ])('%s', (_label, viewport, field) => {
    const g = eyeGymGeometry(viewport, field);
    const dotRadius = 15;

    expect(g.cy + g.RY + dotRadius).toBeLessThanOrEqual(g.boardH - 16);
    expect(g.cy - g.RY - dotRadius).toBeGreaterThanOrEqual(16);
    expect(g.boardH).toBeLessThanOrEqual(field.height);
  });
});
