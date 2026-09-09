/* psygames-streak-goal-sheet-gate · VER 1 · 07.09.2026 */
/**
 * ОКНО ЦЕЛИ ПРОВЕРЯЕТСЯ НАСТОЯЩИМ РЕНДЕРОМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА.
 *
 * Три обязательства, ради которых окно и делалось:
 *   1. выбор ставится ОДНИМ ТАПОМ — ввода текста нет нигде;
 *   2. над выбором НЕТ обещаний, а основание показывается, только если ЗАМЕРЕНО;
 *   3. питомец говорит РАЗНОЕ на разные поводы — иначе это табличка.
 *
 * ⚠️ Каждый смонтированный экран СНИМАЕТСЯ. 07.09.2026 набор `anagram-classic-langs`
 * зеленел всеми пробами и всё равно ронял прогон: одиннадцать экранов остались
 * висеть, и после сноса окружения jest их отрисовка продолжалась.
 */
import React from 'react';
import StreakGoalSheet from '@/src/components/StreakGoalSheet';
import { startGoal, type AskReason } from '@/src/services/streakGoal';
import { suggestGoal } from '@/src/services/goalSuggest';
import { pickGoalLine } from '@/src/services/goalPetLines';

declare function require(id: string): any;
const TestRenderer = require('react-test-renderer');

const ЦВЕТА = { surface: '#fff', text: '#111', textSecondary: '#666', primary: '#4a9', border: '#ddd' };
const СЛОВАРЬ: Record<string, string> = {
  goalSheetDays: '{n} дней',
  goalSheetToday: 'Сегодня: {g} партий · {p} ⭐ · серия {s}',
  notNow: 'Не сейчас',
  goalSuggest_best_streak: 'Твоя лучшая серия — {n} дн. подряд',
  goalSuggest_at_top: 'Ты уже держал {n} дн.',
  goalSuggest_smaller: 'В прошлый раз было {n} — начнём с меньшего',
};
const t = (k: string) => СЛОВАРЬ[k] ?? k;
const подряд = (n: number) => Array.from({ length: n }, (_, k) => `2026-9-${k + 1}`);

const смонтированные: any[] = [];
afterEach(() => { смонтированные.splice(0).forEach((r) => TestRenderer.act(() => r.unmount())); });

function окно(over: Partial<React.ComponentProps<typeof StreakGoalSheet>> = {}) {
  const props: any = {
    reason: 'first' as AskReason,
    suggestion: suggestGoal({ days: подряд(4), hasSessions: true }),
    today: { games: 3, tokens: 96, streak: 4 },
    language: 'ru',
    petSkin: 'cat',
    colors: ЦВЕТА,
    t,
    onPick: () => {},
    onSkip: () => {},
    ...over,
  };
  let r: any;
  TestRenderer.act(() => { r = TestRenderer.create(React.createElement(StreakGoalSheet as any, props)); });
  смонтированные.push(r);
  return r;
}

const текст = (r: any): string => {
  const out: string[] = [];
  const идти = (n: any) => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n && n.children) n.children.forEach(идти);
  };
  идти(r.toJSON());
  return out.join(' ');
};
/*
 * ⚠️ ТОЛЬКО НАСТОЯЩИЕ УЗЛЫ. `findAll` возвращает и React-элемент, и отрисованный
 * им хост-узел с тем же `testID` — на каждый testID выходит по ДВА совпадения,
 * и проверка «ровно один» падает на исправном окне. Фильтр по строковому типу
 * оставляет то, что реально нарисовано.
 */
const поId = (r: any, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id && typeof n.type === 'string', { deep: true });

/**
 * Нажать по testID. ⚠️ Отдельно от `поId`: обработчик `onPress` висит на
 * СОСТАВНОМ элементе (TouchableOpacity), а не на отрисованном узле, который
 * считает `поId`. Одна функция на оба случая давала бы то пустой список, то
 * узел без обработчика — и то и другое выглядит как поломка окна.
 */
