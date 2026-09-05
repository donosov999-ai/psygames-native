/**
 * 🔴 ФАЗА РАЗМЕЩЕНИЯ ПОМЕЩАЕТСЯ В ЭКРАН: ПРЕДМЕТ И МЕСТО ВИДНЫ ВМЕСТЕ.
 *
 * ОТКУДА. Отзыв тестировщицы, запись `afa77c5a` в `app_feedback` (02.09.2026),
 * дословно: «надо бегать вверх вниз чтобы что-то с чем-то совместить по сути
 * между двумя страницами бегаешь целую игру».
 *
 * 📍 ЗАМЕР ДО, живая сборка 05.09.2026, 375×812, ru, уровень 1 (пять мест):
 * видимая высота игры 741 точка, содержимое фазы размещения 1595 — за экраном
 * 854 точки. Блоки: шапка 79, строка смысла 76, инструкция 96, сетка предметов
 * 162 (два ряда), строка выбора 19, СЦЕНА МЕСТ 820, счётчик 18, подсказка 38,
 * кнопка 48, клавиатурная подсказка 38; зазоры 9×18 = 162, поля 40. Лента
 * предметов кончалась на 558, первое место начиналось на 613: пара, которую и
 * надо совместить, не помещалась вместе НИ РАЗУ за партию.
 *
 * 📍 ЗАМЕР ПОСЛЕ, там же: уровень 1 — содержимое 682 при видимых 741, за экраном
 * 0; уровень 15 (двенадцать мест) — 774, за экраном 33, и эти 33 — только кнопка
 * «Запомнить размещение» с клавиатурной подсказкой, тогда как лента предметов
 * (335…411) и ВСЯ сцена мест (445…729) стоят на экране ОДНОВРЕМЕННО на обоих
 * уровнях. Сцена мест ужалась с 820 точек до 192 (пять мест) и 284 (двенадцать).
 *
 * ⚠️ ЧЕМ ЭТА ПРОБА ОТЛИЧАЕТСЯ ОТ ЧТЕНИЯ ИСХОДНИКА. Проверок здесь две, и порознь
 * каждая дырявая:
 *   1. ЖИВОЕ ДЕРЕВО. Игра доводится до фазы размещения и рисуется
 *      react-test-renderer'ом; из дерева снимаются НАСТОЯЩИЕ стили — высота
 *      плитки места, доля ширины, поле и зазор контейнера — и проверяется, что
 *      предметы лежат в ГОРИЗОНТАЛЬНОЙ прокрутке, а не в переносимой сетке.
 *      Без этого формула могла бы быть верной при неверной разметке.
 *   2. ВЫСОТА ПО ФОРМУЛЕ `memoryPalacePlaceHeight` — та же, из которой собраны
 *      стили. Без неё разметка могла бы быть «компактной» и всё равно не
 *      помещаться.
 * Вернуть старую раскладку так, чтобы обе остались зелёными, нельзя: правка
 * разметки роняет первую, правка констант — вторую.
 *
 * ⚠️ Модель переноса текста (`textBlockHeight`) — модель, а не метрика шрифта.
 * Её точность проверена по живому замеру 05.09.2026: на уровне 15 формула даёт
 * 776 при настоящих 774, на уровне 1 — 684 при настоящих 682. Ошибка — две точки,
 * и она в запас. Худший из двенадцати языков (испанский, девять мест) — 794.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import {
  PLACE_LAYOUT,
  memoryPalacePlaceHeight,
  palaceColumns,
  palaceLocusBasis,
  type PlaceTextLengths,
} from '@/src/games/memory-palace/placeLayout';
import {
  continueToPlacement,
  createMemoryPalaceSession,
  getMemoryPalaceStrings,
  interpolateMemoryPalace,
  memoryPalaceLociCountForLevel,
  startMemoryPalaceRound,
  MEMORY_PALACE_LOCALES,
  type MemoryPalaceLocale,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';

const TestRenderer = require('react-test-renderer'); // eslint-disable-line @typescript-eslint/no-require-imports

/** Экран тестировщицы: iPhone-портрет. */
const ЭКРАН = { ширина: 375, высота: 812 };
/**
 * Видимая высота САМОЙ ИГРЫ: экран минус шапка приложения. Замер 05.09.2026 —
 * прокрутка игры начинается на 71 и имеет 741 точку.
 */
