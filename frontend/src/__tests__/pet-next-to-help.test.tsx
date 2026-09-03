/* eslint-disable import/first */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * 🔴 ПИТОМЕЦ СКВОЗНОЙ И СТОИТ ВПЛОТНУЮ К «?».
 *
 * Место питомца ломалось три раза за один день, и каждый раз это было видно только
 * в НАРИСОВАННОМ дереве, а не в исходнике:
 *   · 2.37.0 — «питомца не видно вообще»: слот шапки получал отступ под плавающую
 *     кнопку только при `headerRight || wuStep`, питомец в условие не попал и встал
 *     ровно под кнопку;
 *   · 2.37.1 — питомец есть, но между ним и «?» вклинивалась кнопка самой игры
 *     (замер на 360 px в «Шульте»: питомец 184, чужая иконка 246, справка 312);
 *   · 2.37.3 — на экране настройки «Доски в уме» питомца нет вовсе: шапку там рисует
 *     сама игра, а не каркас. Денис: «по идее я хочу, чтобы он сквозной был».
 *
 * Отсюда нынешний дом: угол ПЛАВАЮЩЕЙ СПРАВКИ. Этот слой монтируется в корневом
 * макете и показывается на каждом экране с правилами — и в настройке, и в партии.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => {
  const настоящий = jest.requireActual('@/src/contexts/LanguageContext');
  return { ...настоящий, useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) };
});
/**
 * ⚠️ Сам питомец подменён заглушкой С ТЕМ ЖЕ testID: под проверкой СОСТАВ и ПОРЯДОК
 * угла, а не рисование спрайта (за него отвечает pet-head-closeup). Убрать `<GamePet>`
 * из ряда проба всё равно заметит — заглушки в дереве не станет.
 */
const проПитомца: Record<string, unknown>[] = [];
jest.mock('@/src/components/pet/GamePet', () => {
  const Реакт = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => { проПитомца.push(props); return Реакт.createElement(View, { testID: 'game-pet' }); },
  };
});

import { HelpCornerRow } from '@/src/components/GameHelpOverlay';

beforeAll(() => {
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

type Узел = { props: Record<string, unknown> };

function нарисовать(props: Partial<React.ComponentProps<typeof HelpCornerRow>> = {}) {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(
      <HelpCornerRow rtl={false} mood="idle" top={10} label="Правила" helpLabel="Справка"
        accent="#7c3aed" accentFg="#fff" onPress={() => {}} {...props} />,
    );
  });
  return t.root;
}

/** Плоский список testID в порядке обхода дерева — то есть слева направо. */
function порядок(root: ReturnType<typeof нарисовать>): string[] {
  const out: string[] = [];
  for (const узел of root.findAll(() => true, { deep: true })) {
    const id = (узел.props as Record<string, unknown>).testID;
    if (typeof id === 'string' && !out.includes(id)) out.push(id);
  }
  return out;
}
function стиль(узел: Узел): Record<string, unknown> {
  return ([] as Record<string, unknown>[]).concat(узел.props.style as never)
    .reduce((a, x) => ({ ...a, ...(x || {}) }), {} as Record<string, unknown>);
}

describe('питомец в углу справки', () => {
  it('🔴 питомец и кнопка справки — в ОДНОМ ряду, питомец первым (то есть левее)', () => {
    const ids = порядок(нарисовать());
    expect(ids).toContain('help-corner-row');
    expect(ids).toContain('game-pet');
    expect(ids).toContain('help-fab');
    // Ряд прижат к правому краю, значит первый в нём — левее: питомец слева, «?» справа.
    expect(ids.indexOf('game-pet')).toBeLessThan(ids.indexOf('help-fab'));
  });

  it('🔴 ряд прижат к правому верхнему углу — там, куда просили', () => {
    const ряд = нарисовать().findAll((у) => (у.props as Record<string, unknown>).testID === 'help-corner-row')[0] as unknown as Узел;
    const s = стиль(ряд);
    expect(s.position).toBe('absolute');
    expect(Number(s.right)).toBeGreaterThanOrEqual(0);
    expect(s.left).toBeUndefined();
  });

  it('в правом-налево языке угол зеркалится к левому краю', () => {
    const ряд = нарисовать({ rtl: true }).findAll((у) => (у.props as Record<string, unknown>).testID === 'help-corner-row')[0] as unknown as Узел;
    const s = стиль(ряд);
    expect(Number(s.left)).toBeGreaterThanOrEqual(0);
    expect(s.right).toBeUndefined();
  });

  it('🔴 настроение доходит до питомца — иначе он перестанет отвечать на ход', () => {
    проПитомца.length = 0;
    нарисовать({ mood: 'good' });
    expect(проПитомца.at(-1)?.mood).toBe('good');
    нарисовать({ mood: 'bad' });
    expect(проПитомца.at(-1)?.mood).toBe('bad');
  });

  it('🔴 медальон питомца вровень с кнопкой справки, а не крошечный', () => {
    // Просьба Дениса 03.09.2026: «рамку ей увеличить, чтобы рамка высоты была равна
    // размерам кнопки справка». Рамка строится как `size + 14`, круг «?» — 44.
    проПитомца.length = 0;
    нарисовать();
    expect(Number(проПитомца.at(-1)?.size) + 14).toBeGreaterThanOrEqual(44);
  });
});
