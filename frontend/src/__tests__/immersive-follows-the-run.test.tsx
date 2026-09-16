/**
 * ПОЛНОЭКРАННЫЙ РЕЖИМ ИДЁТ ЗА ПАРТИЕЙ — ПРОВЕРКА ПОВЕДЕНИЕМ.
 *
 * Денис 16.09.2026: «надо добавить и продумать управление полноэкранным режимом».
 * Решение записано в `src/services/immersive.ts`: полосы телефона уходят сами, пока
 * партия идёт, и возвращаются на паузе, при выходе с экрана и по выбору в меню паузы.
 * Здесь монтируется хук и считается, какие команды ушли в нативный слой
 * (`__TAURI_INTERNALS__.invoke('set_immersive', { on })`).
 *
 * Вторая половина — пункт меню паузы: он есть у игры, объявившей режим, и нет у
 * остальных. Иначе у шестидесяти игр без полноэкранного слоя висел бы переключатель,
 * который ничего не делает.
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useImmersive } from '@/src/hooks/useImmersive';
import { holdGame, __resetGameClock } from '@/src/services/gamePause';
import { __resetImmersive, immersiveCapable, setImmersiveEnabled } from '@/src/services/immersive';

// jest поднимает jest.mock выше импортов сам, поэтому импорты стоят сверху (линт import/first).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const команды: boolean[] = [];

beforeEach(() => {
  команды.length = 0;
  __resetImmersive();
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args: { on: boolean }) => {
      if (cmd === 'set_immersive') команды.push(args.on);
      return Promise.resolve();
    },
  };
});
afterEach(() => {
  delete (globalThis as any).__TAURI_INTERNALS__;
  __resetGameClock();
});

/** Дать микрозадачам доиграть: команда уходит через Promise. */
async function осесть(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

/**
 * ⚠️ ИМЯ ЛАТИНИЦЕЙ НАРОЧНО. Правило хуков узнаёт компонент по ЛАТИНСКОЙ заглавной
 * первой букве: «Экран» оно считает обычной функцией и красит вызов хука ошибкой —
 * а храповик линта держит правила хуков с нулевой терпимостью. Так упал CI метки 2.54.13.
 */
function RunScreen({ идёт }: { идёт: boolean }) {
  useImmersive(идёт);
  return <Text>забег</Text>;
}

async function смонтировать(идёт: boolean): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<RunScreen идёт={идёт} />); });
  await осесть();
  return tr;
}

describe('useImmersive — полосы телефона идут за партией', () => {
  it('до старта партии полосы не трогаем, со стартом — прячем', async () => {
    const tr = await смонтировать(false);
    expect(команды.includes(true)).toBe(false);
    await act(async () => { tr.update(<RunScreen идёт />); });
    await осесть();
    expect(команды[команды.length - 1]).toBe(true);
    await act(async () => { tr.unmount(); });
  });

  it('🔴 пауза возвращает полосы, «Продолжить» прячет снова', async () => {
    const tr = await смонтировать(true);
    let снять!: () => void;
    await act(async () => { снять = holdGame(); });
    await осесть();
    expect(`на паузе: ${команды[команды.length - 1]}`).toBe('на паузе: false');
    await act(async () => { снять(); });
    await осесть();
    expect(`после «Продолжить»: ${команды[команды.length - 1]}`).toBe('после «Продолжить»: true');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 уход с экрана посреди партии возвращает полосы', async () => {
    const tr = await смонтировать(true);
    await act(async () => { tr.unmount(); });
    await осесть();
    expect(`после ухода: ${команды[команды.length - 1]}`).toBe('после ухода: false');
  });

  it('выключил в меню паузы — полосы остаются; включил обратно — снова прячем', async () => {
    const tr = await смонтировать(true);
    await act(async () => { await setImmersiveEnabled(false); });
    await осесть();
    expect(команды[команды.length - 1]).toBe(false);
    await act(async () => { await setImmersiveEnabled(true); });
    await осесть();
    expect(команды[команды.length - 1]).toBe(true);
    await act(async () => { tr.unmount(); });
  });

  it('возврат из свёрнутого состояния повторяет команду — ОС показала полосы сама', async () => {
    // Прогон идёт без DOM (пресет jest-expo): document подставляем на один сценарий.
    const док = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    (globalThis as any).document = док;
    try {
      const tr = await смонтировать(true);
      const до = команды.length;
      await act(async () => { док.dispatchEvent(new Event('visibilitychange')); });
      await осесть();
      expect(`повторов: ${команды.length - до}, последняя: ${команды[команды.length - 1]}`)
        .toBe('повторов: 1, последняя: true');
      await act(async () => { tr.unmount(); });
    } finally {
      delete (globalThis as any).document;
    }
  });

  it('экран объявляет режим, пока смонтирован', async () => {
    expect(immersiveCapable()).toBe(false);
    const tr = await смонтировать(false);
    expect(immersiveCapable()).toBe(true);
    await act(async () => { tr.unmount(); });
    expect(immersiveCapable()).toBe(false);
  });

  it('вне Tauri (сайт, пробы) — ни одной команды и ни одной ошибки', async () => {
    delete (globalThis as any).__TAURI_INTERNALS__;
    const tr = await смонтировать(true);
    expect(команды).toEqual([]);
    await act(async () => { tr.unmount(); });
  });
});
