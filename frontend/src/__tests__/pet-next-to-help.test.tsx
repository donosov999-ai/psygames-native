/*
 * eslint-disable import/first — подмены обязаны стоять ДО ввоза компонента,
 * иначе он захватит настоящие контексты и проба упадёт на теме, а не на месте
 * питомца.
 */
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-require-imports -- в подменах ввоз обязан быть отложенным: `import` поднимется выше jest.mock и утащит настоящий модуль */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * 🔴 ПИТОМЕЦ — ПРАВЕЕ ВСЕХ В ШАПКЕ, И ШАПКА ОТСТУПАЕТ ОТ КРАЯ.
 *
 * Два дефекта одного угла за один день, оба по отчётам Дениса 03.09.2026:
 *   · 2.37.0 — «питомца не видно вообще». Слот получал отступ под плавающую
 *     кнопку справки только при `headerRight || wuStep`; питомец в это условие
 *     не попал, слот встал вплотную к краю ровно под кнопку, и она его накрыла.
 *   · 2.37.1 — питомец есть, но не рядом со справкой: он шёл ПЕРВЫМ в ряду, и
 *     между ним и «?» вставала кнопка самой игры. Замер живьём на 360 px в
 *     «Шульте»: питомец на 184, чужая иконка на 246, справка на 312.
 *     Просьба была дословно «чтобы они рядом шли».
 *
 * ⚠️ ПРОБА СМОТРИТ НАРИСОВАННОЕ ДЕРЕВО, А НЕ ИСХОДНИК. Соседний гейт про
 * питомца читает текст файла — он бы позеленел на обеих правках выше, потому что
 * `<GamePet` в файле стоял в обоих случаях. Здесь важен ПОРЯДОК и ОТСТУП, а их
 * видно только у нарисованного.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
/**
 * ⚠️ Сам питомец подменён заглушкой С ТЕМ ЖЕ testID. Под проверкой здесь СОСТАВ и
 * ПОРЯДОК угла, а не рисование спрайта: за спрайт отвечает pet-head-closeup, и
 * тянуть сюда загрузку картинок значит проверять чужое. Убрать `<GamePet>` из
 * слота проба всё равно заметит — заглушки в дереве не станет.
 */
const проПитомца: Record<string, unknown>[] = [];
jest.mock('@/src/components/pet/GamePet', () => {
  const Реакт = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      проПитомца.push(props);
      return Реакт.createElement(View, { testID: 'game-pet' });
    },
  };
});

import { HeaderRightSlot } from '@/src/components/GameShell';

beforeAll(() => {
  // react-test-renderer 19 при ЛЮБОЙ ошибке рендера зовёт window.dispatchEvent;
  // в среде jest-expo его нет, и настоящая ошибка подменяется чужой.
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

type Узел = { type: unknown; props: Record<string, unknown>; children?: unknown };

/**
 * ⚠️ ТОЛЬКО ВНУТРИ act. В react-test-renderer 19 корень конкурентный: без act
 * первый кадр не успевает встать, `toJSON()` отдаёт null, а `.root` ругается
 * «unmounted» — и проба падает не на дефекте, а на собственной торопливости.
 */
function нарисовать(props: Partial<React.ComponentProps<typeof HeaderRightSlot>> = {}) {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(
      <HeaderRightSlot
        rtl={false}
        mood="idle"
        skipLabel="пропустить"
        iconColor="#888"
        {...props}
      />,
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

describe('питомец стоит рядом со справкой', () => {
  it('🔴 питомец ПОСЛЕДНИЙ в ряду — значит ближе всех к плавающей «?»', () => {
    const root = нарисовать({ headerRight: <MarkerButton /> });
    const ids = порядок(root);
    expect(ids).toContain('game-pet');
    expect(ids).toContain('кнопка-игры');
    expect(ids.indexOf('game-pet')).toBeGreaterThan(ids.indexOf('кнопка-игры'));
  });

  it('🔴 питомец ПОСЛЕДНИЙ и когда в ряду есть пропуск шага зарядки', () => {
    const ids = порядок(нарисовать({ headerRight: <MarkerButton />, wuStep: true, wuSkip: () => {} }));
    expect(ids.indexOf('game-pet')).toBeGreaterThan(ids.indexOf('warmup-skip-step'));
    expect(ids.indexOf('warmup-skip-step')).toBeGreaterThan(ids.indexOf('кнопка-игры'));
  });

  it('🔴 отступ под справку есть ВСЕГДА, даже когда кнопок игры нет', () => {
    // Ровно тот случай, в котором питомец пропал: слот без `headerRight`.
    const root = нарисовать();
    const слот = root.findAll((у) => (у.props as Record<string, unknown>).testID === 'game-header-right')[0] as unknown as Узел;
    const стиль = ([] as Record<string, unknown>[]).concat(слот.props.style as never);
    const отступ = стиль.reduce((a, s) => a + (Number((s || {}).marginRight) || 0), 0);
    expect(отступ).toBeGreaterThanOrEqual(44);   // кнопка справки — 44 точки
  });

  it('🔴 настроение доходит до питомца — иначе он перестанет отвечать на ход', () => {
    /* Переезд угла легко сделать тихой потерей: питомец на месте, а на верный
       ход больше не прыгает. Проверяем сам проп, а не факт присутствия. */
    проПитомца.length = 0;
    нарисовать({ mood: 'good' });
    expect(проПитомца.at(-1)?.mood).toBe('good');
    нарисовать({ mood: 'bad' });
    expect(проПитомца.at(-1)?.mood).toBe('bad');
  });

  it('в правом-налево языке отступ уходит на левую сторону', () => {
    const root = нарисовать({ rtl: true });
    const слот = root.findAll((у) => (у.props as Record<string, unknown>).testID === 'game-header-right')[0] as unknown as Узел;
    const стиль = ([] as Record<string, unknown>[]).concat(слот.props.style as never);
    const слева = стиль.reduce((a, s) => a + (Number((s || {}).marginLeft) || 0), 0);
    const справа = стиль.reduce((a, s) => a + (Number((s || {}).marginRight) || 0), 0);
    expect(слева).toBeGreaterThanOrEqual(44);
    expect(справа).toBe(0);
  });
});

/** Подставная кнопка игры: занимает место `headerRight` и опознаётся по testID. */
function MarkerButton() {
  const { View } = require('react-native');
  return <View testID="кнопка-игры" />;
}
