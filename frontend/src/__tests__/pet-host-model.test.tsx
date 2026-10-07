/* psygames-pet-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «ПИТОМЕЦ» ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЕТ САМ (задача d1e147b0; приём —
 * `services/hostScreens.ts`).
 *
 * Экран монтируется целиком на настоящих провайдерах и хранилище; оболочка подменена.
 *   Портрет: описания кадров на четыре действия (покой, умывается, ёрзает, ест) — `petRenderSpec`.
 *   Забота: кормление списывает очки и включает «ест» с лакомством; мытьё раз в день; «погладить» —
 *   «ёрзает»; «поиграть» и совет ведут в игры.
 *   Рост: полоса и подпись — `petGrowth`; совет — `petAdvice` (самая отстающая шкала).
 *   Имя: сохраняется обрезанным до 20 знаков.
 * Образец модели — для проб Flutter (`flutter/test/fixtures/pet_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: (...a: any[]) => mockPush(...a) };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/pet',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { getTokens, addTokens } = require('@/src/services/tokens');
const { getPetName, PET_FEED_COST } = require('@/src/services/pet');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '/pet';
const PID = 'nzt48';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.clearAllMocks();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

async function смонтировать(host = true) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ROUTE];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/pet').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const act = async (name: string, ...args: any[]) => {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][name](...args); });
    await осесть();
  };
  return { sent, last, act };
}

const день = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', PID);
  await AsyncStorage.setItem('language', 'ru');
  // 12 партий памяти и внимания — стадия «Импульс», логика и скорость отстают (есть совет).
  const games = ['digit_span', 'schulte_table'];
  await AsyncStorage.setItem('psygames_sessions', JSON.stringify([...Array(12)].map((_, i) => ({
    id: `s${i}`, profile_id: PID, game_type: games[i % 2], score: 50, time_seconds: 60, timestamp: день(i % 3),
  }))));
  await addTokens(PID, 300);
});

describe('«Питомец» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent).toEqual([]);
  });

  it('🔴 портрет — описания кадров на четыре действия; рост, облики, шкалы, совет', async () => {
    const { last } = await смонтировать();
    const m = last();
    expect(m.portrait.state).toBe('idle');
    expect(Object.keys(m.portrait.specs).sort()).toEqual(['eat', 'groom', 'idle', 'wiggle']);
    for (const spec of Object.values(m.portrait.specs) as any[]) {
      expect(spec.uris.length).toBeGreaterThan(0);
      expect(spec.frames).toBeGreaterThan(0);
    }
    expect(m.portrait.treat).toBe(null);
    expect(m.total).toBe('12');
    expect(m.growth.frac).toBeCloseTo(2 / 20);
    expect(m.growth.text).toContain('12');
    expect(m.growth.text).toContain('18');   // до «Созвездия» (30) осталось 18 — остаток, а не только счёт
    expect(m.skins.map((s: any) => s.id)).toEqual(['cat', 'robot', 'constellation']);
    expect(m.skins.filter((s: any) => s.on).map((s: any) => s.id)).toEqual(['cat']);
    expect(m.skills.map((s: any) => s.key)).toEqual(['memory', 'attention', 'logic', 'speed']);
    expect(m.advice).not.toBe(null);
    expect(m.feed.fed).toBe(false);
    expect(m.care.map((c: any) => c.id)).toEqual(['wash', 'stroke', 'play']);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/pet_model.json');
    // Пути картинок в jest — пути файловой системы; в образец (публичный репозиторий) — адресом сборки.
    const json = JSON.stringify(m, null, 1).replace(/"(?:\.\.\/)+(?:[^"]*?\/frontend\/)?(assets\/[^"]+)"/g, '"/assets/$1"');
    if (process.env.WRITE === '1') fs.writeFileSync(file, `${json}\n`, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('🔴 «Угостить»: −стоимость, «ест» с лакомством у рта; второй раз за день — нельзя', async () => {
    const { last, act } = await смонтировать();
    const b0 = await getTokens(PID);
    await act('feed');
    expect(await getTokens(PID)).toBe(b0 - PET_FEED_COST);
    expect(last().feed.fed).toBe(true);
    expect(last().portrait.state).toBe('eat');
    expect(last().portrait.treat.emoji).toBe('🐟');
    expect(last().portrait.treat.mouth.x).toBeGreaterThan(0);
    await act('feed');
    expect(await getTokens(PID)).toBe(b0 - PET_FEED_COST);
  });

  it('🔴 «Помыть» — «умывается», и до завтра недоступно; «Погладить» — «ёрзает»', async () => {
    const { last, act } = await смонтировать();
    expect(last().care[0].enabled).toBe(true);
    await act('wash');
    expect(last().portrait.state).toBe('groom');
    expect(last().care[0].enabled).toBe(false);
    await act('stroke');
    expect(last().portrait.state).toBe('wiggle');
  });

  it('«Поиграть» — в игры; совет — в игру слабой шкалы; «назад» — goBackOrHome', async () => {
    const { act } = await смонтировать();
    await act('play');
    expect(mockPush).toHaveBeenLastCalledWith('/games');
    await act('advice');
    expect(mockPush).toHaveBeenLastCalledWith(expect.stringMatching(/^\/games\//));
    await act('back');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('имя сохраняется обрезанным до 20 знаков и приходит в модель', async () => {
    const { last, act } = await смонтировать();
    await act('saveName', 'Синапс Великолепный Первый');
    // 20 знаков; пробел на краю снимает только хранилище (`setPetName`), экран держит набранное — как разметка веба.
    const набрано = 'Синапс Великолепный Первый'.slice(0, 20);
    expect(await getPetName()).toBe(набрано.trim());
    expect(last().name.trim()).toBe(набрано.trim());
  });
});
