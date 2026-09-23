/* psygames-navigator-restart-and-height · VER 1 · 23.09.2026 */
/* psygames-spatial-claude-mac · задачи b25b1fd5 и 2752f33f */
/**
 * «НАВИГАТОР»: СЛУЖЕБНОЕ — ЗНАЧКОМ ПОД ПОЛЕМ, КАРТА — ОТ ВЫСОТЫ ПОЛЯ, А НЕ ОТ ОКНА.
 *
 * 📍 Два решения Дениса 17.09.2026: служебное одним рядом значков под полем (b25b1fd5) и общая
 * жалоба «игры ездят» (2752f33f, отчёт e5bfc2f0). Обход координатора на 360×640 дал у
 * «Навигатора» +230 px переполнения.
 *
 * 🔴 ПОЧЕМУ КОНСТАНТЫ БЫЛИ ОБРЕЧЕНЫ. Карта считалась как «высота ОКНА минус 257 минус 257/355» —
 * числа, честно замеренные 16.09 по двенадцати языкам на ТОГДАШНЕМ экране. Окно не знает ни про
 * шапку каркаса, ни про полосу счётчиков, ни про ряд значков: любая правка каркаса делает такую
 * константу неверной молча. Теперь высота приходит от каркаса числом, а «всё, кроме карты»
 * меряется живьём.
 *
 * ⚠️ Проба смотрит на ПОВЕДЕНИЕ модуля и на то, что экран отдаёт каркасу, а не на текст файла.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import NavigatorGame, { сторонаКарты } from '@/src/games/navigator/NavigatorGame';
import { ВысотаПоляКаркаса } from '@/src/components/GameFieldHeight';
import { getNavigatorStrings } from '@/src/games/navigator/core';

const ТЕМА = {
  background: '#101014', surface: '#1c1c22', card: '#26262e',
  text: '#ffffff', textSecondary: '#a0a0ac', border: '#3a3a44',
  primary: '#2563eb', success: '#34c759', error: '#ff3b30', warning: '#ff9500',
};
const ГРАДИЕНТ: readonly [string, string] = ['#2563eb', '#14b8a6'];
const СЛОВА = getNavigatorStrings('ru');

function партия(высотаПоля: number, onRestartReady?: (r: () => void) => void) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      React.createElement(
        ВысотаПоляКаркаса.Provider,
        { value: высотаПоля },
        React.createElement(NavigatorGame as any, {
          seed: 'проба-1',
          level: 4,
          mode: 'route-recall',
          locale: 'ru',
          theme: ТЕМА,
          gameGradient: ГРАДИЕНТ,
          gameGradientText: '#ffffff',
          now: () => 1000,
          onRestartReady,
        }),
      ),
    );
  });
  // Модуль открывается правилами: партия (и карта) появляются после «Начать раунд».
  const старт = r.root.findAll(
    (у) => typeof (у.props as any)?.onPress === 'function'
      && JSON.stringify((у.props as any)?.label ?? '') === JSON.stringify(СЛОВА.start),
    { deep: true },
  );
  if (старт.length) act(() => { (старт[0].props as any).onPress(); });
  return r;
}

/** Сторона карты, ИЗМЕРЕННАЯ НА РИСУНКЕ, — по стилю самого квадрата (у него width === height). */
function нарисованнаяСторона(r: TestRenderer.ReactTestRenderer): number | null {
  const узлы = r.root.findAll((у) => {
    const s = (у.props as any)?.style;
    const плоско = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
    return !!плоско && typeof плоско.width === 'number' && плоско.width === плоско.height && плоско.width > 100;
  }, { deep: true });
  if (!узлы.length) return null;
  const s = (узлы[0].props as any).style;
  const плоско = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
  return плоско.width as number;
}

/** Сколько раз в партии нарисована кнопка с этой подписью. */
function кнопок(r: TestRenderer.ReactTestRenderer, подпись: string): number {
  return r.root.findAll(
    (у) => typeof (у.props as any)?.children === 'string' && (у.props as any).children === подпись,
    { deep: true },
  ).length;
}

describe('«Навигатор»: перезапуск и высота карты', () => {
  it('🔴 «Начать заново» уходит НАВЕРХ, а в партии текстовой кнопки больше нет', () => {
    let перезапуск: (() => void) | null = null;
    const r = партия(520, (f) => { перезапуск = f; });
    // Экран получил рабочий перезапуск — именно его он кладёт в пункт паузы `restart`,
    // а каркас рисует значком в ряду под полем.
    expect(typeof перезапуск).toBe('function');
    expect(кнопок(r, СЛОВА.restart)).toBe(0);
    // «Готово» — это ХОД партии, а не служебное действие: оно остаётся на своём месте.
    expect(кнопок(r, СЛОВА.ready)).toBeGreaterThan(0);
    act(() => { r.unmount(); });
  });

  it('🔴 карта считается от ВЫСОТЫ ПОЛЯ: больше поле — больше карта', () => {
    const общее = { поШирине: 360, полКарты: 168, высотаПрочего: 240, поОкну: 200 };
    const тесное = сторонаКарты({ ...общее, высотаПоля: 420 });
    const просторное = сторонаКарты({ ...общее, высотаПоля: 560 });
    expect(тесное).toBe(180);
    expect(просторное).toBe(320);
    expect(просторное).toBeGreaterThan(тесное);
  });

  it('🔴 пока замера нет, карта строится прежним путём по окну — и это не ноль', () => {
    const общее = { поШирине: 360, полКарты: 168, поОкну: 250 };
    expect(сторонаКарты({ ...общее, высотаПоля: 0, высотаПрочего: 0 })).toBe(250);
    // Замер «прочего» ещё не пришёл — высоту поля одну брать нельзя, она включает кнопки.
    expect(сторонаКарты({ ...общее, высотаПоля: 600, высотаПрочего: 0 })).toBe(250);
  });

  it('🔴 карта не мельче читаемого пола и не шире доступной ширины', () => {
    // Крошечное поле: пол по клетке (28 pt × 6) держит карту читаемой, дальше — прокрутка.
    expect(сторонаКарты({ поШирине: 360, полКарты: 168, высотаПоля: 200, высотаПрочего: 190, поОкну: 10 })).toBe(168);
    // Широкий экран: шире доступной ширины карта не растёт.
    expect(сторонаКарты({ поШирине: 300, полКарты: 168, высотаПоля: 900, высотаПрочего: 100, поОкну: 10 })).toBe(300);
  });
});
