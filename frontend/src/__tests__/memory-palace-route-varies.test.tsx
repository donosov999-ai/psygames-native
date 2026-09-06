/**
 * 🔴 С ШЕСТОГО УРОВНЯ МАРШРУТ СВОЙ У КАЖДОЙ ПАРТИИ — И НОМЕРА СКРЫТЫ.
 *
 * ОТКУДА. Заход 06.09.2026 прошёл три уровня живьём и увидел: фаза «Маршрут»
 * ничего не тренирует. Правила объявляют её шагом 1 из 3 («Маршрут: запомните
 * порядок мест»), а порядок был один и тот же на всех пятнадцати уровнях —
 * `FIXED_PALACE_ROUTE.slice(0, lociCount)`, и экран сам писал «Порядок
 * постоянный». Запоминать было нечего: обещанная работа отсутствовала.
 *
 * 📍 ЗАМЕР ДО (живая игра, уровни 1, 2 и 3): маршрут совпадал побуквенно —
 * Арка входа → Фонтан → Галерея → Лестница → Высокое окно, на третьем уровне
 * та же цепочка плюс Библиотека. Уровней с переменным маршрутом: 0 из 15.
 *
 * 🔴 ПОЧЕМУ ОДНОГО ПЕРЕМЕШИВАНИЯ БЫЛО БЫ МАЛО — И ЭТО ГЛАВНОЕ В ЭТОЙ ПРОБЕ.
 * Номер места рисуется в ромбе плитки на ВСЕХ фазах, включая опрос. Пока номер
 * виден в момент вопроса, порядок читается с экрана, а не держится в голове:
 * перемешай хоть все двенадцать мест — нагрузка не вырастет ни на единицу, а
 * лестница будет «расти» только на бумаге. Ровно то, о чём предупреждает §4.2
 * ТЗ раздела на примере «Соедини точки»: тридцать четыре уровня выглядели
 * растущими, а на 25-м медиана оказалась нулём.
 * Поэтому проба проверяет ДВЕ вещи разом, и порознь каждая ничего не стоит:
 *   1. порядок мест на уровнях 6+ различается между партиями;
 *   2. номер вне фазы маршрута НЕ нарисован — ни глазами, ни в подписи для
 *      скринридера. Второе важно отдельно: оставить номер в `accessibilityLabel`
 *      значило бы раздать незрячему подсказку, которой нет у зрячего, и сделать
 *      это молча — глазами такую утечку не увидеть.
 *
 * ГРАНИЦА. До пятого уровня включительно маршрут постоянен: в приёме loci опора
 * должна быть знакомой (свой дом), человек осваивает сам приём, и трудность
 * растёт числом мест. Решение Дениса 06.09.2026, вариант C.
 */
import React from 'react';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  createMemoryPalaceSession,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  generateMemoryPalaceRound,
  getMemoryPalaceStrings,
  memoryPalaceRouteIsShuffled,
  MEMORY_PALACE_FIXED_ROUTE_LEVELS,
  startMemoryPalaceRound,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';

const TestRenderer = require('react-test-renderer'); // eslint-disable-line @typescript-eslint/no-require-imports

const тема = {
  background: '#fff', surface: '#f4f4f5', card: '#fff', text: '#111',
  textSecondary: '#555', primary: '#7c3aed', border: '#ddd',
  success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
};

const маршрут = (seed: string, level: number) =>
  generateMemoryPalaceRound(seed, level).loci.map((l) => l.id).join(',');

/**
 * Разложить все предметы и закрепить — партия оказывается в фазе ИЗУЧЕНИЯ.
 * Она нужна отдельно: именно там место рисуется без обработчика нажатия, а
 * значит подпись для скринридера идёт по ветке `locusA11y`, где и стоит номер.
 * В размещении у места есть onPress, подпись собирается по другой ветке, и
 * проверка «нет номера в подписи» была бы там зелёной всегда — то есть
 * бессмысленной.
 */
function довестиДоИзучения(session: MemoryPalaceSession): MemoryPalaceSession {
  let s = continueToPlacement(session);
  s.round.targetItems.forEach((item, index) => {
    s = selectPlacementItem(s, item.id);
    s = placeSelectedItemAtLocus(s, index);
  });
  return confirmMemoryPalacePlacements(s);
}

function нарисовать(level: number, фаза: 'route' | 'place' | 'study') {
  let session: MemoryPalaceSession = createMemoryPalaceSession({ seed: 'проба-маршрута', level });
  session = startMemoryPalaceRound(session, 1_000);
  if (фаза === 'place') session = continueToPlacement(session);
  if (фаза === 'study') session = довестиДоИзучения(session);
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      <MemoryPalaceGame
        seed="проба-маршрута"
        level={level}
        locale="ru"
        theme={тема}
        gameGradient={['#7c3aed', '#2dd4bf'] as const}
        gameGradientText="#fff"
        showOwnResults={false}
        now={() => 1_000}
        initialSession={session}
      />,
    );
  });
  /** Номера, нарисованные глазами: текстовый узел ровно из цифр. */
  const цифры: string[] = [];
  for (const узел of r.root.findAll((n: any) => typeof n.type === 'string')) {
    const дети = Array.isArray(узел.props?.children) ? узел.props.children : [узел.props?.children];
    for (const ребёнок of дети) {
      if (typeof ребёнок === 'number') цифры.push(String(ребёнок));
      else if (typeof ребёнок === 'string' && /^\d{1,2}$/.test(ребёнок.trim())) цифры.push(ребёнок.trim());
    }
  }
  /** Все подписи для скринридера. */
  const подписи: string[] = r.root
    .findAll((n: any) => typeof n.type === 'string' && n.props?.accessibilityLabel)
    .map((n: any) => String(n.props.accessibilityLabel));
  return { r, session, цифры, подписи };
}

