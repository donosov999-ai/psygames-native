/**
 * 🔴 ПЕРЕХОД МЕЖДУ ФАЗАМИ НЕ ДОЛЖЕН РОНЯТЬ ИГРУ.
 *
 * ОТКУДА. 07.09.2026 «Дворец памяти» получил перенос действия фазы в каркас:
 * модуль отдаёт действие пропом `onPhaseAction`, экран кладёт его в `toolbar`.
 * Блок с `useMemo` и `useEffect` встал ПОСЛЕ ранних `return` по фазам — и партия
 * начала падать на первом же нажатии «Начать маршрут»:
 *
 *   фаза `rules`  → функция выходит раньше блока → хуков 5
 *   фаза `route`  → доходит до блока               → хуков 7
 *   React #310 «Rendered more hooks than during the previous render» → белый
 *   экран «🛠️ Что-то сломалось».
 *
 * 📍 ЧЕМ ЭТО БЫЛО НАЙДЕНО И ЧТО ПРОПУСТИЛИ. Не пробами: на сломанном коде были
 * зелены все 92 пробы раздела и чистый `tsc`. Нашлось живым заходом в браузер
 * (`memory-hearing-chat/measure-geometry.mjs` не увидел якорь каркаса, диагностика
 * показала React #310 после второго нажатия). Причина слепоты видна в соседних
 * пробах: каждая монтирует модуль СРАЗУ в нужной фазе через `initialSession` и
 * ни одна не проходит переход внутри одного смонтированного дерева — а ломается
 * именно переход. Проверка фазы по отдельности не заменяет проверку перехода.
 *
 * ЧТО СТОРОЖИТ. Игры раздела, у которых действие/ответ вынесены из модуля
 * наружу, обязаны пережить смену фазы в живом дереве. Проба намеренно не знает
 * ни про хуки, ни про их число: она нажимает кнопку и требует, чтобы дерево
 * осталось живым и фаза сменилась. Любая будущая перестановка хуков — не только
 * эта — покраснеет здесь.
 */
import React from 'react';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import { getMemoryPalaceStrings } from '@/src/games/memory-palace/core';
import FacesNamesGame from '@/src/games/faces-names/FacesNamesGame';
import { getFacesNamesStrings } from '@/src/games/faces-names/core';

const TestRenderer = require('react-test-renderer'); // eslint-disable-line @typescript-eslint/no-require-imports

const тема = {
  background: '#fff', surface: '#f4f4f5', card: '#fff', text: '#111',
  textSecondary: '#555', primary: '#7c3aed', onPrimary: '#fff', border: '#ddd',
  success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
};

/** Весь видимый текст дерева — по нему узнаём фазу и ловим экран аварии. */
function текстом(r: any): string {
  const куски: string[] = [];
  for (const узел of r.root.findAll((n: any) => typeof n.type === 'string')) {
    const сырые: unknown = узел.props?.children;
    for (const ребёнок of (Array.isArray(сырые) ? сырые : [сырые])) {
      if (typeof ребёнок === 'string' && ребёнок.trim()) куски.push(ребёнок.trim());
    }
  }
  return куски.join(' | ');
}

/**
 * Нажать кнопку по её надписи. Ищем узел с `onPress`, внутри которого лежит
 * нужный текст — так проба не привязана ни к имени компонента, ни к вёрстке.
 */
function нажать(r: any, надпись: string): boolean {
  const кнопки = r.root.findAll((n: any) => typeof n.props?.onPress === 'function' && !n.props?.disabled);
  for (const кнопка of кнопки) {
    if (текстом({ root: кнопка }).includes(надпись)) {
      TestRenderer.act(() => { кнопка.props.onPress(); });
      return true;
    }
  }
  return false;
}