const ВИДИМО = 741;

const тема = {
  background: '#fff', surface: '#f4f4f5', card: '#fff', text: '#111',
  textSecondary: '#555', primary: '#7c3aed', border: '#ddd',
  success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
};

/** Партия, доведённая до фазы размещения, — её и рисуем. */
function партияВРазмещении(level: number): MemoryPalaceSession {
  let s = createMemoryPalaceSession({ seed: 'проба-раскладки', level });
  s = startMemoryPalaceRound(s, 1_000);
  return continueToPlacement(s);
}

/** Длины строк фазы размещения ровно те, что стоят в разметке. */
function длиныСтрок(locale: MemoryPalaceLocale, мест: number): PlaceTextLengths {
  const s = getMemoryPalaceStrings(locale);
  return {
    title: s.placeTitle.length,
    progress: interpolateMemoryPalace(s.placementProgress, { current: 0, total: мест }).length,
    purpose: s.purpose.length,
    // В разметке это ОДИН блок: `placeBody` + пробел + `placementChangeHint`.
    instructions: (s.placeBody + ' ' + s.placementChangeHint).length,
    selected: s.chooseItem.length,
    keyboardHelp: s.keyboardHelp.length,
  };
}

function нарисовать(level: number) {
  const session = партияВРазмещении(level);
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      <MemoryPalaceGame
        seed="проба-раскладки"
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
  /** Все узлы-хосты с разложенным стилем. */
  const узлы = r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.style)
    .map((n: any) => ({ node: n, style: StyleSheet.flatten(n.props.style) as any }))
    .filter((x: any) => x.style);
  /** Горизонтальные прокрутки — лента предметов. */
  const ленты = r.root.findAll((n: any) => n.props?.horizontal === true);
  return { r, session, узлы, ленты, root: r.root };
}

