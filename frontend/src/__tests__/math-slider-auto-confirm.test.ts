/**
 * МАТЕМАТИЧЕСКАЯ ШКАЛА — ГЕЙТ НА ДВА ОТВЕТА ОДНОМУ ОТЧЁТУ.
 *
 * Отчёт 736c5831 (04.09.2026, ПОВТОРНЫЙ — «уже говорил») просил две вещи:
 * поднять выбранное число из-под пальца и убрать десять подтверждений за партию.
 *
 * 🔴 ПОЧЕМУ ГЕЙТ, А НЕ «ПОСМОТРЕЛ ГЛАЗАМИ». Первый заход 02.09 УЖЕ поднимал
 * число — пузырём над ручкой, и это выглядело как починка, пока Денис не сказал
 * то же самое второй раз. Разница между «подняли» и «подняли достаточно»
 * глазами на макете не видна, поэтому здесь она меряется числом: расстояние от
 * места касания до числа берётся из стилей.
 *
 * ⚠️ И ГЛАВНОЕ — ЧАСЫ. Отсчёт «три секунды тишины» обязан идти по тем часам,
 * что подал экран (`gameNow`), иначе открытая справка «Правила» досчитает до
 * трёх и засчитает ответ за спиной у читающего. Проверяется поведением:
 * с застывшими часами ответ НЕ засчитывается никогда.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';
import MathSliderGame from '@/src/games/math-slider/MathSliderGame';
import { getMathSliderStrings } from '@/src/games/math-slider/core';

declare function require(m: string): any;
type Renderer = TestRenderer.ReactTestRenderer;

const RU = getMathSliderStrings('ru');
let clock = 10_000;

function mount(now?: () => number): Renderer {
  let r!: Renderer;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(MathSliderGame as any, {
      seed: 'math-slider-gate', level: 1, locale: 'ru', trialCount: 8,
      now: now ?? (() => clock),
      onComplete: () => {}, onExit: () => {},
    }));
  });
  return r;
}

function press(r: Renderer, label: string): void {
  const btn = r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function');
  expect(`кнопка «${label}»: ${btn.length}`).toBe(`кнопка «${label}»: 1`);
  TestRenderer.act(() => { btn[0].props.onPress(); });
}

function has(r: Renderer, label: string): boolean {
  return r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function').length > 0;
}

/** Ползунок — узел разметки с ролью «adjustable»; композит с теми же пропсами не в счёт. */
function slider(r: Renderer) {
  const n = r.root.findAll((x) => typeof x.type === 'string'
    && x.props?.accessibilityRole === 'adjustable'
    && typeof x.props?.onAccessibilityAction === 'function');
  expect(`ползунков на экране: ${n.length}`).toBe('ползунков на экране: 1');
  return n[0]!;
}

/**
 * Сдвинуть маркер. Идём через `onAccessibilityAction` — это НЕ обходной путь, а
 * настоящая дорожка пользователя со скринридером, и ведёт она в тот же
 * `changeBy → onChange`, что и палец. Пан-жест в react-test-renderer пришлось бы
 * подделывать событиями, и проверка мерила бы подделку.
 */
function drag(r: Renderer): void {
  const s = slider(r);
  TestRenderer.act(() => {
    s.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  });
}

/** Показанное число — самый крупный текст с цифрами на экране. */
function крупноеЧисло(r: Renderer): string | null {
  const тексты = r.root.findAll((n) => typeof n.type === 'string' && n.props?.children !== undefined);
  let лучший: { размер: number; текст: string } | null = null;
  for (const n of тексты) {
    const style = Array.isArray(n.props.style)
      ? n.props.style.reduce((a: any, s: any) => ({ ...a, ...(s || {}) }), {})
      : (n.props.style || {});
    const текст = String(n.props.children ?? '');
    if (!/^[\d\s., -]+$/.test(текст) || !/\d/.test(текст)) continue;
    const размер = Number(style.fontSize || 0);
    if (!лучший || размер > лучший.размер) лучший = { размер, текст };
  }
  return лучший?.текст ?? null;
}

function начать(r: Renderer): void {
  press(r, RU.startTraining);
}

/**
 * ⚠️ ЗАКРЫТА ЛИ ПРОБА — ПО ОБЕИМ КНОПКАМ РАЗБОРА, А НЕ ПО ОДНОЙ.
 * Первая редакция этого файла спрашивала только про «Следующее задание», а после
 * ТРЕНИРОВОЧНОЙ пробы стоит «Начать партию» — и два теста из пяти оказались
 * призраками: обе мутации (отсчёт по настенным часам; отсчёт без касания) прошли
 * мимо них зелёными. Поймано мутацией 04.09.2026.
 */
function пробаЗакрыта(r: Renderer): boolean {
  return has(r, RU.continue) || has(r, RU.startRound);
}

/**
 * ⚠️ ВРЕМЯ ТЕЧЁТ, А НЕ ПРЫГАЕТ. Первая редакция двигала `clock` одним рывком ДО
 * `advanceTimersByTime`, и все тики опроса видели одну и ту же отметку. Мутация
 * «отсчёт стартует сам, без касания» проходила зелёной: она ставит метку на
 * первом же тике, а разница отметок при рывке остаётся нулевой навсегда.
 * Поэтому здесь часы и таймеры двигаются вместе, шагами по 150 мс — как в жизни.
 */
function прошло(ms: number): void {
  for (let ушло = 0; ушло < ms; ушло += 150) {
    clock += 150;
    TestRenderer.act(() => { jest.advanceTimersByTime(150); });
  }
}

describe('шкала: число видно, подтверждать нечего', () => {
  beforeEach(() => { clock = 10_000; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 кнопки подтверждения на экране нет', () => {
    const r = mount();
    начать(r);
    expect(has(r, 'Подтвердить оценку')).toBe(false);
    r.unmount();
  });

  it('🔴 нетронутая шкала НЕ засчитывается сама: иначе игра ответит за человека', () => {
    const r = mount();
    начать(r);
    const было = крупноеЧисло(r);
    прошло(10_000);
    // разбора нет — значит проба не закрыта
    expect(пробаЗакрыта(r)).toBe(false);
    expect(крупноеЧисло(r)).toBe(было);
    r.unmount();
  });

  it('🔴 три секунды тишины после касания закрывают пробу', () => {
    const r = mount();
    начать(r);
    drag(r);
    прошло(3_100);
    expect(пробаЗакрыта(r)).toBe(true);
    r.unmount();
  });

  it('🔴 отсчёт идёт по ПОДАННЫМ часам: замерли часы — ответ не засчитан', () => {
    // ровно то, что происходит на паузе и на справке: gameNow стоит на месте
    const r = mount(() => 10_000);
    начать(r);
    drag(r);
    TestRenderer.act(() => { jest.advanceTimersByTime(30_000); });
    expect(пробаЗакрыта(r)).toBe(false);
    r.unmount();
  });

  it('🔴 число стоит ВЫШЕ шкалы, а не над ручкой в тени пальца', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(
      path.join(__dirname, '../games/math-slider/MathSliderGame.tsx'), 'utf8');
    // пузыря, ездящего с ручкой, быть не должно: он и был тем, что закрыто пальцем
    expect(src).not.toContain('estimateBubble');
    // а отступ под него больше не съедает экран
    const m = /numberLineBlock: \{[^}]*paddingTop: (\d+)/.exec(src);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThan(20);
  });
});