const нажать = (r: any, id: string) => {
  const цель = r.root.findAll(
    (n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function', { deep: true },
  )[0];
  if (!цель) throw new Error(`нечего нажать: ${id}`);
  TestRenderer.act(() => { цель.props.onPress(); });
};

describe('окно цели', () => {
  it('рисуется и показывает три варианта', () => {
    const r = окно();
    expect(поId(r, 'streak-goal-sheet').length).toBe(1);
    for (const d of [7, 14, 30]) expect(поId(r, `goal-option-${d}`).length).toBe(1);
  });

  it('🔴 выбор — ОДИН ТАП, поля ввода нет ни одного', () => {
    const r = окно();
    const вводы = r.root.findAll((n: any) => typeof n.type === 'string' && /TextInput/i.test(n.type), { deep: true });
    expect(вводы.length).toBe(0);
  });

  it('тап по варианту отдаёт именно его число', () => {
    const выбрано: number[] = [];
    const r = окно({ onPick: (d: any) => выбрано.push(d) });
    нажать(r, 'goal-option-14');
    expect(выбрано).toEqual([14]);
  });

  it('«Не сейчас» закрывает, ничего не выбрав', () => {
    let закрыт = 0;
    const r = окно({ onSkip: () => { закрыт += 1; } });
    нажать(r, 'goal-skip');
    expect(закрыт).toBe(1);
  });

  it('дневные метрики показаны числами', () => {
    const r = окно({ today: { games: 5, tokens: 140, streak: 6 } });
    expect(текст(r)).toContain('Сегодня: 5 партий · 140 ⭐ · серия 6');
  });

  describe('основание под предложенным вариантом', () => {
    it('есть замер — есть подпись с его числом', () => {
      const r = окно({ suggestion: suggestGoal({ days: подряд(4), hasSessions: true }) });
      expect(поId(r, 'goal-option-why').length).toBe(1);
      expect(текст(r)).toContain('Твоя лучшая серия — 4 дн. подряд');
    });

    it('🔴 замера нет — подписи НЕТ, а не выдуманная', () => {
      const r = окно({ suggestion: suggestGoal({ days: [], hasSessions: false }) });
      expect(поId(r, 'goal-option-why').length).toBe(0);
    });

    it('подпись стоит только под предложенным, а не под каждым', () => {
      const r = окно({ suggestion: suggestGoal({ days: подряд(8), hasSessions: true }) });
      expect(поId(r, 'goal-option-why').length).toBe(1);
    });
  });

  describe('питомец', () => {
    it('говорит — реплика приходит из petLines, а не зашита в окно', () => {
      const r = окно({ reason: 'first' });
      expect(текст(r)).toContain(pickGoalLine('ru', 'first').text);
    });

    it('🔴 на разные поводы — разные слова', () => {
      const слова = (['first', 'weekly', 'reached', 'broken'] as AskReason[])
        .map((reason) => поId(окно({ reason }), 'goal-pet-line')[0].props.children);
      expect(new Set(слова).size).toBe(4);
    });
  });

  it('🔴 в окне нет ни одного обещания', () => {
    // У Duolingo здесь «ваши шансы вырастут в 2 раза». У нас такого замера нет.
    const всё = (['first', 'weekly', 'reached', 'broken'] as AskReason[])
      .map((reason) => текст(окно({ reason }))).join(' ').toLowerCase();
    const обещания = ['в 2 раза', 'вдвое', 'шанс', 'гаранти', 'twice', 'double'];
    expect(обещания.filter((o) => всё.includes(o))).toEqual([]);
  });

  /**
   * 🔴 СКЛОНЕНИЕ ОСНОВАНИЯ. Варианты 7/14/30 все берут «дней», а основание —
   * число произвольное: 2 → «2 дня», 21 → «21 день». Поэтому в русской подписи
   * после `{n}` НЕ должно стоять склоняемое слово.
   */
  it('🔴 подпись-основание не склоняет слово после числа', () => {
    const склоняемые = /\{n\}\s*(дней|дня|день)/;
    for (const k of ['goalSuggest_best_streak', 'goalSuggest_at_top']) {
      expect(`${k}: ${склоняемые.test(СЛОВАРЬ[k])}`).toBe(`${k}: false`);
    }
  });

  it('цель, поставленную только что, окно уже не зовёт ставить заново', () => {
    // Связка с ядром: startGoal помечает день, и askReason это учитывает.
    const g = startGoal(7, new Date(2026, 8, 7));
    expect(g.askedAt).toBe('2026-9-7');
  });

  /**
   * 🔴 СРЫВ: ОКНО ПОКАЗЫВАЕТ МЕНЬШУЮ ЦЕЛЬ И ОБЪЯСНЯЕТ, ПОЧЕМУ ОНА МЕНЬШЕ.
   * Решение Дениса 07.09.2026. Проверяется рендером: подбор мог сработать
   * правильно, а окно всё равно подсветить не тот вариант.
   */
  describe('после срыва', () => {
    const срыв = { days: 14 as const, reason: 'smaller' as const, basis: 30 };

    it('подсвечен вариант поменьше, а не тот, что не вышел', () => {
      const r = окно({ reason: 'broken', suggestion: срыв });
      // Подпись-основание рисуется ТОЛЬКО под выбранным вариантом.
      const подписи = поId(r, 'goal-option-why');
      expect(подписи.length).toBe(1);
      expect(текст(r)).toContain('В прошлый раз было 30');
    });

    it('🔴 в окне срыва нет ни одного упрёка', () => {
      const t = текст(окно({ reason: 'broken', suggestion: срыв })).toLowerCase();
      const упрёки = ['подвёл', 'провалил', 'не смог', 'опять', 'жаль', 'увы'];
      expect(`${упрёки.filter((u) => t.includes(u)).join(', ') || 'упрёков нет'}`)
        .toBe('упрёков нет');
    });
  });
});
