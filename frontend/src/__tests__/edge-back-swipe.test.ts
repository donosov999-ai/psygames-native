/**
 * @jest-environment jsdom
 */
/* fs/path нужны, чтобы прочитать исходник каркаса и убедиться, что слушатели пассивные. */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ВЫХОД ЖЕСТОМ ОТ КРАЯ — ГЕЙТ НА УСЛОВИЕ, А НЕ НА НАЛИЧИЕ КОДА.
 *
 * Отчёт b7dcf92a: до кнопки выхода не дотянуться, пока рука внизу на ответах.
 * Второй выход добавлен жестом, и ломается он ровно в одну сторону: условие
 * перехвата либо слишком жадное — и тогда отбирает перетаскивание у «Ханойской
 * башни», «Соедини точки» и обычную прокрутку, — либо слишком строгое, и жест
 * не срабатывает никогда. Проверяем ЧИСЛАМИ по обе стороны каждой границы.
 */
import { EDGE_PX, BACK_DX, H_RATIO, shouldGoBack, attachEdgeBack } from '@/src/services/edgeBack';

describe('жест выхода от левого края', () => {
  it('🔴 начатое НЕ у края не выводит никогда, как далеко ни тащи', () => {
    for (const x0 of [EDGE_PX + 1, 60, 200, 380]) {
      expect(`x0=${x0}: ${shouldGoBack(x0, 300, 0)}`).toBe(`x0=${x0}: false`);
    }
  });

  it('🔴 у самого края, но горизонталь не набрана — жест НЕ наш', () => {
    expect(shouldGoBack(2, BACK_DX - 1, 0)).toBe(false);
    expect(shouldGoBack(2, BACK_DX, 0)).toBe(true);
  });

  it('🔴 вертикальная прокрутка у края остаётся прокруткой', () => {
    expect(shouldGoBack(5, 100, 300)).toBe(false);
    // ⚠️ и по диагонали: горизонталь обязана быть в H_RATIO раз больше
    expect(shouldGoBack(5, 100, 100 / H_RATIO + 1)).toBe(false);
    expect(shouldGoBack(5, 100, 100 / H_RATIO - 1)).toBe(true);
  });

  it('🔴 движение ВЛЕВО от края не выходит — иначе выход ловился бы вслепую', () => {
    expect(shouldGoBack(5, -200, 0)).toBe(false);
  });

  /**
   * 🔴 ГЕЙТ ПРОГОНЯЕТ СЛУШАТЕЛЯ, А НЕ ЧИТАЕТ ЕГО. Предыдущая редакция висела на
   * `PanResponder` и была уверена в себе на всех пяти чистых проверках условия —
   * а жест не срабатывал НИ РАЗУ: события до корня каркаса не доходили. Условие
   * было верным, проводки не было. Поэтому здесь бросаются настоящие события DOM.
   */
  it('🔴 настоящие события DOM доводят жест до выхода', () => {
    const вызовы: number[] = [];
    const отписка = attachEdgeBack(() => вызовы.push(1));
    const тач = (type: string, x: number, y: number) => {
      const e: any = new Event(type, { bubbles: true });
      e.changedTouches = [{ clientX: x, clientY: y }];
      document.dispatchEvent(e);
    };
    тач('touchstart', 6, 500); тач('touchend', 6 + BACK_DX + 10, 502);
    expect(`выходов после жеста от края: ${вызовы.length}`).toBe('выходов после жеста от края: 1');

    тач('touchstart', 200, 500); тач('touchend', 400, 500);      // не от края
    тач('touchstart', 6, 500);   тач('touchend', 30, 500);       // не дотащили
    тач('touchstart', 6, 100);   тач('touchend', 100, 500);      // вертикаль
    expect(`выходов всего: ${вызовы.length}`).toBe('выходов всего: 1');

    отписка();
    тач('touchstart', 6, 500); тач('touchend', 200, 500);
    expect(`после отписки: ${вызовы.length}`).toBe('после отписки: 1');
  });

  it('🔴 каркас слушает пассивно: у поля игры жест не отбирается', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(
      path.join(__dirname, '../services/edgeBack.ts'), 'utf8');
    // passive: true означает, что preventDefault невозможен в принципе — значит
    // перетаскивание в «Ханойской башне» и тап по линии «a» в шахматах целы
    expect(src).toContain('passive: true');
    expect(src).not.toContain('preventDefault');
  });
});
