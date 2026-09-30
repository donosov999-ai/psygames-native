/* psygames-test-warmup-bridge · VER 1 · 30.09.2026 */
/**
 * 🔴 МОСТ ЗАРЯДКИ ДЛЯ НАТИВНОЙ РАЗВИЛКИ.
 *
 * В приложении развилки «Слова» и «Языки» рисуются Flutter-экраном поверх этой
 * страницы, а зарядка раздела живёт здесь (`WarmupContext.startPlaylist`). Карточка
 * с `bridgeId` регистрирует в окне `__psyWarmups[имя] = { info(), start(минут) }`,
 * и нативная шапка (`flutter/lib/shell/warmup_bridge.dart`) берёт подписи и число
 * подходов отсюда и зовёт ТОТ ЖЕ запуск. Меряем поведением: что отдаёт `info`,
 * что делает `start`, и что после ухода карточки моста в окне нет.
 */
import React from 'react';
import { WarmupCard } from '@/src/components/WarmupCard';
import {
  ДЛИТЕЛЬНОСТИ, собратьТемуЗарядки, темаШаги,
  ШАГ_АНАГРАММЫ_СЕК, ШАГ_ФИЛВОРДЫ_СЕК, ШАГ_БЕГЛОСТЬ_СЕК,
} from '@/src/services/chessWarmup';

const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const запущено: unknown[] = [];
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#fff', card: '#eee', border: '#ccc', text: '#000', textSecondary: '#666' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => (k === 'warmupPlanCount' ? 'Подходов: {n}' : `${k}·т`), language: 'ru' }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ startPlaylist: (p: unknown) => { запущено.push(p); } }),
}));

const ТЕМЫ = [
  { game_id: 'anagrams', game_route: '/games/anagrams', секунд: ШАГ_АНАГРАММЫ_СЕК, уровень: 4 },
  { game_id: 'proofreading', game_route: '/games/proofreading', секунд: ШАГ_ФИЛВОРДЫ_СЕК, уровень: 2, настройки: { mode: 'fillwords' } },
  { game_id: 'phonemic_fluency', game_route: '/games/phonemic-fluency', секунд: ШАГ_БЕГЛОСТЬ_СЕК, уровень: 1 },
];

type Мост = { info: () => any; start: (м: number) => boolean };
const мост = (): Мост | undefined => (window as any).__psyWarmups?.words;

function карточка(loading = false) {
  return (
    <WarmupCard темы={ТЕМЫ} titleKey="wordsWarmupTitle" descKey="wordsWarmupDesc"
      ярлык="слова" accent="#8b5cf6" loading={loading} bridgeId="words" />
  );
}

beforeEach(() => { запущено.length = 0; delete (window as any).__psyWarmups; });

describe('мост зарядки для нативной развилки', () => {
  it('🔴 info отдаёт подписи и число подходов по каждой длительности — те же, что считает карточка', () => {
    let r: any;
    act(() => { r = TestRenderer.create(карточка()); });
    const i = мост()!.info();
    expect(i.title).toBe('wordsWarmupTitle·т');
    expect(i.desc).toBe('wordsWarmupDesc·т');
    expect(i.ready).toBe(true);
    expect(i.options.map((o: any) => o.min)).toEqual([...ДЛИТЕЛЬНОСТИ]);
    for (const o of i.options) {
      const n = темаШаги(ТЕМЫ, o.min).length;
      expect(`${o.min}: ${o.count}`).toBe(`${o.min}: ${n}`);
      expect(o.label).toBe(`Подходов: ${n}`);
    }
    act(() => r.unmount());
  });

  it('🔴 start зовёт тот же startPlaylist с той же серией, что и кнопка карточки', () => {
    let r: any;
    act(() => { r = TestRenderer.create(карточка()); });
    let ok = false;
    act(() => { ok = мост()!.start(10); });
    expect(ok).toBe(true);
    expect(запущено).toEqual([собратьТемуЗарядки(ТЕМЫ, 10, 'слова')]);
    act(() => r.unmount());
  });

  it('чужая длительность и незагруженные уровни — отказ, а не запуск', () => {
    let r: any;
    act(() => { r = TestRenderer.create(карточка(true)); });
    expect(мост()!.info().ready).toBe(false);
    expect(мост()!.start(10)).toBe(false);
    act(() => r.update(карточка(false)));
    expect(мост()!.start(7)).toBe(false);
    expect(запущено).toEqual([]);
    act(() => r.unmount());
  });

  it('🔴 карточка ушла — моста в окне нет: нативная шапка не позовёт мёртвую серию', () => {
    let r: any;
    act(() => { r = TestRenderer.create(карточка()); });
    expect(мост()).toBeDefined();
    act(() => r.unmount());
    expect(мост()).toBeUndefined();
  });
});