describe('Дворец памяти · маршрут перестаёт быть постоянным с шестого уровня', () => {
  it('есть что проверять: граница объявлена и предикат ей следует', () => {
    expect(MEMORY_PALACE_FIXED_ROUTE_LEVELS).toBe(5);
    expect(memoryPalaceRouteIsShuffled(5)).toBe(false);
    expect(memoryPalaceRouteIsShuffled(6)).toBe(true);
  });

  /** До границы опора неизменна — человек учит приём на знакомой дороге. */
  it('уровни 1–5: маршрут один и тот же при любом зерне', () => {
    for (let level = 1; level <= MEMORY_PALACE_FIXED_ROUTE_LEVELS; level++) {
      expect(маршрут('зерно-а', level)).toBe(маршрут('зерно-б', level));
    }
  });

  /** 🔴 Сам дефект: после границы порядок обязан различаться между партиями. */
  it('🔴 уровни 6–15: у разных партий разный порядок мест', () => {
    const различий = [];
    for (let level = MEMORY_PALACE_FIXED_ROUTE_LEVELS + 1; level <= 15; level++) {
      if (маршрут('зерно-а', level) !== маршрут('зерно-б', level)) различий.push(level);
    }
    expect({ уровней_с_переменным_маршрутом: различий.length, всего: 10 })
      .toEqual({ уровней_с_переменным_маршрутом: 10, всего: 10 });
  });

  /** Одно зерно — та же партия: иначе поднятая из хранилища партия рассыплется. */
  it('одно зерно даёт тот же маршрут', () => {
    expect(маршрут('зерно-а', 9)).toBe(маршрут('зерно-а', 9));
  });

  /** Нумерация всегда подряд: перемешивается состав, а не счёт. */
  it('номера идут 1..N и после перемешивания', () => {
    const loci = generateMemoryPalaceRound('зерно-в', 12).loci;
    expect(loci.map((l) => l.order)).toEqual(loci.map((_, i) => i + 1));
  });

  /**
   * 🔴 ВТОРАЯ ПОЛОВИНА, БЕЗ КОТОРОЙ ПЕРВАЯ ПУСТА: номер виден в фазе маршрута
   * и скрыт в размещении. Иначе порядок читается с экрана в момент вопроса.
   */
  it('🔴 уровень 8: номер есть в фазе маршрута и пропал в размещении', () => {
    const маршрутный = нарисовать(8, 'route');
    expect(маршрутный.цифры.length).toBeGreaterThan(0);
    TestRenderer.act(() => { маршрутный.r.unmount(); });

    const размещение = нарисовать(8, 'place');
    expect({ фаза: 'place', номеров: размещение.цифры.length }).toEqual({ фаза: 'place', номеров: 0 });
    TestRenderer.act(() => { размещение.r.unmount(); });
  });

  /**
   * 🔴 НОМЕР НЕ ДОЛЖЕН УТЕЧЬ И В ПОДПИСЬ ДЛЯ СКРИНРИДЕРА — проверяется в фазе
   * ИЗУЧЕНИЯ, а не размещения.
   *
   * ⚠️ Первая редакция этой проверки смотрела фазу размещения и была зелёной
   * ДАЖЕ НА МУТАЦИИ «номер рисуется всегда»: у места там есть onPress, подпись
   * собирается по ветке placeAt/chooseItem, где номера нет ни при каком
   * поведении. Проверка мерила не то, что заявляла, и вскрыла это мутация, а не
   * чтение кода.
   */
  it('🔴 уровень 8: в подписях мест изучения нет номера, на уровне 3 — есть', () => {
    const строки = getMemoryPalaceStrings('ru');
    const начало = строки.locusA11y.split('{order}')[0];   // «Место »

    const высокий = нарисовать(8, 'study');
    expect({ уровень: 8, подписей_с_номером: высокий.подписи.filter((п) => п.startsWith(начало)).length })
      .toEqual({ уровень: 8, подписей_с_номером: 0 });
    TestRenderer.act(() => { высокий.r.unmount(); });

    const низкий = нарисовать(3, 'study');
    expect(низкий.подписи.filter((п) => п.startsWith(начало)).length).toBeGreaterThan(0);
    expect(низкий.цифры.length).toBeGreaterThan(0);
    TestRenderer.act(() => { низкий.r.unmount(); });
  });

  /** Подсказка фазы маршрута перестала обещать постоянный порядок. */
  it('🔴 на уровне 8 текст фазы маршрута другой, чем на первом', () => {
    const строки = getMemoryPalaceStrings('ru');
    expect(строки.routeBody).not.toBe(строки.routeBodyShuffled);
    expect(строки.routeBody).toContain('постоянный');
    expect(строки.routeBodyShuffled).not.toContain('постоянный');
  });
});