describe('Память и слух · смена фазы не роняет игру', () => {
  const палец = getMemoryPalaceStrings('ru');

  it('есть что проверять: «Дворец» монтируется на правилах и кнопка старта видна', () => {
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <MemoryPalaceGame
          seed="проба-перехода" level={1} locale="ru" theme={тема}
          gameGradient={['#7c3aed', '#2dd4bf'] as const} gameGradientText="#fff"
          showOwnResults={false} now={() => 1_000}
          onPhaseAction={() => {}}
        />,
      );
    });
    expect(текстом(r)).toContain(палец.start);
    r.unmount();
  });

  /**
   * 🔴 Сам гейт. `onPhaseAction` передан — то есть модуль работает в том самом
   * режиме, в котором действие уезжает в каркас: без пропа ветка другая и
   * поломка бы не воспроизвелась.
   */
  it('🔴 «Дворец»: правила → маршрут проходят без падения', () => {
    const действия: unknown[] = [];
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <MemoryPalaceGame
          seed="проба-перехода" level={1} locale="ru" theme={тема}
          gameGradient={['#7c3aed', '#2dd4bf'] as const} gameGradientText="#fff"
          showOwnResults={false} now={() => 1_000}
          onPhaseAction={(д) => действия.push(д)}
        />,
      );
    });

    // Само нажатие. Если хуки переставлены — здесь и рвётся, с React #310.
    expect(нажать(r, палец.start)).toBe(true);

    const после = текстом(r);
    // Экран правил ушёл — значит переход состоялся, а не был проглочен.
    expect(после).not.toContain(палец.rulesTitle);
    // И наружу уехало непустое действие фазы: ради него всё и затевалось.
    expect(действия.filter(Boolean).length).toBeGreaterThan(0);
    r.unmount();
  });

  it('🔴 «Лица и имена»: правила → изучение проходят без падения', () => {
    const ответы: unknown[] = [];
    const лица = getFacesNamesStrings('ru');
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <FacesNamesGame
          seed="проба-перехода" level={1} locale="ru" theme={тема}
          gameGradient={['#7c3aed', '#2dd4bf'] as const} gameGradientText="#fff"
          now={() => 1_000}
          onAnswer={(о) => ответы.push(о)}
        />,
      );
    });
    expect(текстом(r)).toContain(лица.start);

    expect(нажать(r, лица.start)).toBe(true);

    expect(текстом(r)).not.toContain(лица.rulesTitle);
    expect(ответы.filter(Boolean).length).toBeGreaterThan(0);
    r.unmount();
  });

  /**
   * 🔴 ИСКЛЮЧЕНИЕ ДЛЯ ФАЗЫ УЗНАВАНИЯ — ПРОВЕРЯЕМОЕ, А НЕ ОБЪЯВЛЕННОЕ.
   *
   * Решётка портретов остаётся сценой и наружу не уезжает: живой замер 07.09.2026
   * показал, что у слота `toolbar` поля под плавающие кнопки (`FAB_GUTTER = 66`
   * с двух сторон) оставляют 243 пикселя из 375, а двум плиткам лица нужно 314 —
   * в каркасе они встают столбиком на 354 пикселя, оставляя сцену пустой. Ужать
   * лицо значило бы подкрутить сложность ухудшением картинки: похожесть
   * портретов у этой игры и есть ось роста.
   *
   * Проба держит ОБА края, чтобы исключение не расползлось:
   *   1. на фазе узнавания наружу уходит `null` — полосы ответа там нет;
   *   2. лица при этом нарисованы, то есть игра не осталась без ответа вовсе.
   * Если кто-то однажды перенесёт лица в каркас, покраснеет пункт 1 и заставит
   * перечитать замер, а не просто «поправить проваленную пробу».
   */
  it('🔴 «Лица и имена»: узнавание лиц остаётся сценой, а не полосой ответа', () => {
    const лица = getFacesNamesStrings('ru');
    let последний: any = null;
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <FacesNamesGame
          seed="проба-узнавания" level={1} locale="ru" theme={тема}
          gameGradient={['#7c3aed', '#2dd4bf'] as const} gameGradientText="#fff"
          now={() => 1_000}
          onAnswer={(о: any) => { последний = о; }}
        />,
      );
    });
    нажать(r, лица.start);

    // Идём по партии ЧЕРЕЗ ОТДАННОЕ НАРУЖУ ОПИСАНИЕ: внутри модуль эти кнопки
    // больше не рисует, значит и проба обязана ходить тем же путём, что экран.
    for (let шаг = 0; шаг < 12 && !текстом(r).includes(лица.recognitionPrompt); шаг++) {
      const действие = последний?.options?.[0];
      if (!действие) break;
      TestRenderer.act(() => { действие.run(); });
    }

    expect(текстом(r)).toContain(лица.recognitionPrompt);   // дошли до узнавания
    expect(последний).toBeNull();                            // полосы ответа нет
    // …но ответить есть чем: лица нарисованы внутри партии.
    const лицаНаЭкране = r.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && /^\d+\. /.test(String(n.props?.accessibilityLabel ?? '')));
    expect(лицаНаЭкране.length).toBeGreaterThanOrEqual(2);
    r.unmount();
  });
});
