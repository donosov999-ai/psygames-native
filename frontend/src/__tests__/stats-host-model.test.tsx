/* psygames-stats-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «ПРОГРЕСС» ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЕТ САМ (задача 6ff4a966).
 *
 * Экран монтируется целиком (обвязка — `stats-balance-follows-profile`): партии двух профилей,
 * настоящие профиль, тема, язык. Оболочка подменена (`window.PsyBridge`, `__psyHostScreens`).
 *   · без оболочки модели нет;
 *   · баланс в модели — те же числа, что в строках веба (своё: 4 и 4);
 *   · действие `scope(true)` переключает охват — баланс модели становится «все игры» (16, 12, 4);
 *   · история и карточки игр приходят готовыми строками; образец модели — для пробы Flutter.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const r = { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => r,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    usePathname: () => '/statistics',
    useFocusEffect: () => {},
    useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
    Redirect: () => null,
    router: r,
  };
});
// «Назад» — правило веба `goBackOrHome`; здесь только запоминаем вызов.
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
// ИИ-дайджест ходит в сеть — здесь он молчит (как без ключа).
jest.mock('@/src/services/aiInsight', () => ({
  getAiInsight: async () => null, toneForProfile: () => 'neutral', isoWeekKey: () => '2026-W41',
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };
const день = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const партии = (profile_id: string, game_type: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${profile_id}-${game_type}-${i}`, profile_id, game_type, score: 10 + i, time_seconds: 60 + i, timestamp: день(1 + i),
  }));

async function смонтировать(host: boolean) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', '#switcher', '/statistics'];
  }
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'women');
  await AsyncStorage.setItem('language', 'ru');
  await AsyncStorage.setItem('psygames_sessions', JSON.stringify([
    ...партии('women', 'breathing', 4),
    ...партии('women', 'sudoku', 4),
    ...партии('nzt48', 'sudoku', 12),
    ...партии('nzt48', 'corsi', 12),
  ]));
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/statistics').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '/statistics')?.model;
  return { r, sent, last };
}

const числа = (m: any) => (m?.areas?.rows ?? []).map((a: any) => Number(/· (\d+)$/.exec(a.text)![1])).sort((a: number, b: number) => b - a);

describe('«Прогресс» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent.filter((m) => m.op === 'screenUi')).toEqual([]);
  });

  it('🔴 баланс модели — тот же, что в строках веба; scope(true) — все игры устройства', async () => {
    const { last } = await смонтировать(true);
    const m = last();
    expect(m ? 'модель есть' : 'модели нет').toBe('модель есть');
    expect(m.loading).toBe(false);
    expect(числа(m)).toEqual([4, 4]);
    expect(m.scope.isAll).toBe(false);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].scope(true); });
    await осесть();
    expect(last().scope.isAll).toBe(true);
    expect(числа(last())).toEqual([16, 12, 4]);
  });

  it('🔴 refresh перечитывает хранилище; back — goBackOrHome веба', async () => {
    const { last } = await смонтировать(true);
    const было = last().totalPlayed;
    const raw = JSON.parse((await AsyncStorage.getItem('psygames_sessions'))!);
    await AsyncStorage.setItem('psygames_sessions', JSON.stringify([...raw, ...партии('women', 'sudoku', 3).map((x) => ({ ...x, id: `new-${x.id}` }))]));
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].refresh(); });
    await осесть();
    expect([было, last().totalPlayed]).toEqual([было, было.replace('32', '35')]);
    mockBack.mockClear();
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].back(); });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('карточки игр и история — готовыми строками; образец для Flutter', async () => {
    const { last } = await смонтировать(true);
    const m = last();
    expect(m.games.length).toBeGreaterThan(0);
    for (const g of m.games) expect([g.id, g.stats.length]).toEqual([g.id, 4]);
    expect(m.history.kind).toBe('days');
    expect(m.history.days[0].entries[0].name.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/stats_model.json');
    // Метки времени в образце — относительные к сегодняшнему дню: для пробы Flutter форма важнее дат.
    const now = `${JSON.stringify(m, null, 1)}\n`;
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
  });
});