describe('Дворец памяти · раскладка размещения помещается в экран', () => {
  it('есть что проверять: партия действительно в фазе размещения', () => {
    const { session, r } = нарисовать(1);
    expect(session.phase).toBe('place');
    expect(session.round.lociCount).toBe(5);
    TestRenderer.act(() => { r.unmount(); });
  });

  /**
   * 🔴 ПРЕДМЕТЫ — ЛЕНТА, А НЕ ПЕРЕНОСИМАЯ СЕТКА. Именно перенос давал два ряда
   * (162 точки) и отодвигал места за экран. Проверяется на живом дереве: плитки
   * предметов обязаны лежать ВНУТРИ горизонтальной прокрутки.
   */
  it('🔴 плитки предметов лежат в горизонтальной прокрутке', () => {
    for (const level of [1, 15]) {
      const { r, session, ленты, root } = нарисовать(level);
      expect(ленты.length).toBeGreaterThan(0);
      const плитка = (n: any) => {
        if (typeof n.type !== 'string') return false;
        const st = StyleSheet.flatten(n.props?.style) as any;
        return Boolean(st && st.width === PLACE_LAYOUT.itemTile && st.height === PLACE_LAYOUT.itemTile);
      };
      const внутри = ленты[0].findAll(плитка).length;
      const всего = root.findAll(плитка).length;
      expect(внутри).toBeGreaterThanOrEqual(session.round.targetItems.length);
      // снаружи ленты не осталось НИ ОДНОЙ плитки предмета — иначе это снова сетка
      expect(внутри).toBe(всего);
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /**
   * 🔴 МЕСТА — КОМПАКТНАЯ СЕТКА В НЕСКОЛЬКО КОЛОНОК. Полная плитка объявлена
   * `flexBasis: 145` и на 375 точках встаёт ПО ОДНОЙ в ряд: пять мест = 820
   * точек. Проверяется, что в дерево уходят компактная высота и доля ширины из
   * формулы, а не старые числа.
   */
  it('🔴 плитки мест компактные и в несколько колонок', () => {
    for (const level of [1, 9, 15]) {
      const { r, session, узлы } = нарисовать(level);
      const мест = session.round.lociCount;
      const плитки = узлы.filter((x: any) => x.style.minHeight === PLACE_LAYOUT.locusTileHeight);
      expect(плитки.length).toBe(мест);
      for (const п of плитки) expect(п.style.flexBasis).toBe(palaceLocusBasis(мест));
      // старая раскладка узнаётся по этим числам — их в дереве быть не должно
      expect(узлы.some((x: any) => x.style.minHeight === 150)).toBe(false);
      expect(узлы.some((x: any) => x.style.flexBasis === 145)).toBe(false);
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /** Поле и зазор контейнера тоже из формулы: на них держится вся арифметика. */
  it('🔴 поле и зазор контейнера взяты из формулы раскладки', () => {
    const { r, root } = нарисовать(1);
    const прокрутки = root.findAll((n: any) => n.props?.contentContainerStyle);
    const стили = прокрутки.map((n: any) => StyleSheet.flatten(n.props.contentContainerStyle) as any);
    const контейнер = стили.find((s: any) => s && s.maxWidth === 1000);
    expect(контейнер).toBeTruthy();
    expect(контейнер.padding).toBe(PLACE_LAYOUT.contentPadding);
    expect(контейнер.gap).toBe(PLACE_LAYOUT.contentGap);
    TestRenderer.act(() => { r.unmount(); });
  });

  /**
   * 🔴 ГЛАВНОЕ ЧИСЛО: содержимое фазы размещения не выше окна 812 НИ НА ОДНОМ
   * уровне. До правки на уровне 1 было 1595.
   */
  it('🔴 содержимое не выше окна 812 — все 15 уровней', () => {
    const плохие: string[] = [];
    for (let level = 1; level <= 15; level += 1) {
      const мест = memoryPalaceLociCountForLevel(level);
      const h = memoryPalacePlaceHeight(ЭКРАН.ширина, мест, длиныСтрок('ru', мест));
      if (h.total > ЭКРАН.высота) плохие.push(`уровень ${level} (${мест} мест): ${h.total} > ${ЭКРАН.высота}`);
    }
    expect(плохие).toEqual([]);
  });

  /** То же на всех двенадцати языках: немецкий и романские длиннее русского. */
  it('🔴 содержимое не выше 812 ни на одном из двенадцати языков', () => {
    const плохие: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (const level of [1, 5, 9, 15]) {
        const мест = memoryPalaceLociCountForLevel(level);
        const h = memoryPalacePlaceHeight(ЭКРАН.ширина, мест, длиныСтрок(locale, мест));
        if (h.total > ЭКРАН.высота) плохие.push(`${locale} L${level}: ${h.total}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  /**
   * 🔴 САМА ЖАЛОБА В ЧИСЛЕ: пара «предмет + место» видна ОДНОВРЕМЕННО. Лента
   * предметов и низ сцены мест обязаны уместиться в видимые 741 точку — иначе
   * человек снова бегает вверх-вниз на каждом ходу. До правки низ сцены был на
   * 1433 при видимых 741.
   */
  it('🔴 лента предметов и вся сцена мест видны разом (741 точка)', () => {
    const плохие: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (let level = 1; level <= 15; level += 1) {
        const мест = memoryPalaceLociCountForLevel(level);
        const h = memoryPalacePlaceHeight(ЭКРАН.ширина, мест, длиныСтрок(locale, мест));
        if (h.sceneBottom > ВИДИМО) плохие.push(`${locale} L${level}: низ сцены ${h.sceneBottom} > ${ВИДИМО}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  /** Цель нажатия приложения — не меньше 48 точек. Компакт её не съедает. */
  it('цели нажатия остаются не меньше 48 точек', () => {
    expect(PLACE_LAYOUT.itemTile).toBeGreaterThanOrEqual(48);
    expect(PLACE_LAYOUT.locusTileHeight).toBeGreaterThanOrEqual(48);
    expect(PLACE_LAYOUT.locusTileMinWidth).toBeGreaterThanOrEqual(48);
  });

  /** Колонок ровно столько, сколько влезает: иначе сетка снова растёт вверх. */
  it('число колонок растёт вместе с числом мест', () => {
    expect(palaceColumns(5)).toBe(3);
    expect(palaceColumns(6)).toBe(3);
    expect(palaceColumns(7)).toBe(4);
    expect(palaceColumns(12)).toBe(4);
  });
});
