/*
 * eslint-disable import/first — подмены (`jest.mock`) обязаны стоять ДО ввоза
 * проверяемого компонента: иначе он захватит настоящие контексты и проба
 * упадёт на теме, а не на замке.
 */
/* eslint-disable import/first */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { translateFor } from '@/src/contexts/LanguageContext';

/**
 * ЗАМКИ ЛЕСТНИЦЫ ПРОВЕРЯЮТСЯ ПО НАРИСОВАННОМУ, А НЕ ПО ИСХОДНИКУ.
 *
 * Гейт, читающий исходник, в этом проекте краснел на правильной правке девять
 * раз за один день. Поэтому кнопка честно рендерится при разных уровнях, и
 * проверяется то, что увидит игрок: иконка замка вместо приёма, ответ на
 * нажатие, вызов обработчика.
 *
 * Тема и язык подменены нарочно: под проверкой ЗАМОК, а не оформление. Текст
 * при этом берётся НАСТОЯЩИЙ (`translateFor('ru', …)`), иначе проба зеленела бы
 * на пустой строке.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => {
  const настоящий = jest.requireActual('@/src/contexts/LanguageContext');
  return { ...настоящий, useLanguage: () => ({ t: (k: string) => настоящий.translateFor('ru', k) }) };
});

import { GameAuxAction } from '@/src/components/GameAuxAction';
import { PlayerLevelValue } from '@/src/contexts/PlayerLevelContext';

beforeAll(() => {
  // react-test-renderer 19 при ЛЮБОЙ ошибке рендера зовёт window.dispatchEvent;
  // в среде jest-expo его нет, и настоящая ошибка подменяется чужой.
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

type Узел = { type: unknown; props: Record<string, unknown> };

function нарисовать(level: number | null, props: Record<string, unknown> = {}) {
  const нажатия: number[] = [];
  let дерево!: renderer.ReactTestRenderer;
  act(() => {
    дерево = renderer.create(
      <PlayerLevelValue level={level}>
        <GameAuxAction ladder="hint" label="Подсказка" icon="bulb"
          onPress={() => nажатия_push(нажатия)} {...props} />
      </PlayerLevelValue>,
    );
  });
  return { дерево, нажатия, ...снять(дерево) };
}
function nажатия_push(a: number[]) { a.push(1); }

function снять(дерево: renderer.ReactTestRenderer) {
  const все = дерево.root.findAll(() => true, { deep: true }) as unknown as Узел[];
  const иконки = все.map((n) => n.props?.name).filter((v): v is string => typeof v === 'string');
  const тексты = JSON.stringify(дерево.toJSON());
  const кнопка = все.find((n) => n.props?.testID === 'game-aux')!;
  return { иконки, тексты, кнопка };
}

describe('лестница замков — служебные кнопки', () => {
  it('🔴 новичок видит ЗАМОК, а не пустоту: кнопка остаётся на месте', () => {
    const { иконки, тексты } = нарисовать(0);
    expect(иконки).toContain('lock-closed');
    expect(иконки).not.toContain('bulb');
    expect(тексты).toContain('Подсказка');
  });

  it('🔴 запертая кнопка ОТВЕЧАЕТ на нажатие, а не молчит', () => {
    const { дерево, кнопка, нажатия } = нарисовать(0);
    expect(кнопка.props.disabled).toBeFalsy();
    act(() => { (кнопка.props.onPress as () => void)(); });
    expect(JSON.stringify(дерево.toJSON())).toContain(translateFor('ru', 'ladderLockedAt').replace('{n}', '2'));
    expect(нажатия).toEqual([]);   // сам приём не сработал
  });

  it('открытый уровень возвращает обычную кнопку и обработчик', () => {
    const { иконки, кнопка, нажатия } = нарисовать(10);
    expect(иконки).toContain('bulb');
    expect(иконки).not.toContain('lock-closed');
    act(() => { (кнопка.props.onPress as () => void)(); });
    expect(нажатия).toEqual([1]);
  });

  it('🔴 уровень НЕИЗВЕСТЕН — замка нет: приём не мигает запертым на первом кадре', () => {
    expect(нарисовать(null).иконки).toContain('bulb');
    expect(нарисовать(null).иконки).not.toContain('lock-closed');
  });

  it('ровно на пороге приём уже открыт', () => {
    expect(нарисовать(2).иконки).toContain('bulb');
    expect(нарисовать(1).иконки).toContain('lock-closed');
  });

  it('кнопка без ключа лестницы не запирается никогда', () => {
    expect(нарисовать(0, { ladder: undefined }).иконки).toContain('bulb');
  });

  it('неизвестный ключ открыт: замок должен быть явным', () => {
    expect(нарисовать(0, { ladder: 'такого-приёма-нет' }).иконки).toContain('bulb');
  });

  it('🔴 скринридеру запертая кнопка называет условие, а не только подпись', () => {
    const { кнопка } = нарисовать(0);
    expect(String(кнопка.props.accessibilityLabel)).toMatch(/Подсказка/);
    expect(String(кнопка.props.accessibilityLabel)).toMatch(/уровне 2/);
  });
});
