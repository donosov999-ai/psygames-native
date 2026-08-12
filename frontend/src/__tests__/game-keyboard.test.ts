/**
 * @jest-environment jsdom
 *
 * Окружение здесь jsdom, а не общий node: проверяется работа с настоящими событиями
 * клавиатуры и фокусом, а без DOM это выродилось бы в проверку заглушек — то есть
 * в тест, который зелен всегда и не значит ничего.
 */
/**
 * Управление играми с клавиатуры.
 *
 * ЗАЧЕМ ТЕСТ. Клавиатурный слой ломается ТИХО и в обе стороны, причём обе поломки
 * человек объяснит себе не тем.
 *
 * Не сработало — «приложение подтормаживает», а не «клавиши не поддержали».
 * Сработало лишний раз — вот это хуже: внутри приложения есть поле отзыва, и если
 * слушатель не проверяет фокус, то жалоба «в судоку 3 ошибки подряд» расставит
 * цифры 3 по доске под окном. Человек отправит отзыв и обнаружит испорченную партию,
 * не связав одно с другим.
 *
 * Поэтому проверяем не «вызвался обработчик», а границы: поля ввода, сочетания
 * с Ctrl/Cmd, выключенное состояние и снятие слушателя при уходе с экрана.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';

// Слой сознательно работает только на вебе: на телефоне физической клавиатуры нет,
// а window.addEventListener там отсутствует. По умолчанию jest выдаёт себя за
// мобильную платформу, и без подмены хук корректно молчал бы — а тест выглядел бы
// зелёным, ничего не проверив.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { useGameKeyboard, digitKeys, isTypingInField } from '../hooks/useGameKeyboard';

/** Компонент без JSX: тесты в проекте только .ts, а .tsx jest не подхватывает. */
function mount(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const Probe = () => { useGameKeyboard(map, enabled); return null; };
  let r: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => { r = TestRenderer.create(React.createElement(Probe)); });
  return r!;
}

function press(key: string, init: Partial<KeyboardEventInit> & { target?: any } = {}) {
  const { target, ...rest } = init;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest });
  if (target) Object.defineProperty(e, 'target', { value: target });
  window.dispatchEvent(e);
  return e;
}

describe('раскладка цифр', () => {
  it('1…9 ставят свою цифру', () => {
    const got: number[] = [];
    const map = digitKeys((n) => got.push(n));
    for (let n = 1; n <= 9; n++) map[String(n)](null as any);
    expect(got).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('0, Backspace и Delete стирают — все три, иначе привычка не переносится', () => {
    const got: number[] = [];
    const map = digitKeys((n) => got.push(n));
    map['0'](null as any); map.Backspace(null as any); map.Delete(null as any);
    expect(got).toEqual([0, 0, 0]);
  });

  it('на поле 6×6 цифр больше шести нет — иначе пройдёт заведомо неверный ход', () => {
    const map = digitKeys(() => {}, { maxDigit: 6 });
    expect(Object.keys(map).filter((k) => /^[1-9]$/.test(k))).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});

describe('распознавание поля ввода', () => {
  it.each(['input', 'textarea', 'select'])('%s — человек печатает, игра не вмешивается', (tag) => {
    expect(isTypingInField(document.createElement(tag))).toBe(true);
  });

  it('contenteditable тоже поле', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isTypingInField(el)).toBe(true);
  });

  it('обычный div полем не считается', () => {
    expect(isTypingInField(document.createElement('div'))).toBe(false);
  });

  it('пустая цель не роняет проверку', () => {
    expect(isTypingInField(null)).toBe(false);
  });
});

describe('слушатель', () => {
  it('нажатие доходит до игры', () => {
    let n = 0;
    mount({ '5': () => { n = 5; } });
    press('5');
    expect(n).toBe(5);
  });

  it('🔴 набор в поле отзыва НЕ ходит по доске', () => {
    let n = 0;
    mount({ '3': () => { n = 3; } });
    press('3', { target: document.createElement('textarea') });
    expect(n).toBe(0);
  });

  it('Ctrl и Cmd оставляем системе — иначе отнимем перезагрузку и выход', () => {
    let hits = 0;
    mount({ r: () => { hits++; }, q: () => { hits++; } });
    press('r', { ctrlKey: true });
    press('q', { metaKey: true });
    expect(hits).toBe(0);
  });

  it('стрелки гасят прокрутку страницы — иначе экран уезжает на каждом ходу', () => {
    mount({ ArrowDown: () => {} });
    expect(press('ArrowDown').defaultPrevented).toBe(true);
  });

  it('незанятая клавиша браузеру не мешает', () => {
    mount({ ArrowDown: () => {} });
    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('выключенный слой молчит — на экране результата доски уже нет', () => {
    let n = 0;
    mount({ '7': () => { n = 7; } }, false);
    press('7');
    expect(n).toBe(0);
  });

  it('после ухода с экрана слушатель снят — иначе они копятся за сессию', () => {
    let n = 0;
    const r = mount({ '9': () => { n = 9; } });
    TestRenderer.act(() => { r.unmount(); });
    press('9');
    expect(n).toBe(0);
  });
});
