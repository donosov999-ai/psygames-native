/**
 * 🔴 НА ПЕРВЫХ УРОВНЯХ У ПРЕДМЕТА В ЛЕНТЕ ВИДНО ИМЯ — ИНАЧЕ СВЯЗЫВАТЬ НЕЧЕГО.
 *
 * ОТКУДА. Два отчёта NZT-48 подряд (31.08 и 02.09.2026): «нихуя не понятно ни по
 * смыслу игры». Заход 06.09.2026 сыграл три уровня живьём и нашёл причину:
 * на фазе размещения предметы нарисованы БЕЗ ПОДПИСЕЙ — только фигура и цвет.
 * Имя лежало единственно в `accessibilityLabel`, то есть было доступно
 * скринридеру и невидимо зрячему.
 *
 * ПОЧЕМУ ЭТО ЛОМАЕТ ИМЕННО ЭТУ ИГРУ. Приём «дворец памяти» — связать ЯРКИЙ ОБРАЗ
 * с местом. Человек связывал «оранжевый ромб» с фонтаном, а на опросе его
 * спрашивали «Оранжевая лампа?»: связка строилась на цвете и форме, а
 * спрашивалась словом. Разные носители на входе и на выходе.
 *
 * ⚠️ ПОДПИСИ УБРАЛ ПРЕДЫДУЩИЙ ЗАХОД — И НЕ ПО НЕДОСМОТРУ. Комментарий в
 * `ItemChoice` объясняет: плитку ужали до 76×76 без подписи, чтобы лента и сцена
 * мест влезли в один экран (жалоба «бегаешь между двумя экранами», задача
 * 9421ebcb). То есть починка беготни и породила непонятность.
 *
 * 📍 ЗАМЕР ДО (эта проба на неправленом коде): в ленте фазы размещения 0 подписей
 * из 7 предметов на уровне 1, 0 из 7 на уровне 2, 0 из 8 на уровне 3.
 *
 * 🔴 ПОЭТОМУ ПРОБА СТОРОЖИТ ОБА КРАЯ СРАЗУ, и в этом её смысл:
 *   1. имена на уровнях 1–3 видны глазами (лечит непонятность);
 *   2. плитка остаётся 76×76 (`PLACE_LAYOUT.itemTile`) — подпись вложена
 *      ВНУТРЬ, а не приписана снизу, поэтому высота ленты не растёт и беготня
 *      не возвращается. Проверку вмещения держит соседняя проба
 *      `memory-palace-place-fits-screen`, и она обязана остаться зелёной.
 * Вернуть подписи, распухнув по высоте, эта пара не даст.
 *
 * ГРАНИЦА. Начиная с уровня 4 подписи снова нет: к этому моменту человек прошёл
 * приём трижды, а предметов становится 8 и больше. Решение Дениса 06.09.2026:
 * «подписи показывать только первые 2-3 уровня, дальше убирать».
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import { PLACE_LAYOUT, MEMORY_PALACE_LABELLED_LEVELS } from '@/src/games/memory-palace/placeLayout';
import {
  continueToPlacement,
  createMemoryPalaceSession,
  getItemLabel,
  startMemoryPalaceRound,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';

const TestRenderer = require('react-test-renderer'); // eslint-disable-line @typescript-eslint/no-require-imports

const тема = {
  background: '#fff', surface: '#f4f4f5', card: '#fff', text: '#111',
  textSecondary: '#555', primary: '#7c3aed', border: '#ddd',
  success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
};

function партияВРазмещении(level: number): MemoryPalaceSession {
  let s = createMemoryPalaceSession({ seed: 'проба-имён', level });
  s = startMemoryPalaceRound(s, 1_000);
  return continueToPlacement(s);
}

function нарисовать(level: number) {
  const session = партияВРазмещении(level);
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      <MemoryPalaceGame
        seed="проба-имён"
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
  const ленты = r.root.findAll((n: any) => n.props?.horizontal === true);
  /** Весь текст, лежащий ВНУТРИ ленты предметов. */
  const текстВЛенте: string[] = [];
  if (ленты.length > 0) {
    for (const узел of ленты[0].findAll((n: any) => typeof n.type === 'string')) {
      const сырые: unknown = узел.props?.children;
      const дети: unknown[] = Array.isArray(сырые) ? сырые : [сырые];
      for (const ребёнок of дети) {
        if (typeof ребёнок === 'string' && ребёнок.trim()) текстВЛенте.push(ребёнок.trim());
      }
    }
  }
  return { r, session, ленты, текстВЛенте };
}

describe('Дворец памяти · имя предмета видно на первых уровнях', () => {
  it('есть что проверять: партия в фазе размещения, лента предметов нарисована', () => {
    const { session, ленты, r } = нарисовать(1);
    expect(session.phase).toBe('place');
    expect(ленты.length).toBeGreaterThan(0);
    expect(session.round.targetItems.length).toBeGreaterThan(0);
    TestRenderer.act(() => { r.unmount(); });
  });

  /** 🔴 Сам дефект: на уровнях 1–3 имя КАЖДОГО предмета читается глазами. */
  it('🔴 уровни 1–3: имя каждого предмета подписано в ленте', () => {
    for (let level = 1; level <= MEMORY_PALACE_LABELLED_LEVELS; level++) {
      const { r, session, текстВЛенте } = нарисовать(level);
      const ожидаемые = session.round.targetItems.map((i: any) => getItemLabel(i, 'ru'));
      const найдено = ожидаемые.filter((имя: string) => текстВЛенте.includes(имя));
      expect({ level, найдено: найдено.length, всего: ожидаемые.length })
        .toEqual({ level, найдено: ожидаемые.length, всего: ожидаемые.length });
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /**
   * 🔴 ВТОРОЙ КРАЙ: подпись вложена в плитку, а не приписана снизу. Плитка
   * обязана остаться 76×76 — иначе лента вырастет и вернётся беготня, ради
   * лечения которой подписи когда-то и убрали.
   */
  it('🔴 плитка предмета остаётся 76×76 — лента не растёт по высоте', () => {
    for (const level of [1, 3]) {
      const { r, session, ленты } = нарисовать(level);
      const плитка = (n: any) => {
        if (typeof n.type !== 'string') return false;
        const st = StyleSheet.flatten(n.props?.style) as any;
        return Boolean(st && st.width === PLACE_LAYOUT.itemTile && st.height === PLACE_LAYOUT.itemTile);
      };
      expect(ленты[0].findAll(плитка).length).toBeGreaterThanOrEqual(session.round.targetItems.length);
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /** ГРАНИЦА: с четвёртого уровня подписей в ленте больше нет. */
  it('уровень 4 и дальше: подписи в ленте нет', () => {
    const { r, session, текстВЛенте } = нарисовать(MEMORY_PALACE_LABELLED_LEVELS + 1);
    const имена = session.round.targetItems.map((i: any) => getItemLabel(i, 'ru'));
    expect(имена.filter((имя: string) => текстВЛенте.includes(имя))).toEqual([]);
    TestRenderer.act(() => { r.unmount(); });
  });
});
